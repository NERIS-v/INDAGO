"use client";

// ============================================================================
// PR-2 ControlCenterLayout — the five-zone geometry owner.
//
// Top row (three columns, allocation DERIVED from layout state):
//     [ operational rail ][ graph workspace ][ contextual panel ]
// Bottom band (two equal halves, structurally independent of the side rails):
//     [ temporal / case context ][ investigative intelligence ]
//
// The single source of truth for column widths is controlCenterColumns()
// (lib/layout/control-center.ts). A collapsed side panel leaves the layout
// entirely (only a narrow reopen strip remains) and the middle graph column —
// always `minmax(0, 1fr)` — genuinely reclaims the space. GraphCanvas detects
// the container resize through its existing ResizeObserver and remeasures
// against the new dimensions; the canvas is never unmounted here.
//
// Side columns that are open render their slot content; collapsed columns
// render the reopen strip. On collapse, focus is moved onto the reopen strip
// so it is never stranded in hidden content.
// ============================================================================

import { useEffect, useRef, type ReactNode } from "react";
import { controlCenterColumns, bottomBandHeightClass } from "@/lib/layout/control-center";
import { PanelToggle } from "./panel-toggle";

interface ControlCenterLayoutProps {
  leftRailOpen: boolean;
  rightPanelOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  rail: ReactNode;
  graph: ReactNode;
  context: ReactNode;
  temporal: ReactNode;
  intelligence: ReactNode;
}

function columnsKey(leftRailOpen: boolean, rightPanelOpen: boolean): string {
  if (leftRailOpen && rightPanelOpen) return "rail-graph-context";
  if (leftRailOpen && !rightPanelOpen) return "rail-graph";
  if (!leftRailOpen && rightPanelOpen) return "graph-context";
  return "graph";
}

export function ControlCenterLayout({
  leftRailOpen,
  rightPanelOpen,
  onToggleLeft,
  onToggleRight,
  rail,
  graph,
  context,
  temporal,
  intelligence,
}: ControlCenterLayoutProps) {
  const leftStripRef = useRef<HTMLButtonElement>(null);
  const rightStripRef = useRef<HTMLButtonElement>(null);

  const prevLeft = useRef(leftRailOpen);
  const prevRight = useRef(rightPanelOpen);

  useEffect(() => {
    if (prevLeft.current === true && leftRailOpen === false) {
      leftStripRef.current?.focus();
    }
    prevLeft.current = leftRailOpen;
  }, [leftRailOpen]);

  useEffect(() => {
    if (prevRight.current === true && rightPanelOpen === false) {
      rightStripRef.current?.focus();
    }
    prevRight.current = rightPanelOpen;
  }, [rightPanelOpen]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden">
      <div
        className="grid min-h-0 flex-1 gap-2 transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateColumns: controlCenterColumns({ leftRailOpen, rightPanelOpen }) }}
        data-control-center-main
        data-cols={columnsKey(leftRailOpen, rightPanelOpen)}
      >
        <div className="min-h-0 min-w-0 overflow-hidden">
          {leftRailOpen ? (
            rail
          ) : (
            <PanelToggle
              ref={leftStripRef}
              open={false}
              onToggle={onToggleLeft}
              label="Open left operational rail"
              expandedActionLabel="Collapse left operational rail"
              controlsId="operational-rail"
              side="left"
            />
          )}
        </div>

        <div className="relative min-h-0 min-w-0 overflow-hidden" data-graph-workspace>
          {graph}
        </div>

        <div className="min-h-0 min-w-0 overflow-hidden" data-context-region>
          {rightPanelOpen ? (
            context
          ) : (
            <PanelToggle
              ref={rightStripRef}
              open={false}
              onToggle={onToggleRight}
              label="Open right contextual panel"
              expandedActionLabel="Collapse right contextual panel"
              controlsId="contextual-panel"
              side="right"
            />
          )}
        </div>
      </div>

      <div className={`grid shrink-0 grid-cols-2 gap-2 ${bottomBandHeightClass()}`} data-control-center-bottom>
        {temporal}
        {intelligence}
      </div>
    </div>
  );
}