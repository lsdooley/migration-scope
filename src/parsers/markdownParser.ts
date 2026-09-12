import { load as loadYaml } from 'js-yaml';
import type { ApplicationRecord, DependencyRecord, IntegrationRecord, ProvenanceInfo, TechnologyComponent } from '../model/types';
import { validateRawRow } from '../model/schemas';
import { normalizeRawRow } from '../model/normalizer';
import type { ImportIssue, ImportResult } from './csvParser';

// Structured Markdown ingestion: YAML front matter for scalars, fixed-column
// tables for repeated records, one application per file. Free text is kept
// as notes only — it never reaches the calculation engine.

const REQUIRED_SECTIONS = ['Architecture and Technology', 'Dependencies', 'Integrations', 'Recovery', 'Data Quality'];

function splitFrontMatter(text: string): { frontMatter: string; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontMatter: '', body: text };
  return { frontMatter: match[1], body: match[2] };
}

function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = /^##\s+(.+)$/gm;
  const matches = [...body.matchAll(headingRegex)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim();
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    sections[name] = body.slice(start, end).trim();
  }
  return sections;
}

function toCamel(header: string): string {
  const parts = header.trim().toLowerCase().split(/[\s_-]+/);
  return parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['true', 'yes', '1', 'y'].includes(value.trim().toLowerCase());
}

/** Parse a fixed-column Markdown table (header row, separator row, data rows) into plain objects. */
export function parseMarkdownTable(section: string): Record<string, string>[] {
  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (lines.length < 2) return [];
  const headers = lines[0].split('|').map((h) => h.trim()).filter(Boolean).map(toCamel);
  const rows = lines.slice(2); // skip header + separator
  return rows.map((line) => {
    const cells = line.split('|').map((c) => c.trim()).filter((_, i, arr) => !(i === 0 || i === arr.length - 1));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? '';
    });
    return obj;
  });
}

function parseDependenciesTable(section: string): DependencyRecord[] {
  return parseMarkdownTable(section).map((row, i) => ({
    id: row.id || `DEP-${i + 1}`,
    direction: (row.direction?.toLowerCase() === 'downstream' ? 'downstream' : 'upstream') as DependencyRecord['direction'],
    relationshipType: (row.relationshipType || row.relationship || 'Unknown') as DependencyRecord['relationshipType'],
    critical: parseBoolean(row.critical),
    external: parseBoolean(row.external),
    sharedPlatform: parseBoolean(row.sharedPlatform || row.shared),
  }));
}

function parseIntegrationsTable(section: string): IntegrationRecord[] {
  return parseMarkdownTable(section).map((row, i) => ({
    id: row.id || `INT-${i + 1}`,
    type: (row.type || 'Unknown') as IntegrationRecord['type'],
    direction: (row.direction || 'Unknown') as IntegrationRecord['direction'],
    realTime: parseBoolean(row.realTime || row.real_time),
    externalParty: parseBoolean(row.externalParty),
    businessCritical: parseBoolean(row.businessCritical),
    endpointProtocolIdentityChange: parseBoolean(row.endpointChange || row.endpointProtocolIdentityChange),
    aggregateOnly: parseBoolean(row.aggregateOnly),
    authType: row.authType,
    protocolProduct: row.protocolProduct,
  }));
}

function parseTechnologyTable(section: string): TechnologyComponent[] {
  return parseMarkdownTable(section).map((row) => ({
    name: row.name || 'Unknown',
    kind: (row.kind || 'language') as TechnologyComponent['kind'],
    version: row.version || null,
    supportStatus: (row.supportStatus || row.support || 'bespoke-unknown') as TechnologyComponent['supportStatus'],
    majorVersionUpgradeNeeded: parseBoolean(row.majorVersionUpgradeNeeded),
    awsTargetIncompatible: parseBoolean(row.awsTargetIncompatible),
    specialistSkillRequired: parseBoolean(row.specialistSkillRequired),
    isPrimaryLanguage: parseBoolean(row.isPrimaryLanguage || row.primary),
  }));
}

