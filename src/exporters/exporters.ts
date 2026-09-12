import type { ApplicationRecord, EstimateResult } from '../model/types';
import type { ModelConfig } from '../model/modelConfig';
import { sanitizeCsvCell } from '../parsers/csvParser';

// Every export here is a plain client-side Blob download — no network call,
// no backend. CSV cells are passed through sanitizeCsvCell to block
// spreadsheet-formula injection on values beginning with = + - @.

export function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportEstimateJson(result: EstimateResult, app: ApplicationRecord): void {
  const payload = {
    application: { id: app.applicationId, name: app.applicationName, sourceFileHash: app.sourceFileHash, provenance: app.provenance },
    estimate: result,
  };
  downloadBlob(`${app.applicationId}-${result.path}-estimate.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function csvRow(cells: (string | number)[]): string {
  return cells.map((c) => {
    const sanitized = sanitizeCsvCell(c);
    return /[",\n]/.test(sanitized) ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
  }).join(',');
}

export function exportResultSummaryCsv(result: EstimateResult, app: ApplicationRecord): void {
  const headers = [
    'application_id', 'application_name', 'path', 'expected_effort_weeks', 'optimistic_effort_weeks',
    'conservative_effort_weeks', 'active_duration_weeks', 'calendar_duration_weeks', 'suggested_people',
    'suggested_fte', 'scope_index', 'business_impact', 'complexity', 'risk_band', 'confidence_band',
    'wave_suitability', 'model_version',
  ];
  const row = [
    app.applicationId, app.applicationName, result.path, result.expectedEffortWeeks.toFixed(1),
    result.optimisticEffortWeeks.toFixed(1), result.conservativeEffortWeeks.toFixed(1),
    result.activeDurationWeeks.toFixed(1), result.calendarDurationWeeks.toFixed(1), result.suggestedPeople,
    result.suggestedFte.toFixed(1), result.scopeIndex.toFixed(0), result.businessImpact.toFixed(0),
    result.complexity.toFixed(0), result.riskBand, result.confidenceBand, result.waveSuitability,
    result.trace.modelVersion,
  ];
  downloadBlob(`${app.applicationId}-${result.path}-summary.csv`, `${csvRow(headers)}\n${csvRow(row)}\n`, 'text/csv');
}

export function exportSyntheticApplicationsCsv(apps: ApplicationRecord[]): void {
  const headers = [
    'schema_version', 'application_id', 'application_name', 'last_verified_date', 'languages',
    'runtime_platforms', 'architecture_style', 'first_production_date', 'upstream_dependency_count',
    'downstream_dependency_count', 'integration_count', 'integration_types', 'business_criticality',
    'dr_topology', 'rto_minutes', 'rpo_minutes',
  ];
  const rows = apps.map((a) => csvRow([
    a.schemaVersion, a.applicationId, a.applicationName, a.lastVerifiedDate ?? 'Unknown',
    JSON.stringify(a.languages), JSON.stringify(a.runtimePlatforms), a.architectureStyle,
    a.firstProductionDate ?? 'Unknown', a.upstreamDependencyCount ?? 'Unknown', a.downstreamDependencyCount ?? 'Unknown',
    a.integrationCount ?? 'Unknown', JSON.stringify(a.integrationTypes), a.businessCriticality, a.drTopology,
    a.rtoMinutes ?? 'Unknown', a.rpoMinutes ?? 'Unknown',
  ]));
  downloadBlob('migrationscope-synthetic-applications.csv', `${csvRow(headers)}\n${rows.join('\n')}\n`, 'text/csv');
}

export function exportModelConfigJson(config: ModelConfig): void {
  downloadBlob('model-config.json', JSON.stringify(config, null, 2), 'application/json');
}

/** Opens the browser print dialog against the page's print stylesheet — no file is generated. */
export function printEstimate(): void {
  window.print();
}
