import { z } from 'zod';

// Schemas validate raw imported rows (CSV cells / Markdown front matter + tables)
// before normalization. Keep permissive: unknown/blank values pass through as
// 'Unknown' or null rather than failing — only malformed values are rejected.

export const SCHEMA_VERSION = '1.0';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be ISO YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Invalid calendar date');

export const dateOrUnknown = z.union([isoDate, z.literal('Unknown'), z.literal(''), z.null()]).optional();

export const nonNegativeIntOrUnknown = z.union([
  z.number().int().nonnegative(),
  z.literal('Unknown'),
  z.literal(''),
  z.null(),
]);

export const nonNegativeNumberOrUnknown = z.union([
  z.number().nonnegative(),
  z.literal('Unknown'),
  z.literal(''),
  z.null(),
]);

export const architectureStyleEnum = z.enum([
  'Single deployable',
  'Layered application',
  'Distributed services',
  'Event-driven/data-intensive',
  'Mainframe or specialized-platform coupled',
  'Mixed/unknown',
]);

export const criticalityEnum = z.enum(['Low', 'Medium', 'High', 'Mission-critical', 'Unknown']);

export const drTopologyEnum = z.enum([
  'None',
  'Backup/restore',
  'Pilot light',
  'Warm standby',
  'Active/passive',
  'Active/active',
  'Unknown',
]);

export const dependencyRecordSchema = z.object({
  id: z.string(),
  direction: z.enum(['upstream', 'downstream']),
  relationshipType: z.enum(['Calls', 'Runs on', 'Hosted on', 'Depends on', 'Shares platform', 'Unknown']),
  critical: z.boolean().default(false),
  external: z.boolean().default(false),
  sharedPlatform: z.boolean().default(false),
});

export const integrationRecordSchema = z.object({
  id: z.string(),
  type: z.enum(['API', 'File', 'Message', 'Event/stream', 'Database coupling', 'UI/screen', 'Batch', 'Proprietary', 'Unknown']),
  direction: z.enum(['inbound', 'outbound', 'bidirectional', 'Unknown']).default('Unknown'),
  realTime: z.boolean().default(false),
  externalParty: z.boolean().default(false),
  businessCritical: z.boolean().default(false),
  endpointProtocolIdentityChange: z.boolean().default(false),
  aggregateOnly: z.boolean().default(false),
  authType: z.string().optional(),
  protocolProduct: z.string().optional(),
});

export const technologyComponentSchema = z.object({
  name: z.string(),
  kind: z.enum(['language', 'framework', 'runtime', 'os', 'database']),
  version: z.string().nullable().optional(),
  supportStatus: z.enum(['current', 'aging', 'out-of-support', 'bespoke-unknown']),
  majorVersionUpgradeNeeded: z.boolean().optional(),
  awsTargetIncompatible: z.boolean().optional(),
  specialistSkillRequired: z.boolean().optional(),
  isPrimaryLanguage: z.boolean().optional(),
});

