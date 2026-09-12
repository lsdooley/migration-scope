import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAppState } from '../state/appState';
import type { ViewName } from '../state/appState';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { EmptyState } from '../components/EmptyState';
import { computeEvidenceQuality } from '../model/dataQuality';
import { deriveResilienceFeatures } from '../model/featureDerivation';
import type { ApplicationRecord, Provenance } from '../model/types';

function FieldRow({
  appId,
  field,
  label,
  value,
  onCorrect,
}: {
  appId: string;
  field: keyof ApplicationRecord;
  label: string;
  value: string;
  onCorrect?: (field: keyof ApplicationRecord, newValue: string, reason: string) => void;
}) {
  const { correctionsByAppId, applications } = useAppState();
  const app = applications.find((a) => a.applicationId === appId);
  const provenanceInfo = app?.provenance[field as string];
  const source: Provenance = provenanceInfo?.source ?? 'Unknown';
  const correction = correctionsByAppId[appId]?.[field as string];
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [reason, setReason] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--ms-space-2) 0', borderBottom: '1px solid var(--ms-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ms-space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <ProvenanceBadge source={correction ? 'User corrected' : source} timestamp={provenanceInfo?.timestamp} />
      </div>
      <div>
        {correction ? (
          <>
            <span>{String(correction.value)}</span>
            <span style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}> (was {value} — {correction.reason})</span>
          </>
        ) : (
          <span>{value}</span>
        )}
      </div>
      {onCorrect && !editing && (
        <button className="ms-btn ms-btn-secondary" style={{ alignSelf: 'flex-start', minHeight: 32, padding: '4px 10px' }} onClick={() => setEditing(true)}>
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
          }}
          style={{ display: 'flex', gap: 'var(--ms-space-2)', flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div className="ms-field" style={{ marginBottom: 0 }}>
            <label htmlFor={`${field}-correction-value`}>New value</label>
            <input id={`${field}-correction-value`} type="text" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
          </div>
          <div className="ms-field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
            <label htmlFor={`${field}-correction-reason`}>Reason</label>
            <input id={`${field}-correction-reason`} type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being corrected?" />
          </div>
          <button className="ms-btn ms-btn-primary" type="submit">Save</button>
          <button className="ms-btn ms-btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      )}
    </div>
  );
}