export async function parseMarkdown(
  text: string,
  fileName: string,
  opts: { maxSizeMb: number } = { maxSizeMb: 5 },
): Promise<ImportResult> {
  const sizeMb = new TextEncoder().encode(text).length / (1024 * 1024);
  if (sizeMb > opts.maxSizeMb) {
    return {
      accepted: [], rejectedRowCount: 1, acceptedRowCount: 0,
      issues: [{ rowIndex: -1, field: '(file)', message: `File is ${sizeMb.toFixed(1)}MB, over the ${opts.maxSizeMb}MB POC limit.`, severity: 'error' }],
      duplicateIds: [], format: 'csv', fileName, fileHash: '',
    };
  }

  const issues: ImportIssue[] = [];
  const { frontMatter, body } = splitFrontMatter(text);
  if (!frontMatter) {
    issues.push({ rowIndex: 0, field: '(front matter)', message: 'No YAML front matter found — required for scalar fields.', severity: 'error' });
    return { accepted: [], rejectedRowCount: 1, acceptedRowCount: 0, issues, duplicateIds: [], format: 'csv', fileName, fileHash: '' };
  }

  let scalars: Record<string, unknown>;
  try {
    scalars = (loadYaml(frontMatter) as Record<string, unknown>) ?? {};
  } catch (e) {
    issues.push({ rowIndex: 0, field: '(front matter)', message: `Invalid YAML: ${(e as Error).message}`, severity: 'error' });
    return { accepted: [], rejectedRowCount: 1, acceptedRowCount: 0, issues, duplicateIds: [], format: 'csv', fileName, fileHash: '' };
  }

  const sections = splitSections(body);
  for (const name of REQUIRED_SECTIONS) {
    if (!(name in sections)) {
      issues.push({ rowIndex: 0, field: `## ${name}`, message: `Missing required section "## ${name}".`, severity: 'warning' });
    }
  }

  const dependencies = parseDependenciesTable(sections['Dependencies'] ?? '');
  const integrations = parseIntegrationsTable(sections['Integrations'] ?? '');
  const technologyComponents = parseTechnologyTable(sections['Architecture and Technology'] ?? '');

  const rawRow = {
    ...scalars,
    dependencies_detail: dependencies,
    integrations_detail: integrations,
    technology_components_detail: technologyComponents,
  };

  const { issues: rowIssues, parsed } = validateRawRow(rawRow);
  if (!parsed) {
    return {
      accepted: [], rejectedRowCount: 1, acceptedRowCount: 0,
      issues: [...issues, ...rowIssues.map((i) => ({ rowIndex: 0, field: i.field, message: i.message, severity: i.severity as 'error' | 'warning' }))],
      duplicateIds: [], format: 'csv', fileName, fileHash: '',
    };
  }

  const normalized = normalizeRawRow(parsed);
  const importedAt = new Date().toISOString();
  const conflicts: string[] = [];
  if (normalized.integrationCount != null && normalized.integrations.length > 0 && normalized.integrationCount !== normalized.integrations.length) {
    conflicts.push(`integration_count (${normalized.integrationCount}) does not match the Integrations table (${normalized.integrations.length} rows).`);
  }

  const provenance: Record<string, ProvenanceInfo> = {};
  for (const key of Object.keys(normalized)) {
    provenance[key] = { source: 'CMDB', timestamp: normalized.lastVerifiedDate ?? importedAt };
  }

  const record: ApplicationRecord = {
    ...normalized,
    isSynthetic: false,
    provenance,
    sourceFileName: fileName,
    sourceFileHash: '',
    importedAt,
    conflicts,
  };

  return {
    accepted: [record],
    rejectedRowCount: 0,
    acceptedRowCount: 1,
    issues,
    duplicateIds: [],
    format: 'csv',
    fileName,
    fileHash: '',
  };
}

export function generateSampleMarkdown(): string {
  return `---
schema_version: "1.0"
application_id: SAMPLE-APP-002
application_name: Sample Claims Intake Service
last_verified_date: "2026-06-15"
languages: ["Java"]
runtime_platforms: ["OpenJDK 17"]
architecture_style: Layered application
first_production_date: "2017-03-01"
upstream_dependency_count: 2
downstream_dependency_count: 3
integration_count: 2
integration_types: ["API", "Batch"]
business_criticality: High
dr_topology: Warm standby
rto_minutes: 240
rpo_minutes: 60
---

## Architecture and Technology

| name | kind | version | supportStatus | isPrimaryLanguage |
|------|------|---------|----------------|---------------------|
| Java | language | 17 | current | true |

## Dependencies

| id | direction | relationshipType | critical | external | sharedPlatform |
|----|-----------|-------------------|----------|----------|----------------|
| DEP-1 | upstream | Calls | true | false | false |
| DEP-2 | downstream | Depends on | false | false | true |

## Integrations

| id | type | direction | realTime | externalParty | businessCritical | endpointChange | aggregateOnly |
|----|------|-----------|----------|----------------|--------------------|------------------|-----------------|
| INT-1 | API | outbound | true | false | true | false | false |
| INT-2 | Batch | outbound | false | false | false | false | false |

## Recovery

Notes: quarterly DR test scheduled; no known gaps.

## Data Quality

Notes: CMDB record reviewed during last architecture assessment.
`;
}
