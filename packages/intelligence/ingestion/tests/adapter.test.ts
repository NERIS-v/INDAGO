import { describe, it, expect, beforeEach } from 'vitest';
import { IngestionEnvelopeSchema } from '@indago/contracts';
import { MockAdapter } from './mock-adapter.js';
import { InMemoryArtifactStorage } from '../src/storage/artifact-storage.js';
import type { IngestionContext, IngestionInput } from '../src/adapters/source-adapter.js';

// ============================================================================
// Adapter Tests
//
// Verifies the SourceAdapter contract through the MockAdapter.
// ============================================================================

describe('SourceAdapter', () => {
  let storage: InMemoryArtifactStorage;

  beforeEach(() => {
    storage = new InMemoryArtifactStorage();
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
    content: new TextEncoder().encode('test content'),
    mimeType: 'text/plain',
    filename: 'test.txt',
    ...overrides,
  });

  it('adapter declares correct capabilities', () => {
    const adapter = new MockAdapter({ storage });
    const cap = adapter.capability();

    expect(cap.adapterId).toBe('mock-adapter-v1');
    expect(cap.adapterVersion).toBe('1.0.0');
    expect(cap.sourceType).toBe('MOCK_SOURCE');
    expect(cap.supportedMimeTypes).toContain('text/plain');
    expect(cap.supportedMimeTypes).toContain('application/json');
  });

  it('canHandle returns true for supported mime types', () => {
    const adapter = new MockAdapter({ storage });
    expect(adapter.canHandle(makeInput({ mimeType: 'text/plain' }))).toBe(true);
    expect(adapter.canHandle(makeInput({ mimeType: 'application/json' }))).toBe(true);
  });

  it('canHandle returns false for unsupported mime types', () => {
    const adapter = new MockAdapter({ storage });
    expect(adapter.canHandle(makeInput({ mimeType: 'video/mp4' }))).toBe(false);
  });

  it('canHandle returns false when configured to reject', () => {
    const adapter = new MockAdapter({ storage, failWith: 'UNSUPPORTED_INPUT' });
    expect(adapter.canHandle(makeInput())).toBe(false);
  });

  it('ingest produces a valid IngestionEnvelope', async () => {
    const adapter = new MockAdapter({ storage });
    const result = await adapter.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok: true');

    const validation = IngestionEnvelopeSchema.safeParse(result.envelope);
    expect(validation.success).toBe(true);
  });

  it('envelope preserves integrity metadata', async () => {
    const adapter = new MockAdapter({ storage });
    const result = await adapter.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok: true');

    const { integrity } = result.envelope;
    expect(integrity.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(integrity.contentSizeBytes).toBe(12); // 'test content' = 12 bytes
    expect(integrity.mimeType).toBe('text/plain');
    expect(integrity.originalFilename).toBe('test.txt');
  });

  it('envelope preserves source context', async () => {
    const adapter = new MockAdapter({ storage });
    const context = makeContext();
    const result = await adapter.ingest(makeInput(), context);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok: true');

    const { sourceContext } = result.envelope;
    expect(sourceContext.sourceId).toBe(context.sourceId);
    expect(sourceContext.caseId).toBe(context.caseId);
    expect(sourceContext.investigationId).toBe(context.investigationId);
    expect(sourceContext.adapterId).toBe('mock-adapter-v1');
    expect(sourceContext.adapterVersion).toBe('1.0.0');
    expect(sourceContext.systemOrigin).toBe('mock-system');
  });

  it('envelope preserves ingestion time', async () => {
    const adapter = new MockAdapter({ storage });
    const result = await adapter.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok: true');

    expect(result.envelope.ingestionTime.precision).toBe('exact');
    expect(new Date(result.envelope.ingestionTime.value).getTime()).not.toBeNaN();
  });

  it('content hash is deterministic', async () => {
    const adapter = new MockAdapter({ storage });
    const input = makeInput({ content: new TextEncoder().encode('deterministic content') });

    const r1 = await adapter.ingest(input, makeContext());
    const r2 = await adapter.ingest(input, makeContext());

    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.envelope.integrity.contentHash).toBe(r2.envelope.integrity.contentHash);
    }
  });

  it('artifact is stored', async () => {
    const adapter = new MockAdapter({ storage });
    const content = new TextEncoder().encode('stored content');
    const result = await adapter.ingest(makeInput({ content }), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok: true');

    const exists = await storage.exists(result.envelope.storagePath);
    expect(exists).toBe(true);

    const retrieved = await storage.read(result.envelope.storagePath);
    expect(new TextDecoder().decode(retrieved)).toBe('stored content');
  });

  it('adapter does not produce entity/relation/graph semantics', async () => {
    const adapter = new MockAdapter({ storage });
    const result = await adapter.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected ok: true');

    const envelope = result.envelope;
    expect('entityIds' in envelope).toBe(false);
    expect('observationIds' in envelope).toBe(false);
    expect('hypothesisIds' in envelope).toBe(false);
    expect('strength' in envelope).toBe(false);
    expect('posture' in envelope).toBe(false);
  });

  it('adapter can be configured with custom adapter ID', () => {
    const adapter = new MockAdapter({
      storage,
      adapterId: 'custom-adapter-v2',
      sourceType: 'CUSTOM_SOURCE',
    });
    const cap = adapter.capability();
    expect(cap.adapterId).toBe('custom-adapter-v2');
    expect(cap.sourceType).toBe('CUSTOM_SOURCE');
  });

  it('adapter returns typed error on failure', async () => {
    const adapter = new MockAdapter({ storage, failWith: 'ADAPTER_FAILURE' });
    const result = await adapter.ingest(makeInput(), makeContext());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected ok: false');

    expect(result.error.category).toBe('ADAPTER_FAILURE');
    expect(result.error.code).toBe('MOCK_ADAPTER_FAILURE');
    expect(result.error.sourceId).toBeDefined();
  });
});
