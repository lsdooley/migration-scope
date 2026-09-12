// Canonical domain types for MigrationScope.
// Pure types only — no UI imports, no runtime logic.

export type Provenance = 'CMDB' | 'Derived' | 'User confirmed' | 'User corrected' | 'Unknown';

export interface ProvenanceInfo {
  source: Provenance;
  timestamp?: string | null;
  correction?: { reason: string; correctedAt: string; previousValue?: unknown };
}

export type AWSPath = 'Relocate' | 'Rehost' | 'Replatform' | 'Repurchase' | 'Refactor';

export type ArchitectureStyle =
  | 'Single deployable'
  | 'Layered application'
  | 'Distributed services'
  | 'Event-driven/data-intensive'
  | 'Mainframe or specialized-platform coupled'
  | 'Mixed/unknown';

export type Criticality = 'Low' | 'Medium' | 'High' | 'Mission-critical' | 'Unknown';

export type DRTopology =
  | 'None'
  | 'Backup/restore'
  | 'Pilot light'
  | 'Warm standby'
  | 'Active/passive'
  | 'Active/active'
  | 'Unknown';

export type SupportStatus = 'current' | 'aging' | 'out-of-support' | 'bespoke-unknown';

export interface TechnologyComponent {
  name: string;
  kind: 'language' | 'framework' | 'runtime' | 'os' | 'database';
  version?: string | null;
  supportStatus: SupportStatus;
  majorVersionUpgradeNeeded?: boolean;
  awsTargetIncompatible?: boolean;
  specialistSkillRequired?: boolean;
  isPrimaryLanguage?: boolean;
}

export type DependencyDirection = 'upstream' | 'downstream';

export type DependencyRelationshipType =
  | 'Calls'
  | 'Runs on'
  | 'Hosted on'
  | 'Depends on'
  | 'Shares platform'
  | 'Unknown';

export interface DependencyRecord {
  id: string;
  direction: DependencyDirection;
  relationshipType: DependencyRelationshipType;
  critical: boolean;
  external: boolean;
  sharedPlatform: boolean;
}

export type IntegrationType =
  | 'API'
  | 'File'
  | 'Message'
  | 'Event/stream'
  | 'Database coupling'
  | 'UI/screen'
  | 'Batch'
  | 'Proprietary'
  | 'Unknown';

export interface IntegrationRecord {
  id: string;
  type: IntegrationType;
  direction: 'inbound' | 'outbound' | 'bidirectional' | 'Unknown';
  realTime: boolean;
  externalParty: boolean;
  businessCritical: boolean;
  endpointProtocolIdentityChange: boolean;
  aggregateOnly: boolean;
  authType?: string;
  protocolProduct?: string;
}

export type CustomerTransactionExposure = 'none' | 'indirect' | 'direct' | 'Unknown';
export type RecoveryTestStatus = 'passed' | 'failed' | 'never-tested' | 'Unknown';

export interface ApplicationRecord {
  // --- required canonical fields ---
  schemaVersion: string;
  applicationId: string;
  applicationName: string;
  lastVerifiedDate: string | null;
  languages: string[];
  runtimePlatforms: string[];
  architectureStyle: ArchitectureStyle;
  firstProductionDate: string | null;
  upstreamDependencyCount: number | null;
  downstreamDependencyCount: number | null;
  integrationCount: number | null;
  integrationTypes: string[];
  businessCriticality: Criticality;
  drTopology: DRTopology;
  rtoMinutes: number | null;

  // --- recommended fields used by the calculation/rules model ---
  applicationSysId?: string;
  applicationServiceIds?: string[];
  businessOwner?: string;
  technicalOwner?: string;
  supportGroup?: string;
  lifecycleStatus?: string;
  frameworks?: string[];
  operatingSystems?: string[];
  databases?: string[];
  deploymentModel?: string;
  environmentCount?: number;
  productionInstanceCount?: number;
  architectureComponents?: string[];
  technologyComponents: TechnologyComponent[];

  dependencies: DependencyRecord[];
  dependencyIds?: string[];
  criticalDependencyCount: number | null;
  externalDependencyCount: number | null;
  unknownDependencyIndicator: boolean;
  sharedPlatformDependencyCount: number | null;

  integrations: IntegrationRecord[];
  integrationIds?: string[];
  criticalIntegrationCount: number | null;
  externalPartyIntegrationCount: number | null;
  realTimeIntegrationCount: number | null;
  integrationInventoryConfidence: 'high' | 'medium' | 'low' | 'Unknown';

  availabilityTier?: string;
  rpoMinutes: number | null;
  targetReplicationPattern?: string | null;
  currentRecoveryTestStatus: RecoveryTestStatus;
  lastRecoveryTestDate: string | null;
  recoveryTestResult?: string;
  multiRegionOrSite?: boolean;

  dataClassification?: string;
  regulatoryTags?: string[];
  customerTransactionExposure: CustomerTransactionExposure;
  incidentSev1_12m: number | null;
  incidentSev2_12m: number | null;
  changeFailureRate: number | null;

