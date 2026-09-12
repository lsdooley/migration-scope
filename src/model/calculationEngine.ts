import type {
  ApplicationRecord,
  CalculationTrace,
  ConfidenceBand,
  EstimateResult,
  PlanningAnswers,
  RiskBand,
  WaveSuitability,
  WorkPackage,
} from './types';
import type { ModelConfig } from './modelConfig';
import { MODEL_VERSION } from './modelConfig';
import { deriveFeatures, type DerivedFeatures } from './featureDerivation';
import { computeEvidenceQuality, missingWeightedFieldCount } from './dataQuality';
import { evaluateRules, type RuleContext, type RuleEffect } from './rulesEngine';
import { isContainmentRelationship } from './normalizer';

// Pure calculation engine. Given an ApplicationRecord, PlanningAnswers, and a
// ModelConfig, produces the full EstimateResult with an explainable trace.
// No UI imports. No mutation of inputs.

const RISK_BAND_ORDER: RiskBand[] = ['Low', 'Moderate', 'High', 'Critical'];
function maxRiskBand(a: RiskBand, b: RiskBand): RiskBand {
  return RISK_BAND_ORDER.indexOf(a) >= RISK_BAND_ORDER.indexOf(b) ? a : b;
}

// --- Work-package ledger: unique IDs prevent double counting. ---------------

class Ledger {
  private packages = new Map<string, WorkPackage>();

  add(id: string, name: string, category: WorkPackage['category'], effortWeeks: number, source: string): void {
    if (this.packages.has(id)) return; // idempotent — already counted
    this.packages.set(id, { id, name, category, effortWeeks, source });
  }

  addAll(entries: { id: string; name: string; category: WorkPackage['category']; effortWeeks: number }[], source: string): void {
    for (const e of entries) this.add(e.id, e.name, e.category, e.effortWeeks, source);
  }

  list(): WorkPackage[] {
    return [...this.packages.values()];
  }

  sum(): number {
    return this.list().reduce((acc, p) => acc + p.effortWeeks, 0);
  }

  sumByCategory(category: WorkPackage['category']): number {
    return this.list().filter((p) => p.category === category).reduce((acc, p) => acc + p.effortWeeks, 0);
  }
}

// --- Business Impact ---------------------------------------------------------

export function computeBusinessImpact(
  features: DerivedFeatures,
  config: ModelConfig,
): { businessImpact: number; rpoReweighted: boolean } {
  const w = config.businessImpact.weights;
  if (!features.rpoUnknown) {
    const raw =
      config.businessImpact.scale *
      (w.criticality * features.criticalitySeverity +
        w.rtoSeverity * (features.rtoSeverity ?? 0) +
        w.rpoSeverity * (features.rpoSeverity ?? 0) +
        w.customerTransactionExposure * features.exposureSeverity);
    return { businessImpact: Math.min(config.businessImpact.cap, raw), rpoReweighted: false };
  }
  // RPO unknown: re-normalize the remaining weights rather than treating it as zero.
  const remainingWeight = w.criticality + w.rtoSeverity + w.customerTransactionExposure;
  const raw =
    config.businessImpact.scale *
    ((w.criticality / remainingWeight) * features.criticalitySeverity +
      (w.rtoSeverity / remainingWeight) * (features.rtoSeverity ?? 0) +
      (w.customerTransactionExposure / remainingWeight) * features.exposureSeverity);
  return { businessImpact: Math.min(config.businessImpact.cap, raw), rpoReweighted: true };
}

// --- Technology remediation ---------------------------------------------------

export function computeTechnologyRemediation(
  app: ApplicationRecord,
  features: DerivedFeatures,
  config: ModelConfig,
): number {
  const per = config.technologyRemediation.perComponent;
  const adders = config.technologyRemediation.adders;
  let weeks = 0;
  for (const c of app.technologyComponents) {
    weeks +=
      c.supportStatus === 'current'
        ? per.current
        : c.supportStatus === 'aging'
          ? per.aging
          : c.supportStatus === 'out-of-support'
            ? per.outOfSupport
            : per.bespokeUnknown;
    if (c.majorVersionUpgradeNeeded) weeks += adders.majorVersionUpgrade;
    if (c.awsTargetIncompatible) weeks += adders.awsTargetIncompatibility;
    if (c.specialistSkillRequired) weeks += adders.specialistSkill;
  }
  const languageAdder = Math.min(
    features.additionalPrimaryLanguageCount * adders.additionalPrimaryLanguage,
    config.technologyRemediation.additionalPrimaryLanguageCap,
  );
  return weeks + languageAdder;
}

