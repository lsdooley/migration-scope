import { useMemo, useState } from 'react';
import { CheckCircle2, IdCard } from 'lucide-react';
import { useAppState, defaultPlanningAnswers } from '../state/appState';
import type { ViewName } from '../state/appState';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { EmptyState } from '../components/EmptyState';
import { LiveImpactPreview } from '../components/LiveImpactPreview';
import { computeEvidenceQuality } from '../model/dataQuality';
import { deriveResilienceFeatures } from '../model/featureDerivation';
import { calculateEstimate } from '../model/calculationEngine';
import { coerceCorrectionValue } from '../model/normalizer';
import type { ApplicationRecord, Provenance } from '../model/types';

function FieldRow({
  app,
  field,
  label,
  displayValue,
  onCorrect,
  onDraftChange,
}: {
  app: ApplicationRecord;
  field: keyof ApplicationRecord;
  label: string;
  displayValue: string;
  onCorrect?: (field: keyof ApplicationRecord, newValue: string, reason: string) => void;
  onDraftChange?: (field: keyof ApplicationRecord, value: string | undefined) => void;
}) {
  const provenanceInfo = app.provenance[field as string];
  const source: Provenance = provenanceInfo?.source ?? 'Unknown';
  const previousValue = provenanceInfo?.correction?.previousValue;
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(displayValue);
  const [reason, setReason] = useState('');

  function startEditing() {
    setDraftValue(displayValue);
    setEditing(true);
    onDraftChange?.(field, displayValue);
  }

  function cancel() {
    setEditing(false);
    setReason('');
    onDraftChange?.(field, undefined);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--ms-space-2) 0', borderBottom: '1px solid var(--ms-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ms-space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <ProvenanceBadge source={source} timestamp={provenanceInfo?.timestamp} />
      </div>
      <div>
        <span>{displayValue}</span>
        {source === 'User corrected' && previousValue != null && (
          <span style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}> (was {String(previousValue)} — {provenanceInfo?.correction?.reason})</span>
        )}
      </div>
      {onCorrect && !editing && (
        <button className="ms-btn ms-btn-secondary" style={{ alignSelf: 'flex-start', minHeight: 32, padding: '4px 10px' }} onClick={startEditing}>
          Correct
        </button>
      )}
      {onCorrect && editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCorrect(field, draftValue, reason || 'No reason provided');
            setEditing(false);
            setReason('');
            onDraftChange?.(field, undefined);
          }}
          style={{ display: 'flex', gap: 'var(--ms-space-2)', flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div className="ms-field" style={{ marginBottom: 0 }}>
            <label htmlFor={`${field}-correction-value`}>New value</label>
            <input
              id={`${field}-correction-value`}
              type="text"
              value={draftValue}
              onChange={(e) => {
                setDraftValue(e.target.value);
                onDraftChange?.(field, e.target.value);
              }}
              autoFocus
            />
          </div>
          <div className="ms-field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
            <label htmlFor={`${field}-correction-reason`}>Reason</label>
            <input id={`${field}-correction-reason`} type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being corrected?" />
          </div>
          <button className="ms-btn ms-btn-primary" type="submit">Save</button>
          <button className="ms-btn ms-btn-secondary" type="button" onClick={cancel}>Cancel</button>
        </form>
      )}
    </div>
  );
}

