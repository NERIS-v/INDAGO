import type { Tool } from '../src/execution/tool.js';
import { FIXTURE_IDS } from './ids.js';

// ============================================================================
// Tool Fixtures
// ============================================================================

export const FIXTURE_TOOL_1: Tool = {
  id: FIXTURE_IDS.tool1,
  name: 'financial-extractor',
  displayName: 'Financial Record Extractor',
  version: '2.1.0',
  category: 'EXTRACTION',
  status: 'ACTIVE',
  description: 'Extracts financial transaction records from structured data sources',
  parameters: [
    {
      name: 'sourceId',
      type: 'SourceId',
      required: true,
      description: 'ID of the source to extract from',
    },
    {
      name: 'dateRange',
      type: 'object',
      required: false,
      description: 'Date range to filter records',
    },
  ],
  outputType: 'FinancialExtractionResult',
  timeoutMs: 300000,
  maxRetries: 2,
  createdAt: { value: '2025-01-10T09:00:00Z', precision: 'exact' },
  updatedAt: { value: '2025-01-15T10:00:00Z', precision: 'exact' },
};