// --- Dependency load -----------------------------------------------------------

export function computeDependencyLoad(
  app: ApplicationRecord,
  features: DerivedFeatures,
  config: ModelConfig,
): { dependencyLoad: number; countDerivedCapped: boolean } {
  const cfg = config.dependencyLoad;
  const upstream = app.upstreamDependencyCount ?? 0;
  const downstream = app.downstreamDependencyCount ?? 0;
  const nonContainment = app.dependencies.filter((d) => !isContainmentRelationship(d.relationshipType));
  const critical = app.criticalDependencyCount ?? nonContainment.filter((d) => d.critical).length;
  const sharedPlatform = app.sharedPlatformDependencyCount ?? nonContainment.filter((d) => d.sharedPlatform).length;
  const external = app.externalDependencyCount ?? nonContainment.filter((d) => d.external).length;

  const base = cfg.baseCoefficient * Math.sqrt(upstream + downstream);
  const countDerivedRaw = base + cfg.criticalCoefficient * critical + cfg.sharedPlatformCoefficient * sharedPlatform + cfg.externalCoefficient * external;
  const countDerivedCapped = countDerivedRaw > cfg.countDerivedCap;
  const countDerived = Math.min(countDerivedRaw, cfg.countDerivedCap);

  const unknownAdd = features.dependencyInventoryUnknown ? cfg.unknownInventoryAdd : 0;
  return { dependencyLoad: countDerived + unknownAdd, countDerivedCapped };
}

// --- Integration load -----------------------------------------------------------

export function computeIntegrationLoad(
  features: DerivedFeatures,
  config: ModelConfig,
): { integrationLoad: number; capped: boolean } {
  const cfg = config.integrationLoad;
  let total = 0;
  for (const rec of features.integrationResolution.records) {
    let effort = cfg.baseType[rec.type] ?? cfg.baseType.Unknown;
    if (rec.realTime) effort *= cfg.multipliers.realTime;
    if (rec.externalParty) effort *= cfg.multipliers.externalParty;
    if (rec.businessCritical) effort *= cfg.multipliers.businessCritical;
    if (rec.endpointProtocolIdentityChange) effort *= cfg.multipliers.endpointChange;
    if (rec.aggregateOnly) effort *= cfg.multipliers.aggregateOnly;
    total += effort;
  }
  const capped = total > cfg.cap;
  return { integrationLoad: Math.min(total, cfg.cap), capped };
}

// --- SME availability & delivery friction ----------------------------------------

export function computeSmeAvailability(answers: PlanningAnswers, config: ModelConfig) {
  const domains = {
    business: config.smeAvailability[answers.businessSmeCoverage].availability,
    application: config.smeAvailability[answers.applicationSmeCoverage].availability,
    dataOps: config.smeAvailability[answers.dataOpsSmeCoverage].availability,
  };
  const values = Object.values(domains);
  const lowestAvailability = Math.min(...values);
  const meanAvailability = values.reduce((a, b) => a + b, 0) / values.length;
  const smeGap = 4 * (1 - meanAvailability);
  const uncoveredDomainCount = [answers.businessSmeCoverage, answers.applicationSmeCoverage, answers.dataOpsSmeCoverage].filter((c) => c === 'none').length;
  return { domains, lowestAvailability, meanAvailability, smeGap, uncoveredDomainCount };
}

function capacityConstraintSeverity(allocationPct: number): number {
  if (allocationPct >= 100) return 0;
  if (allocationPct >= 75) return 4 / 3;
  if (allocationPct >= 50) return 8 / 3;
  return 4;
}

function awsFluencyGapSeverity(fluency: PlanningAnswers['awsFluency']): number {
  return { 'repeated-delivery': 0, 'delivered-once': 4 / 3, assisted: 8 / 3, new: 4 }[fluency];
}

function testReadinessGapSeverity(evidence: PlanningAnswers['testEvidence']): number {
  return { automated: 0, repeatable: 4 / 3, partial: 8 / 3, 'tribal-manual': 4 }[evidence];
}

