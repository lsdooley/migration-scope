import Papa from 'papaparse';
import type { ApplicationRecord, ProvenanceInfo } from '../model/types';
import { validateRawRow, type RowValidationIssue } from '../model/schemas';
import { normalizeRawRow } from '../model/normalizer';

// CSV ingestion: format/alias detection → validation → duplicate detection →
// aggregate/detail reconciliation → normalized ApplicationRecord[]. Never
// executes uploaded content; every cell is treated as untrusted text.

export interface ImportIssue {
  rowIndex: number;
  applicationId?: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportResult {
  accepted: ApplicationRecord[];
  rejectedRowCount: number;
  acceptedRowCount: number;
  issues: ImportIssue[];
  duplicateIds: string[];
  format: 'csv';
  fileName: string;
  fileHash: string;
}

// Case-insensitive header aliases → canonical snake_case field names.
const HEADER_ALIASES: Record<string, string> = {
  'schema version': 'schema_version', schema_version: 'schema_version',
  'application id': 'application_id', app_id: 'application_id', application_id: 'application_id',
  'application name': 'application_name', app_name: 'application_name', application_name: 'application_name',
  'last verified date': 'last_verified_date', last_verified_date: 'last_verified_date', last_verified: 'last_verified_date',
  languages: 'languages', language: 'languages',
  'runtime platforms': 'runtime_platforms', runtime_platforms: 'runtime_platforms', runtime: 'runtime_platforms',
  'architecture style': 'architecture_style', architecture_style: 'architecture_style',
  'first production date': 'first_production_date', first_production_date: 'first_production_date', go_live_date: 'first_production_date',
  'upstream dependency count': 'upstream_dependency_count', upstream_dependency_count: 'upstream_dependency_count', upstream_count: 'upstream_dependency_count',
  'downstream dependency count': 'downstream_dependency_count', downstream_dependency_count: 'downstream_dependency_count', downstream_count: 'downstream_dependency_count',
  'integration count': 'integration_count', integration_count: 'integration_count',
  'integration types': 'integration_types', integration_types: 'integration_types',
  'business criticality': 'business_criticality', business_criticality: 'business_criticality', criticality: 'business_criticality',
  'dr topology': 'dr_topology', dr_topology: 'dr_topology',
  'rto minutes': 'rto_minutes', rto_minutes: 'rto_minutes', rto: 'rto_minutes',
  'rpo minutes': 'rpo_minutes', rpo_minutes: 'rpo_minutes', rpo: 'rpo_minutes',
  application_sys_id: 'application_sys_id', sys_id: 'application_sys_id',
  application_service_ids: 'application_service_ids',
  business_owner: 'business_owner', technical_owner: 'technical_owner', support_group: 'support_group',
  lifecycle_status: 'lifecycle_status',
  frameworks: 'frameworks', operating_systems: 'operating_systems', databases: 'databases',
  deployment_model: 'deployment_model', environment_count: 'environment_count', production_instance_count: 'production_instance_count',
  architecture_components: 'architecture_components',
  dependency_ids: 'dependency_ids', critical_dependency_count: 'critical_dependency_count',
  external_dependency_count: 'external_dependency_count', unknown_dependency_indicator: 'unknown_dependency_indicator',
  shared_platform_dependencies: 'shared_platform_dependencies',
  integration_ids: 'integration_ids', critical_integration_count: 'critical_integration_count',
  external_party_integration_count: 'external_party_integration_count', real_time_integration_count: 'real_time_integration_count',
  integration_inventory_confidence: 'integration_inventory_confidence',
  availability_tier: 'availability_tier',
  current_recovery_test_status: 'current_recovery_test_status', last_recovery_test_date: 'last_recovery_test_date',
  recovery_test_result: 'recovery_test_result', multi_region_or_site: 'multi_region_or_site',
  data_classification: 'data_classification', regulatory_tags: 'regulatory_tags',
  customer_transaction_exposure: 'customer_transaction_exposure',
  incident_sev1_12m: 'incident_sev1_12m', incident_sev2_12m: 'incident_sev2_12m', change_failure_rate: 'change_failure_rate',
  cmdb_completeness: 'cmdb_completeness', cmdb_correctness: 'cmdb_correctness', cmdb_compliance: 'cmdb_compliance',
  dependencies_detail: 'dependencies_detail', integrations_detail: 'integrations_detail', technology_components_detail: 'technology_components_detail',
};

function mapHeader(raw: string): string {
  const key = raw.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, '_');
}

async function hashText(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  // Fallback simple hash for environments without Web Crypto.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h.toString(16);
}

function nowIso(): string {
  return new Date().toISOString();
}

// CSV cells always arrive as strings; coerce the numeric canonical fields back
// to numbers (leaving 'Unknown'/blank untouched) before schema validation.
const NUMERIC_FIELDS = [
  'upstream_dependency_count', 'downstream_dependency_count', 'integration_count', 'rto_minutes', 'rpo_minutes',
  'critical_dependency_count', 'external_dependency_count', 'shared_platform_dependencies',
  'critical_integration_count', 'external_party_integration_count', 'real_time_integration_count',
  'incident_sev1_12m', 'incident_sev2_12m', 'change_failure_rate', 'cmdb_completeness', 'cmdb_correctness',
  'cmdb_compliance', 'environment_count', 'production_instance_count',
];
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

