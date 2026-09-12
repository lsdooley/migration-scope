import type { ApplicationRecord, EvidenceQualityBreakdown, Provenance } from './types';
import type { ModelConfig } from './modelConfig';
import { daysBetween } from './normalizer';

// Evidence Quality = weighted blend of Completeness, Freshness, Consistency,
// SourceAuthority, and HumanConfirmation. Every component is shown in the trace.

/** Required canonical fields count 2x recommended fields toward Completeness. */
const REQUIRED_WEIGHTED_FIELDS: (keyof ApplicationRecord)[] = [
  'schemaVersion', 'applicationId', 'applicationName', 'lastVerifiedDate', 'languages',
  'runtimePlatforms', 'architectureStyle', 'firstProductionDate', 'upstreamDependencyCount',
  'downstreamDependencyCount', 'integrationCount', 'integrationTypes', 'businessCriticality',
  'drTopology', 'rtoMinutes',
];

const RECOMMENDED_WEIGHTED_FIELDS: (keyof ApplicationRecord)[] = [
  'businessOwner', 'technicalOwner', 'supportGroup', 'lifecycleStatus', 'frameworks',
  'operatingSystems', 'databases', 'deploymentModel', 'environmentCount', 'productionInstanceCount',
  'architectureComponents', 'dependencyIds', 'criticalDependencyCount', 'externalDependencyCount',
  'sharedPlatformDependencyCount', 'integrationIds', 'criticalIntegrationCount',
  'externalPartyIntegrationCount', 'realTimeIntegrationCount', 'integrationInventoryConfidence',
  'availabilityTier', 'rpoMinutes', 'currentRecoveryTestStatus', 'lastRecoveryTestDate',
  'multiRegionOrSite', 'dataClassification', 'regulatoryTags', 'customerTransactionExposure',
  'incidentSev1_12m', 'incidentSev2_12m', 'changeFailureRate', 'cmdbCompleteness',
  'cmdbCorrectness', 'cmdbCompliance',
];

export function isPopulated(value: unknown): boolean {
  if (value == null || value === '' || value === 'Unknown') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Weighted fields not populated (required + recommended) — feeds the Discovery allowance. */
export function missingWeightedFieldCount(app: ApplicationRecord): number {
  let missing = 0;
  for (const f of REQUIRED_WEIGHTED_FIELDS) if (!isPopulated(app[f])) missing++;
  for (const f of RECOMMENDED_WEIGHTED_FIELDS) if (!isPopulated(app[f])) missing++;
  return missing;
}

export function completenessScore(app: ApplicationRecord): number {
  let populatedWeight = 0;
  let totalWeight = 0;
  for (const f of REQUIRED_WEIGHTED_FIELDS) {
    totalWeight += 2;
    if (isPopulated(app[f])) populatedWeight += 2;
  }
  for (const f of RECOMMENDED_WEIGHTED_FIELDS) {
    totalWeight += 1;
    if (isPopulated(app[f])) populatedWeight += 1;
  }
  return totalWeight === 0 ? 0 : Math.min(100, (populatedWeight / totalWeight) * 100);
}

export function freshnessScore(app: ApplicationRecord, config: ModelConfig, now: Date = new Date()): number {
  const days = daysBetween(app.lastVerifiedDate, now);
  if (days == null) return 0;
  for (const { within, score } of config.evidenceQuality.freshnessThresholdsDays) {
    if (days <= within) return score;
  }
  return 0;
}

export function consistencyScore(app: ApplicationRecord, config: ModelConfig): number {
  const conflicts = app.conflicts?.length ?? 0;
  return Math.max(0, 100 - conflicts * config.evidenceQuality.consistencyPenaltyPerConflict);
}

const PROVENANCE_AUTHORITY_KEY: Record<Provenance, keyof ModelConfig['evidenceQuality']['sourceAuthorityScores']> = {
  CMDB: 'cmdbOrDiscovery',
  Derived: 'governedImport',
  'User confirmed': 'userAssertion',
  'User corrected': 'userAssertion',
  Unknown: 'unverifiedNote',
};

export function sourceAuthorityScore(app: ApplicationRecord, config: ModelConfig): number {
  const entries = Object.values(app.provenance);
  if (entries.length === 0) return config.evidenceQuality.sourceAuthorityScores.unverifiedNote;
  const sum = entries.reduce((acc, info) => {
    const key = PROVENANCE_AUTHORITY_KEY[info.source];
    return acc + config.evidenceQuality.sourceAuthorityScores[key];
  }, 0);
  return sum / entries.length;
}

export function humanConfirmationScore(profileConfirmed: boolean, config: ModelConfig): number {
  return profileConfirmed
    ? config.evidenceQuality.humanConfirmationScores.confirmed
    : config.evidenceQuality.humanConfirmationScores.unconfirmed;
}

export function computeEvidenceQuality(
  app: ApplicationRecord,
  config: ModelConfig,
  opts: { profileConfirmed: boolean; now?: Date },
): EvidenceQualityBreakdown {
  const completeness = completenessScore(app);
  const freshness = freshnessScore(app, config, opts.now);
  const consistency = consistencyScore(app, config);
  const sourceAuthority = sourceAuthorityScore(app, config);
  const humanConfirmation = humanConfirmationScore(opts.profileConfirmed, config);

  const w = config.evidenceQuality.weights;
  const total = Math.min(
    100,
    w.completeness * completeness +
      w.freshness * freshness +
      w.consistency * consistency +
      w.sourceAuthority * sourceAuthority +
      w.humanConfirmation * humanConfirmation,
  );

  return { completeness, freshness, consistency, sourceAuthority, humanConfirmation, total };
}
