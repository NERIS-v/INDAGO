import type { AdapterCapability } from '@indago/contracts';
import type { SourceAdapter } from '../adapters/source-adapter.js';

// ============================================================================
// Adapter Registry
//
// Manages registered source adapters.
// Allows lookup by adapter ID or source type.
// Rejects duplicate registrations deterministically.
//
// Avoids global hidden mutable state — the registry is an explicit instance.
// ============================================================================

export class AdapterRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: 'DUPLICATE_ADAPTER' | 'ADAPTER_NOT_FOUND',
    public readonly adapterId?: string,
  ) {
    super(message);
    this.name = 'AdapterRegistryError';
  }
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();
  private readonly bySourceType = new Map<string, SourceAdapter>();

  /**
   * Register a source adapter.
   * Rejects if an adapter with the same ID is already registered.
   */
  register(adapter: SourceAdapter): void {
    const cap = adapter.capability();
    const id = cap.adapterId;

    if (this.adapters.has(id)) {
      throw new AdapterRegistryError(
        `Adapter "${id}" is already registered`,
        'DUPLICATE_ADAPTER',
        id,
      );
    }

    this.adapters.set(id, adapter);
    this.bySourceType.set(cap.sourceType, adapter);
  }

  /**
   * Retrieve an adapter by its unique ID.
   */
  getById(adapterId: string): SourceAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  /**
   * Retrieve an adapter by source type.
   */
  getBySourceType(sourceType: string): SourceAdapter | undefined {
    return this.bySourceType.get(sourceType);
  }

  /**
   * Get the capability metadata for a registered adapter.
   */
  getCapability(adapterId: string): AdapterCapability | undefined {
    return this.adapters.get(adapterId)?.capability();
  }

  /**
   * List all registered adapter capabilities.
   */
  listCapabilities(): AdapterCapability[] {
    return Array.from(this.adapters.values()).map((a) => a.capability());
  }

  /**
   * Check if an adapter with the given ID is registered.
   */
  has(adapterId: string): boolean {
    return this.adapters.has(adapterId);
  }

  /**
   * Unregister an adapter by ID.
   * Returns true if the adapter was removed, false if not found.
   */
  unregister(adapterId: string): boolean {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) return false;

    const cap = adapter.capability();
    this.adapters.delete(adapterId);
    this.bySourceType.delete(cap.sourceType);
    return true;
  }

  /**
   * Number of registered adapters.
   */
  get size(): number {
    return this.adapters.size;
  }
}
