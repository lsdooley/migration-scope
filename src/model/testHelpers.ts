import type { ApplicationRecord, PlanningAnswers } from './types';
import { SCHEMA_VERSION } from './schemas';

// Shared test fixtures — not part of the production bundle's public surface,
// but colocated with the model so engine and parser tests can both use it.

export function makeAnswers(overrides: Partial<PlanningAnswers> = {}): PlanningAnswers {
  return {
    path: 'Replatform',
    changeSurface: 'Runtime/platform',
    targetCompletionWeeks: null,
    scopeExclusions: [],
    businessSmeCoverage: 'primary-plus-backup',
    applicationSmeCoverage: 'primary-plus-backup',
    dataOpsSmeCoverage: 'primary-plus-backup',
    deliveryTeamCount: 4,
    deliveryTeamAllocationPct: 75,
    awsFluency: 'assisted',
    testEvidence: 'partial',
    documentationConfidence: 'medium',
    constraints: [],
    externalWaitWeeks: 0,
    smeDetail: [],
    ...overrides,
  };
}

export function makeApp(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  const base: ApplicationRecord = {
    schemaVersion: SCHEMA_VERSION,
    applicationId: 'TEST-APP-001',
    applicationName: 'Test Application',
    lastVerifiedDate: '2026-08-01',
    languages: ['Java'],
    runtimePlatforms: ['OpenJDK 17'],
    architectureStyle: 'Layered application',
    firstProductionDate: '2020-01-01',
    upstreamDependencyCount: 2,
    downstreamDependencyCount: 2,
    integrationCount: 2,
    integrationTypes: ['API'],
    businessCriticality: 'Medium',
    drTopology: 'Warm standby',
    rtoMinutes: 240,
    technologyComponents: [{ name: 'Java', kind: 'language', version: '17', supportStatus: 'current', isPrimaryLanguage: true }],
    dependencies: [],
    criticalDependencyCount: 0,
    externalDependencyCount: 0,
    unknownDependencyIndicator: false,
    sharedPlatformDependencyCount: 0,
    integrations: [
      { id: 'INT-1', type: 'API', direction: 'outbound', realTime: false, externalParty: false, businessCritical: false, endpointProtocolIdentityChange: false, aggregateOnly: false },
      { id: 'INT-2', type: 'API', direction: 'inbound', realTime: false, externalParty: false, businessCritical: false, endpointProtocolIdentityChange: false, aggregateOnly: false },
    ],
    criticalIntegrationCount: 0,
    externalPartyIntegrationCount: 0,
    realTimeIntegrationCount: 0,
    integrationInventoryConfidence: 'high',
    rpoMinutes: 60,
    currentRecoveryTestStatus: 'passed',
    lastRecoveryTestDate: '2026-06-01',
    customerTransactionExposure: 'indirect',
    incidentSev1_12m: 0,
    incidentSev2_12m: 0,
    changeFailureRate: 0.05,
    isSynthetic: true,
    provenance: {},
  };
  return { ...base, ...overrides };
}
