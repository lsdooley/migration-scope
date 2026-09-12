import type {
  ApplicationRecord,
  ArchitectureStyle,
  Criticality,
  CustomerTransactionExposure,
  DependencyRecord,
  DRTopology,
  IntegrationRecord,
  IntegrationType,
  RecoveryTestStatus,
} from './types';
import type { RawApplicationRow } from './schemas';

// Pure normalization functions: unit/label/technology/topology/relationship-direction
// normalization plus the 0-4 severity mappings the calculation engine consumes.
// No UI imports, no state mutation.

export function toArray(value: unknown): string[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // fall through to comma split
      }
    }
    return trimmed.length ? trimmed.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }
  return [String(value)];
}

export function parseJsonArray<T>(value: unknown): T[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function toNullableInt(value: unknown): number | null {
  if (value === 'Unknown' || value === '' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === 'Unknown' || value === '' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toNullableDate(value: unknown): string | null {
  if (value === 'Unknown' || value === '' || value == null) return null;
  return String(value);
}

const ARCHITECTURE_ALIASES: Record<string, ArchitectureStyle> = {
  'single deployable': 'Single deployable',
  monolith: 'Single deployable',
  'layered application': 'Layered application',
  layered: 'Layered application',
  'distributed services': 'Distributed services',
  microservices: 'Distributed services',
  'event-driven/data-intensive': 'Event-driven/data-intensive',
  'event-driven': 'Event-driven/data-intensive',
  'mainframe or specialized-platform coupled': 'Mainframe or specialized-platform coupled',
  mainframe: 'Mainframe or specialized-platform coupled',
  'mixed/unknown': 'Mixed/unknown',
  unknown: 'Mixed/unknown',
};

export function normalizeArchitectureStyle(value: unknown): ArchitectureStyle {
  const key = String(value ?? '').trim().toLowerCase();
  return ARCHITECTURE_ALIASES[key] ?? 'Mixed/unknown';
}

const CRITICALITY_ALIASES: Record<string, Criticality> = {
  low: 'Low',
  medium: 'Medium',
  moderate: 'Medium',
  high: 'High',
  'mission-critical': 'Mission-critical',
  'mission critical': 'Mission-critical',
  critical: 'Mission-critical',
  unknown: 'Unknown',
};

export function normalizeCriticality(value: unknown): Criticality {
  const key = String(value ?? '').trim().toLowerCase();
  return CRITICALITY_ALIASES[key] ?? 'Unknown';
}

const DR_TOPOLOGY_ALIASES: Record<string, DRTopology> = {
  none: 'None',
  'backup/restore': 'Backup/restore',
  backup: 'Backup/restore',
  'pilot light': 'Pilot light',
  'warm standby': 'Warm standby',
  'active/passive': 'Active/passive',
  'active/active': 'Active/active',
  unknown: 'Unknown',
};

export function normalizeDrTopology(value: unknown): DRTopology {
  const key = String(value ?? '').trim().toLowerCase();
  return DR_TOPOLOGY_ALIASES[key] ?? 'Unknown';
}

const CUSTOMER_EXPOSURE_ALIASES: Record<string, CustomerTransactionExposure> = {
  none: 'none',
  indirect: 'indirect',
  direct: 'direct',
  unknown: 'Unknown',
};

export function normalizeCustomerExposure(value: unknown): CustomerTransactionExposure {
  const key = String(value ?? '').trim().toLowerCase();
  return CUSTOMER_EXPOSURE_ALIASES[key] ?? 'Unknown';
}

const RECOVERY_STATUS_ALIASES: Record<string, RecoveryTestStatus> = {
  passed: 'passed',
  pass: 'passed',
  failed: 'failed',
  fail: 'failed',
  'never-tested': 'never-tested',
  'never tested': 'never-tested',
  untested: 'never-tested',
  unknown: 'Unknown',
};

export function normalizeRecoveryTestStatus(value: unknown): RecoveryTestStatus {
  const key = String(value ?? '').trim().toLowerCase();
  return RECOVERY_STATUS_ALIASES[key] ?? 'Unknown';
}

const INTEGRATION_TYPE_ALIASES: Record<string, IntegrationType> = {
  api: 'API',
  rest: 'API',
  soap: 'API',
  file: 'File',
  sftp: 'File',
  message: 'Message',
  mq: 'Message',
  'event/stream': 'Event/stream',
  event: 'Event/stream',
  stream: 'Event/stream',
  'database coupling': 'Database coupling',
  database: 'Database coupling',
  'ui/screen': 'UI/screen',
  screen: 'UI/screen',
  batch: 'Batch',
  proprietary: 'Proprietary',
  unknown: 'Unknown',
};

export function normalizeIntegrationType(value: unknown): IntegrationType {
  const key = String(value ?? '').trim().toLowerCase();
  return INTEGRATION_TYPE_ALIASES[key] ?? 'Unknown';
}

/**
 * Relationship types like "Runs on", "Hosted on", or containment describe topology,
 * not an integration — callers must not count these toward integration load.
 */
const CONTAINMENT_RELATIONSHIP_TYPES = new Set(['Runs on', 'Hosted on']);
export function isContainmentRelationship(relationshipType: DependencyRecord['relationshipType']): boolean {
  return CONTAINMENT_RELATIONSHIP_TYPES.has(relationshipType);
}

// --- Severity normalization (0-4, 4 = greatest burden/exposure) -------------

const CRITICALITY_SEVERITY: Record<Criticality, number> = {
  Low: 0,
  Medium: 4 / 3,
  High: 8 / 3,
  'Mission-critical': 4,
  Unknown: 4 / 3, // neutral assumption; evidence penalty applies separately
};

export function criticalitySeverity(c: Criticality): number {
  return CRITICALITY_SEVERITY[c];
}

/** Returns null when RTO/RPO is unknown — callers must re-normalize rather than treat as 0. */
export function minutesSeverity(minutes: number | null): number | null {
  if (minutes == null) return null;
  if (minutes <= 15) return 4;
  if (minutes <= 120) return 3;
  if (minutes <= 480) return 2;
  if (minutes <= 1440) return 1;
  return 0;
}

const EXPOSURE_SEVERITY: Record<CustomerTransactionExposure, number> = {
  none: 0,
  indirect: 2,
  direct: 4,
  Unknown: 2,
};

export function customerExposureSeverity(e: CustomerTransactionExposure): number {
  return EXPOSURE_SEVERITY[e];
}

/** Required resilience level (1-5) implied by RTO; null RTO defaults to the least strict level with an uncertainty flag via caller. */
export function requiredResilienceLevelFromRto(
  minutes: number | null,
  table: { maxMinutes: number; level: number }[],
): number {
  if (minutes == null) return table[table.length - 1].level;
  for (const row of table) {
    if (minutes <= row.maxMinutes) return row.level;
  }
  return table[table.length - 1].level;
}

export function daysBetween(isoDate: string | null, now: Date = new Date()): number | null {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / (1000 * 60 * 60 * 24));
}

/** Derive application age in whole years from first_production_date; null when unknown. */
export function applicationAgeYears(firstProductionDate: string | null, now: Date = new Date()): number | null {
  const days = daysBetween(firstProductionDate, now);
  return days == null ? null : Math.floor(days / 365.25);
}

/**
 * Build a normalized ApplicationRecord (minus provenance/bookkeeping) from a validated raw row.
 * Aggregate/detail reconciliation and conflict detection happen in the parser layer, which has
 * visibility into both the row and any detail tables.
 */
export function normalizeRawRow(raw: RawApplicationRow): Omit<ApplicationRecord, 'isSynthetic' | 'provenance'> {
  const dependencies = parseJsonArray<DependencyRecord>(raw.dependencies_detail);
  const integrations = parseJsonArray<IntegrationRecord>(raw.integrations_detail).map((i) => ({
    ...i,
    type: normalizeIntegrationType(i.type),
  }));

  return {
    schemaVersion: raw.schema_version ?? '1.0',
    applicationId: raw.application_id.trim(),
    applicationName: raw.application_name.trim(),
    lastVerifiedDate: toNullableDate(raw.last_verified_date),
    languages: toArray(raw.languages),
    runtimePlatforms: toArray(raw.runtime_platforms),
    architectureStyle: normalizeArchitectureStyle(raw.architecture_style),
    firstProductionDate: toNullableDate(raw.first_production_date),
    upstreamDependencyCount: toNullableInt(raw.upstream_dependency_count),
    downstreamDependencyCount: toNullableInt(raw.downstream_dependency_count),
    integrationCount: toNullableInt(raw.integration_count),
    integrationTypes: toArray(raw.integration_types),
    businessCriticality: normalizeCriticality(raw.business_criticality),
    drTopology: normalizeDrTopology(raw.dr_topology),
    rtoMinutes: toNullableNumber(raw.rto_minutes),

    applicationSysId: raw.application_sys_id,
    applicationServiceIds: toArray(raw.application_service_ids),
    businessOwner: raw.business_owner,
    technicalOwner: raw.technical_owner,
    supportGroup: raw.support_group,
    lifecycleStatus: raw.lifecycle_status,
    frameworks: toArray(raw.frameworks),
    operatingSystems: toArray(raw.operating_systems),
    databases: toArray(raw.databases),
    deploymentModel: raw.deployment_model,
    environmentCount: raw.environment_count,
    productionInstanceCount: raw.production_instance_count,
    architectureComponents: toArray(raw.architecture_components),
    technologyComponents: parseJsonArray(raw.technology_components_detail),

    dependencies,
    dependencyIds: toArray(raw.dependency_ids),
    criticalDependencyCount: toNullableInt(raw.critical_dependency_count),
    externalDependencyCount: toNullableInt(raw.external_dependency_count),
    unknownDependencyIndicator: raw.unknown_dependency_indicator === true || raw.unknown_dependency_indicator === 'true',
    sharedPlatformDependencyCount: toNullableInt(raw.shared_platform_dependencies),

    integrations,
    integrationIds: toArray(raw.integration_ids),
    criticalIntegrationCount: toNullableInt(raw.critical_integration_count),
    externalPartyIntegrationCount: toNullableInt(raw.external_party_integration_count),
    realTimeIntegrationCount: toNullableInt(raw.real_time_integration_count),
    integrationInventoryConfidence: (raw.integration_inventory_confidence as 'high' | 'medium' | 'low' | 'Unknown') ?? 'Unknown',

    availabilityTier: raw.availability_tier,
    rpoMinutes: toNullableNumber(raw.rpo_minutes),
    currentRecoveryTestStatus: normalizeRecoveryTestStatus(raw.current_recovery_test_status),
    lastRecoveryTestDate: toNullableDate(raw.last_recovery_test_date),
    recoveryTestResult: raw.recovery_test_result,
    multiRegionOrSite: raw.multi_region_or_site === true || raw.multi_region_or_site === 'true',

    dataClassification: raw.data_classification,
    regulatoryTags: toArray(raw.regulatory_tags),
    customerTransactionExposure: normalizeCustomerExposure(raw.customer_transaction_exposure),
    incidentSev1_12m: toNullableInt(raw.incident_sev1_12m),
    incidentSev2_12m: toNullableInt(raw.incident_sev2_12m),
    changeFailureRate: toNullableNumber(raw.change_failure_rate),

    cmdbCompleteness: toNullableNumber(raw.cmdb_completeness),
    cmdbCorrectness: toNullableNumber(raw.cmdb_correctness),
    cmdbCompliance: toNullableNumber(raw.cmdb_compliance),
  };
}

const NUMERIC_CORRECTION_FIELDS = new Set([
  'upstreamDependencyCount', 'downstreamDependencyCount', 'integrationCount',
  'criticalDependencyCount', 'externalDependencyCount', 'sharedPlatformDependencyCount',
  'criticalIntegrationCount', 'externalPartyIntegrationCount', 'realTimeIntegrationCount',
  'incidentSev1_12m', 'incidentSev2_12m',
]);
const RATE_CORRECTION_FIELDS = new Set(['rtoMinutes', 'rpoMinutes', 'changeFailureRate']);
const DATE_CORRECTION_FIELDS = new Set(['lastVerifiedDate', 'firstProductionDate', 'lastRecoveryTestDate']);

/**
 * Coerce a user-typed correction string back into the ApplicationRecord's
 * real field type, so a saved (or in-progress, unsaved) correction actually
 * feeds the calculation engine rather than being display-only metadata.
 */
export function coerceCorrectionValue(field: string, raw: string): unknown {
  if (NUMERIC_CORRECTION_FIELDS.has(field)) return toNullableInt(raw);
  if (RATE_CORRECTION_FIELDS.has(field)) return toNullableNumber(raw);
  if (DATE_CORRECTION_FIELDS.has(field)) return toNullableDate(raw);
  if (field === 'architectureStyle') return normalizeArchitectureStyle(raw);
  if (field === 'businessCriticality') return normalizeCriticality(raw);
  if (field === 'drTopology') return normalizeDrTopology(raw);
  if (field === 'customerTransactionExposure') return normalizeCustomerExposure(raw);
  if (field === 'currentRecoveryTestStatus') return normalizeRecoveryTestStatus(raw);
  return raw;
}
