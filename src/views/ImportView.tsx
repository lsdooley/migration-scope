import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAppState } from '../state/appState';
import { parseCsv, generateSampleCsv } from '../parsers/csvParser';
import { parseMarkdown, generateSampleMarkdown } from '../parsers/markdownParser';
import type { ImportResult } from '../parsers/csvParser';

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Stage = 'idle' | 'parsing' | 'preview' | 'committed' | 'error';

export function ImportView() {
  const { modelConfig, recordImport, pushToast } = useAppState();
  const [stage, setStage] = useState<Stage>('idle');
  const [fileName, setFileName] = useState('');
  const [pendingResult, setPendingResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStage('parsing');
    setFileName(file.name);
    const text = await file.text();
    const lower = file.name.toLowerCase();
    const opts = { maxSizeMb: modelConfig.poc.fileSizeLimitMb };
    try {
      const result = lower.endsWith('.csv')
        ? await parseCsv(text, file.name, opts)
        : lower.endsWith('.md') || lower.endsWith('.markdown')
          ? await parseMarkdown(text, file.name, opts)
          : null;
      if (!result) {
        setStage('error');
        pushToast('Unsupported file type — use .csv, .md, or .markdown.', 'warning');
        return;
      }
      setPendingResult(result);
      setStage('preview');
    } catch {
      setStage('error');
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function commit() {
    if (!pendingResult) return;
    recordImport(pendingResult);
    setStage('committed');
    pushToast(`Imported ${pendingResult.acceptedRowCount} application${pendingResult.acceptedRowCount === 1 ? '' : 's'}.`, 'success');
  }

  function reset() {
    setStage('idle');
    setPendingResult(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section aria-labelledby="import-h1" className="ms-page">
      <h1 id="import-h1">Import data</h1>
      <p>Accepts ServiceNow/CMDB exports as <code>.csv</code>, <code>.md</code>, or <code>.markdown</code>. Uploaded content is never executed — every field is treated as untrusted text.</p>

      <div
        className="ms-card"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: dragOver ? 'var(--ms-accent)' : 'var(--ms-border-strong)',
          textAlign: 'center',
          padding: 'var(--ms-space-6)',
        }}
      >
        <Upload size={28} aria-hidden />
        <p>Drag a file here, or</p>
        <label className="ms-btn ms-btn-primary" htmlFor="file-input" style={{ display: 'inline-flex' }}>
          Choose file
        </label>
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          accept=".csv,.md,.markdown"
          className="ms-visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <p style={{ color: 'var(--ms-text-muted)', fontSize: '0.85rem' }}>Max {modelConfig.poc.fileSizeLimitMb}MB for this POC.</p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--ms-space-3)', marginTop: 'var(--ms-space-4)', flexWrap: 'wrap' }}>
        <button className="ms-btn ms-btn-secondary" onClick={() => downloadText('migrationscope-sample.csv', generateSampleCsv(), 'text/csv')}>
          <FileSpreadsheet size={16} aria-hidden style={{ marginRight: 6 }} />Download sample CSV
        </button>
        <button className="ms-btn ms-btn-secondary" onClick={() => downloadText('migrationscope-sample.md', generateSampleMarkdown(), 'text/markdown')}>
          <FileText size={16} aria-hidden style={{ marginRight: 6 }} />Download sample Markdown
        </button>
      </div>

      {stage === 'parsing' && (
        <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }} role="status" aria-live="polite">
          <div className="ms-skeleton" style={{ width: '60%', marginBottom: 8 }} />
          <div className="ms-skeleton" style={{ width: '80%' }} />
          <p>Parsing {fileName}…</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="ms-inline-error" style={{ marginTop: 'var(--ms-space-4)' }} role="alert">
          Could not read {fileName}. Confirm it is a plain-text .csv, .md, or .markdown file and try again.
        </div>
      )}

      {(stage === 'preview' || stage === 'committed') && pendingResult && (
        <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }}>
          <h2>Preview: {pendingResult.fileName}</h2>
          <p>
            <strong>{pendingResult.acceptedRowCount}</strong> accepted, <strong>{pendingResult.rejectedRowCount}</strong> rejected.
            {pendingResult.duplicateIds.length > 0 && <> {pendingResult.duplicateIds.length} duplicate ID(s) skipped.</>}
          </p>

          {pendingResult.issues.length > 0 && (
            <div className={pendingResult.acceptedRowCount === 0 ? 'ms-inline-error' : 'ms-inline-warning'} role="alert">
              <strong>{pendingResult.acceptedRowCount === 0 ? 'Import rejected' : 'Partial import — review before committing'}</strong>
              <ul>
                {pendingResult.issues.slice(0, 10).map((issue, i) => (
                  <li key={i}>
                    {issue.applicationId ? `${issue.applicationId}: ` : ''}{issue.field} — {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingResult.accepted.length > 0 && (
            <div className="ms-table-wrap ms-table-cards">
              <table className="ms-table">
                <thead>
                  <tr><th scope="col">ID</th><th scope="col">Name</th><th scope="col">Criticality</th><th scope="col">Conflicts</th></tr>
                </thead>
                <tbody>
                  {pendingResult.accepted.map((a) => (
                    <tr key={a.applicationId}>
                      <td data-label="ID">{a.applicationId}</td>
                      <td data-label="Name">{a.applicationName}</td>
                      <td data-label="Criticality">{a.businessCriticality}</td>
                      <td data-label="Conflicts">{a.conflicts?.length ? <span className="ms-badge ms-badge-warning">{a.conflicts.length}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stage === 'preview' ? (
            <div style={{ display: 'flex', gap: 'var(--ms-space-3)', marginTop: 'var(--ms-space-4)' }}>
              <button className="ms-btn ms-btn-primary" onClick={commit} disabled={pendingResult.accepted.length === 0}>
                Commit to applications
              </button>
              <button className="ms-btn ms-btn-secondary" onClick={reset}>Discard</button>
            </div>
          ) : (
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ms-success)' }}>
              <CheckCircle2 size={18} aria-hidden /> Committed to in-memory application state.
              <button className="ms-btn ms-btn-secondary" onClick={reset} style={{ marginLeft: 'var(--ms-space-3)' }}>Import another file</button>
            </p>
          )}
        </div>
      )}

      {stage === 'idle' && (
        <p style={{ marginTop: 'var(--ms-space-4)', color: 'var(--ms-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={16} aria-hidden /> No file selected yet.
        </p>
      )}
    </section>
  );
}
