import type { RealtimeProvider, RealtimeStatus, ProviderEvent, DataModeConfig } from "../types";
import { logDemoEvent } from "./state";
import type { DemoWorkspaceState } from "./state";
import { streamDelay } from "./latency";
import { operationFinancialShadowEvents } from "./demo-fixtures/events";
import { uploadDemoSequence, getSetupEvents } from "./demo-fixtures/upload-demo-sequence";
import { INVESTIGATION_ID } from "./demo-fixtures/lookup";
import type { DemoStreamEvent } from "./demo-fixtures/events";

export class DemoRealtimeProvider implements RealtimeProvider {
  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private status: RealtimeStatus = "disconnected";
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private connectedInvestigationId: string | null = null;
  private emitted = 0;
  private queuedSequences: DemoStreamEvent[][] = [];
  private draining = false;
  
  // The memory bank: allows nodes to survive tab switching!
  private history: ProviderEvent[] = [];

  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  /** The fixture-driven stream for this workspace. Real-case fixture sets carry
   *  an empty stream (real cases = no choreographed demo playback); demo serves
   *  its deterministic OFS sequence. */
  private eventsOf(): DemoStreamEvent[] {
    return this.state.fixtures.events ?? operationFinancialShadowEvents;
  }

  private namedSequencesOf(): Record<string, DemoStreamEvent[]> {
    return this.state.fixtures.namedSequences ?? { upload: uploadDemoSequence };
  }

  private setupEventsOf(): DemoStreamEvent[] {
    return this.state.fixtures.setupEvents ?? getSetupEvents();
  }

  connect(investigationId: string): void {
    if (this.status === "connecting" || this.status === "connected") {
      if (this.connectedInvestigationId === investigationId) return;
      this.disconnect();
    }
    this.connectedInvestigationId = investigationId;
    this.status = "connecting";
    
    // PRE-LOAD the memory bank with the Courier Firm and the Hole immediately!
    this.history = this.setupEventsOf();

    this.timeouts.push(
      setTimeout(() => {
        this.status = "connected";
        this.emitted = 0;
        this.scheduleNext();
        
        if (this.queuedSequences.length > 0 && !this.draining && this.listeners.size > 0) {
          this.drainQueue();
        }
      }, streamDelay(120, this.config)),
    );
  }

  triggerSequence(key: string): void {
    const sequence = this.namedSequencesOf()[key];
    if (!sequence || sequence.length === 0) return;
    this.queuedSequences.push(sequence);
    
    if (this.status === "connected" && !this.draining && this.listeners.size > 0) {
      this.drainQueue();
    }
  }

  private scheduleNext(): void {
    if (this.status !== "connected") return;
    const stream = this.eventsOf();
    const next = stream[this.emitted];
    if (!next) {
      if (this.listeners.size > 0) this.drainQueue();
      return;
    }
    this.emitted += 1;
    this.timeouts.push(
      setTimeout(() => {
        this.emit(next);
        this.scheduleNext();
      }, streamDelay(next.delayMs, this.config)),
    );
  }

  private drainQueue(): void {
    if (this.draining || this.status !== "connected") return;
    const sequence = this.queuedSequences.shift();
    if (!sequence) return;
    this.draining = true;
    let index = 0;
    
    const step = () => {
      // Pause if user navigates to a different tab mid-animation
      if (this.status !== "connected" || this.listeners.size === 0) {
        this.draining = false;
        if (sequence.slice(index).length > 0) {
          this.queuedSequences.unshift(sequence.slice(index));
        }
        return;
      }
      
      const next = sequence[index];
      if (!next) {
        this.draining = false;
        this.drainQueue();
        return;
      }
      index += 1;
      this.timeouts.push(
        setTimeout(() => {
          this.emit(next);
          step();
        }, streamDelay(next.delayMs, this.config)),
      );
    };
    step();
  }

  private emit(event: ProviderEvent): void {
    if (this.status !== "connected") return;
    
    // Store every event so we can catch up components that mount later
    this.history.push(event); 
    logDemoEvent(this.state, event);
    
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    
    // THE MAGIC TRICK: Catch this specific tab up on EVERYTHING it missed while closed!
    for (const pastEvent of this.history) {
      try {
        listener(pastEvent);
      } catch {}
    }
    
    if (this.status === "connected" && !this.draining && this.queuedSequences.length > 0) {
      setTimeout(() => this.drainQueue(), 800);
    }
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  disconnect(): void {
    this.status = "disconnected";
    this.connectedInvestigationId = null;
    this.emitted = 0;
    this.draining = false;
    this.history = []; // Clear memory on disconnect
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }
}

export function createDemoRealtimeProvider(
  state: DemoWorkspaceState,
  config: DataModeConfig,
): RealtimeProvider {
  return new DemoRealtimeProvider(state, config);
}

export { INVESTIGATION_ID as DEMO_INVESTIGATION_ID };