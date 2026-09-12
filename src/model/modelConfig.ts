// All weights, coefficients, caps, thresholds, and lookup tables live here.
// This is the single source of truth the calculation engine reads from.
// Model Configuration view can export/import/edit this object at runtime.

export const MODEL_VERSION = 'POC-1.1';

export interface PathBaseline {
  path: string;
  baselineWeeks: number;
  pathComplexity: number; // 1-4
  changeFactor: number; // technology remediation path factor
  parallelismCapFte: number;
  minimumPeople: number;
  defaultFte: number;
}

export interface ModelConfig {
  version: string;
  evidenceQuality: {
    weights: { completeness: number; freshness: number; consistency: number; sourceAuthority: number; humanConfirmation: number };
    freshnessThresholdsDays: { within: number; score: number }[];
    consistencyPenaltyPerConflict: number;
    sourceAuthorityScores: { cmdbOrDiscovery: number; governedImport: number; userAssertion: number; unverifiedNote: number };
    humanConfirmationScores: { confirmed: number; unconfirmed: number };
  };
  businessImpact: {
    weights: { criticality: number; rtoSeverity: number; rpoSeverity: number; customerTransactionExposure: number };
    scale: number; // 25
    cap: number;
  };
  pathBaselines: Record<string, PathBaseline>;
  architectureComplexity: Record<string, number>;
  technologyRemediation: {
    perComponent: { current: number; aging: number; outOfSupport: number; bespokeUnknown: number };
    adders: { majorVersionUpgrade: number; awsTargetIncompatibility: number; specialistSkill: number; additionalPrimaryLanguage: number };
    additionalPrimaryLanguageCap: number;
  };
  dependencyLoad: {
    baseCoefficient: number; // 0.6 x sqrt(upstream+downstream)
    criticalCoefficient: number;
    sharedPlatformCoefficient: number;
    externalCoefficient: number;
    unknownInventoryAdd: number;
    countDerivedCap: number; // cap before unknown-data addition
  };
  integrationLoad: {
    baseType: Record<string, number>;
    multipliers: { realTime: number; externalParty: number; businessCritical: number; endpointChange: number; aggregateOnly: number };
    cap: number;
  };
  changeSurfaceMultiplier: Record<string, number>;
  resilience: {
    currentLevel: Record<string, number>;
    requiredLevelFromRto: { maxMinutes: number; level: number }[];
    effortPerGapLevel: number;
    failedTestAdd: number;
    neverTestedAdd: number;
    staleTestAdd: number;
    staleTestThresholdDays: number;
  };
  assurance: {
    bands: { maxImpact: number; weeks: number }[];
    packages: string[];
  };
  discovery: {
    perMissingField: number;
    unknownDependencyAdd: number;
    unknownIntegrationAdd: number;
    perUncoveredSmeDomain: number;
    lowDocumentationAdd: number;
    cap: number;
  };
  complexity: {
    weights: { path: number; architecture: number; technology: number; dependency: number; integration: number; resilience: number };
    maxima: { path: number; architecture: number; technology: number; dependency: number; integration: number; resilience: number };
  };
  deliveryFriction: {
    weights: { smeGap: number; capacityConstraint: number; awsFluencyGap: number; testReadinessGap: number; documentationGap: number; constraintLoad: number };
    scale: number;
  };
  risk: {
    likelihoodWeights: { complexity: number; deliveryFriction: number };
    consequenceBase: number;
    consequenceBusinessImpactDivisor: number;
    bands: { max: number; band: string }[];
  };
  confidence: {
    bands: { min: number; band: string }[];
    rangeWidth: { base: number; evidenceWeaknessCoefficient: number; businessImpactCoefficient: number; cap: number };
    conservativeMultiplier: number;
  };
  capacity: {
    fluencyProductivity: Record<string, number>;
    minEffectiveFte: number;
  };
  smeAvailability: Record<string, { count: number; availability: number }>;
  scopeIndex: { category: string; maxWeight: number }[];
  waveSuitability: {
    readyComplexityMax: number;
    readyBusinessImpactMax: number;
    readyConfidenceMin: number;
    laterWaveBusinessImpactMin: number;
    laterWaveConfidenceMax: number;
  };
  poc: { maxNormalQuestions: number; maxQuestionsWithConditional: number; fileSizeLimitMb: number };
  ruleSwitches: Record<string, boolean>;
}

