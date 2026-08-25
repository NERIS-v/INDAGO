import { describe, it, expect, beforeEach } from 'vitest';
import { AdapterRegistry, AdapterRegistryError } from '../src/registry/adapter-registry.js';
import { MockAdapter } from './mock-adapter.js';
import { InMemoryArtifactStorage } from '../src/storage/artifact-storage.js';

// ============================================================================
// Registry Tests
//
// Verifies adapter registration, lookup, and duplicate rejection.
// ============================================================================

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;
  let storage: InMemoryArtifactStorage;

  beforeEach(() => {
    registry = new AdapterRegistry();
    storage = new InMemoryArtifactStorage();
  });

  it('registers and retrieves an adapter by ID', () => {
    const adapter = new MockAdapter({ storage, adapterId: 'test-v1' });
    registry.register(adapter);

    const retrieved = registry.getById('test-v1');
    expect(retrieved).toBe(adapter);
  });

  it('retrieves an adapter by source type', () => {
    const adapter = new MockAdapter({ storage, sourceType: 'TEST_TYPE' });
    registry.register(adapter);

    const retrieved = registry.getBySourceType('TEST_TYPE');
    expect(retrieved).toBe(adapter);
  });

  it('returns undefined for unknown adapter ID', () => {
    expect(registry.getById('nonexistent')).toBeUndefined();
  });

  it('returns undefined for unknown source type', () => {
    expect(registry.getBySourceType('NONEXISTENT')).toBeUndefined();
  });

  it('rejects duplicate adapter registration deterministically', () => {
    const adapter1 = new MockAdapter({ storage, adapterId: 'dup-v1' });
    const adapter2 = new MockAdapter({ storage, adapterId: 'dup-v1' });

    registry.register(adapter1);

    expect(() => registry.register(adapter2)).toThrow(AdapterRegistryError);
    try {
      registry.register(adapter2);
    } catch (e) {
      expect(e).toBeInstanceOf(AdapterRegistryError);
      const err = e as AdapterRegistryError;
      expect(err.code).toBe('DUPLICATE_ADAPTER');
      expect(err.adapterId).toBe('dup-v1');
    }
  });

  it('returns capability for a registered adapter', () => {
    const adapter = new MockAdapter({ storage, adapterId: 'cap-v1' });
    registry.register(adapter);

    const cap = registry.getCapability('cap-v1');
    expect(cap).toBeDefined();
    expect(cap?.adapterId).toBe('cap-v1');
    expect(cap?.adapterVersion).toBe('1.0.0');
  });

  it('lists all registered capabilities', () => {
    const adapter1 = new MockAdapter({ storage, adapterId: 'a-v1', sourceType: 'TYPE_A' });
    const adapter2 = new MockAdapter({ storage, adapterId: 'b-v1', sourceType: 'TYPE_B' });

    registry.register(adapter1);
    registry.register(adapter2);

    const caps = registry.listCapabilities();
    expect(caps).toHaveLength(2);
    expect(caps.map((c) => c.adapterId)).toContain('a-v1');
    expect(caps.map((c) => c.adapterId)).toContain('b-v1');
  });

  it('has() returns true for registered adapter', () => {
    expect(registry.has('test-v1')).toBe(false);
    registry.register(new MockAdapter({ storage, adapterId: 'test-v1' }));
    expect(registry.has('test-v1')).toBe(true);
  });

  it('size reflects number of registered adapters', () => {
    expect(registry.size).toBe(0);
    registry.register(new MockAdapter({ storage, adapterId: 'a' }));
    expect(registry.size).toBe(1);
    registry.register(new MockAdapter({ storage, adapterId: 'b', sourceType: 'TYPE_B' }));
    expect(registry.size).toBe(2);
  });

  it('unregister removes an adapter', () => {
    registry.register(new MockAdapter({ storage, adapterId: 'rm-v1', sourceType: 'RM_TYPE' }));
    expect(registry.has('rm-v1')).toBe(true);

    const removed = registry.unregister('rm-v1');
    expect(removed).toBe(true);
    expect(registry.has('rm-v1')).toBe(false);
    expect(registry.getBySourceType('RM_TYPE')).toBeUndefined();
  });

  it('unregister returns false for unknown adapter', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('supports many adapters without collision', () => {
    for (let i = 0; i < 20; i++) {
      registry.register(
        new MockAdapter({ storage, adapterId: `adapter-${i}`, sourceType: `TYPE_${i}` }),
      );
    }
    expect(registry.size).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(registry.has(`adapter-${i}`)).toBe(true);
      expect(registry.getBySourceType(`TYPE_${i}`)).toBeDefined();
    }
  });
});
