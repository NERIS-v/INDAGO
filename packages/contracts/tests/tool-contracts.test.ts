import { describe, it, expect } from 'vitest';
import {
  ToolSchema,
  ToolExecutionSchema,
  ToolCategorySchema,
  ToolStatusSchema,
  ToolParameterSchema,
  ToolExecutionStatusSchema,
} from '../src/index.js';
import { FIXTURE_TOOL_1 } from '../fixtures/tools.js';
import { FIXTURE_IDS } from '../fixtures/ids.js';

// ============================================================================
// Tool Contract Tests
//
// Verifies tool schemas and execution contracts.
// ============================================================================

describe('Tool Schema', () => {
  it('Tool fixture validates', () => {
    const result = ToolSchema.safeParse(FIXTURE_TOOL_1);
    expect(result.success).toBe(true);
  });

  it('ToolCategory accepts all values', () => {
    const categories = ['EXTRACTION', 'ANALYSIS', 'ENRICHMENT', 'VERIFICATION', 'EXPORT', 'INTEGRATION'];
    for (const cat of categories) {
      expect(ToolCategorySchema.safeParse(cat).success).toBe(true);
    }
  });

  it('ToolStatus accepts all values', () => {
    const statuses = ['REGISTERED', 'ACTIVE', 'DEPRECATED', 'DISABLED'];
    for (const status of statuses) {
      expect(ToolStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('ToolParameter validates', () => {
    const result = ToolParameterSchema.safeParse({
      name: 'sourceId',
      type: 'SourceId',
      required: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('Tool Execution Schema', () => {
  it('ToolExecutionStatus accepts all values', () => {
    const statuses = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'];
    for (const status of statuses) {
      expect(ToolExecutionStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('ToolExecution validates with minimal data', () => {
    const result = ToolExecutionSchema.safeParse({
      id: FIXTURE_IDS.toolExecution1,
      toolId: FIXTURE_IDS.tool1,
      runId: FIXTURE_IDS.run1,
      investigationId: FIXTURE_IDS.investigation1,
      status: 'PENDING',
      parameters: { sourceId: FIXTURE_IDS.source1 },
      createdAt: { value: '2025-01-15T10:00:00Z', precision: 'exact' },
      updatedAt: { value: '2025-01-15T10:00:00Z', precision: 'exact' },
    });
    expect(result.success).toBe(true);
  });
});
