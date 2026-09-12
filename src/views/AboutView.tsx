import { useAppState } from '../state/appState';
import { MODEL_VERSION } from '../model/modelConfig';

const APP_VERSION = '0.1.0-poc';

export function AboutView() {
  const { selectedApplication, importLog } = useAppState();
  const lastImport = importLog[0];

  return (
    <section aria-labelledby="about-h1" className="ms-page">
      <h1 id="about-h1">About and provenance</h1>

      <div className="ms-card">
        <h2>Purpose</h2>
        <p>
          MigrationScope is a proof-of-concept estimator for moving one existing application to AWS. It imports
          current-state evidence from ServiceNow/CMDB exports and asks only the small number of planning
          questions the source data cannot answer, then produces a deterministic, traceable estimate of effort,
          duration, staffing, risk, confidence, and migration-wave suitability.
        </p>
      </div>

      <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }}>
        <h2>Ownership</h2>
        <dl>
          <dt>Product owner</dt><dd>— (placeholder — assign before this leaves the POC stage)</dd>
          <dt>Technical owner</dt><dd>— (placeholder — assign before this leaves the POC stage)</dd>
        </dl>
      </div>

      <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }}>
        <h2>Versions and provenance</h2>
        <dl>
          <dt>Application version</dt><dd>{APP_VERSION}</dd>
          <dt>Model version</dt><dd>{MODEL_VERSION}</dd>
          <dt>Selected application</dt><dd>{selectedApplication ? `${selectedApplication.applicationId} — ${selectedApplication.applicationName}` : 'None selected'}</dd>
          <dt>Last import timestamp</dt><dd>{lastImport ? new Date().toISOString() : 'No import in this session'}</dd>
          <dt>Last import source</dt><dd>{lastImport ? `${lastImport.fileName} (${lastImport.format})` : '—'}</dd>
          <dt>Source file hash</dt><dd>{lastImport?.fileHash || selectedApplication?.sourceFileHash || '—'}</dd>
          <dt>Schema version</dt><dd>{selectedApplication?.schemaVersion ?? '1.0'}</dd>
          <dt>AI status</dt><dd>Disabled by default. When enabled, narratives are deterministic templates labeled "AI-assisted explanation — calculations unchanged."</dd>
        </dl>
      </div>

      <div className="ms-inline-warning" role="note" style={{ marginTop: 'var(--ms-space-4)' }}>
        <strong>Planning estimate only.</strong> POC coefficients are uncalibrated and must not be treated as a funding or delivery commitment.
      </div>
    </section>
  );
}
