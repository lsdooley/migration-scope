import { describe, expect, it } from 'vitest';
import { calculateEstimate } from './calculationEngine';
import { defaultModelConfig } from './modelConfig';
import { makeAnswers, makeApp } from './testHelpers';
import { parseCsv } from '../parsers/csvParser';

const config = defaultModelConfig;

describe('Rules engine', () => {
  it('5. integration detail that mismatches the aggregate count fires R-702', async () => {
    const csv = [
      'application_id,application_name,integration_count,integrations_detail',
      `SYN-TEST,Test App,5,"[{""id"":""I1"",""type"":""API"",""direction"":""inbound"",""realTime"":false,""externalParty"":false,""businessCritical"":false,""endpointProtocolIdentityChange"":false,""aggregateOnly"":false}]"`,
    ].join('\n');
    const parseResult = await parseCsv(csv, 'test.csv');
    expect(parseResult.accepted).toHaveLength(1);
    expect(parseResult.accepted[0].conflicts?.some((c) => c.includes('integration_count'))).toBe(true);

    const app = makeApp({ integrationCount: 5, integrations: [
      { id: 'I1', type: 'API', direction: 'inbound', realTime: false, externalParty: false, businessCritical: false, endpointProtocolIdentityChange: false, aggregateOnly: false },
    ] });
    const result = calculateEstimate(app, makeAnswers(), config);
    expect(result.trace.rulesFired.map((r) => r.id)).toContain('R-702');
  });

  it('7. a failed recovery test adds remediation work and raises likelihood', () => {
    const answers = makeAnswers();
    const passed = calculateEstimate(makeApp({ currentRecoveryTestStatus: 'passed' }), answers, config);
    const failed = calculateEstimate(makeApp({ currentRecoveryTestStatus: 'failed' }), answers, config);
    expect(failed.trace.rulesFired.map((r) => r.id)).toContain('R-804');
    expect(failed.resilienceWeeks).toBeGreaterThan(passed.resilienceWeeks);
    expect(failed.likelihood).toBeGreaterThan(passed.likelihood);
  });

  it('9. high Business Impact with low Evidence Quality fires R-204', () => {
    const highImpactLowEvidence = makeApp({
      businessCriticality: 'Mission-critical',
      customerTransactionExposure: 'direct',
      rtoMinutes: 15,
      rpoMinutes: 1,
      lastVerifiedDate: '2018-01-01',
      businessOwner: undefined,
      technicalOwner: undefined,
      supportGroup: undefined,
      lifecycleStatus: undefined,
      frameworks: [],
      operatingSystems: [],
      databases: [],
      dependencyIds: [],
      availabilityTier: undefined,
      dataClassification: undefined,
      regulatoryTags: [],
    });
    const result = calculateEstimate(highImpactLowEvidence, makeAnswers(), config, { profileConfirmed: false });
    expect(result.businessImpact).toBeGreaterThanOrEqual(80);
    expect(result.evidenceQuality.total).toBeLessThan(55);
    expect(result.trace.rulesFired.map((r) => r.id)).toContain('R-204');
    expect(result.riskBand === 'High' || result.riskBand === 'Critical').toBe(true);
  });
});

describe('Capacity and scope', () => {
  it('10. team capacity cannot exceed the path parallelism cap', () => {
    const answers = makeAnswers({ path: 'Relocate', deliveryTeamCount: 12, deliveryTeamAllocationPct: 100 });
    const result = calculateEstimate(makeApp(), answers, config);
    expect(result.effectiveFte).toBeLessThanOrEqual(config.pathBaselines.Relocate.parallelismCapFte * config.capacity.fluencyProductivity[answers.awsFluency]);
  });

  it('11. an excluded mandatory scope package remains visible and raises risk', () => {
    const answers = makeAnswers({ scopeExclusions: ['data-remediation'] });
    const result = calculateEstimate(makeApp(), answers, config);
    const dataMigration = result.scopePackages.find((p) => p.category === 'Data migration');
    expect(dataMigration?.excluded).toBe(true);
    expect(result.scopeIndex).toBeLessThan(100);
    expect(result.topRisks.some((r) => r.toLowerCase().includes('excluded'))).toBe(true);
  });

  it('12. changing the migration path recomputes the relevant packages', () => {
    const app = makeApp();
    const rehost = calculateEstimate(app, makeAnswers({ path: 'Rehost' }), config);
    const refactor = calculateEstimate(app, makeAnswers({ path: 'Refactor' }), config);
    expect(refactor.expectedEffortWeeks).toBeGreaterThan(rehost.expectedEffortWeeks);
    expect(refactor.minimumRoles.length).toBeGreaterThanOrEqual(rehost.minimumRoles.length - 1);
  });

  it('17. work-package IDs prevent double counting across repeated calculation', () => {
    const app = makeApp({ architectureStyle: 'Distributed services' });
    const answers = makeAnswers({ path: 'Refactor' });
    const result = calculateEstimate(app, answers, config);
    const ids = result.trace.workPackages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Running the calculation twice must yield the same total — no accumulation across calls.
    const again = calculateEstimate(app, answers, config);
    expect(again.expectedEffortWeeks).toBeCloseTo(result.expectedEffortWeeks, 6);
  });
});
