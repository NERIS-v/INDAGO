// ============================================================================
// Shared Contract Types
//
// Re-exports from @indago/contracts that the web package uses.
// Local type definitions where contracts don't cover the API shape.
// ============================================================================

export {
  InvestigationRunStateSchema,
  InvestigationRunStatusSchema,
  SourceCatalogSchema,
  DEFAULT_SOURCE_CATALOG,
} from "@indago/contracts";
export type { InvestigationRunState, InvestigationRunStatus, SourceCatalog } from "@indago/contracts";
export { DEFAULT_RUN_STATE_CONFIGURATION } from "@indago/contracts";

// ============================================================================
// Human-readable state labels
// ============================================================================

export const STATE_LABELS: Record<string, string> = {
  CREATED: "Created",
  INGESTING: "Ingesting",
  NORMALIZING: "Normalizing",
  ANALYZING: "Analyzing",
  DISCOVERING: "Discovering",
  WAITING_FOR_EVIDENCE: "Waiting for Evidence",
  REASSESSING: "Reassessing",
  REVIEW_REQUIRED: "Review Required",
  PAUSED: "Paused",
  FAILED: "Failed",
  COMPLETED: "Completed",
} as const;

export const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queued",
  INITIALIZING: "Initializing",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
} as const;

// ============================================================================
// State colors for badges
// ============================================================================

export const STATE_COLORS: Record<string, string> = {
  CREATED: "#6b7280",
  INGESTING: "#3b82f6",
  NORMALIZING: "#eab308",
  ANALYZING: "#8b5cf6",
  DISCOVERING: "#06b6d4",
  WAITING_FOR_EVIDENCE: "#f97316",
  REASSESSING: "#f59e0b",
  REVIEW_REQUIRED: "#ec4899",
  PAUSED: "#6b7280",
  FAILED: "#ef4444",
  COMPLETED: "#22c55e",
} as const;

// ============================================================================
// Evidence type labels (maps to EvidenceTypeSchema from contracts)
// ============================================================================

export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  DOCUMENT: "Document",
  RECORD: "Record",
  TESTIMONY: "Testimony",
  PHYSICAL: "Physical",
  DIGITAL: "Digital",
  FINANCIAL: "Financial",
  COMMUNICATION: "Communication",
  OTHER: "Other",
} as const;

// ============================================================================
// Source catalog labels (values come from the canonical SourceCatalogSchema
// enum; the dropdown is generated from this map + the schema, never hand-typed
// in a second location)
// ============================================================================

export const SOURCE_CATALOG_LABELS: Record<string, string> = {
  FIR: "FIR (First Information Report)",
  CDR: "CDR (Call Detail Record)",
  FINANCIAL: "Financial Records",
  SURVEILLANCE: "Surveillance",
  SOCIAL: "Social Media",
  INTEL: "Intelligence",
  MANUAL: "Manual Entry",
} as const;
