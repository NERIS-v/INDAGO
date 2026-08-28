// ============================================================================
// F-PR2 Demo Realtime Provider
//
// Replays the deterministic event sequence (from demo-fixtures/events.ts) with
// scaled timing. Implements the RealtimeProvider lifecycle: connect / subscribe
// / disconnect / getStatus. Per-workspace instance; shares the workspace state
// store so emitted events are appended to the workspace event log.
// ============================================================================

import type {
  RealtimeProvider,
  RealtimeStatus,
  ProviderEvent,
  DataModeConfig,
} from "../types";
import { logDemoEvent } from "./state";
import type { DemoWorkspaceState } from "./state";
import { streamDelay } from "./latency";
import { operationFinancialShadowEvents } from "./demo-fixtures/events";
import { INVESTIGATION_ID } from "./demo-fixtures/lookup";

export class DemoRealtimeProvider implements RealtimeProvider {
  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private status: RealtimeStatus = "disconnected";
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private connectedInvestigationId: string | null = null;
  private emitted = 0;

  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  connect(investigationId: string): void {
    if (this.status === "connecting" || this.status === "connected") {
      if (this.connectedInvestigationId === investigationId) return;
      this.disconnect();
    }
    this.connectedInvestigationId = investigationId;
    this.status = "connecting";
    this.timeouts.push(
      setTimeout(() => {
        this.status = "connected";
        this.emitted = 0;
        this.scheduleNext();
      }, streamDelay(120, this.config)),
    );
  }

  private scheduleNext(): void {
    if (this.status !== "connected") return;
    const next = operationFinancialShadowEvents[this.emitted];
    if (!next) return;
    this.emitted += 1;
    this.timeouts.push(
      setTimeout(() => {
        this.emit(next);
        this.scheduleNext();
      }, streamDelay(next.delayMs, this.config)),
    );
  }

  private emit(event: ProviderEvent): void {
    if (this.status !== "connected") return;
    logDemoEvent(this.state, event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A single listener must not break the stream.
      }
    }
  }

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  disconnect(): void {
    this.status = "disconnected";
    this.connectedInvestigationId = null;
    this.emitted = 0;
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }
}

/** Build a DemoRealtimeProvider for the given workspace state. */
export function createDemoRealtimeProvider(
  state: DemoWorkspaceState,
  config: DataModeConfig,
): RealtimeProvider {
  return new DemoRealtimeProvider(state, config);
}

/** Re-export the canonical demo investigation id used by the realtime stream. */
export { INVESTIGATION_ID as DEMO_INVESTIGATION_ID };