export function ProfileView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  const { selectedApplication, modelConfig, profileConfirmedByAppId, confirmProfile, addCorrection, draftAnswersByAppId, pushToast } = useAppState();
  // Values typed into an open "Correct" form, keyed by field — purely for the
  // live preview below. Nothing here is persisted until "Save" is clicked.
  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>({});

  function handleDraftChange(field: keyof ApplicationRecord, value: string | undefined) {
    setDraftOverrides((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[field as string];
      else next[field as string] = value;
      return next;
    });
  }

  const app = selectedApplication;

  const previewApp = useMemo(() => {
    if (!app || Object.keys(draftOverrides).length === 0) return app;
    const overridden = { ...app } as ApplicationRecord;
    for (const [field, raw] of Object.entries(draftOverrides)) {
      (overridden as unknown as Record<string, unknown>)[field] = coerceCorrectionValue(field, raw);
    }
    return overridden;
  }, [app, draftOverrides]);

  const profileConfirmed = app ? !!profileConfirmedByAppId[app.applicationId] : false;
  const previewAnswers = app ? draftAnswersByAppId[app.applicationId] ?? defaultPlanningAnswers() : defaultPlanningAnswers();

  const liveResult = useMemo(() => {
    if (!previewApp) return null;
    return calculateEstimate(previewApp, previewAnswers, modelConfig, { profileConfirmed });
  }, [previewApp, previewAnswers, modelConfig, profileConfirmed]);

  const baselineResult = useMemo(() => {
    if (!app) return null;
    return calculateEstimate(app, previewAnswers, modelConfig, { profileConfirmed });
  }, [app, previewAnswers, modelConfig, profileConfirmed]);

  if (!app) {
    return (
      <EmptyState
        icon={IdCard}
        title="No application selected"
        description="Select an application from the Applications view to review its profile."
        primaryAction={<button className="ms-btn ms-btn-primary" onClick={() => onNavigate('applications')}>Go to Applications</button>}
      />
    );
  }

  const hasUnsavedEdits = Object.keys(draftOverrides).length > 0;
  const evidence = computeEvidenceQuality(app, modelConfig, { profileConfirmed });
  const resilience = deriveResilienceFeatures(app, modelConfig);
  const hasConflicts = (app.conflicts?.length ?? 0) > 0;
  const hasTechGaps = app.technologyComponents.some((c) => c.supportStatus === 'out-of-support' || c.supportStatus === 'bespoke-unknown');
  const hasResilienceConflict = resilience.gap > 1 || resilience.uncertaintyFlag;
  const isStale = evidence.freshness < 75;

  function correct(field: keyof ApplicationRecord, newValue: string, reason: string) {
    addCorrection(app!.applicationId, field as string, newValue, reason);
    pushToast('Correction saved — it now feeds the calculation engine directly.', 'success');
  }

  return (
    <section aria-labelledby="profile-h1" className="ms-page ms-workspace-grid">
      <div className="ms-workspace-main">
        <h1 id="profile-h1">Application profile — {app.applicationName}</h1>
        {hasConflicts && (
          <div className="ms-inline-warning" role="alert">
            <strong>{app.conflicts!.length} data conflict(s) found.</strong>
            <ul>{app.conflicts!.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}

        <details open>
          <summary><strong>Identity and ownership</strong></summary>
          <div style={{ padding: 'var(--ms-space-3) 0' }}>
            <FieldRow app={app} field="applicationId" label="Application ID" displayValue={app.applicationId} />
            <FieldRow app={app} field="applicationName" label="Application name" displayValue={app.applicationName} />
            <FieldRow app={app} field="businessOwner" label="Business owner" displayValue={app.businessOwner ?? 'Unknown'} />
            <FieldRow app={app} field="technicalOwner" label="Technical owner" displayValue={app.technicalOwner ?? 'Unknown'} />
            <FieldRow app={app} field="lifecycleStatus" label="Lifecycle status" displayValue={app.lifecycleStatus ?? 'Unknown'} />
            <FieldRow app={app} field="businessCriticality" label="Business criticality" displayValue={app.businessCriticality} onCorrect={correct} onDraftChange={handleDraftChange} />
          </div>
        </details>

        <details open={hasTechGaps}>
          <summary><strong>Architecture and technology</strong>{hasTechGaps && <span className="ms-badge ms-badge-warning"> Gaps found</span>}</summary>
          <div style={{ padding: 'var(--ms-space-3) 0' }}>
            <FieldRow app={app} field="architectureStyle" label="Architecture style" displayValue={app.architectureStyle} onCorrect={correct} onDraftChange={handleDraftChange} />
            <FieldRow app={app} field="languages" label="Languages" displayValue={app.languages.join(', ') || 'Unknown'} />
            <FieldRow app={app} field="runtimePlatforms" label="Runtime platforms" displayValue={app.runtimePlatforms.join(', ') || 'Unknown'} />
            <div style={{ marginTop: 'var(--ms-space-2)' }}>
              <strong>Technology components</strong>
              <div className="ms-table-card" style={{ marginTop: 'var(--ms-space-2)' }}>
              <div className="ms-table-wrap ms-table-cards">
                <table className="ms-table">
                  <thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Version</th><th scope="col">Support status</th></tr></thead>
                  <tbody>
                    {app.technologyComponents.map((c, i) => (
                      <tr key={i}>
                        <td data-label="Name">{c.name}</td>
                        <td data-label="Kind">{c.kind}</td>
                        <td data-label="Version">{c.version ?? 'Unknown'}</td>
                        <td data-label="Support status">
                          <span className={c.supportStatus === 'current' ? 'ms-badge' : 'ms-badge ms-badge-warning'}>{c.supportStatus}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          </div>
        </details>

        <details open={app.unknownDependencyIndicator}>
          <summary><strong>Dependencies</strong>{app.unknownDependencyIndicator && <span className="ms-badge ms-badge-warning"> Unknown inventory</span>}</summary>
          <div style={{ padding: 'var(--ms-space-3) 0' }}>
            <FieldRow app={app} field="upstreamDependencyCount" label="Upstream dependency count" displayValue={app.upstreamDependencyCount?.toString() ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
            <FieldRow app={app} field="downstreamDependencyCount" label="Downstream dependency count" displayValue={app.downstreamDependencyCount?.toString() ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
            <FieldRow app={app} field="criticalDependencyCount" label="Critical dependencies" displayValue={app.criticalDependencyCount?.toString() ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
            <FieldRow app={app} field="externalDependencyCount" label="External dependencies" displayValue={app.externalDependencyCount?.toString() ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
            <p style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}>Upstream dependencies affect sequencing and test-stub needs; downstream dependencies affect blast radius and consumer coordination.</p>
          </div>
        </details>

        <details open={hasConflicts}>
          <summary><strong>Integrations</strong></summary>
          <div style={{ padding: 'var(--ms-space-3) 0' }}>
            <FieldRow app={app} field="integrationCount" label="Integration count (aggregate)" displayValue={app.integrationCount?.toString() ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
            <p>{app.integrations.length} detail record(s) on file.</p>
          </div>
        </details>

        <details open={hasResilienceConflict}>
          <summary><strong>Resilience and recovery</strong>{hasResilienceConflict && <span className="ms-badge ms-badge-warning"> Gap detected</span>}</summary>
          <div style={{ padding: 'var(--ms-space-3) 0' }}>
            <FieldRow app={app} field="drTopology" label="DR topology" displayValue={app.drTopology} onCorrect={correct} onDraftChange={handleDraftChange} />
            <FieldRow app={app} field="rtoMinutes" label="RTO (minutes)" displayValue={app.rtoMinutes?.toString() ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
            <FieldRow app={app} field="rpoMinutes" label="RPO (minutes)" displayValue={app.rpoMinutes?.toString() ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
            <FieldRow app={app} field="currentRecoveryTestStatus" label="Last recovery test status" displayValue={app.currentRecoveryTestStatus} onCorrect={correct} onDraftChange={handleDraftChange} />
            <p>Current resilience level {resilience.currentLevel} vs. required level {resilience.requiredLevel} for this RTO — gap of {resilience.gap}.</p>
          </div>
        </details>

        <details>
          <summary><strong>Operational history</strong></summary>
          <div style={{ padding: 'var(--ms-space-3) 0' }}>
            <FieldRow app={app} field="incidentSev1_12m" label="Sev1 incidents (12mo)" displayValue={app.incidentSev1_12m?.toString() ?? 'Unknown'} />
            <FieldRow app={app} field="incidentSev2_12m" label="Sev2 incidents (12mo)" displayValue={app.incidentSev2_12m?.toString() ?? 'Unknown'} />
            <FieldRow app={app} field="changeFailureRate" label="Change failure rate" displayValue={app.changeFailureRate != null ? `${(app.changeFailureRate * 100).toFixed(0)}%` : 'Unknown'} />
          </div>
        </details>

        <details open={isStale || hasConflicts}>
          <summary><strong>Data quality</strong></summary>
          <div style={{ padding: 'var(--ms-space-3) 0' }}>
            <p>Evidence Quality: <strong>{evidence.total.toFixed(0)}</strong> / 100 (POC defaults — not calibrated)</p>
            <ul>
              <li>Completeness: {evidence.completeness.toFixed(0)}</li>
              <li>Freshness: {evidence.freshness.toFixed(0)}</li>
              <li>Consistency: {evidence.consistency.toFixed(0)}</li>
              <li>Source authority: {evidence.sourceAuthority.toFixed(0)}</li>
              <li>Human confirmation: {evidence.humanConfirmation.toFixed(0)}</li>
            </ul>
            <FieldRow app={app} field="lastVerifiedDate" label="Last verified date" displayValue={app.lastVerifiedDate ?? 'Unknown'} onCorrect={correct} onDraftChange={handleDraftChange} />
          </div>
        </details>

        <div style={{ marginTop: 'var(--ms-space-5)', display: 'flex', gap: 'var(--ms-space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="ms-btn ms-btn-primary"
            onClick={() => {
              confirmProfile(app.applicationId);
              pushToast('Profile confirmed — Human Confirmation now counts toward Evidence Quality.', 'success');
            }}
            disabled={profileConfirmed}
          >
            {profileConfirmed ? <><CheckCircle2 size={16} aria-hidden style={{ marginRight: 6 }} />Profile confirmed</> : 'Confirm profile'}
          </button>
          <button className="ms-btn ms-btn-secondary" onClick={() => onNavigate('estimate')}>Go to Estimate workspace</button>
        </div>
      </div>

      <LiveImpactPreview
        current={liveResult}
        baseline={baselineResult}
        title="Impact preview"
        note={hasUnsavedEdits ? 'Showing the effect of your unsaved edit — click Save to keep it.' : 'Correct a fact above to see its impact here before saving.'}
      />
    </section>
  );
}
