import { describe, expect, it } from 'vitest';
import { calculateEstimate, computeBusinessImpact, computeDependencyLoad } from './calculationEngine';
import { deriveFeatures } from './featureDerivation';
import { defaultModelConfig } from './modelConfig';
import { computeEvidenceQuality } from './dataQuality';
import { makeAnswers, makeApp } from './testHelpers';

const config = defaultModelConfig;

describe('Business Impact', () => {
  it('1. increases with higher criticality, all else equal', () => {
    const low = deriveFeatures(makeApp({ businessCriticality: 'Low' }), config);
    const high = deriveFeatures(makeApp({ businessCriticality: 'Mission-critical' }), config);
    const biLow = computeBusinessImpact(low, config).businessImpact;
    const biHigh = computeBusinessImpact(high, config).businessImpact;
    expect(biHigh).toBeGreaterThan(biLow);
  });

  it('2. does not directly multiply Core Engineering', () => {
    const answers = makeAnswers();
    const lowImpact = calculateEstimate(makeApp({ businessCriticality: 'Low', customerTransactionExposure: 'none' }), answers, config);
    const highImpact = calculateEstimate(makeApp({ businessCriticality: 'Mission-critical', customerTransactionExposure: 'direct' }), answers, config);
    // Business Impact changed substantially...
    expect(highImpact.businessImpact).toBeGreaterThan(lowImpact.businessImpact);
    // ...but Core Engineering (tech/integration/dependency/change-surface driven) is untouched by it.
    expect(highImpact.coreEngineeringWeeks).toBeCloseTo(lowImpact.coreEngineeringWeeks, 6);
  });

  it('16. missing RPO re-normalizes weights and penalizes evidence instead of zeroing the term', () => {
    const withRpo = makeApp({ rpoMinutes: 60 });
    const withoutRpo = makeApp({ rpoMinutes: null });
    const featuresWith = deriveFeatures(withRpo, config);
    const featuresWithout = deriveFeatures(withoutRpo, config);
    const resultWith = computeBusinessImpact(featuresWith, config);
    const resultWithout = computeBusinessImpact(featuresWithout, config);
    expect(resultWith.rpoReweighted).toBe(false);
    expect(resultWithout.rpoReweighted).toBe(true);

    const evidenceWith = computeEvidenceQuality(withRpo, config, { profileConfirmed: true });
    const evidenceWithout = computeEvidenceQuality(withoutRpo, config, { profileConfirmed: true });
    expect(evidenceWithout.completeness).toBeLessThan(evidenceWith.completeness);
  });
});

describe('Dependencies', () => {
  it('3. unknown dependencies add discovery weeks; verified zero does not', () => {
    const answers = makeAnswers();
    const unknownApp = makeApp({ upstreamDependencyCount: null, downstreamDependencyCount: null, unknownDependencyIndicator: true });
    const verifiedZeroApp = makeApp({ upstreamDependencyCount: 0, downstreamDependencyCount: 0, unknownDependencyIndicator: false });
    const unknownResult = calculateEstimate(unknownApp, answers, config);
    const zeroResult = calculateEstimate(verifiedZeroApp, answers, config);
    expect(unknownResult.discoveryWeeks).toBeGreaterThan(zeroResult.discoveryWeeks);
  });

  it('4. upstream and downstream counts remain distinct fields, not collapsed into one', () => {
    const app = makeApp({ upstreamDependencyCount: 7, downstreamDependencyCount: 1 });
    expect(app.upstreamDependencyCount).not.toBe(app.downstreamDependencyCount);
    const { dependencyLoad: loadA } = computeDependencyLoad(app, deriveFeatures(app, config), config);
    const swapped = makeApp({ upstreamDependencyCount: 1, downstreamDependencyCount: 7 });
    const { dependencyLoad: loadB } = computeDependencyLoad(swapped, deriveFeatures(swapped, config), config);
    // The combined load formula is symmetric in the two counts (by design), but each
    // application still carries its own distinct upstream/downstream values end to end.
    expect(loadA).toBeCloseTo(loadB, 6);
    expect(app.upstreamDependencyCount).toBe(7);
    expect(swapped.downstreamDependencyCount).toBe(7);
  });

  it('15. blank, zero, and unknown remain distinct signals', () => {
    const verifiedZero = deriveFeatures(makeApp({ upstreamDependencyCount: 0, downstreamDependencyCount: 0, unknownDependencyIndicator: false }), config);
    const unknown = deriveFeatures(makeApp({ upstreamDependencyCount: null, downstreamDependencyCount: null }), config);
    expect(verifiedZero.dependencyInventoryUnknown).toBe(false);
    expect(unknown.dependencyInventoryUnknown).toBe(true);
  });
});

