import type { ApplicationRecord, IntegrationRecord } from './types';
import type { ModelConfig } from './modelConfig';
import {
  applicationAgeYears,
  criticalitySeverity,
  customerExposureSeverity,
  daysBetween,
  minutesSeverity,
  requiredResilienceLevelFromRto,
} from './normalizer';

// Derives calculation features from imported facts alone (no planning answers).
// This runs once per application during ingestion (step 8 of the ingestion
// sequence) and again whenever the profile is corrected.

export interface ResilienceFeatures {
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  recoveryTestPenaltyWeeks: number;
  uncertaintyFlag: boolean;
  rpoPatternValidated: boolean;
}

export interface IntegrationResolution {
  records: IntegrationRecord[];
  usedAggregatePlaceholder: boolean;
}

export interface DerivedFeatures {
  ageYears: number | null;
  criticalitySeverity: number;
  rtoSeverity: number | null;
  rpoSeverity: number | null;
  rpoUnknown: boolean;
  exposureSeverity: number;
  architectureComplexityMax: number;
  resilience: ResilienceFeatures;
  primaryLanguageCount: number;
  additionalPrimaryLanguageCount: number;
  dependencyInventoryUnknown: boolean;
  integrationInventoryUnknown: boolean;
  integrationResolution: IntegrationResolution;
}

export function deriveResilienceFeatures(app: ApplicationRecord, config: ModelConfig, now: Date = new Date()): ResilienceFeatures {
  const currentLevel = config.resilience.currentLevel[app.drTopology] ?? 0;
  const requiredLevel = requiredResilienceLevelFromRto(app.rtoMinutes, config.resilience.requiredLevelFromRto);
  const gap = Math.max(0, requiredLevel - currentLevel);

  let recoveryTestPenaltyWeeks = 0;
  if (app.currentRecoveryTestStatus === 'failed') {
    recoveryTestPenaltyWeeks += config.resilience.failedTestAdd;
  } else if (app.currentRecoveryTestStatus === 'never-tested' || app.currentRecoveryTestStatus === 'Unknown') {
    recoveryTestPenaltyWeeks += config.resilience.neverTestedAdd;
  }
  const lastTestDays = daysBetween(app.lastRecoveryTestDate, now);
  if (app.currentRecoveryTestStatus === 'passed' && lastTestDays != null && lastTestDays > config.resilience.staleTestThresholdDays) {
    recoveryTestPenaltyWeeks += config.resilience.staleTestAdd;
  }

  const uncertaintyFlag = app.drTopology === 'Unknown' || app.rtoMinutes == null;
  // RPO is only "satisfied" by a named replication pattern; absence raises a design action
  // rather than being silently treated as met.
  const rpoPatternValidated = app.rpoMinutes != null && Boolean(app.targetReplicationPattern);

  return { currentLevel, requiredLevel, gap, recoveryTestPenaltyWeeks, uncertaintyFlag, rpoPatternValidated };
}

export function resolveIntegrations(app: ApplicationRecord, config: ModelConfig): IntegrationResolution {
  if (app.integrations.length > 0) {
    return { records: app.integrations, usedAggregatePlaceholder: false };
  }
  if (app.integrationCount != null && app.integrationCount > 0) {
    const placeholders: IntegrationRecord[] = Array.from({ length: app.integrationCount }, (_, i) => ({
      id: `AGG-${app.applicationId}-${i + 1}`,
      type: 'Unknown',
      direction: 'Unknown',
      realTime: false,
      externalParty: false,
      businessCritical: false,
      endpointProtocolIdentityChange: false,
      aggregateOnly: true,
    }));
    return { records: placeholders, usedAggregatePlaceholder: true };
  }
  void config;
  return { records: [], usedAggregatePlaceholder: false };
}

export function deriveFeatures(app: ApplicationRecord, config: ModelConfig, now: Date = new Date()): DerivedFeatures {
  const primaryLanguageCount =
    app.technologyComponents.filter((c) => c.isPrimaryLanguage).length || Math.min(app.languages.length, 1);
  const additionalPrimaryLanguageCount = Math.max(0, primaryLanguageCount - 1);

  const rpoSeverityRaw = minutesSeverity(app.rpoMinutes);

  return {
    ageYears: applicationAgeYears(app.firstProductionDate, now),
    criticalitySeverity: criticalitySeverity(app.businessCriticality),
    rtoSeverity: minutesSeverity(app.rtoMinutes),
    rpoSeverity: rpoSeverityRaw,
    rpoUnknown: app.rpoMinutes == null,
    exposureSeverity: customerExposureSeverity(app.customerTransactionExposure),
    architectureComplexityMax: config.architectureComplexity[app.architectureStyle] ?? config.architectureComplexity['Mixed/unknown'],
    resilience: deriveResilienceFeatures(app, config, now),
    primaryLanguageCount,
    additionalPrimaryLanguageCount,
    dependencyInventoryUnknown: app.unknownDependencyIndicator || (app.upstreamDependencyCount == null && app.downstreamDependencyCount == null),
    integrationInventoryUnknown: app.integrationInventoryConfidence === 'Unknown' && app.integrationCount == null,
    integrationResolution: resolveIntegrations(app, config),
  };
}
