import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  WORKSPACE_NAV,
  isNavEntryActive,
  isDashboardPathname,
  isHomePathname,
} from "@/lib/workspace/nav";

// ============================================================================
// PR — Home vs Dashboard route separation
//
// Contract tests: "/" is the cinematic Home surface, "/dashboard" is the
// canonical application Dashboard. Locks the route helpers, the dock
// destinations, and the "Go to Dashboard" escape hatches without a browser.
// ============================================================================

describe("PR — Home vs Dashboard route separation", () => {
  it("WORKSPACE_NAV points Dashboard at /dashboard (no workspace entry owns root)", () => {
    const dashboard = WORKSPACE_NAV.find((n) => n.label === "Dashboard")!;
    expect(dashboard.href).toBe("/dashboard");
    expect(WORKSPACE_NAV.some((n) => n.href === "/")).toBe(false);
  });

  it("Dashboard activation is /dashboard-scoped; Home is never Dashboard", () => {
    const dashboard = WORKSPACE_NAV.find((n) => n.label === "Dashboard")!;
    expect(isNavEntryActive(dashboard, "/dashboard")).toBe(true);
    expect(isNavEntryActive(dashboard, "/")).toBe(false);
    expect(
      isNavEntryActive(dashboard, "/investigations/abc/graph"),
    ).toBe(false);
    expect(isDashboardPathname("/dashboard")).toBe(true);
    expect(isDashboardPathname("/")).toBe(false);
  });

  it("AppNavDock links Dashboard to /dashboard while the brand anchor stays on /", () => {
    const dock = fs.readFileSync(
      path.resolve("src/components/layout/app-nav-dock.tsx"),
      "utf-8",
    );
    expect(dock).toMatch(/href="\/dashboard"/);
    // Only the brand anchor targets the root Home route.
    expect(dock.match(/href="\/"/g) ?? []).toHaveLength(1);
  });

  it("the cinematic Home route owns the root path and hides the app dock", () => {
    expect(isHomePathname("/")).toBe(true);
    expect(isHomePathname("/dashboard")).toBe(false);
    expect(isHomePathname("/investigations/abc/graph")).toBe(false);
    // AppNavDock must early-return null on Home so no chrome paints over the
    // pinned scene (brand, Dashboard pill, floating panel — all of it).
    const dock = fs.readFileSync(
      path.resolve("src/components/layout/app-nav-dock.tsx"),
      "utf-8",
    );
    expect(dock).toMatch(/isHomePathname\(pathname\)/);
    expect(dock).toMatch(/return null/);
  });

  it("the workspace dock builds absolute app-level hrefs as-is (never /investigations/:id/dashboard)", () => {
    const dock = fs.readFileSync(
      path.resolve("src/components/layout/workspace-nav-dock.tsx"),
      "utf-8",
    );
    expect(dock).toMatch(/entry\.href\.startsWith\("\/"\)/);
  });

  it("every 'Go to Dashboard' escape hatch targets /dashboard", () => {
    const notFound = fs.readFileSync(
      path.resolve("src/app/not-found.tsx"),
      "utf-8",
    );
    const missingCaseId = fs.readFileSync(
      path.resolve("src/app/investigations/[id]/page.tsx"),
      "utf-8",
    );
    expect(notFound).toMatch(/href="\/dashboard"/);
    expect(missingCaseId).toMatch(/href="\/dashboard"/);
  });
});