  cmdbCompleteness?: number | null;
  cmdbCorrectness?: number | null;
  cmdbCompliance?: number | null;

  // --- POC bookkeeping ---
  isSynthetic: boolean;
  provenance: Record<string, ProvenanceInfo>;
  sourceFileName?: string;
  sourceFileHash?: string;
  importedAt?: string;
  conflicts?: string[];
  aggregateDetailMismatch?: { field: string; aggregate: number; detail: number }[];
}

export type SMECoverage = 'none' | 'one-unprotected' | 'primary-plus-backup' | 'resilient';

export type ChangeSurface =
  | 'Configuration only'
  | 'Runtime/platform'
  | 'Data tier'
  | 'Interfaces/identity'
  | 'Material redesign';

export type ScopeExclusion =
  | 'data-remediation'
  | 'interface-redesign'
  | 'test-automation'
  | 'resilience-uplift'
  | 'source-retirement';

export type AWSFluency = 'new' | 'assisted' | 'delivered-once' | 'repeated-delivery';
export type TestEvidence = 'tribal-manual' | 'partial' | 'repeatable' | 'automated';
export type DocumentationConfidence = 'low' | 'medium' | 'high' | 'recently-verified';
export type ConstraintType =
  | 'fixed-event'
  | 'release-blackout'
  | 'vendor-dependency'
  | 'shared-environment'
  | 'approval-lead-time';

export interface SMEDetail {
  domain: 'business' | 'application' | 'dataOps';
  exactCount: number;
}

export interface PlanningAnswers {
  path: AWSPath;
  changeSurface: ChangeSurface;
  targetCompletionWeeks: number | null;
  scopeExclusions: ScopeExclusion[];
  businessSmeCoverage: SMECoverage;
  applicationSmeCoverage: SMECoverage;
  dataOpsSmeCoverage: SMECoverage;
  deliveryTeamCount: number; // 1-12
  deliveryTeamAllocationPct: 25 | 50 | 75 | 100;
  awsFluency: AWSFluency;
  testEvidence: TestEvidence;
  documentationConfidence: DocumentationConfidence;
  constraints: ConstraintType[];
  externalWaitWeeks: number;
  smeDetail: SMEDetail[];
}

export interface WorkPackage {
  id: string;
  name: string;
  category:
    | 'Assess/design'
    | 'AWS platform build'
    | 'Application change'
    | 'Data migration'
    | 'Integration/connectivity'
    | 'Security/control evidence'
    | 'Testing/resilience'
    | 'Cutover/rollback'
    | 'Operational handoff'
    | 'Hypercare/closure';
  effortWeeks: number;
  source: string; // formula/rule that produced it
  excluded?: boolean;
}

export interface FiredRule {
  id: string;
  version: string;
  severity: 'info' | 'warning' | 'critical';
  isGate: boolean;
  userExplanation: string;
  effectSummary: string;
}

export type RiskBand = 'Low' | 'Moderate' | 'High' | 'Critical';
export type ConfidenceBand = 'Low' | 'Medium' | 'High';
export type WaveSuitability = 'Ready' | 'Conditional' | 'Later wave';

export interface EvidenceQualityBreakdown {
  completeness: number;
  freshness: number;
  consistency: number;
  sourceAuthority: number;
  humanConfirmation: number;
  total: number;
}

export interface CalculationTrace {
  normalizedInputs: Record<string, unknown>;
  sourceLineage: Record<string, ProvenanceInfo>;
  derivedFeatures: Record<string, number | string | boolean | null>;
  coefficients: Record<string, number>;
  formulas: string[];
  workPackages: WorkPackage[];
  capsApplied: { label: string; limit: number; rawValue: number }[];
  rulesFired: FiredRule[];
  modelVersion: string;
}

export interface EstimateResult {
  id: string;
  applicationId: string;
  path: AWSPath;
  createdAt: string;
  answers: PlanningAnswers;

  coreEngineeringWeeks: number;
  assuranceWeeks: number;
  discoveryWeeks: number;
  resilienceWeeks: number;
  expectedEffortWeeks: number;
  optimisticEffortWeeks: number;
  conservativeEffortWeeks: number;

  activeDurationWeeks: number;
  calendarDurationWeeks: number;

  minimumRoles: string[];
  suggestedPeople: number;
  suggestedFte: number;
  effectiveFte: number;
  capacityGapWarning: boolean;
  scheduleFeasibilityWarning: boolean;

  scopeIndex: number;
  scopePackages: { category: string; weight: number; maxWeight: number; excluded: boolean }[];

  businessImpact: number;
  complexity: number;
  deliveryFriction: number;
  likelihood: number;
  riskExposure: number;
  riskBand: RiskBand;

  evidenceQuality: EvidenceQualityBreakdown;
  confidenceBand: ConfidenceBand;

  waveSuitability: WaveSuitability;

  topDrivers: string[];
  topRisks: string[];
  evidenceImprovementActions: string[];

  trace: CalculationTrace;
}
