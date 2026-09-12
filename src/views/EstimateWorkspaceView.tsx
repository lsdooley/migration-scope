import { useEffect, useMemo, useState } from 'react';
import { useAppState, defaultPlanningAnswers } from '../state/appState';
import type { ViewName } from '../state/appState';
import { EmptyState } from '../components/EmptyState';
import { RadioCardGroup, CheckboxChipGroup } from '../components/RadioCardGroup';
import { EstimateResultsPanel } from '../components/EstimateResultsPanel';
import { calculateEstimate } from '../model/calculationEngine';
import type { AWSPath, ChangeSurface, ConstraintType, PlanningAnswers, ScopeExclusion, SMECoverage } from '../model/types';

const PATH_OPTIONS: { value: AWSPath; label: string; hint: string }[] = [
  { value: 'Relocate', label: 'Relocate', hint: 'Move the VM/image as-is to a new hypervisor context.' },
  { value: 'Rehost', label: 'Rehost', hint: 'Lift-and-shift onto AWS infrastructure with minimal change.' },
  { value: 'Replatform', label: 'Replatform', hint: 'Swap underlying platform/runtime pieces for AWS equivalents.' },
  { value: 'Repurchase', label: 'Repurchase', hint: 'Replace with a SaaS/COTS equivalent.' },
  { value: 'Refactor', label: 'Refactor', hint: 'Materially redesign the application for cloud-native patterns.' },
];

const CHANGE_SURFACE_OPTIONS: { value: ChangeSurface; label: string }[] = [
  { value: 'Configuration only', label: 'Configuration only' },
  { value: 'Runtime/platform', label: 'Runtime/platform' },
  { value: 'Data tier', label: 'Data tier' },
  { value: 'Interfaces/identity', label: 'Interfaces/identity' },
  { value: 'Material redesign', label: 'Material redesign' },
];

const EXCLUSION_OPTIONS: { value: ScopeExclusion; label: string }[] = [
  { value: 'data-remediation', label: 'Data remediation' },
  { value: 'interface-redesign', label: 'Interface redesign' },
  { value: 'test-automation', label: 'Test automation' },
  { value: 'resilience-uplift', label: 'Resilience uplift' },
  { value: 'source-retirement', label: 'Source retirement' },
];

const SME_OPTIONS: { value: SMECoverage; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'one-unprotected', label: 'One unprotected SME' },
  { value: 'primary-plus-backup', label: 'Primary plus backup' },
  { value: 'resilient', label: 'Resilient coverage (3+)' },
];

const CONSTRAINT_OPTIONS: { value: ConstraintType; label: string }[] = [
  { value: 'fixed-event', label: 'Fixed event' },
  { value: 'release-blackout', label: 'Release blackout' },
  { value: 'vendor-dependency', label: 'Vendor dependency' },
  { value: 'shared-environment', label: 'Shared environment' },
  { value: 'approval-lead-time', label: 'Approval lead time' },
];

