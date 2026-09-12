import { useEffect, useMemo, useState } from 'react';
import { useAppState, defaultPlanningAnswers } from '../state/appState';
import { defaultModelConfig, validateModelConfig, type ModelConfig } from '../model/modelConfig';
import { modelConfigImportSchema } from '../model/schemas';
import { ALL_RULES } from '../model/rulesEngine';
import { calculateEstimate } from '../model/calculationEngine';
import { LiveImpactPreview } from '../components/LiveImpactPreview';

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function NumberField({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="ms-field" style={{ marginBottom: 'var(--ms-space-2)' }}>
      <label>{label}
        <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    </div>
  );
}

export function ModelConfigView() {
  const { modelConfig, setModelConfig, resetModelConfig, modelConfigDirty, pushToast, applications, selectedApplication, draftAnswersByAppId, profileConfirmedByAppId } = useAppState();
  const [draft, setDraft] = useState<ModelConfig>(() => structuredClone(modelConfig));
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(structuredClone(modelConfig));
  }, [modelConfig]);

  const hasUnsavedChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(modelConfig), [draft, modelConfig]);
  const validationErrors = useMemo(() => validateModelConfig(draft), [draft]);

  // Preview coefficient edits against a real application immediately —
  // selected one if there is one, otherwise the first loaded application.
  const previewApp = selectedApplication ?? applications[0] ?? null;
  const previewAnswers = previewApp ? draftAnswersByAppId[previewApp.applicationId] ?? defaultPlanningAnswers() : defaultPlanningAnswers();
  const previewProfileConfirmed = previewApp ? !!profileConfirmedByAppId[previewApp.applicationId] : false;

  const baselineResult = useMemo(() => {
    if (!previewApp) return null;
    return calculateEstimate(previewApp, previewAnswers, modelConfig, { profileConfirmed: previewProfileConfirmed });
  }, [previewApp, previewAnswers, modelConfig, previewProfileConfirmed]);

  const liveResult = useMemo(() => {
    if (!previewApp || validationErrors.length > 0) return null;
    return calculateEstimate(previewApp, previewAnswers, draft, { profileConfirmed: previewProfileConfirmed });
  }, [previewApp, previewAnswers, draft, previewProfileConfirmed, validationErrors.length]);

  function save() {
    if (validationErrors.length > 0) {
      pushToast('Cannot save — resolve validation errors first.', 'warning');
      return;
    }
    setModelConfig(draft);
    pushToast('Model configuration saved.', 'success');
  }

  function discard() {
    setDraft(structuredClone(modelConfig));
  }

  function cloneVersion() {
    const n = Math.floor(Math.random() * 900 + 100);
    setDraft((prev) => ({ ...prev, version: `${prev.version}-clone-${n}` }));
    pushToast('Cloned as a new draft version — Save to activate it.', 'info');
  }

  function handleImportFile(file: File) {
    setImportError(null);
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text);
        const shapeCheck = modelConfigImportSchema.safeParse(parsed);
        if (!shapeCheck.success) {
          setImportError('Invalid model JSON shape: ' + shapeCheck.error.issues.map((i) => i.path.join('.')).join(', '));
          return;
        }
        const errors = validateModelConfig(parsed as ModelConfig);
        if (errors.length > 0) {
          setImportError('Invalid model configuration: ' + errors.join('; '));
          return;
        }
        setDraft(parsed as ModelConfig);
        pushToast('Model JSON imported and validated — review, then Save.', 'success');
      } catch {
        setImportError('Could not parse file as JSON.');
      }
    });
  }

  return (
    <section aria-labelledby="model-config-h1" className="ms-page ms-workspace-grid">
      <div className="ms-workspace-main">
        <h1 id="model-config-h1">Model configuration</h1>
        <p>Version: <strong>{draft.version}</strong>. POC defaults — not calibrated. All core outputs trace back to these values.</p>

      {hasUnsavedChanges && (
        <div className="ms-inline-warning" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ms-space-2)' }}>
          <span>You have unsaved changes.</span>
          <span style={{ display: 'flex', gap: 'var(--ms-space-2)' }}>
            <button className="ms-btn ms-btn-primary" onClick={save} disabled={validationErrors.length > 0}>Save changes</button>
            <button className="ms-btn ms-btn-secondary" onClick={discard}>Discard</button>
          </span>
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="ms-inline-error" role="alert">
          <strong>Validation errors:</strong>
          <ul>{validationErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--ms-space-3)', flexWrap: 'wrap', margin: 'var(--ms-space-4) 0' }}>
        <button className="ms-btn ms-btn-secondary" onClick={() => { setDraft(structuredClone(defaultModelConfig)); resetModelConfig(); }}>Reset POC defaults</button>
        <button className="ms-btn ms-btn-secondary" onClick={() => downloadJson('model-config.json', modelConfig)}>Export model JSON</button>
        <label className="ms-btn ms-btn-secondary" style={{ display: 'inline-flex' }}>
          Import model JSON
          <input type="file" accept="application/json" className="ms-visually-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
        </label>
        <button className="ms-btn ms-btn-secondary" onClick={cloneVersion}>Clone model version</button>
      </div>
      {importError && <div className="ms-inline-error" role="alert">{importError}</div>}

      <div className="ms-card">
        <h2>Path baselines</h2>
        <div className="ms-table-wrap ms-table-cards">
          <table className="ms-table">
            <thead><tr><th scope="col">Path</th><th scope="col">Baseline (pw)</th><th scope="col">Complexity</th><th scope="col">Change factor</th><th scope="col">Parallelism cap (FTE)</th><th scope="col">Min people</th><th scope="col">Default FTE</th></tr></thead>
            <tbody>
              {Object.entries(draft.pathBaselines).map(([path, b]) => (
                <tr key={path}>
                  <th scope="row">{path}</th>
                  {(['baselineWeeks', 'pathComplexity', 'changeFactor', 'parallelismCapFte', 'minimumPeople', 'defaultFte'] as const).map((field) => (
                    <td data-label={field} key={field}>
                      <input
                        type="number"
                        value={b[field]}
                        onChange={(e) => setDraft((prev) => ({ ...prev, pathBaselines: { ...prev.pathBaselines, [path]: { ...prev.pathBaselines[path], [field]: Number(e.target.value) } } }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }}>
        <h2>Risk and confidence thresholds</h2>
        <div style={{ display: 'flex', gap: 'var(--ms-space-5)', flexWrap: 'wrap' }}>
          <div>
            <h3>Risk bands (max score)</h3>
            {draft.risk.bands.map((b, i) => (
              <NumberField key={b.band} label={b.band} step={1} value={b.max} onChange={(v) => setDraft((prev) => { const bands = [...prev.risk.bands]; bands[i] = { ...bands[i], max: v }; return { ...prev, risk: { ...prev.risk, bands } }; })} />
            ))}
          </div>
          <div>
            <h3>Confidence bands (min score)</h3>
            {draft.confidence.bands.map((b, i) => (
              <NumberField key={b.band} label={b.band} step={1} value={b.min} onChange={(v) => setDraft((prev) => { const bands = [...prev.confidence.bands]; bands[i] = { ...bands[i], min: v }; return { ...prev, confidence: { ...prev.confidence, bands } }; })} />
            ))}
          </div>
          <div>
            <h3>Caps</h3>
            <NumberField label="Dependency count-derived cap" step={1} value={draft.dependencyLoad.countDerivedCap} onChange={(v) => setDraft((prev) => ({ ...prev, dependencyLoad: { ...prev.dependencyLoad, countDerivedCap: v } }))} />
            <NumberField label="Integration load cap" step={1} value={draft.integrationLoad.cap} onChange={(v) => setDraft((prev) => ({ ...prev, integrationLoad: { ...prev.integrationLoad, cap: v } }))} />
            <NumberField label="Discovery allowance cap" step={1} value={draft.discovery.cap} onChange={(v) => setDraft((prev) => ({ ...prev, discovery: { ...prev.discovery, cap: v } }))} />
          </div>
        </div>
      </div>

      <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }}>
        <h2>Scope Index weights</h2>
        <p>Max weights must total 100. Current total: <strong>{draft.scopeIndex.reduce((a, b) => a + b.maxWeight, 0)}</strong></p>
        <div style={{ display: 'flex', gap: 'var(--ms-space-3)', flexWrap: 'wrap' }}>
          {draft.scopeIndex.map((pkg, i) => (
            <NumberField key={pkg.category} label={pkg.category} step={1} value={pkg.maxWeight} onChange={(v) => setDraft((prev) => { const scopeIndex = [...prev.scopeIndex]; scopeIndex[i] = { ...scopeIndex[i], maxWeight: v }; return { ...prev, scopeIndex }; })} />
          ))}
        </div>
      </div>

      <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }}>
        <h2>Rule switches</h2>
        {ALL_RULES.map((rule) => (
          <label key={rule.id} style={{ display: 'flex', gap: 'var(--ms-space-2)', alignItems: 'flex-start', padding: 'var(--ms-space-2) 0', borderBottom: '1px solid var(--ms-border)' }}>
            <input
              type="checkbox"
              checked={draft.ruleSwitches[rule.id] !== false}
              onChange={(e) => setDraft((prev) => ({ ...prev, ruleSwitches: { ...prev.ruleSwitches, [rule.id]: e.target.checked } }))}
            />
            <span><strong>{rule.id}</strong> ({rule.severity}{rule.isGate ? ', gate' : ''}) — {rule.effectSummary}</span>
          </label>
        ))}
      </div>

      <div className="ms-card" style={{ marginTop: 'var(--ms-space-4)' }}>
        <h2>Question limits</h2>
        <NumberField label="Max normal questions" step={1} value={draft.poc.maxNormalQuestions} onChange={(v) => setDraft((prev) => ({ ...prev, poc: { ...prev.poc, maxNormalQuestions: v } }))} />
        <NumberField label="Max questions with conditionals" step={1} value={draft.poc.maxQuestionsWithConditional} onChange={(v) => setDraft((prev) => ({ ...prev, poc: { ...prev.poc, maxQuestionsWithConditional: v } }))} />
        <NumberField label="File size limit (MB)" step={1} value={draft.poc.fileSizeLimitMb} onChange={(v) => setDraft((prev) => ({ ...prev, poc: { ...prev.poc, fileSizeLimitMb: v } }))} />
      </div>

      {modelConfigDirty && !hasUnsavedChanges && <p style={{ color: 'var(--ms-text-muted)' }}>Model configuration has been customized for this session.</p>}
      </div>

      <LiveImpactPreview
        current={liveResult}
        baseline={baselineResult}
        title="Coefficient impact"
        note={
          !previewApp
            ? 'Load an application to preview coefficient changes.'
            : hasUnsavedChanges
              ? `Effect on ${previewApp.applicationName} if saved (vs. the currently active config).`
              : `Showing ${previewApp.applicationName} with the active config. Edit a value to preview its effect.`
        }
        emptyMessage="Load an application on the Applications view to preview coefficient changes here."
      />
    </section>
  );
}
