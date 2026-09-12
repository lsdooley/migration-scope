import type { ConfidenceBand, EstimateResult, RiskBand, WaveSuitability } from '../model/types';

// A single, consistent "this is live" panel reused everywhere the user edits
// data that feeds the calculation engine (Estimate workspace answers,
// Application profile corrections, Model configuration coefficients). It is
// always on screen — a sticky sidebar on wide screens, a pinned bottom sheet
// on phones — so the impact of an edit is visible the instant it's made,
// never only after a separate "save" step.

interface Delta {
  text: string;
  cls: 'ms-delta-better' | 'ms-delta-worse' | 'ms-delta-neutral';
}

const RISK_RANK: Record<RiskBand, number> = { Low: 0, Moderate: 1, High: 2, Critical: 3 };
const CONFIDENCE_RANK: Record<ConfidenceBand, number> = { Low: 0, Medium: 1, High: 2 };
const WAVE_RANK: Record<WaveSuitability, number> = { 'Later wave': 0, Conditional: 1, Ready: 2 };

function numDelta(curr: number, base: number, higherIsWorse: boolean, unit: string, digits = 1): Delta | null {
  const diff = curr - base;
  if (Math.abs(diff) < 0.05) return null;
  const worse = higherIsWorse ? diff > 0 : diff < 0;
  const arrow = diff > 0 ? '▲' : '▼';
  return { text: `${arrow} ${Math.abs(diff).toFixed(digits)}${unit}`, cls: worse ? 'ms-delta-worse' : 'ms-delta-better' };
}

function bandDelta<T extends string>(curr: T, base: T, rank: Record<T, number>): Delta | null {
  if (curr === base) return null;
  const better = rank[curr] > rank[base];
  const arrow = rank[curr] > rank[base] ? '▲' : '▼';
  return { text: `${arrow} was ${base}`, cls: better ? 'ms-delta-better' : 'ms-delta-worse' };
}

function Row({ label, value, delta }: { label: string; value: string; delta?: Delta | null }) {
  return (
    <div className="ms-preview-row">
      <span className="ms-preview-label">{label}</span>
      <span className="ms-preview-value">
        {value}
        {delta && <span className={`ms-delta ${delta.cls}`}>{delta.text}</span>}
      </span>
    </div>
  );
}

export function LiveImpactPreview({
  current,
  baseline,
  title = 'Live preview',
  note,
  emptyMessage = 'Make a selection to see a live estimate here.',
}: {
  current: EstimateResult | null;
  /** When provided, each row shows a delta against this — e.g. "before this edit" or "last committed estimate". */
  baseline?: EstimateResult | null;
  title?: string;
  note?: string;
  emptyMessage?: string;
}) {
  return (
    <aside className="ms-card ms-live-preview" aria-label={title}>
      <div className="ms-live-preview-header">
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{title}</h2>
        <span className="ms-live-badge">
          <span className="ms-live-dot" aria-hidden="true" />
          Live
        </span>
      </div>
      {note && <p style={{ marginTop: 0, marginBottom: 'var(--ms-space-2)', fontSize: '0.85rem', color: 'var(--ms-text-muted)' }}>{note}</p>}

      {!current ? (
        <p style={{ color: 'var(--ms-text-muted)', margin: 0 }}>{emptyMessage}</p>
      ) : (
        <>
          {/* Restrained live region: one short sentence, not every row, so screen readers aren't spammed on every keystroke. */}
          <p aria-live="polite" className="ms-visually-hidden">
            Updated: {current.expectedEffortWeeks.toFixed(1)} person-weeks, {current.riskBand} risk, {current.confidenceBand} confidence, {current.waveSuitability}.
          </p>
          <div>
            <Row
              label="Expected effort"
              value={`${current.expectedEffortWeeks.toFixed(1)} pw`}
              delta={baseline && numDelta(current.expectedEffortWeeks, baseline.expectedEffortWeeks, true, ' pw')}
            />
            <Row label="Range" value={`${current.optimisticEffortWeeks.toFixed(1)}–${current.conservativeEffortWeeks.toFixed(1)} pw`} />
            <Row
              label="Calendar duration"
              value={`${current.calendarDurationWeeks.toFixed(1)} wks`}
              delta={baseline && numDelta(current.calendarDurationWeeks, baseline.calendarDurationWeeks, true, ' wks')}
            />
            <Row
              label="Risk"
              value={current.riskBand}
              delta={baseline && bandDelta(current.riskBand, baseline.riskBand, RISK_RANK)}
            />
            <Row
              label="Confidence"
              value={current.confidenceBand}
              delta={baseline && bandDelta(current.confidenceBand, baseline.confidenceBand, CONFIDENCE_RANK)}
            />
            <Row
              label="Wave suitability"
              value={current.waveSuitability}
              delta={baseline && bandDelta(current.waveSuitability, baseline.waveSuitability, WAVE_RANK)}
            />
          </div>
        </>
      )}
    </aside>
  );
}