export function EstimateWorkspaceView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  const { selectedApplication, modelConfig, draftAnswersByAppId, updateDraftAnswers, estimatesByAppId, commitEstimate, profileConfirmedByAppId, pushToast } = useAppState();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const app = selectedApplication;
  const appId = app?.applicationId ?? '';
  const [answers, setAnswers] = useState<PlanningAnswers>(() => draftAnswersByAppId[appId] ?? defaultPlanningAnswers());

  useEffect(() => {
    if (app) setAnswers(draftAnswersByAppId[app.applicationId] ?? defaultPlanningAnswers());
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.applicationId]);

  useEffect(() => {
    if (app) updateDraftAnswers(app.applicationId, answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, app?.applicationId]);

  const profileConfirmed = app ? !!profileConfirmedByAppId[app.applicationId] : false;

  const liveResult = useMemo(() => {
    if (!app) return null;
    return calculateEstimate(app, answers, modelConfig, { profileConfirmed });
  }, [app, answers, modelConfig, profileConfirmed]);

  const committedResult = app ? estimatesByAppId[app.applicationId]?.[answers.path] : undefined;

  if (!app) {
    return (
      <EmptyState
        title="No application selected"
        description="Select an application before starting an estimate."
        primaryAction={<button className="ms-btn ms-btn-primary" onClick={() => onNavigate('applications')}>Go to Applications</button>}
      />
    );
  }

  function update<K extends keyof PlanningAnswers>(key: K, value: PlanningAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  const questionCount = 12; // normal path; conditional questions never push this above 15 (poc.maxQuestionsWithConditional)

  return (
    <section aria-labelledby="estimate-h1" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--ms-space-5)' }}>
      <div style={{ minWidth: 0 }}>
        <h1 id="estimate-h1">Estimate workspace — {app.applicationName}</h1>
        <p style={{ color: 'var(--ms-text-muted)' }}>{questionCount} of max {modelConfig.poc.maxQuestionsWithConditional} questions for this estimate. Only "Calculate estimate" commits a result.</p>

        <ol style={{ display: 'flex', gap: 'var(--ms-space-2)', listStyle: 'none', padding: 0, marginBottom: 'var(--ms-space-4)' }}>
          {([1, 2, 3] as const).map((s) => (
            <li key={s}>
              <button className="ms-btn ms-btn-secondary" aria-current={step === s ? 'step' : undefined} onClick={() => setStep(s)} style={{ borderColor: step === s ? 'var(--ms-accent)' : undefined }}>
                {s}. {s === 1 ? 'Migration intent' : s === 2 ? 'People and readiness' : 'Confirmation'}
              </button>
            </li>
          ))}
        </ol>

        {step === 1 && (
          <div className="ms-card">
            <RadioCardGroup legend="1. AWS change path" name="path" options={PATH_OPTIONS} value={answers.path} onChange={(v) => update('path', v)} />
            <RadioCardGroup legend="2. Planned change surface" name="changeSurface" options={CHANGE_SURFACE_OPTIONS} value={answers.changeSurface} onChange={(v) => update('changeSurface', v)} />

            <div className="ms-field">
              <label htmlFor="target-weeks">3. Target completion window</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, minHeight: 'var(--ms-target-min)' }}>
                <input type="checkbox" checked={answers.targetCompletionWeeks == null} onChange={(e) => update('targetCompletionWeeks', e.target.checked ? null : 12)} />
                No fixed target
              </label>
              {answers.targetCompletionWeeks != null && (
                <input id="target-weeks" type="number" min={1} value={answers.targetCompletionWeeks} onChange={(e) => update('targetCompletionWeeks', Number(e.target.value))} />
              )}
            </div>

            <CheckboxChipGroup legend="4. Scope exclusions" options={EXCLUSION_OPTIONS} values={answers.scopeExclusions} onChange={(v) => update('scopeExclusions', v)} />
          </div>
        )}

        {step === 2 && (
          <div className="ms-card">
            <RadioCardGroup legend="5. Business SME coverage" name="businessSme" options={SME_OPTIONS} value={answers.businessSmeCoverage} onChange={(v) => update('businessSmeCoverage', v)} />
            <RadioCardGroup legend="6. Application SME coverage" name="applicationSme" options={SME_OPTIONS} value={answers.applicationSmeCoverage} onChange={(v) => update('applicationSmeCoverage', v)} />
            <RadioCardGroup legend="7. Data/operations SME coverage" name="dataOpsSme" options={SME_OPTIONS} value={answers.dataOpsSmeCoverage} onChange={(v) => update('dataOpsSmeCoverage', v)} />

            <details>
              <summary>Optional: record exact SME counts</summary>
              <div style={{ display: 'flex', gap: 'var(--ms-space-3)', flexWrap: 'wrap', paddingTop: 'var(--ms-space-2)' }}>
                {(['business', 'application', 'dataOps'] as const).map((domain) => (
                  <div className="ms-field" key={domain} style={{ marginBottom: 0 }}>
                    <label htmlFor={`sme-count-${domain}`}>{domain} SME count</label>
                    <input
                      id={`sme-count-${domain}`}
                      type="number"
                      min={0}
                      value={answers.smeDetail.find((d) => d.domain === domain)?.exactCount ?? ''}
                      onChange={(e) => {
                        const exactCount = Number(e.target.value);
                        const next = answers.smeDetail.filter((d) => d.domain !== domain);
                        update('smeDetail', Number.isFinite(exactCount) ? [...next, { domain, exactCount }] : next);
                      }}
                    />
                  </div>
                ))}
              </div>
            </details>

            <div className="ms-field">
              <label htmlFor="team-count">8. Delivery team — developer/engineer count</label>
              <input id="team-count" type="range" min={1} max={12} value={answers.deliveryTeamCount} onChange={(e) => update('deliveryTeamCount', Number(e.target.value))} />
              <input type="number" min={1} max={12} value={answers.deliveryTeamCount} onChange={(e) => update('deliveryTeamCount', Number(e.target.value))} aria-label="Delivery team count (exact)" />
            </div>
            <RadioCardGroup
              legend="8. Average allocation"
              name="allocation"
              options={[25, 50, 75, 100].map((n) => ({ value: String(n), label: `${n}%` }))}
              value={String(answers.deliveryTeamAllocationPct)}
              onChange={(v) => update('deliveryTeamAllocationPct', Number(v) as 25 | 50 | 75 | 100)}
            />

            <RadioCardGroup
              legend="9. AWS fluency"
              name="fluency"
              options={[
                { value: 'new', label: 'New' },
                { value: 'assisted', label: 'Assisted' },
                { value: 'delivered-once', label: 'Delivered once' },
                { value: 'repeated-delivery', label: 'Repeated delivery' },
              ]}
              value={answers.awsFluency}
              onChange={(v) => update('awsFluency', v)}
            />
            <RadioCardGroup
              legend="10. Test evidence"
              name="testEvidence"
              options={[
                { value: 'tribal-manual', label: 'Tribal / manual' },
                { value: 'partial', label: 'Partial' },
                { value: 'repeatable', label: 'Repeatable' },
                { value: 'automated', label: 'Automated' },
              ]}
              value={answers.testEvidence}
              onChange={(v) => update('testEvidence', v)}
            />
            <RadioCardGroup
              legend="11. Documentation confidence"
              name="docConfidence"
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'recently-verified', label: 'Recently verified' },
              ]}
              value={answers.documentationConfidence}
              onChange={(v) => update('documentationConfidence', v)}
            />
            <CheckboxChipGroup legend="12. Constraints" options={CONSTRAINT_OPTIONS} values={answers.constraints} onChange={(v) => update('constraints', v)} />
            {answers.constraints.length > 0 && (
              <div className="ms-field">
                <label htmlFor="wait-weeks">External wait weeks</label>
                <input id="wait-weeks" type="number" min={0} value={answers.externalWaitWeeks} onChange={(e) => update('externalWaitWeeks', Number(e.target.value))} />
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="ms-card">
            <h2>Confirmation</h2>
            <p>Model version: {modelConfig.version}. Profile confirmed: {profileConfirmed ? 'Yes' : 'No'}.</p>
            <h3>Imported profile summary</h3>
            <ul>
              <li>Criticality: {app.businessCriticality} · Architecture: {app.architectureStyle}</li>
              <li>DR topology: {app.drTopology} · RTO: {app.rtoMinutes ?? 'Unknown'} min · RPO: {app.rpoMinutes ?? 'Unknown'} min</li>
              <li>Dependencies: {app.upstreamDependencyCount ?? 'Unknown'} upstream / {app.downstreamDependencyCount ?? 'Unknown'} downstream</li>
            </ul>
            {app.conflicts && app.conflicts.length > 0 && (
              <div className="ms-inline-warning" role="alert">
                <strong>Unresolved conflicts:</strong>
                <ul>{app.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
            <h3>Answers</h3>
            <ul>
              <li>Path: {answers.path} · Change surface: {answers.changeSurface}</li>
              <li>Target window: {answers.targetCompletionWeeks ?? 'No fixed target'}</li>
              <li>Scope exclusions: {answers.scopeExclusions.length ? answers.scopeExclusions.join(', ') : 'None'}</li>
              <li>SME coverage: business {answers.businessSmeCoverage}, application {answers.applicationSmeCoverage}, data/ops {answers.dataOpsSmeCoverage}</li>
              <li>Team: {answers.deliveryTeamCount} people @ {answers.deliveryTeamAllocationPct}% · AWS fluency {answers.awsFluency}</li>
              <li>Constraints: {answers.constraints.length ? answers.constraints.join(', ') : 'None'}</li>
            </ul>
            <button
              className="ms-btn ms-btn-primary"
              onClick={() => {
                if (!liveResult) return;
                commitEstimate(app.applicationId, liveResult);
                pushToast('Estimate calculated and committed.', 'success');
              }}
            >
              Calculate estimate
            </button>
          </div>
        )}

        {committedResult && (
          <div style={{ marginTop: 'var(--ms-space-5)' }}>
            <h2>Committed result</h2>
            <EstimateResultsPanel result={committedResult} app={app} />
          </div>
        )}
      </div>

      <aside aria-label="Live preview" style={{ alignSelf: 'start', position: 'sticky', top: 'var(--ms-space-4)' }} className="ms-card">
        <h2 style={{ marginTop: 0 }}>Live preview</h2>
        <p style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}>Updates as you answer. Not yet committed.</p>
        {liveResult && (
          <>
            {/* Restrained live region: announce a short summary, not the full list, on every change. */}
            <p aria-live="polite" className="ms-visually-hidden">
              Updated preview: {liveResult.expectedEffortWeeks.toFixed(1)} person-weeks, {liveResult.riskBand} risk, {liveResult.confidenceBand} confidence.
            </p>
            <ul style={{ paddingLeft: 'var(--ms-space-4)' }}>
              <li>Expected: {liveResult.expectedEffortWeeks.toFixed(1)} pw</li>
              <li>Range: {liveResult.optimisticEffortWeeks.toFixed(1)}–{liveResult.conservativeEffortWeeks.toFixed(1)} pw</li>
              <li>Risk: {liveResult.riskBand}</li>
              <li>Confidence: {liveResult.confidenceBand}</li>
              <li>Wave: {liveResult.waveSuitability}</li>
            </ul>
          </>
        )}
      </aside>

      <style>{`
        @media (max-width: 900px) {
          section[aria-labelledby="estimate-h1"] { display: block !important; }
          aside[aria-label="Live preview"] { position: static !important; margin-top: var(--ms-space-4); }
        }
      `}</style>
    </section>
  );
}
