import { useState } from 'react';
import { Download, FileJson, Printer, Sparkles } from 'lucide-react';
import type { ApplicationRecord, EstimateResult } from '../model/types';
import { exportEstimateJson, exportResultSummaryCsv, printEstimate } from '../exporters/exporters';
import { narrativeProvider, NARRATIVE_LABEL } from '../narrative/narrativeProvider';

type Tab = 'overview' | 'scope' | 'risk' | 'team' | 'trace';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'scope', label: 'Scope and effort' },
  { id: 'risk', label: 'Risk and confidence' },
  { id: 'team', label: 'Team and schedule' },
  { id: 'trace', label: 'Calculation trace' },
];

function riskBadgeClass(band: string): string {
  if (band === 'Critical' || band === 'High') return 'ms-badge ms-badge-danger';
  if (band === 'Moderate') return 'ms-badge ms-badge-warning';
  return 'ms-badge';
}

export function EstimateResultsPanel({ result, app }: { result: EstimateResult; app: ApplicationRecord }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const gateRules = result.trace.rulesFired.filter((r) => r.isGate);

  return (
    <div className="ms-card">
      <p aria-live="polite" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
        {result.path} · {result.riskBand} delivery exposure · {result.confidenceBand} confidence
      </p>
      <p style={{ color: 'var(--ms-text-muted)' }}>POC defaults — not calibrated. Planning estimate only.</p>

      {gateRules.length > 0 && (
        <div className="ms-inline-error" role="alert" style={{ marginBottom: 'var(--ms-space-3)' }}>
          <strong>Gated estimate — {gateRules.length} unresolved conflict{gateRules.length > 1 ? 's' : ''} must be resolved before this can move forward.</strong>
          <ul>{gateRules.map((r) => <li key={r.id}>{r.id}: {r.userExplanation}</li>)}</ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--ms-space-2)', flexWrap: 'wrap', marginBottom: 'var(--ms-space-3)' }}>
        <button className="ms-btn ms-btn-secondary" onClick={() => exportEstimateJson(result, app)}>
          <FileJson size={16} aria-hidden style={{ marginRight: 6 }} />Export JSON
        </button>
        <button className="ms-btn ms-btn-secondary" onClick={() => exportResultSummaryCsv(result, app)}>
          <Download size={16} aria-hidden style={{ marginRight: 6 }} />Export summary CSV
        </button>
        <button className="ms-btn ms-btn-secondary" onClick={printEstimate}>
          <Printer size={16} aria-hidden style={{ marginRight: 6 }} />Printer-friendly view
        </button>
        <button className="ms-btn ms-btn-secondary" aria-pressed={aiPanelOpen} onClick={() => setAiPanelOpen((v) => !v)}>
          <Sparkles size={16} aria-hidden style={{ marginRight: 6 }} />{aiPanelOpen ? 'Hide' : 'Show'} AI narrative (off by default)
        </button>
      </div>

      {aiPanelOpen && (
        <div className="ms-inline-warning" role="note" style={{ marginBottom: 'var(--ms-space-3)' }}>
          <strong>{NARRATIVE_LABEL}</strong>
          <p>{narrativeProvider.executiveExplanation(result)}</p>
          <p>{narrativeProvider.technicalTopDriverExplanation(result)}</p>
          <p>{narrativeProvider.evidenceImprovementSuggestions(result)}</p>
          <p>{narrativeProvider.dataQualityAnomalyExplanation(app, result)}</p>
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--ms-space-2)', flexWrap: 'wrap', marginBottom: 'var(--ms-space-4)' }}>
        <Stat label="Expected effort" value={`${result.expectedEffortWeeks.toFixed(1)} pw`} />
        <Stat label="Range" value={`${result.optimisticEffortWeeks.toFixed(1)}–${result.conservativeEffortWeeks.toFixed(1)} pw`} />
        <Stat label="Calendar duration" value={`${result.calendarDurationWeeks.toFixed(1)} wks`} />
        <Stat label="Suggested team" value={`${result.suggestedPeople} people (${result.suggestedFte.toFixed(1)} FTE)`} />
        <Stat label="Scope Index" value={result.scopeIndex.toFixed(0)} />
        <Stat label="Wave suitability" value={result.waveSuitability} />
      </div>

      <div role="tablist" aria-label="Estimate results" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--ms-border)', marginBottom: 'var(--ms-space-3)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="ms-btn ms-btn-secondary"
            style={{ borderBottomColor: tab === t.id ? 'var(--ms-accent)' : 'transparent', borderBottomWidth: 2 }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div role="tabpanel">
          <h3>Top drivers</h3>
          <ul>{result.topDrivers.length ? result.topDrivers.map((d, i) => <li key={i}>{d}</li>) : <li>No single driver dominates this estimate.</li>}</ul>
          <h3>Top risks</h3>
          <ul>{result.topRisks.length ? result.topRisks.map((r, i) => <li key={i}>{r}</li>) : <li>No elevated risks flagged.</li>}</ul>
          <h3>Evidence-improvement actions</h3>
          <ul>{result.evidenceImprovementActions.length ? result.evidenceImprovementActions.map((a, i) => <li key={i}>{a}</li>) : <li>No specific evidence gaps flagged.</li>}</ul>
        </div>
      )}

      {tab === 'scope' && (
        <div role="tabpanel">
          <h3>Effort</h3>
          <ul>
            <li>Core engineering: {result.coreEngineeringWeeks.toFixed(1)} pw</li>
            <li>Resilience: {result.resilienceWeeks.toFixed(1)} pw</li>
            <li>Assurance: {result.assuranceWeeks.toFixed(1)} pw</li>
            <li>Discovery allowance: {result.discoveryWeeks.toFixed(1)} pw</li>
            <li><strong>Expected total: {result.expectedEffortWeeks.toFixed(1)} pw</strong></li>
          </ul>
          <h3>Scope Index package ledger</h3>
          <div className="ms-table-wrap ms-table-cards">
            <table className="ms-table">
              <thead><tr><th scope="col">Package</th><th scope="col">Weight / max</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {result.scopePackages.map((p) => (
                  <tr key={p.category}>
                    <td data-label="Package">{p.category}</td>
                    <td data-label="Weight">{p.weight} / {p.maxWeight}</td>
                    <td data-label="Status">{p.excluded ? <span className="ms-badge ms-badge-warning">Excluded with risk</span> : <span className="ms-badge">Included</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'risk' && (
        <div role="tabpanel">
          <h3>Risk</h3>
          <p><span className={riskBadgeClass(result.riskBand)}>{result.riskBand}</span> — exposure {result.riskExposure.toFixed(0)} / 100 (Complexity {result.complexity.toFixed(0)}, Delivery friction {result.deliveryFriction.toFixed(0)})</p>
          <h3>Confidence</h3>
          <p>{result.confidenceBand} — Evidence Quality {result.evidenceQuality.total.toFixed(0)} / 100</p>
          <ul>
            <li>Completeness: {result.evidenceQuality.completeness.toFixed(0)}</li>
            <li>Freshness: {result.evidenceQuality.freshness.toFixed(0)}</li>
            <li>Consistency: {result.evidenceQuality.consistency.toFixed(0)}</li>
            <li>Source authority: {result.evidenceQuality.sourceAuthority.toFixed(0)}</li>
            <li>Human confirmation: {result.evidenceQuality.humanConfirmation.toFixed(0)}</li>
          </ul>
          <h3>Rules fired</h3>
          {result.trace.rulesFired.length === 0 ? <p>No rules fired for this estimate.</p> : (
            <ul>
              {result.trace.rulesFired.map((r) => (
                <li key={r.id}>
                  <span className={r.severity === 'critical' ? 'ms-badge ms-badge-danger' : r.severity === 'warning' ? 'ms-badge ms-badge-warning' : 'ms-badge'}>{r.id}{r.isGate ? ' · gate' : ''}</span>
                  {' '}{r.userExplanation}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'team' && (
        <div role="tabpanel">
          <h3>Team and schedule</h3>
          <ul>
            <li>Minimum roles: {result.minimumRoles.join(', ')}</li>
            <li>Suggested people: {result.suggestedPeople} ({result.suggestedFte.toFixed(1)} FTE suggested, {result.effectiveFte.toFixed(1)} effective FTE)</li>
            <li>Active duration: {result.activeDurationWeeks.toFixed(1)} weeks</li>
            <li>Calendar duration: {result.calendarDurationWeeks.toFixed(1)} weeks</li>
          </ul>
          {result.capacityGapWarning && <p className="ms-inline-warning" role="alert">Required FTE exceeds this path's parallelism cap — more people will not shorten the schedule further.</p>}
          {result.scheduleFeasibilityWarning && <p className="ms-inline-warning" role="alert">The target completion window may not be achievable at current team capacity.</p>}
        </div>
      )}

      {tab === 'trace' && (
        <div role="tabpanel">
          <h3>Formulas</h3>
          <ul>{result.trace.formulas.map((f, i) => <li key={i}><code>{f}</code></li>)}</ul>
          <h3>Caps applied</h3>
          {result.trace.capsApplied.length === 0 ? <p>No caps were triggered.</p> : (
            <ul>{result.trace.capsApplied.map((c, i) => <li key={i}>{c.label}: {c.rawValue.toFixed(1)} capped to {c.limit}</li>)}</ul>
          )}
          <h3>Work-package ledger</h3>
          <div className="ms-table-wrap ms-table-cards">
            <table className="ms-table">
              <thead><tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Weeks</th><th scope="col">Source</th></tr></thead>
              <tbody>
                {result.trace.workPackages.map((p) => (
                  <tr key={p.id}>
                    <td data-label="ID">{p.id}</td>
                    <td data-label="Name">{p.name}</td>
                    <td data-label="Category">{p.category}</td>
                    <td data-label="Weeks">{p.effortWeeks.toFixed(2)}</td>
                    <td data-label="Source">{p.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Model version</h3>
          <p>{result.trace.modelVersion}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ms-card" style={{ padding: 'var(--ms-space-3)', minWidth: 140 }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--ms-text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