function documentationGapSeverity(confidence: PlanningAnswers['documentationConfidence']): number {
  return { 'recently-verified': 0, high: 4 / 3, medium: 8 / 3, low: 4 }[confidence];
}

function constraintLoadSeverity(constraints: PlanningAnswers['constraints']): number {
  const count = constraints.length;
  if (count === 0) return 0;
  if (count === 1) return 4 / 3;
  if (count === 2) return 8 / 3;
  return 4;
}

export function computeDeliveryFriction(answers: PlanningAnswers, smeGap: number, config: ModelConfig) {
  const capacityConstraint = capacityConstraintSeverity(answers.deliveryTeamAllocationPct);
  const awsFluencyGap = awsFluencyGapSeverity(answers.awsFluency);
  const testReadinessGap = testReadinessGapSeverity(answers.testEvidence);
  const documentationGap = documentationGapSeverity(answers.documentationConfidence);
  const constraintLoad = constraintLoadSeverity(answers.constraints);
  const w = config.deliveryFriction.weights;
  const deliveryFriction =
    config.deliveryFriction.scale *
    (w.smeGap * smeGap + w.capacityConstraint * capacityConstraint + w.awsFluencyGap * awsFluencyGap + w.testReadinessGap * testReadinessGap + w.documentationGap * documentationGap + w.constraintLoad * constraintLoad);
  return { deliveryFriction, capacityConstraint, awsFluencyGap, testReadinessGap, documentationGap, constraintLoad };
}

// --- Minimum roles -----------------------------------------------------------

function buildMinimumRoles(app: ApplicationRecord, answers: PlanningAnswers, businessImpact: number): string[] {
  const roles = new Set<string>(['Application lead', 'Migration engineer', 'Developer']);
  if (app.databases && app.databases.length > 0) roles.add('Data specialist');
  if (app.integrations.length > 0 || (app.integrationCount ?? 0) > 0) roles.add('Integration specialist');
  roles.add('Tester');
  roles.add('Operations lead');
  roles.add('Business validator');
  if (businessImpact >= 60) {
    roles.add('Security/control partner');
    roles.add('Cutover manager');
  } else if (answers.path === 'Refactor' || answers.path === 'Replatform') {
    roles.add('Cutover manager');
  }
  if (businessImpact >= 80) roles.add('Security/control partner');
  return [...roles];
}

// --- Scope Index ---------------------------------------------------------------

const EXCLUSION_TO_CATEGORY: Record<PlanningAnswers['scopeExclusions'][number], WorkPackage['category']> = {
  'data-remediation': 'Data migration',
  'interface-redesign': 'Integration/connectivity',
  'test-automation': 'Testing/resilience',
  'resilience-uplift': 'Testing/resilience',
  'source-retirement': 'Operational handoff',
};

function computeScopeIndex(answers: PlanningAnswers, config: ModelConfig) {
  const excludedCategories = new Set(answers.scopeExclusions.map((e) => EXCLUSION_TO_CATEGORY[e]));
  const packages = config.scopeIndex.map(({ category, maxWeight }) => ({
    category,
    weight: excludedCategories.has(category as WorkPackage['category']) ? 0 : maxWeight,
    maxWeight,
    excluded: excludedCategories.has(category as WorkPackage['category']),
  }));
  const scopeIndex = Math.min(100, packages.reduce((acc, p) => acc + p.weight, 0));
  return { scopeIndex, packages };
}

// --- Wave suitability -----------------------------------------------------------

function computeWaveSuitability(
  complexity: number,
  businessImpact: number,
  confidenceForBand: number,
  riskBand: RiskBand,
  anyCriticalGate: boolean,
  forcesLaterWave: boolean,
  dependencyInventoryUnknown: boolean,
  config: ModelConfig,
): WaveSuitability {
  const w = config.waveSuitability;
  if (forcesLaterWave || riskBand === 'Critical' || (businessImpact >= w.laterWaveBusinessImpactMin && confidenceForBand < w.laterWaveConfidenceMax) || dependencyInventoryUnknown) {
    return 'Later wave';
  }
  const readyConditions = [complexity < w.readyComplexityMax, businessImpact < w.readyBusinessImpactMax, confidenceForBand >= w.readyConfidenceMin];
  if (!anyCriticalGate && readyConditions.every(Boolean)) return 'Ready';
  if (!anyCriticalGate && readyConditions.filter(Boolean).length >= 2) return 'Conditional';
  return 'Later wave';
}