export const defaultModelConfig: ModelConfig = {
  version: MODEL_VERSION,

  evidenceQuality: {
    weights: { completeness: 0.3, freshness: 0.2, consistency: 0.2, sourceAuthority: 0.2, humanConfirmation: 0.1 },
    freshnessThresholdsDays: [
      { within: 90, score: 100 },
      { within: 180, score: 75 },
      { within: 365, score: 50 },
      { within: 730, score: 25 },
    ],
    consistencyPenaltyPerConflict: 20,
    sourceAuthorityScores: { cmdbOrDiscovery: 100, governedImport: 75, userAssertion: 50, unverifiedNote: 25 },
    humanConfirmationScores: { confirmed: 100, unconfirmed: 40 },
  },

  businessImpact: {
    weights: { criticality: 0.55, rtoSeverity: 0.2, rpoSeverity: 0.1, customerTransactionExposure: 0.15 },
    scale: 25,
    cap: 100,
  },

  pathBaselines: {
    Relocate: { path: 'Relocate', baselineWeeks: 6, pathComplexity: 1, changeFactor: 0.4, parallelismCapFte: 4, minimumPeople: 3, defaultFte: 2 },
    Rehost: { path: 'Rehost', baselineWeeks: 8, pathComplexity: 1, changeFactor: 0.6, parallelismCapFte: 5, minimumPeople: 3, defaultFte: 2.5 },
    Replatform: { path: 'Replatform', baselineWeeks: 14, pathComplexity: 2, changeFactor: 1.0, parallelismCapFte: 6, minimumPeople: 4, defaultFte: 3 },
    Repurchase: { path: 'Repurchase', baselineWeeks: 12, pathComplexity: 2, changeFactor: 0.5, parallelismCapFte: 5, minimumPeople: 4, defaultFte: 3 },
    Refactor: { path: 'Refactor', baselineWeeks: 28, pathComplexity: 4, changeFactor: 1.4, parallelismCapFte: 8, minimumPeople: 6, defaultFte: 4 },
  },

  architectureComplexity: {
    'Single deployable': 1,
    'Layered application': 2,
    'Distributed services': 3,
    'Event-driven/data-intensive': 3,
    'Mainframe or specialized-platform coupled': 4,
    'Mixed/unknown': 4,
  },

  technologyRemediation: {
    perComponent: { current: 0, aging: 1.5, outOfSupport: 5, bespokeUnknown: 6 },
    adders: { majorVersionUpgrade: 3, awsTargetIncompatibility: 5, specialistSkill: 2, additionalPrimaryLanguage: 1 },
    additionalPrimaryLanguageCap: 3,
  },

  dependencyLoad: {
    baseCoefficient: 0.6,
    criticalCoefficient: 0.8,
    sharedPlatformCoefficient: 1.0,
    externalCoefficient: 1.5,
    unknownInventoryAdd: 4.0,
    countDerivedCap: 18,
  },

  integrationLoad: {
    baseType: {
      API: 0.7,
      File: 0.9,
      Message: 1.0,
      'Event/stream': 1.1,
      'Database coupling': 1.4,
      'UI/screen': 0.8,
      Batch: 1.0,
      Proprietary: 1.8,
      Unknown: 1.5,
    },
    multipliers: { realTime: 1.25, externalParty: 1.35, businessCritical: 1.3, endpointChange: 1.2, aggregateOnly: 1.15 },
    cap: 30,
  },

  changeSurfaceMultiplier: {
    'Configuration only': 1.0,
    'Runtime/platform': 1.08,
    'Data tier': 1.16,
    'Interfaces/identity': 1.25,
    'Material redesign': 1.4,
  },

  resilience: {
    currentLevel: {
      None: 0,
      'Backup/restore': 1,
      'Pilot light': 2,
      'Warm standby': 3,
      'Active/passive': 4,
      'Active/active': 5,
      Unknown: 0,
    },
    requiredLevelFromRto: [
      { maxMinutes: 15, level: 5 },
      { maxMinutes: 120, level: 4 },
      { maxMinutes: 480, level: 3 },
      { maxMinutes: 1440, level: 2 },
      { maxMinutes: Infinity, level: 1 },
    ],
    effortPerGapLevel: 4,
    failedTestAdd: 3,
    neverTestedAdd: 2,
    staleTestAdd: 1,
    staleTestThresholdDays: 365,
  },

  assurance: {
    bands: [
      { maxImpact: 19, weeks: 2 },
      { maxImpact: 39, weeks: 4 },
      { maxImpact: 59, weeks: 8 },
      { maxImpact: 79, weeks: 14 },
      { maxImpact: 100, weeks: 22 },
    ],
    packages: [
      'Architecture/threat review',
      'Control evidence',
      'Regression',
      'Performance',
      'Resilience validation',
      'Cutover rehearsal',
      'Rollback rehearsal',
      'Operational readiness',
      'Hypercare',
    ],
  },

  discovery: {
    perMissingField: 0.75,
    unknownDependencyAdd: 4,
    unknownIntegrationAdd: 3,
    perUncoveredSmeDomain: 2,
    lowDocumentationAdd: 2,
    cap: 16,
  },

  complexity: {
    weights: { path: 0.15, architecture: 0.15, technology: 0.2, dependency: 0.2, integration: 0.2, resilience: 0.1 },
    maxima: { path: 4, architecture: 4, technology: 40, dependency: 18, integration: 30, resilience: 20 },
  },

  deliveryFriction: {
    weights: { smeGap: 0.25, capacityConstraint: 0.2, awsFluencyGap: 0.2, testReadinessGap: 0.15, documentationGap: 0.1, constraintLoad: 0.1 },
    scale: 25,
  },

  risk: {
    likelihoodWeights: { complexity: 0.6, deliveryFriction: 0.4 },
    consequenceBase: 0.5,
    consequenceBusinessImpactDivisor: 200,
    bands: [
      { max: 24, band: 'Low' },
      { max: 49, band: 'Moderate' },
      { max: 74, band: 'High' },
      { max: 100, band: 'Critical' },
    ],
  },

  confidence: {
    bands: [
      { min: 80, band: 'High' },
      { min: 55, band: 'Medium' },
      { min: 0, band: 'Low' },
    ],
    rangeWidth: { base: 0.12, evidenceWeaknessCoefficient: 0.25, businessImpactCoefficient: 0.1, cap: 0.45 },
    conservativeMultiplier: 1.5,
  },

  capacity: {
    fluencyProductivity: { new: 0.65, assisted: 0.8, 'delivered-once': 0.95, 'repeated-delivery': 1.05 },
    minEffectiveFte: 0.5,
  },

  smeAvailability: {
    none: { count: 0, availability: 0.0 },
    'one-unprotected': { count: 1, availability: 0.45 },
    'primary-plus-backup': { count: 2, availability: 0.8 },
    resilient: { count: 3, availability: 1.0 },
  },

  scopeIndex: [
    { category: 'Assess/design', maxWeight: 10 },
    { category: 'AWS platform build', maxWeight: 10 },
    { category: 'Application change', maxWeight: 18 },
    { category: 'Data migration', maxWeight: 12 },
    { category: 'Integration/connectivity', maxWeight: 15 },
    { category: 'Security/control evidence', maxWeight: 10 },
    { category: 'Testing/resilience', maxWeight: 12 },
    { category: 'Cutover/rollback', maxWeight: 7 },
    { category: 'Operational handoff', maxWeight: 4 },
    { category: 'Hypercare/closure', maxWeight: 2 },
  ],

  waveSuitability: {
    readyComplexityMax: 45,
    readyBusinessImpactMax: 60,
    readyConfidenceMin: 70,
    laterWaveBusinessImpactMin: 80,
    laterWaveConfidenceMax: 70,
  },

  poc: { maxNormalQuestions: 12, maxQuestionsWithConditional: 15, fileSizeLimitMb: 5 },

  ruleSwitches: {
    'R-101': true, 'R-204': true, 'R-307': true, 'R-412': true, 'R-509': true,
    'R-610': true, 'R-611': true, 'R-702': true, 'R-703': true, 'R-804': true, 'R-901': true,
  },
};

