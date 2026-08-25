import { describe, it, expect, beforeEach } from 'vitest';
import { IngestionEnvelopeSchema } from '@indago/contracts';
import { IngestionService } from '../src/service/ingestion-service.js';
import { AdapterRegistry } from '../src/registry/adapter-registry.js';
import { InMemoryArtifactStorage } from '../src/storage/artifact-storage.js';
import { MockAdapter } from './mock-adapter.js';
import type { IngestionContext, IngestionInput } from '../src/adapters/source-adapter.js';

// ============================================================================
// Ingestion Service Tests
//
// Verifies the full ingestion pipeline: registry → adapter → storage → envelope.
// ============================================================================

describe('IngestionService', () => {
  let registry: AdapterRegistry;
  let storage: InMemoryArtifactStorage;
  let service: IngestionService;

  beforeEach(() => {
    registry = new AdapterRegistry();
    storage = new InMemoryArtifactStorage();
    service = new IngestionService({ adapterRegistry: registry });

    registry.register(new MockAdapter({ storage }));
  });

  const makeContext = (overrides?: Partial<IngestionContext>): IngestionContext => ({
    sourceId: '550e8400-e29b-41d4-a716-446655440000',
    caseId: '550e8400-e29b-41d4-a716-446655440001',
    investigationId: '550e8400-e29b-41d4-a716-446655440002',
    adapterId: 'mock-adapter-v1',
    adapterVersion: '1.0.0',
    ...overrides,
  });

  const makeInput = (overrides?: Partial<IngestionInput>): IngestionInput => ({
    content: new TextEncoder().encode('service test content'),
    mimeType: 'text/plain',
    filename: 'service-test.txt',
    ...overrides,
  });

  it('successful ingestion via adapter ID', async () => {
    const result = await service.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success');

    const validation = IngestionEnvelopeSchema.safeParse(result.envelope);
    expect(validation.success).toBe(true);
  });

  it('successful ingestion via source type routing', async () => {
    const result = await service.ingestBySourceType(
      makeInput({ sourceMetadata: { sourceType: 'MOCK_SOURCE' } }),
      makeContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success');
  });

  it('returns error for unknown adapter ID', async () => {
    const result = await service.ingest(makeInput(), makeContext({ adapterId: 'unknown-adapter' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.error.category).toBe('UNSUPPORTED_SOURCE');
  });

  it('returns error for unknown source type', async () => {
    const result = await service.ingestBySourceType(
      makeInput({ sourceMetadata: { sourceType: 'UNKNOWN_TYPE' } }),
      makeContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.error.category).toBe('UNSUPPORTED_SOURCE');
  });

  it('returns error when sourceType missing from metadata', async () => {
    const result = await service.ingestBySourceType(makeInput(), makeContext());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.error.category).toBe('INVALID_INPUT');
  });

  it('returns error when adapter cannot handle input', async () => {
    const result = await service.ingest(
      makeInput({ mimeType: 'video/mp4' }),
      makeContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.error.category).toBe('UNSUPPORTED_INPUT');
  });

  it('preserves integrity through the full pipeline', async () => {
    const content = new TextEncoder().encode('integrity test');
    const result = await service.ingest(makeInput({ content }), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success');

    const { integrity, storagePath } = result.envelope;
    expect(integrity.contentSizeBytes).toBe(14);
    expect(integrity.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await storage.exists(storagePath)).toBe(true);
  });

  it('preserves provenance through the full pipeline', async () => {
    const context = makeContext();
    const result = await service.ingest(makeInput(), context);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success');

    const { sourceContext } = result.envelope;
    expect(sourceContext.sourceId).toBe(context.sourceId);
    expect(sourceContext.caseId).toBe(context.caseId);
    expect(sourceContext.investigationId).toBe(context.investigationId);
    expect(sourceContext.adapterId).toBe(context.adapterId);
  });

  it('source metadata survives ingestion', async () => {
    const metadata = { sourceType: 'MOCK_SOURCE', customField: 'value' };
    const result = await service.ingest(
      makeInput({ sourceMetadata: metadata }),
      makeContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success');
    expect(result.envelope.metadata?.customFields).toEqual(metadata);
  });

  it('adapter errors are typed', async () => {
    registry.register(
      new MockAdapter({ storage, adapterId: 'fail-v1', sourceType: 'FAIL_TYPE', failWith: 'ADAPTER_FAILURE' }),
    );

    const result = await service.ingest(makeInput(), makeContext({ adapterId: 'fail-v1' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure');
    expect(result.error.category).toBe('ADAPTER_FAILURE');
    expect(result.error.code).toBe('MOCK_ADAPTER_FAILURE');
    expect(result.error.retryable).toBe(false);
    expect(typeof result.error.timestamp).toBe('string');
  });

  it('does not produce downstream intelligence concepts', async () => {
    const result = await service.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success');

    const envelope = result.envelope;
    // Envelope should NOT contain any of these
    const forbidden = ['entityIds', 'observationIds', 'hypothesisIds', 'strength', 'posture', 'leadIds', 'graphVersionId'];
    for (const key of forbidden) {
      expect(key in envelope).toBe(false);
    }
  });

  it('multiple adapters coexist without interference', async () => {
    registry.register(
      new MockAdapter({ storage, adapterId: 'adapter-a', sourceType: 'TYPE_A' }),
    );
    registry.register(
      new MockAdapter({ storage, adapterId: 'adapter-b', sourceType: 'TYPE_B' }),
    );

    const r1 = await service.ingest(makeInput(), makeContext({ adapterId: 'adapter-a' }));
    const r2 = await service.ingest(makeInput(), makeContext({ adapterId: 'adapter-b' }));

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    if (r1.ok && r2.ok) {
      expect(r1.envelope.sourceContext.adapterId).toBe('adapter-a');
      expect(r2.envelope.sourceContext.adapterId).toBe('adapter-b');
    }
  });

  it('ingestion result validates against contracts', async () => {
    const result = await service.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success');

    // Validate the full envelope against the contract schema
    const validation = IngestionEnvelopeSchema.safeParse(result.envelope);
    expect(validation.success).toBe(true);
  });
});