// --- Main orchestrator -----------------------------------------------------------

export function calculateEstimate(
  app: ApplicationRecord,
  answers: PlanningAnswers,
  config: ModelConfig,
  opts: { profileConfirmed: boolean; now?: Date } = { profileConfirmed: false },
): EstimateResult {
  const now = opts.now ?? new Date();
  const features = deriveFeatures(app, config, now);
  const evidenceQuality = computeEvidenceQuality(app, config, { profileConfirmed: opts.profileConfirmed, now });
  const { businessImpact, rpoReweighted } = computeBusinessImpact(features, config);

  const pathBaseline = config.pathBaselines[answers.path];
  const ledger = new Ledger();
  const capsApplied: CalculationTrace['capsApplied'] = [];

  // Core engineering components
  const techRemediationRaw = computeTechnologyRemediation(app, features, config);
  const techRemediation = techRemediationRaw * pathBaseline.changeFactor;
  ledger.add('core-path-baseline', `${answers.path} path baseline`, 'AWS platform build', pathBaseline.baselineWeeks, 'pathBaselines');
  ledger.add('core-tech-remediation', 'Technology remediation', 'Application change', techRemediation, 'computeTechnologyRemediation');

  const { integrationLoad, capped: integrationCapped } = computeIntegrationLoad(features, config);
  if (integrationCapped) capsApplied.push({ label: 'Integration load', limit: config.integrationLoad.cap, rawValue: integrationLoad });
  ledger.add('core-integration-load', 'Integration load', 'Integration/connectivity', integrationLoad, 'computeIntegrationLoad');

  const coreBeforeChange = pathBaseline.baselineWeeks + techRemediation + integrationLoad;
  const changeSurfaceMultiplier = config.changeSurfaceMultiplier[answers.changeSurface];

  const { dependencyLoad, countDerivedCapped } = computeDependencyLoad(app, features, config);
  if (countDerivedCapped) capsApplied.push({ label: 'Dependency count-derived effort', limit: config.dependencyLoad.countDerivedCap, rawValue: dependencyLoad });
  ledger.add('core-dependency-load', 'Dependency load', 'Integration/connectivity', dependencyLoad, 'computeDependencyLoad');

  const coreEngineeringWeeks = coreBeforeChange * changeSurfaceMultiplier + dependencyLoad;
  // Record the change-surface uplift as its own traceable delta rather than folding it silently into one package.
  ledger.add('core-change-surface', `Change surface uplift (${answers.changeSurface})`, 'Application change', coreBeforeChange * (changeSurfaceMultiplier - 1), 'changeSurfaceMultiplier');

  // Resilience
  const resilienceEffort = config.resilience.effortPerGapLevel * features.resilience.gap + features.resilience.recoveryTestPenaltyWeeks;
  ledger.add('resilience-gap', 'Resilience gap remediation', 'Testing/resilience', config.resilience.effortPerGapLevel * features.resilience.gap, 'deriveResilienceFeatures');
  if (features.resilience.recoveryTestPenaltyWeeks > 0) {
    ledger.add('resilience-test-penalty', 'Recovery test penalty', 'Testing/resilience', features.resilience.recoveryTestPenaltyWeeks, 'deriveResilienceFeatures');
  }

  // Assurance
  const assuranceBand = config.assurance.bands.find((b) => businessImpact <= b.maxImpact) ?? config.assurance.bands[config.assurance.bands.length - 1];
  const assuranceWeeks = assuranceBand.weeks;
  const perPackage = assuranceWeeks / config.assurance.packages.length;
  config.assurance.packages.forEach((name, i) => {
    ledger.add(`assurance-${i}`, name, 'Security/control evidence', perPackage, 'assurance.bands');
  });

  // Discovery
  const missingFields = missingWeightedFieldCount(app);
  const sme = computeSmeAvailability(answers, config);
  const dcfg = config.discovery;
  let discoveryRaw =
    dcfg.perMissingField * missingFields +
    (features.dependencyInventoryUnknown ? dcfg.unknownDependencyAdd : 0) +
    (features.integrationInventoryUnknown ? dcfg.unknownIntegrationAdd : 0) +
    sme.uncoveredDomainCount * dcfg.perUncoveredSmeDomain +
    (answers.documentationConfidence === 'low' ? dcfg.lowDocumentationAdd : 0);
  const discoveryCapped = discoveryRaw > dcfg.cap;
  if (discoveryCapped) capsApplied.push({ label: 'Discovery allowance', limit: dcfg.cap, rawValue: discoveryRaw });
  const discoveryWeeks = Math.min(discoveryRaw, dcfg.cap);
  ledger.add('discovery-allowance', 'Discovery allowance', 'Assess/design', discoveryWeeks, 'discovery');

  // Complexity (0-100 normalized blend)
  const cc = config.complexity;
  const pathComplexityScore = Math.min(100, (pathBaseline.pathComplexity / cc.maxima.path) * 100);
  const architectureComplexityScore = Math.min(100, (features.architectureComplexityMax / cc.maxima.architecture) * 100);
  const technologyComplexityScore = Math.min(100, (techRemediationRaw / cc.maxima.technology) * 100);
  const dependencyComplexityScore = Math.min(100, (dependencyLoad / cc.maxima.dependency) * 100);
  const integrationComplexityScore = Math.min(100, (integrationLoad / cc.maxima.integration) * 100);
  const resilienceComplexityScore = Math.min(100, (resilienceEffort / cc.maxima.resilience) * 100);
  const complexity =
    cc.weights.path * pathComplexityScore +
    cc.weights.architecture * architectureComplexityScore +
    cc.weights.technology * technologyComplexityScore +
    cc.weights.dependency * dependencyComplexityScore +
    cc.weights.integration * integrationComplexityScore +
    cc.weights.resilience * resilienceComplexityScore;

  // Delivery friction
  const friction = computeDeliveryFriction(answers, sme.smeGap, config);

  // Risk (pre-rules)
  let likelihood = config.risk.likelihoodWeights.complexity * complexity + config.risk.likelihoodWeights.deliveryFriction * friction.deliveryFriction;
  const consequenceFactor = config.risk.consequenceBase + businessImpact / config.risk.consequenceBusinessImpactDivisor;

  // Rules
  const ruleCtx: RuleContext = {
    app,
    answers,
    features,
    businessImpact,
    evidenceQuality: evidenceQuality.total,
    smeUncoveredDomainCount: sme.uncoveredDomainCount,
    allocationPct: answers.deliveryTeamAllocationPct,
    hasFixedTarget: answers.targetCompletionWeeks != null,
    integrationDetailCount: app.integrations.length,
  };
  const { fired, effects } = evaluateRules(ruleCtx, config.ruleSwitches);

  let riskFloor: RiskBand = 'Low';
  let confidencePenalty = 0;
  let anyForcesGate = false;
  let anyForcesLaterWave = false;
  const conflictNotes: string[] = [];
  for (const effect of effects as RuleEffect[]) {
    if (effect.addWorkPackages) ledger.addAll(effect.addWorkPackages, 'rulesEngine');
    if (effect.riskFloor) riskFloor = maxRiskBand(riskFloor, effect.riskFloor);
    if (effect.confidencePenaltyPoints) confidencePenalty += effect.confidencePenaltyPoints;
    if (effect.likelihoodBumpPoints) likelihood += effect.likelihoodBumpPoints;
    if (effect.forcesGate) anyForcesGate = true;
    if (effect.forcesLaterWave) anyForcesLaterWave = true;
    if (effect.conflictNotes) conflictNotes.push(...effect.conflictNotes);
  }
  likelihood = Math.min(100, likelihood);

  const riskExposure = Math.min(100, likelihood * consequenceFactor);
  const exposureBand = (config.risk.bands.find((b) => riskExposure <= b.max)?.band ?? 'Critical') as RiskBand;
  const riskBand = maxRiskBand(exposureBand, riskFloor);

  // Effort totals. Core/resilience/assurance/discovery come straight from their
  // formulas (not a ledger sum) so a rule that happens to add a package in the
  // same category can never be counted twice; only rule-added packages are summed
  // from the ledger, and work-package IDs keep those additions idempotent.
  const assuranceTotal = assuranceWeeks;
  const resilienceTotal = resilienceEffort;
  const ruleAddedWeeks = ledger.list().filter((p) => p.source === 'rulesEngine').reduce((acc, p) => acc + p.effortWeeks, 0);
  const expectedEffortWeeks = coreEngineeringWeeks + resilienceTotal + assuranceTotal + discoveryWeeks + ruleAddedWeeks;

  // Confidence & range
  const confidenceForBand = Math.max(0, evidenceQuality.total - confidencePenalty);
  const confidenceBand = (config.confidence.bands.find((b) => confidenceForBand >= b.min)?.band ?? 'Low') as ConfidenceBand;
  const evidenceWeakness = 1 - evidenceQuality.total / 100;
  const rangeWidth = Math.min(
    config.confidence.rangeWidth.cap,
    config.confidence.rangeWidth.base + config.confidence.rangeWidth.evidenceWeaknessCoefficient * evidenceWeakness + config.confidence.rangeWidth.businessImpactCoefficient * (businessImpact / 100),
  );
  const optimisticEffortWeeks = expectedEffortWeeks * (1 - rangeWidth);
  const conservativeEffortWeeks = expectedEffortWeeks * (1 + config.confidence.conservativeMultiplier * rangeWidth);

  // Capacity & duration
  const productivityFactor = config.capacity.fluencyProductivity[answers.awsFluency];
  const allocationFraction = answers.deliveryTeamAllocationPct / 100;
  const rawFte = answers.deliveryTeamCount * allocationFraction;
  const safeParallelFte = Math.min(rawFte, pathBaseline.parallelismCapFte);
  const effectiveFte = Math.max(config.capacity.minEffectiveFte, safeParallelFte * productivityFactor);
  const activeDurationWeeks = expectedEffortWeeks / effectiveFte;
  const calendarDurationWeeks = activeDurationWeeks + answers.externalWaitWeeks;

  let capacityGapWarning = false;
  let scheduleFeasibilityWarning = false;
  let requiredFte: number | null = null;
  if (answers.targetCompletionWeeks != null && answers.targetCompletionWeeks > 0) {
    requiredFte = expectedEffortWeeks / answers.targetCompletionWeeks;
    if (requiredFte > pathBaseline.parallelismCapFte) {
      capacityGapWarning = true;
      scheduleFeasibilityWarning = true;
    }
  }
  if (fired.some((r) => r.id === 'R-509')) scheduleFeasibilityWarning = true;

  // Team logic
  let minimumPeople = pathBaseline.minimumPeople;
  if (businessImpact >= 80) minimumPeople += 2;
  else if (businessImpact >= 60) minimumPeople += 1;
  const minimumRoles = buildMinimumRoles(app, answers, businessImpact);
  const minimumRoleFte = minimumPeople * allocationFraction;

  let suggestedFte: number;
  if (requiredFte != null) {
    suggestedFte = Math.max(minimumRoleFte, Math.min(requiredFte, pathBaseline.parallelismCapFte));
  } else {
    suggestedFte = Math.max(minimumRoleFte, pathBaseline.defaultFte);
  }
  const suggestedPeople = Math.ceil(suggestedFte / allocationFraction);

  // Scope Index
  const { scopeIndex, packages: scopePackages } = computeScopeIndex(answers, config);
  const hasExcludedMandatoryPackage = scopePackages.some((p) => p.excluded);

  // Wave suitability
  const waveSuitability = computeWaveSuitability(
    complexity,
    businessImpact,
    confidenceForBand,
    riskBand,
    anyForcesGate,
    anyForcesLaterWave,
    features.dependencyInventoryUnknown,
    config,
  );

  // Top drivers / risks / evidence-improvement actions
  const driverCandidates: { label: string; value: number }[] = [
    { label: 'Technology remediation', value: techRemediation },
    { label: 'Integration load', value: integrationLoad },
    { label: 'Dependency load', value: dependencyLoad },
    { label: 'Resilience gap remediation', value: resilienceEffort },
    { label: 'Assurance effort', value: assuranceTotal },
    { label: 'Discovery allowance', value: discoveryWeeks },
  ];
  const topDrivers = driverCandidates.sort((a, b) => b.value - a.value).slice(0, 3).filter((d) => d.value > 0).map((d) => `${d.label} (${d.value.toFixed(1)} pw)`);

  const riskCandidates: string[] = [
    ...fired.filter((r) => r.severity !== 'info').map((r) => r.effectSummary),
    hasExcludedMandatoryPackage ? 'Mandatory scope package excluded — risk carried forward.' : '',
    scheduleFeasibilityWarning ? 'Target completion window may not be achievable at current capacity.' : '',
  ].filter(Boolean);
  const topRisks = riskCandidates.slice(0, 3);

  const evidenceActions: string[] = [];
  if (features.dependencyInventoryUnknown) evidenceActions.push('Confirm the dependency inventory — upstream/downstream counts are unknown.');
  if (features.integrationInventoryUnknown) evidenceActions.push('Confirm the integration inventory — no detail records or count on file.');
  if (evidenceQuality.freshness < 75) evidenceActions.push('Refresh the CMDB record — last verified data is ageing.');
  if (evidenceQuality.consistency < 100) evidenceActions.push('Resolve flagged data conflicts before relying on this estimate.');
  if (!features.resilience.rpoPatternValidated && app.rpoMinutes != null) evidenceActions.push('Confirm a target data-replication pattern that satisfies the stated RPO.');
  if (rpoReweighted) evidenceActions.push('Capture the RPO — Business Impact weights were re-normalized without it.');
  const evidenceImprovementActions = evidenceActions.slice(0, 3);

  const trace: CalculationTrace = {
    normalizedInputs: {
      path: answers.path,
      changeSurface: answers.changeSurface,
      businessCriticality: app.businessCriticality,
      architectureStyle: app.architectureStyle,
      drTopology: app.drTopology,
      rtoMinutes: app.rtoMinutes,
      rpoMinutes: app.rpoMinutes,
    },
    sourceLineage: app.provenance,
    derivedFeatures: {
      ageYears: features.ageYears,
      criticalitySeverity: features.criticalitySeverity,
      rtoSeverity: features.rtoSeverity,
      rpoSeverity: features.rpoSeverity,
      rpoUnknown: features.rpoUnknown,
      exposureSeverity: features.exposureSeverity,
      resilienceCurrentLevel: features.resilience.currentLevel,
      resilienceRequiredLevel: features.resilience.requiredLevel,
      resilienceGap: features.resilience.gap,
      smeLowestAvailability: sme.lowestAvailability,
      smeMeanAvailability: sme.meanAvailability,
      smeGap: sme.smeGap,
      complexity,
      deliveryFriction: friction.deliveryFriction,
      likelihood,
      consequenceFactor,
      evidenceWeakness,
    },
    coefficients: {
      changeSurfaceMultiplier,
      pathChangeFactor: pathBaseline.changeFactor,
      rangeWidth,
    },
    formulas: [
      'BusinessImpact = 25 × (0.55×Criticality + 0.20×RTOSeverity + 0.10×RPOSeverity + 0.15×CustomerExposure)',
      'CoreEngineering = (PathBaseline + TechRemediation + IntegrationLoad) × ChangeSurfaceMultiplier + DependencyLoad',
      'ExpectedEffort = CoreEngineering + ResilienceEffort + AssuranceEffort + DiscoveryAllowance',
      'RiskExposure = min(100, (0.6×Complexity + 0.4×DeliveryFriction) × (0.5 + BusinessImpact/200))',
      'RangeWidth = min(0.45, 0.12 + 0.25×(1-EvidenceQuality/100) + 0.10×BusinessImpact/100)',
    ],
    workPackages: ledger.list(),
    capsApplied,
    rulesFired: fired,
    modelVersion: MODEL_VERSION,
  };

  return {
    id: `EST-${app.applicationId}-${Date.now()}`,
    applicationId: app.applicationId,
    path: answers.path,
    createdAt: now.toISOString(),
    answers,

    coreEngineeringWeeks,
    assuranceWeeks: assuranceTotal,
    discoveryWeeks,
    resilienceWeeks: resilienceTotal,
    expectedEffortWeeks,
    optimisticEffortWeeks,
    conservativeEffortWeeks,

    activeDurationWeeks,
    calendarDurationWeeks,

    minimumRoles,
    suggestedPeople,
    suggestedFte,
    effectiveFte,
    capacityGapWarning,
    scheduleFeasibilityWarning,

    scopeIndex,
    scopePackages,

    businessImpact,
    complexity,
    deliveryFriction: friction.deliveryFriction,
    likelihood,
    riskExposure,
    riskBand,

    evidenceQuality,
    confidenceBand,

    waveSuitability,

    topDrivers,
    topRisks,
    evidenceImprovementActions,

    trace,
  };
}

export { MODEL_VERSION };
