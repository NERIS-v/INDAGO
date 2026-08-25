import { z } from 'zod';

// ============================================================================
// Authorization
//
// Role-based access control contracts for INDAGO.
// ============================================================================

export const PermissionSchema = z.enum([
  'INVESTIGATION_CREATE',
  'INVESTIGATION_READ',
  'INVESTIGATION_UPDATE',
  'INVESTIGATION_DELETE',
  'INVESTIGATION_CLOSE',
  'EVIDENCE_INGEST',
  'EVIDENCE_READ',
  'EVIDENCE_REVIEW',
  'EVIDENCE_VERIFY',
  'EVIDENCE_DELETE',
  'ENTITY_READ',
  'ENTITY_UPDATE',
  'ENTITY_MERGE',
  'ENTITY_SPLIT',
  'HYPOTHESIS_CREATE',
  'HYPOTHESIS_READ',
  'HYPOTHESIS_PROMOTE',
  'HYPOTHESIS_ABANDON',
  'LEAD_CREATE',
  'LEAD_READ',
  'LEAD_PROMOTE',
  'LEAD_REJECT',
  'GRAPH_READ',
  'GRAPH_ANALYZE',
  'TOOL_EXECUTE',
  'TOOL_REGISTER',
  'REVIEW_CREATE',
  'REVIEW_COMPLETE',
  'AUDIT_READ',
  'ADMIN',
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const RoleSchema = z.enum([
  'INVESTIGATOR',
  'ANALYST',
  'REVIEWER',
  'ADMIN',
  'READ_ONLY',
]);
export type Role = z.infer<typeof RoleSchema>;

export const RolePermissionsSchema = z.object({
  role: RoleSchema,
  permissions: z.array(PermissionSchema),
}).strict();
export type RolePermissions = z.infer<typeof RolePermissionsSchema>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions[] = [
  {
    role: 'ADMIN',
    permissions: ['ADMIN'],
  },
  {
    role: 'INVESTIGATOR',
    permissions: [
      'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
      'EVIDENCE_INGEST', 'EVIDENCE_READ', 'EVIDENCE_REVIEW',
      'ENTITY_READ', 'ENTITY_UPDATE',
      'HYPOTHESIS_CREATE', 'HYPOTHESIS_READ', 'HYPOTHESIS_PROMOTE', 'HYPOTHESIS_ABANDON',
      'LEAD_CREATE', 'LEAD_READ', 'LEAD_PROMOTE', 'LEAD_REJECT',
      'GRAPH_READ', 'GRAPH_ANALYZE',
      'TOOL_EXECUTE',
      'REVIEW_CREATE',
      'AUDIT_READ',
    ],
  },
  {
    role: 'ANALYST',
    permissions: [
      'INVESTIGATION_READ',
      'EVIDENCE_READ', 'EVIDENCE_REVIEW',
      'ENTITY_READ',
      'HYPOTHESIS_CREATE', 'HYPOTHESIS_READ',
      'LEAD_CREATE', 'LEAD_READ',
      'GRAPH_READ', 'GRAPH_ANALYZE',
      'TOOL_EXECUTE',
      'AUDIT_READ',
    ],
  },
  {
    role: 'REVIEWER',
    permissions: [
      'INVESTIGATION_READ',
      'EVIDENCE_READ', 'EVIDENCE_REVIEW', 'EVIDENCE_VERIFY',
      'ENTITY_READ',
      'HYPOTHESIS_READ',
      'LEAD_READ',
      'GRAPH_READ',
      'REVIEW_CREATE', 'REVIEW_COMPLETE',
      'AUDIT_READ',
    ],
  },
  {
    role: 'READ_ONLY',
    permissions: [
      'INVESTIGATION_READ',
      'EVIDENCE_READ',
      'ENTITY_READ',
      'HYPOTHESIS_READ',
      'LEAD_READ',
      'GRAPH_READ',
      'AUDIT_READ',
    ],
  },
];
