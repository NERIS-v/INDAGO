import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { bottomBandHeightClass } from "@/lib/layout/control-center";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webRoot = join(__dirname, "..", "src");

function read(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

afterEach(() => {
  cleanup();
});

describe("F-PR18 — Timeline parent workspace height", () => {
  it("retunes the bottom band to compact height so it carries the fit-redesigned timeline", () => {
    // Compact: the 34vh→26vh ceiling leaves no unused vertical dead space below
    // the trimmed three-lane timeline.
    expect(bottomBandHeightClass()).toBe("h-[clamp(12rem,26vh,16rem)]");
  });

  it("makes the TIME tabpanel a vertical flex container so the timeline fill-contract engages", () => {
    const src = read("components/graph/control-center/temporal-context-panel.tsx");
    // Tabpanel provides flex height context.
    expect(src).toMatch(/className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-1"/);
  });

  it("wraps the time-tab child in an inner flex column (no dead gap above the timeline)", () => {
    const src = read("components/graph/control-center/temporal-context-panel.tsx");
    // The timeline mounts inside a wrapper that lets its own flex-1 consume
    // every spare pixel — nothing sits idle below it.
    expect(src).toContain(
      '<div className="flex min-h-0 flex-1 flex-col">{children}</div>',
    );
  });

  it("exposes the timeline inside a flex-1 subtree (fills available height, never fixed-overflows)", () => {
    const timeline = read("components/timeline/timeline-panel.tsx");
    expect(timeline).toMatch(/min-h-0/);
    // Timeline is not given an oversized absolute height; it yields to the band.
    expect(timeline).not.toMatch(/h-\[clamp\(14rem/);
  });

  it("keeps the retuned height strictly smaller than the removed oversized allocation", () => {
    const compact = Number(bottomBandHeightClass().match(/clamp\((\d+)rem/)![1]);
    expect(compact).toBe(12);
    expect(compact).toBeLessThan(14);
  });
});