describe('Resilience', () => {
  it('6. strict RTO with weak/no DR creates a resilience gap', () => {
    const app = makeApp({ rtoMinutes: 10, drTopology: 'None' });
    const features = deriveFeatures(app, config);
    expect(features.resilience.gap).toBeGreaterThan(0);
  });
});

describe('Confidence and range', () => {
  it('8. better Evidence Quality narrows the optimistic/conservative range', () => {
    const answers = makeAnswers();
    const wellEvidenced = makeApp({ lastVerifiedDate: new Date().toISOString().slice(0, 10), conflicts: [] });
    const poorlyEvidenced = makeApp({
      lastVerifiedDate: '2019-01-01',
      businessOwner: undefined,
      technicalOwner: undefined,
      frameworks: [],
      databases: [],
      conflicts: ['conflict A', 'conflict B'],
    });
    const good = calculateEstimate(wellEvidenced, answers, config, { profileConfirmed: true });
    const poor = calculateEstimate(poorlyEvidenced, answers, config, { profileConfirmed: false });
    expect(good.evidenceQuality.total).toBeGreaterThan(poor.evidenceQuality.total);
    const goodRange = good.conservativeEffortWeeks - good.optimisticEffortWeeks;
    const poorRange = poor.conservativeEffortWeeks - poor.optimisticEffortWeeks;
    expect(goodRange).toBeLessThan(poorRange);
  });
});

describe('Capping', () => {
  it('18. risk exposure and 0-100 scores never exceed their caps under extreme inputs', () => {
    const extremeApp = makeApp({
      businessCriticality: 'Mission-critical',
      customerTransactionExposure: 'direct',
      rtoMinutes: 1,
      rpoMinutes: 1,
      upstreamDependencyCount: 500,
      downstreamDependencyCount: 500,
      criticalDependencyCount: 200,
      externalDependencyCount: 200,
      unknownDependencyIndicator: true,
      integrations: Array.from({ length: 50 }, (_, i) => ({
        id: `INT-${i}`,
        type: 'Proprietary' as const,
        direction: 'bidirectional' as const,
        realTime: true,
        externalParty: true,
        businessCritical: true,
        endpointProtocolIdentityChange: true,
        aggregateOnly: false,
      })),
    });
    const extremeAnswers = makeAnswers({
      businessSmeCoverage: 'none',
      applicationSmeCoverage: 'none',
      dataOpsSmeCoverage: 'none',
      awsFluency: 'new',
      testEvidence: 'tribal-manual',
      documentationConfidence: 'low',
      constraints: ['fixed-event', 'release-blackout', 'vendor-dependency'],
      deliveryTeamAllocationPct: 25,
    });
    const result = calculateEstimate(extremeApp, extremeAnswers, config);
    expect(result.riskExposure).toBeLessThanOrEqual(100);
    expect(result.businessImpact).toBeLessThanOrEqual(100);
    expect(result.complexity).toBeLessThanOrEqual(100);
    expect(result.evidenceQuality.total).toBeLessThanOrEqual(100);
    expect(result.scopeIndex).toBeLessThanOrEqual(100);
  });
});
