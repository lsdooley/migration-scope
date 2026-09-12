import type { ApplicationRecord, FiredRule, PlanningAnswers, RiskBand, WorkPackage } from './types';
import type { DerivedFeatures } from './featureDerivation';

// Versioned rules engine. Each rule fires at most once per estimate — callers
// run evaluate() exactly once per calculation and merge effects via the
// work-package ledger, which itself dedupes by package id.

export interface RuleContext {
  app: ApplicationRecord;
  answers: PlanningAnswers;
  features: DerivedFeatures;
  businessImpact: number;
  evidenceQuality: number;
  smeUncoveredDomainCount: number;
  allocationPct: number;
  hasFixedTarget: boolean;
  integrationDetailCount: number;
}

export interface RuleEffect {
  addWorkPackages?: Omit<WorkPackage, 'excluded' | 'source'>[];
  riskFloor?: RiskBand;
  confidencePenaltyPoints?: number;
  forcesGate?: boolean;
  forcesLaterWave?: boolean;
  likelihoodBumpPoints?: number;
  conflictNotes?: string[];
}

interface RuleDefinition {
  id: string;
  version: string;
  severity: FiredRule['severity'];
  isGate: boolean;
  userExplanation: string;
  effectSummary: string;
  test: (ctx: RuleContext) => boolean;
  effect: (ctx: RuleContext) => RuleEffect;
}