/** Validate a model config's weights/thresholds before accepting an edit or import. */
export function validateModelConfig(config: ModelConfig): string[] {
  const errors: string[] = [];

  const weightGroups: [string, Record<string, number>][] = [
    ['evidenceQuality.weights', config.evidenceQuality.weights],
    ['businessImpact.weights', config.businessImpact.weights],
    ['complexity.weights', config.complexity.weights],
    ['deliveryFriction.weights', config.deliveryFriction.weights],
  ];
  for (const [name, weights] of weightGroups) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      errors.push(`${name} must sum to 1.0 (got ${sum.toFixed(3)})`);
    }
    for (const [k, v] of Object.entries(weights)) {
      if (v < 0 || v > 1) errors.push(`${name}.${k} must be between 0 and 1 (got ${v})`);
    }
  }

  if (config.risk.likelihoodWeights.complexity + config.risk.likelihoodWeights.deliveryFriction !== 1) {
    errors.push('risk.likelihoodWeights must sum to 1.0');
  }

  const riskBands = config.risk.bands;
  for (let i = 1; i < riskBands.length; i++) {
    if (riskBands[i].max <= riskBands[i - 1].max) errors.push('risk.bands thresholds must be strictly increasing');
  }

  const confBands = config.confidence.bands;
  for (let i = 1; i < confBands.length; i++) {
    if (confBands[i].min >= confBands[i - 1].min) errors.push('confidence.bands thresholds must be strictly decreasing by position');
  }

  if (config.confidence.rangeWidth.cap <= 0 || config.confidence.rangeWidth.cap > 1) {
    errors.push('confidence.rangeWidth.cap must be between 0 and 1');
  }

  for (const [path, baseline] of Object.entries(config.pathBaselines)) {
    if (baseline.baselineWeeks <= 0) errors.push(`pathBaselines.${path}.baselineWeeks must be positive`);
    if (baseline.parallelismCapFte <= 0) errors.push(`pathBaselines.${path}.parallelismCapFte must be positive`);
    if (baseline.minimumPeople <= 0) errors.push(`pathBaselines.${path}.minimumPeople must be positive`);
  }

  if (config.poc.maxNormalQuestions > config.poc.maxQuestionsWithConditional) {
    errors.push('poc.maxNormalQuestions cannot exceed poc.maxQuestionsWithConditional');
  }
  if (config.poc.maxQuestionsWithConditional > 15) {
    errors.push('poc.maxQuestionsWithConditional cannot exceed 15');
  }

  const scopeSum = config.scopeIndex.reduce((a, b) => a + b.maxWeight, 0);
  if (scopeSum !== 100) {
    errors.push(`scopeIndex maxWeights must total 100 (got ${scopeSum})`);
  }

  return errors;
}