export function ProfileView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  const { selectedApplication, modelConfig, profileConfirmedByAppId, confirmProfile, addCorrection, pushToast } = useAppState();

  if (!selectedApplication) {
    return (
      <EmptyState
        title="No application selected"
        description="Select an application from the Applications view to review its profile."
        primaryAction={<button className="ms-btn ms-btn-primary" onClick={() => onNavigate('applications')}>Go to Applications</button>}
      />
    );
  }

  const app = selectedApplication;
  const profileConfirmed = !!profileConfirmedByAppId[app.applicationId];
  const evidence = computeEvidenceQuality(app, modelConfig, { profileConfirmed });
  const resilience = deriveResilienceFeatures(app, modelConfig);
  const hasConflicts = (app.conflicts?.length ?? 0) > 0;
  const hasTechGaps = app.technologyComponents.some((c) => c.supportStatus === 'out-of-support' || c.supportStatus === 'bespoke-unknown');
  const hasResilienceConflict = resilience.gap > 1 || resilience.uncertaintyFlag;
  const isStale = evidence.freshness < 75;

  function correct(field: keyof ApplicationRecord, newValue: string, reason: string) {
    addCorrection(app.applicationId, field as string, newValue, reason);
    pushToast('Correction saved as an overlay — the original value is preserved.', 'info');
  }

  return (
    <section aria-labelledby="profile-h1">
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
          <FieldRow appId={app.applicationId} field="applicationId" label="Application ID" value={app.applicationId} />
          <FieldRow appId={app.applicationId} field="applicationName" label="Application name" value={app.applicationName} />
          <FieldRow appId={app.applicationId} field="businessOwner" label="Business owner" value={app.businessOwner ?? 'Unknown'} />
          <FieldRow appId={app.applicationId} field="technicalOwner" label="Technical owner" value={app.technicalOwner ?? 'Unknown'} />
          <FieldRow appId={app.applicationId} field="lifecycleStatus" label="Lifecycle status" value={app.lifecycleStatus ?? 'Unknown'} />
        </div>
      </details>

      <details open={hasTechGaps}>
        <summary><strong>Architecture and technology</strong>{hasTechGaps && <span className="ms-badge ms-badge-warning"> Gaps found</span>}</summary>
        <div style={{ padding: 'var(--ms-space-3) 0' }}>
          <FieldRow appId={app.applicationId} field="architectureStyle" label="Architecture style" value={app.architectureStyle} onCorrect={correct} />
          <FieldRow appId={app.applicationId} field="languages" label="Languages" value={app.languages.join(', ') || 'Unknown'} />
          <FieldRow appId={app.applicationId} field="runtimePlatforms" label="Runtime platforms" value={app.runtimePlatforms.join(', ') || 'Unknown'} />
          <div style={{ marginTop: 'var(--ms-space-2)' }}>
            <strong>Technology components</strong>
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
      </details>

      <details open={app.unknownDependencyIndicator}>
        <summary><strong>Dependencies</strong>{app.unknownDependencyIndicator && <span className="ms-badge ms-badge-warning"> Unknown inventory</span>}</summary>
        <div style={{ padding: 'var(--ms-space-3) 0' }}>
          <FieldRow appId={app.applicationId} field="upstreamDependencyCount" label="Upstream dependency count" value={app.upstreamDependencyCount?.toString() ?? 'Unknown'} onCorrect={correct} />
          <FieldRow appId={app.applicationId} field="downstreamDependencyCount" label="Downstream dependency count" value={app.downstreamDependencyCount?.toString() ?? 'Unknown'} onCorrect={correct} />
          <FieldRow appId={app.applicationId} field="criticalDependencyCount" label="Critical dependencies" value={app.criticalDependencyCount?.toString() ?? 'Unknown'} />
          <FieldRow appId={app.applicationId} field="externalDependencyCount" label="External dependencies" value={app.externalDependencyCount?.toString() ?? 'Unknown'} />
          <p style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}>Upstream dependencies affect sequencing and test-stub needs; downstream dependencies affect blast radius and consumer coordination.</p>
        </div>
      </details>

      <details open={hasConflicts}>
        <summary><strong>Integrations</strong></summary>
        <div style={{ padding: 'var(--ms-space-3) 0' }}>
          <FieldRow appId={app.applicationId} field="integrationCount" label="Integration count (aggregate)" value={app.integrationCount?.toString() ?? 'Unknown'} onCorrect={correct} />
          <p>{app.integrations.length} detail record(s) on file.</p>
        </div>
      </details>

      <details open={hasResilienceConflict}>
        <summary><strong>Resilience and recovery</strong>{hasResilienceConflict && <span className="ms-badge ms-badge-warning"> Gap detected</span>}</summary>
        <div style={{ padding: 'var(--ms-space-3) 0' }}>
          <FieldRow appId={app.applicationId} field="drTopology" label="DR topology" value={app.drTopology} onCorrect={correct} />
          <FieldRow appId={app.applicationId} field="rtoMinutes" label="RTO (minutes)" value={app.rtoMinutes?.toString() ?? 'Unknown'} onCorrect={correct} />
          <FieldRow appId={app.applicationId} field="rpoMinutes" label="RPO (minutes)" value={app.rpoMinutes?.toString() ?? 'Unknown'} onCorrect={correct} />
          <FieldRow appId={app.applicationId} field="currentRecoveryTestStatus" label="Last recovery test status" value={app.currentRecoveryTestStatus} />
          <p>Current resilience level {resilience.currentLevel} vs. required level {resilience.requiredLevel} for this RTO — gap of {resilience.gap}.</p>
        </div>
      </details>

      <details>
        <summary><strong>Operational history</strong></summary>
        <div style={{ padding: 'var(--ms-space-3) 0' }}>
          <FieldRow appId={app.applicationId} field="incidentSev1_12m" label="Sev1 incidents (12mo)" value={app.incidentSev1_12m?.toString() ?? 'Unknown'} />
          <FieldRow appId={app.applicationId} field="incidentSev2_12m" label="Sev2 incidents (12mo)" value={app.incidentSev2_12m?.toString() ?? 'Unknown'} />
          <FieldRow appId={app.applicationId} field="changeFailureRate" label="Change failure rate" value={app.changeFailureRate != null ? `${(app.changeFailureRate * 100).toFixed(0)}%` : 'Unknown'} />
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
          <FieldRow appId={app.applicationId} field="lastVerifiedDate" label="Last verified date" value={app.lastVerifiedDate ?? 'Unknown'} />
        </div>
      </details>

      <div style={{ marginTop: 'var(--ms-space-5)', display: 'flex', gap: 'var(--ms-space-3)', alignItems: 'center' }}>
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
    </section>
  );
}
