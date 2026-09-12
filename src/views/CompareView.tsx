import { useMemo, useState } from 'react';
import { useAppState, defaultPlanningAnswers } from '../state/appState';
import type { ViewName } from '../state/appState';
import { EmptyState } from '../components/EmptyState';
import { calculateEstimate } from '../model/calculationEngine';
import type { AWSPath } from '../model/types';

const ALL_PATHS: AWSPath[] = ['Relocate', 'Rehost', 'Replatform', 'Repurchase', 'Refactor'];

export function CompareView({ onNavigate }: { onNavigate: (v: ViewName) => void }) {
  const { selectedApplication, modelConfig, draftAnswersByAppId, profileConfirmedByAppId } = useAppState();
  const app = selectedApplication;
  const baseAnswers = app ? draftAnswersByAppId[app.applicationId] ?? defaultPlanningAnswers() : defaultPlanningAnswers();
  const [selected, setSelected] = useState<AWSPath[]>([baseAnswers.path, 'Rehost'].filter((p, i, arr) => arr.indexOf(p) === i).slice(0, 2) as AWSPath[]);

  const results = useMemo(() => {
    if (!app) return [];
    const profileConfirmed = !!profileConfirmedByAppId[app.applicationId];
    // Re-entering inputs is never required: every path reuses the same base answers,
    // and the engine recomputes technology/change/integration/resilience/assurance per path.
    return selected.map((path) => calculateEstimate(app, { ...baseAnswers, path }, modelConfig, { profileConfirmed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, selected, modelConfig, profileConfirmedByAppId]);

  if (!app) {
    return (
      <EmptyState
        title="No application selected"
        description="Select an application to compare AWS migration paths."
        primaryAction={<button className="ms-btn ms-btn-primary" onClick={() => onNavigate('applications')}>Go to Applications</button>}
      />
    );
  }

  function toggle(path: AWSPath) {
    setSelected((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      if (prev.length >= 3) return prev;
      return [...prev, path];
    });
  }

  const allWorkPackageIds = [...new Set(results.flatMap((r) => r.trace.workPackages.map((p) => p.id)))];

  return (
    <section aria-labelledby="compare-h1" className="ms-page">
      <h1 id="compare-h1">Compare paths — {app.applicationName}</h1>
      <p>Pick two or three AWS migration paths. Inputs from the Estimate workspace are reused automatically.</p>

      <fieldset style={{ border: 'none', padding: 0 }}>
        <legend>Paths to compare (2–3)</legend>
        <div style={{ display: 'flex', gap: 'var(--ms-space-2)', flexWrap: 'wrap', marginBottom: 'var(--ms-space-4)' }}>
          {ALL_PATHS.map((p) => (
            <label key={p} className="ms-radio-card" style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px' }}>
              <input type="checkbox" checked={selected.includes(p)} onChange={() => toggle(p)} disabled={!selected.includes(p) && selected.length >= 3} />
              <span style={{ marginLeft: 6 }}>{p}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {selected.length < 2 ? (
        <p className="ms-inline-warning" role="alert">Select at least two paths to compare.</p>
      ) : (
        <>
          <div className="ms-table-wrap ms-table-cards">
            <table className="ms-table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {results.map((r) => <th scope="col" key={r.path}>{r.path}</th>)}
                </tr>
              </thead>
              <tbody>
                <Row label="Expected effort (pw)" results={results} get={(r) => r.expectedEffortWeeks.toFixed(1)} />
                <Row label="Range (pw)" results={results} get={(r) => `${r.optimisticEffortWeeks.toFixed(1)}–${r.conservativeEffortWeeks.toFixed(1)}`} />
                <Row label="Calendar duration (wks)" results={results} get={(r) => r.calendarDurationWeeks.toFixed(1)} />
                <Row label="Staffing" results={results} get={(r) => `${r.suggestedPeople} ppl / ${r.suggestedFte.toFixed(1)} FTE`} />
                <Row label="Scope Index" results={results} get={(r) => r.scopeIndex.toFixed(0)} />
                <Row label="Risk" results={results} get={(r) => r.riskBand} />
                <Row label="Confidence" results={results} get={(r) => r.confidenceBand} />
                <Row label="Wave suitability" results={results} get={(r) => r.waveSuitability} />
              </tbody>
            </table>
          </div>

          <h2>Changed work packages</h2>
          <div className="ms-table-wrap ms-table-cards">
            <table className="ms-table">
              <thead>
                <tr>
                  <th scope="col">Package</th>
                  {results.map((r) => <th scope="col" key={r.path}>{r.path} (pw)</th>)}
                </tr>
              </thead>
              <tbody>
                {allWorkPackageIds.map((id) => {
                  const name = results.find((r) => r.trace.workPackages.some((p) => p.id === id))?.trace.workPackages.find((p) => p.id === id)?.name ?? id;
                  const weeksPerPath = results.map((r) => r.trace.workPackages.find((p) => p.id === id)?.effortWeeks ?? 0);
                  const varies = new Set(weeksPerPath.map((w) => w.toFixed(2))).size > 1;
                  if (!varies && weeksPerPath.every((w) => w === 0)) return null;
                  return (
                    <tr key={id} style={{ background: varies ? 'var(--ms-bg-sunken)' : undefined }}>
                      <td data-label="Package">{name}</td>
                      {weeksPerPath.map((w, i) => <td data-label={results[i].path} key={i}>{w.toFixed(2)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Row({ label, results, get }: { label: string; results: ReturnType<typeof calculateEstimate>[]; get: (r: ReturnType<typeof calculateEstimate>) => string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {results.map((r) => <td data-label={label} key={r.path}>{get(r)}</td>)}
    </tr>
  );
}