function coerceNumericFields(row: Record<string, string>): Record<string, unknown> {
  const coerced: Record<string, unknown> = { ...row };
  for (const field of NUMERIC_FIELDS) {
    const value = coerced[field];
    if (typeof value === 'string' && NUMERIC_PATTERN.test(value.trim())) {
      coerced[field] = Number(value.trim());
    }
  }
  return coerced;
}

function rowsToIssues(rowIndex: number, applicationId: string | undefined, issues: RowValidationIssue[]): ImportIssue[] {
  return issues.map((i) => ({ rowIndex, applicationId, field: i.field, message: i.message, severity: i.severity }));
}

export async function parseCsv(
  text: string,
  fileName: string,
  opts: { maxSizeMb: number } = { maxSizeMb: 5 },
): Promise<ImportResult> {
  const sizeMb = new TextEncoder().encode(text).length / (1024 * 1024);
  if (sizeMb > opts.maxSizeMb) {
    return {
      accepted: [],
      rejectedRowCount: 0,
      acceptedRowCount: 0,
      issues: [{ rowIndex: -1, field: '(file)', message: `File is ${sizeMb.toFixed(1)}MB, over the ${opts.maxSizeMb}MB POC limit.`, severity: 'error' }],
      duplicateIds: [],
      format: 'csv',
      fileName,
      fileHash: '',
    };
  }

  const fileHash = await hashText(text);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: mapHeader,
  });

  const issues: ImportIssue[] = [];
  const accepted: ApplicationRecord[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  let rejectedRowCount = 0;
  const importedAt = nowIso();

  parsed.data.forEach((row, idx) => {
    const { issues: rowIssues, parsed: validRow } = validateRawRow(coerceNumericFields(row));
    if (!validRow) {
      rejectedRowCount++;
      issues.push(...rowsToIssues(idx, row.application_id, rowIssues));
      return;
    }

    if (seenIds.has(validRow.application_id)) {
      duplicateIds.add(validRow.application_id);
      issues.push({ rowIndex: idx, applicationId: validRow.application_id, field: 'application_id', message: 'Duplicate application_id — row skipped.', severity: 'error' });
      rejectedRowCount++;
      return;
    }
    seenIds.add(validRow.application_id);

    const normalized = normalizeRawRow(validRow);
    const conflicts: string[] = [];

    // Aggregate/detail reconciliation.
    if (normalized.integrationCount != null && normalized.integrations.length > 0 && normalized.integrationCount !== normalized.integrations.length) {
      conflicts.push(`integration_count (${normalized.integrationCount}) does not match integrations_detail (${normalized.integrations.length}).`);
      issues.push({ rowIndex: idx, applicationId: validRow.application_id, field: 'integration_count', message: 'Aggregate/detail mismatch on integration count.', severity: 'warning' });
    }
    const depDetailCount = normalized.dependencies.length;
    const declaredDepCount = (normalized.upstreamDependencyCount ?? 0) + (normalized.downstreamDependencyCount ?? 0);
    if (depDetailCount > 0 && declaredDepCount > 0 && depDetailCount !== declaredDepCount) {
      conflicts.push(`Declared dependency counts (${declaredDepCount}) do not match dependencies_detail (${depDetailCount}).`);
      issues.push({ rowIndex: idx, applicationId: validRow.application_id, field: 'upstream_dependency_count', message: 'Aggregate/detail mismatch on dependency count.', severity: 'warning' });
    }
    if ((normalized.dependencyIds?.length ?? 0) > 0 && declaredDepCount === 0) {
      conflicts.push('Dependency IDs exist while declared dependency counts are zero.');
    }

    const provenance: Record<string, ProvenanceInfo> = {};
    for (const key of Object.keys(normalized)) {
      provenance[key] = { source: 'CMDB', timestamp: normalized.lastVerifiedDate ?? importedAt };
    }

    accepted.push({
      ...normalized,
      isSynthetic: false,
      provenance,
      sourceFileName: fileName,
      sourceFileHash: fileHash,
      importedAt,
      conflicts,
    });
  });

  return {
    accepted,
    rejectedRowCount,
    acceptedRowCount: accepted.length,
    issues,
    duplicateIds: [...duplicateIds],
    format: 'csv',
    fileName,
    fileHash,
  };
}

/** Spreadsheet-formula injection guard for exported CSV cells. */
export function sanitizeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

export function generateSampleCsv(): string {
  const headers = [
    'schema_version', 'application_id', 'application_name', 'last_verified_date', 'languages',
    'runtime_platforms', 'architecture_style', 'first_production_date', 'upstream_dependency_count',
    'downstream_dependency_count', 'integration_count', 'integration_types', 'business_criticality',
    'dr_topology', 'rto_minutes', 'rpo_minutes',
  ];
  const row = [
    '1.0', 'SAMPLE-APP-001', 'Sample Claims Portal', '2026-06-01', '"[""Java""]"',
    '"[""OpenJDK 17""]"', 'Layered application', '2018-01-01', '3', '5', '4', '"[""API""]"',
    'High', 'Warm standby', '240', '60',
  ];
  return `${headers.join(',')}\n${row.join(',')}\n`;
}
