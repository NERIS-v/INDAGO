"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphNode, GraphEdge, GraphHole } from "@indago/contracts";
import type { RealtimeProvider, ProviderEvent } from "@/lib/providers/types";
import {
  catalogKey,
  type GraphRealtimeCatalog,
  type GraphRealtimeCatalogEntry,
} from "@/lib/providers/types";

export type LiveGraphCatalog = GraphRealtimeCatalog;
export type LiveGraphCatalogEntry = GraphRealtimeCatalogEntry;
export { catalogKey };

interface LiveGraphOverlayState {
  readonly overlayNodes: GraphNode[];
  readonly overlayEdges: GraphEdge[];
  readonly overlayHoles: GraphHole[];
  readonly lastEvent: ProviderEvent | null;
}

export function useGraphLiveOverlay(
  realtime: RealtimeProvider,
  investigationId: string,
  catalog: LiveGraphCatalog
): LiveGraphOverlayState {
  const [overlayNodes, setOverlayNodes] = useState<GraphNode[]>([]);
  const [overlayEdges, setOverlayEdges] = useState<GraphEdge[]>([]);
  const [overlayHoles, setOverlayHoles] = useState<GraphHole[]>([]);
  const [lastEvent, setLastEvent] = useState<ProviderEvent | null>(null);
  
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    // Connects to the provider
    realtime.connect(investigationId);

    // Subscribing will now automatically flush the queue if the Provider has one waiting!
    const unsubscribe = realtime.subscribe((event) => {
      setLastEvent(event);
      
      const action = event.action ?? "";
      const targetId = event.targetId ?? "";
      
      const entry = catalogRef.current[catalogKey(action, targetId)];
      if (!entry) return;

      if (entry.extraEdges?.length) {
        const extra = entry.extraEdges;
        setOverlayEdges((prev) => {
          const missing = extra.filter((e) => !prev.some((existing) => existing.id === e.id));
          return missing.length ? [...prev, ...missing] : prev;
        });
      }

      switch (entry.kind) {
        case "node": {
          const node = entry.node;
          if (!node) return;
          setOverlayNodes((prev) => (prev.some((n) => n.id === node.id) ? prev : [...prev, node]));
          return;
        }
        case "edge": {
          const edge = entry.edge;
          if (!edge) return;
          setOverlayEdges((prev) => (prev.some((e) => e.id === edge.id) ? prev : [...prev, edge]));
          return;
        }
        case "hole": {
          const hole = entry.hole;
          if (!hole) return;
          setOverlayHoles((prev) =>
            prev.some((h) => h.investigationGapId === hole.investigationGapId) ? prev : [...prev, hole]
          );
          return;
        }
        case "hole-resolve": {
          setOverlayHoles((prev) => prev.filter((h) => h.investigationGapId !== entry.resolvesHoleId));
          if (entry.edge) {
            const edge = entry.edge;
            setOverlayEdges((prev) => (prev.some((e) => e.id === edge.id) ? prev : [...prev, edge]));
          }
          return;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [realtime, investigationId]);

  return { overlayNodes, overlayEdges, overlayHoles, lastEvent };
}

export function triggerOrQueueUploadSequence(realtime: RealtimeProvider): void {
  realtime.triggerSequence?.("upload");
}