const RULES: RuleDefinition[] = [
  {
    id: 'R-101',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'Refactor plus a distributed architecture typically requires decomposing services, reworking integration contracts, and expanding regression coverage beyond the baseline.',
    effectSummary: 'Adds decomposition, integration rework, and regression work packages.',
    test: (ctx) => ctx.answers.path === 'Refactor' && (ctx.app.architectureStyle === 'Distributed services' || ctx.app.architectureStyle === 'Event-driven/data-intensive'),
    effect: () => ({
      addWorkPackages: [
        { id: 'R-101-decomposition', name: 'Service decomposition', category: 'Application change', effortWeeks: 4 },
        { id: 'R-101-integration-rework', name: 'Integration contract rework', category: 'Integration/connectivity', effortWeeks: 3 },
        { id: 'R-101-regression', name: 'Regression expansion', category: 'Testing/resilience', effortWeeks: 3 },
      ],
    }),
  },
  {
    id: 'R-204',
    version: '1.0',
    severity: 'critical',
    isGate: false,
    userExplanation: 'Business Impact of 80 or higher combined with Evidence Quality below 55 means high-stakes decisions are being made on thin evidence — risk is floored at High and discovery work is required before this estimate can be trusted.',
    effectSummary: 'Sets risk to at least High and adds required discovery.',
    test: (ctx) => ctx.businessImpact >= 80 && ctx.evidenceQuality < 55,
    effect: () => ({
      riskFloor: 'High',
      addWorkPackages: [{ id: 'R-204-discovery', name: 'High-impact evidence discovery', category: 'Assess/design', effortWeeks: 3 }],
    }),
  },
  {
    id: 'R-307',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'An RTO of 15 minutes or less combined with high-change data demands tight synchronization, rehearsed cutovers, and a named cutover lead — this is not a standard cutover.',
    effectSummary: 'Adds synchronization, rehearsal, and cutover-lead work.',
    test: (ctx) => (ctx.app.rtoMinutes ?? Infinity) <= 15 && (ctx.app.changeFailureRate ?? 0) > 0.15,
    effect: () => ({
      addWorkPackages: [
        { id: 'R-307-sync', name: 'Data synchronization hardening', category: 'Data migration', effortWeeks: 3 },
        { id: 'R-307-rehearsal', name: 'Additional cutover rehearsal', category: 'Cutover/rollback', effortWeeks: 2 },
      ],
    }),
  },
  {
    id: 'R-412',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'Two or more SME domains with no coverage at all leave critical questions unanswerable — discovery work is added and confidence is reduced to reflect that gap.',
    effectSummary: 'Adds discovery and lowers confidence.',
    test: (ctx) => ctx.smeUncoveredDomainCount >= 2,
    effect: () => ({
      addWorkPackages: [{ id: 'R-412-discovery', name: 'SME gap discovery', category: 'Assess/design', effortWeeks: 2 }],
      confidencePenaltyPoints: 10,
    }),
  },
  {
    id: 'R-509',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'A fixed target date paired with team allocation at or below 50% is a schedule-risk combination — the team simply may not have enough dedicated time to hit the date.',
    effectSummary: 'Raises schedule risk.',
    test: (ctx) => ctx.hasFixedTarget && ctx.allocationPct <= 50,
    effect: () => ({ riskFloor: 'Moderate' }),
  },
  {
    id: 'R-610',
    version: '1.0',
    severity: 'critical',
    isGate: true,
    userExplanation: 'This application is declared the highest criticality yet carries a relaxed RTO/RPO and no resilience topology — that combination is internally inconsistent and must be resolved before the estimate can be trusted.',
    effectSummary: 'Creates a Business Impact Conflict gate.',
    test: (ctx) => ctx.app.businessCriticality === 'Mission-critical' && (ctx.app.rtoMinutes ?? 0) > 1440 && (ctx.app.rpoMinutes ?? 0) > 1440,
    effect: () => ({ forcesGate: true, forcesLaterWave: true, conflictNotes: ['Business Impact Conflict: Mission-critical criticality with relaxed RTO/RPO.'] }),
  },
  {
    id: 'R-611',
    version: '1.0',
    severity: 'critical',
    isGate: true,
    userExplanation: 'A strict recovery-time objective with no DR topology, or an unknown one, means the application cannot currently meet its own stated resilience requirement.',
    effectSummary: 'Creates a Resilience Conflict gate.',
    test: (ctx) => (ctx.app.rtoMinutes ?? Infinity) <= 120 && (ctx.app.drTopology === 'None' || ctx.app.drTopology === 'Unknown'),
    effect: () => ({ forcesGate: true, forcesLaterWave: true, conflictNotes: ['Resilience Conflict: strict RTO with no or unknown DR topology.'] }),
  },
  {
    id: 'R-702',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'The declared integration count does not match the number of detailed integration records on file — one of the two is wrong and should be reconciled.',
    effectSummary: 'Flags an aggregate/detail mismatch and adds reconciliation discovery.',
    test: (ctx) => ctx.app.integrationCount != null && ctx.integrationDetailCount > 0 && ctx.app.integrationCount !== ctx.integrationDetailCount,
    effect: () => ({
      addWorkPackages: [{ id: 'R-702-reconcile', name: 'Integration inventory reconciliation', category: 'Assess/design', effortWeeks: 1 }],
      conflictNotes: ['Aggregate integration_count does not match detailed integration records.'],
    }),
  },
  {
    id: 'R-703',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'Dependency IDs are on file even though the declared dependency counts are zero — zero should mean verified absence, not an oversight.',
    effectSummary: 'Flags a data-consistency conflict.',
    test: (ctx) => (ctx.app.dependencyIds?.length ?? 0) > 0 && (ctx.app.upstreamDependencyCount ?? 0) === 0 && (ctx.app.downstreamDependencyCount ?? 0) === 0,
    effect: () => ({ conflictNotes: ['Dependency IDs exist while declared upstream/downstream counts are zero.'] }),
  },
  {
    id: 'R-804',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'A failed recovery test is a direct signal that resilience claims are unproven — likelihood is raised and remediation work is added.',
    effectSummary: 'Raises likelihood and adds remediation work.',
    test: (ctx) => ctx.app.currentRecoveryTestStatus === 'failed',
    effect: () => ({
      likelihoodBumpPoints: 5,
      addWorkPackages: [{ id: 'R-804-remediation', name: 'Recovery-test remediation', category: 'Testing/resilience', effortWeeks: 2 }],
    }),
  },
  {
    id: 'R-901',
    version: '1.0',
    severity: 'warning',
    isGate: false,
    userExplanation: 'Rehosting preserves the running technology as-is — out-of-support components remain out of support after the move, and that lifecycle risk does not disappear just because the infrastructure changed.',
    effectSummary: 'Warns that lifecycle risk is preserved after Rehost.',
    test: (ctx) => ctx.answers.path === 'Rehost' && ctx.app.technologyComponents.some((c) => c.supportStatus === 'out-of-support' || c.supportStatus === 'bespoke-unknown'),
    effect: () => ({
      addWorkPackages: [{ id: 'R-901-lifecycle-note', name: 'Lifecycle risk carried forward', category: 'Operational handoff', effortWeeks: 1 }],
    }),
  },
];

export function evaluateRules(ctx: RuleContext, ruleSwitches: Record<string, boolean> = {}): { fired: FiredRule[]; effects: RuleEffect[] } {
  const fired: FiredRule[] = [];
  const effects: RuleEffect[] = [];
  for (const rule of RULES) {
    if (ruleSwitches[rule.id] === false) continue; // disabled via Model configuration
    if (rule.test(ctx)) {
      fired.push({
        id: rule.id,
        version: rule.version,
        severity: rule.severity,
        isGate: rule.isGate,
        userExplanation: rule.userExplanation,
        effectSummary: rule.effectSummary,
      });
      effects.push(rule.effect(ctx));
    }
  }
  return { fired, effects };
}

export const ALL_RULES = RULES;