// Raw row shape as it arrives from CSV (after alias mapping, before normalization).
export const rawApplicationRowSchema = z.object({
  schema_version: z.string().default(SCHEMA_VERSION),
  application_id: z.string().min(1, 'application_id is required'),
  application_name: z.string().min(1, 'application_name is required'),
  last_verified_date: dateOrUnknown,
  languages: z.union([z.array(z.string()), z.string()]).optional(),
  runtime_platforms: z.union([z.array(z.string()), z.string()]).optional(),
  architecture_style: z.union([architectureStyleEnum, z.literal('Unknown')]).default('Mixed/unknown'),
  first_production_date: dateOrUnknown,
  upstream_dependency_count: nonNegativeIntOrUnknown.optional(),
  downstream_dependency_count: nonNegativeIntOrUnknown.optional(),
  integration_count: nonNegativeIntOrUnknown.optional(),
  integration_types: z.union([z.array(z.string()), z.string()]).optional(),
  business_criticality: z.union([criticalityEnum, z.literal('Unknown')]).default('Unknown'),
  dr_topology: z.union([drTopologyEnum, z.literal('Unknown')]).default('Unknown'),
  rto_minutes: nonNegativeNumberOrUnknown.optional(),

  application_sys_id: z.string().optional(),
  application_service_ids: z.union([z.array(z.string()), z.string()]).optional(),
  business_owner: z.string().optional(),
  technical_owner: z.string().optional(),
  support_group: z.string().optional(),
  lifecycle_status: z.string().optional(),
  frameworks: z.union([z.array(z.string()), z.string()]).optional(),
  operating_systems: z.union([z.array(z.string()), z.string()]).optional(),
  databases: z.union([z.array(z.string()), z.string()]).optional(),
  deployment_model: z.string().optional(),
  environment_count: z.number().optional(),
  production_instance_count: z.number().optional(),
  architecture_components: z.union([z.array(z.string()), z.string()]).optional(),
  dependency_ids: z.union([z.array(z.string()), z.string()]).optional(),
  dependency_relationship_types: z.union([z.array(z.unknown()), z.string()]).optional(),
  critical_dependency_count: nonNegativeIntOrUnknown.optional(),
  external_dependency_count: nonNegativeIntOrUnknown.optional(),
  unknown_dependency_indicator: z.union([z.boolean(), z.string()]).optional(),
  shared_platform_dependencies: nonNegativeIntOrUnknown.optional(),
  integration_ids: z.union([z.array(z.string()), z.string()]).optional(),
  integration_directions: z.union([z.array(z.unknown()), z.string()]).optional(),
  integration_patterns: z.union([z.array(z.unknown()), z.string()]).optional(),
  protocols_products: z.union([z.array(z.unknown()), z.string()]).optional(),
  critical_integration_count: nonNegativeIntOrUnknown.optional(),
  external_party_integration_count: nonNegativeIntOrUnknown.optional(),
  real_time_integration_count: nonNegativeIntOrUnknown.optional(),
  integration_auth_types: z.union([z.array(z.unknown()), z.string()]).optional(),
  integration_inventory_confidence: z.string().optional(),
  availability_tier: z.string().optional(),
  rpo_minutes: nonNegativeNumberOrUnknown.optional(),
  current_recovery_test_status: z.string().optional(),
  last_recovery_test_date: dateOrUnknown,
  recovery_test_result: z.string().optional(),
  multi_region_or_site: z.union([z.boolean(), z.string()]).optional(),
  data_classification: z.string().optional(),
  regulatory_tags: z.union([z.array(z.string()), z.string()]).optional(),
  customer_transaction_exposure: z.string().optional(),
  incident_sev1_12m: nonNegativeIntOrUnknown.optional(),
  incident_sev2_12m: nonNegativeIntOrUnknown.optional(),
  change_failure_rate: nonNegativeNumberOrUnknown.optional(),
  cmdb_completeness: nonNegativeNumberOrUnknown.optional(),
  cmdb_correctness: nonNegativeNumberOrUnknown.optional(),
  cmdb_compliance: nonNegativeNumberOrUnknown.optional(),

  // Detail arrays, encoded as JSON in quoted CSV cells or native arrays from Markdown tables.
  dependencies_detail: z.union([z.array(dependencyRecordSchema), z.string()]).optional(),
  integrations_detail: z.union([z.array(integrationRecordSchema), z.string()]).optional(),
  technology_components_detail: z.union([z.array(technologyComponentSchema), z.string()]).optional(),
});

export type RawApplicationRow = z.infer<typeof rawApplicationRowSchema>;

export interface RowValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/** Validate one raw row against the schema, returning structured issues instead of throwing. */
export function validateRawRow(row: unknown): { issues: RowValidationIssue[]; parsed: RawApplicationRow | null } {
  const result = rawApplicationRowSchema.safeParse(row);
  if (result.success) {
    return { issues: [], parsed: result.data };
  }
  const issues: RowValidationIssue[] = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '(row)',
    message: issue.message,
    severity: 'error' as const,
  }));
  return { issues, parsed: null };
}

export const modelConfigImportSchema = z.object({
  version: z.string(),
  evidenceQuality: z.any(),
  businessImpact: z.any(),
  pathBaselines: z.any(),
  architectureComplexity: z.any(),
  technologyRemediation: z.any(),
  dependencyLoad: z.any(),
  integrationLoad: z.any(),
  changeSurfaceMultiplier: z.any(),
  resilience: z.any(),
  assurance: z.any(),
  discovery: z.any(),
  complexity: z.any(),
  deliveryFriction: z.any(),
  risk: z.any(),
  confidence: z.any(),
  capacity: z.any(),
  smeAvailability: z.any(),
  scopeIndex: z.any(),
  waveSuitability: z.any(),
  poc: z.any(),
  ruleSwitches: z.any(),
});
