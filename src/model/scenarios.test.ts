import { describe, expect, it } from 'vitest';
import { calculateEstimate } from './calculationEngine';
import { defaultModelConfig } from './modelConfig';
import { syntheticApplications } from '../data/syntheticData';
import { makeAnswers } from './testHelpers';

const config = defaultModelConfig;

function findApp(id: string) {
  const app = syntheticApplications.find((a) => a.applicationId === id);
  if (!app) throw new Error(`fixture ${id} not found`);
  return app;
}

describe('End-to-end scenarios', () => {
  it('low-impact isolated application (SYN-APP-001) gets a narrow range and a Ready/Conditional wave status', () => {
    const app = findApp('SYN-APP-001');
    const result = calculateEstimate(app, makeAnswers({ path: 'Rehost' }), config, { profileConfirmed: true });
    const rangeRatio = (result.conservativeEffortWeeks - result.optimisticEffortWeeks) / result.expectedEffortWeeks;
    expect(rangeRatio).toBeLessThan(0.9);
    expect(['Ready', 'Conditional']).toContain(result.waveSuitability);
    expect(result.riskBand === 'Low' || result.riskBand === 'Moderate').toBe(true);
  });

  it('high-impact payments application (SYN-APP-003) gets deeper assurance and additional mandatory roles', () => {
    const lowImpactApp = findApp('SYN-APP-001');
    const paymentsApp = findApp('SYN-APP-003');
    const lowResult = calculateEstimate(lowImpactApp, makeAnswers({ path: 'Rehost' }), config, { profileConfirmed: true });
    const paymentsResult = calculateEstimate(paymentsApp, makeAnswers({ path: 'Replatform' }), config, { profileConfirmed: true });

    expect(paymentsResult.businessImpact).toBeGreaterThan(lowResult.businessImpact);
    expect(paymentsResult.assuranceWeeks).toBeGreaterThan(lowResult.assuranceWeeks);
    expect(paymentsResult.minimumRoles).toContain('Security/control partner');
    expect(paymentsResult.minimumRoles.length).toBeGreaterThan(lowResult.minimumRoles.length);
  });

  it('stale, failed-recovery application (SYN-APP-012) gets low confidence, resilience remediation, and a review warning', () => {
    const app = findApp('SYN-APP-012');
    const result = calculateEstimate(app, makeAnswers({ path: 'Replatform' }), config, { profileConfirmed: false });

    expect(result.confidenceBand).toBe('Low');
    expect(result.trace.rulesFired.map((r) => r.id)).toContain('R-804');
    expect(result.resilienceWeeks).toBeGreaterThan(0);
    expect(result.topRisks.length).toBeGreaterThan(0);
  });
});
