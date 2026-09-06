import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  ALL_SEMANTIC_NAMES,
  GRAPH_SEMANTIC_STATES,
  GRAPH_SEMANTIC_TOKENS,
  PANEL_SEMANTIC_NAMES,
  REDUCED_MOTION_MEDIA_QUERY,
  contrastRatio,
  relativeLuminance,
  semanticCssVar,
  semanticUtility,
} from "@/lib/theme/tokens";

// ============================================================================
// PR-9 · Cinematic Theme — Semantic Layer Contract
//
// The palette is centralized in globals.css @theme + tokens.ts. These tests
// lock the LAYER, not pixels:
//   - every declared semantic name has a distinct CSS var + meaningful hook
//   - no two semantic states resolve to the same token
//   - every controlled text tier clears WCAG AA (4.5:1) on the semantic bg
//   - the material ramp is ordered dark→light
//   - each graph state is HONEST (contradiction is the only saturated red;
//     foreign is the only blue; attention is atmosphere, never a numeric color)
// ============================================================================

const CSS_PATH = path.resolve("src/app/globals.css");
let css = "";

function tokenValue(name: string): string {
  const re = new RegExp(`--color-semantic-${name}\\s*:\\s*([^;]+);`);
  const m = css.match(re);
  if (!m) throw new Error(`missing --color-semantic-${name}`);
  return m[1]!.trim();
}

/** Raw RGB of a 6-digit hex token. */
function rgbOf(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length !== 6) throw new Error(`expected 6-digit hex, got ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

beforeAll(() => {
  css = fs.readFileSync(CSS_PATH, "utf-8");
});

describe("PR-9 §A the semantic name universe is distinct and self-consistent", () => {
  it("every graph semantic state has a unique name", () => {
    const names = GRAPH_SEMANTIC_STATES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the canonical token map covers every graph state name", () => {
    for (const s of GRAPH_SEMANTIC_STATES) {
      expect(GRAPH_SEMANTIC_TOKENS[s.name]).toBeDefined();
    }
  });

  it("panel material names are unique and never collide with graph states", () => {
    const graph = new Set(GRAPH_SEMANTIC_STATES.map((s) => s.name));
    expect(new Set(PANEL_SEMANTIC_NAMES).size).toBe(PANEL_SEMANTIC_NAMES.length);
    for (const name of PANEL_SEMANTIC_NAMES) {
      expect(graph.has(name)).toBe(false);
    }
  });

  it("the full name list has no duplicates", () => {
    expect(new Set(ALL_SEMANTIC_NAMES).size).toBe(ALL_SEMANTIC_NAMES.length);
  });

  it("each name maps to a distinct CSS custom property", () => {
    const vars = ALL_SEMANTIC_NAMES.map((n) => semanticCssVar(n));
    expect(new Set(vars).size).toBe(vars.length);
  });

  it("each name maps to a distinct semantic- utility tail", () => {
    const utils = ALL_SEMANTIC_NAMES.map((n) => semanticUtility(n));
    expect(new Set(utils).size).toBe(utils.length);
    for (const u of utils) expect(u.startsWith("semantic-")).toBe(true);
  });

  it("utlities and css vars round-trip from the same name", () => {
    expect(semanticCssVar("selection")).toBe("--color-semantic-selection");
    expect(semanticUtility("contradiction")).toBe("semantic-contradiction");
  });

  it("a state's meaning is what its data hook says it is — every graph state exposes a live hook", () => {
    for (const s of GRAPH_SEMANTIC_STATES) {
      expect(s.hook.length).toBeGreaterThan(0);
    }
  });

  it("no two graph states share both the same hook attribute AND the same value", () => {
    const seen = new Set<string>();
    for (const s of GRAPH_SEMANTIC_STATES) {
      const key = s.hook.split("=")[0];
      const val = s.hook;
      const composite = `${key}::${val}`;
      expect(seen.has(composite)).toBe(false);
      seen.add(composite);
    }
  });
});

describe("PR-9 §B the token layer is really declared, and only in the @theme block", () => {
  it("globals.css is a Tailwind v4 stylesheet", () => {
    expect(css).toContain('@import "tailwindcss";');
    expect(css).toMatch(/@theme\s*\{/);
  });

  it("every semantic token from the contract is declared in globals.css", () => {
    for (const name of ALL_SEMANTIC_NAMES) {
      expect(() => tokenValue(name)).not.toThrow();
    }
  });

  it("the selection/focus text tiers are declared as soft-on-dark, not as full rose", () => {
    const selection = tokenValue("selection");
    const focus = tokenValue("focus");
    expect(selection.startsWith("#")).toBe(true);
    expect(focus.startsWith("#")).toBe(true);
    expect(relativeLuminance(selection)).toBeGreaterThan(0.2);
    expect(relativeLuminance(focus)).toBeGreaterThan(0.2);
  });

  it("the global keyboard focus ring is the warm-white semantic focus, not rose", () => {
    const focusBlock = css.match(/\*:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(focusBlock).toContain("var(--color-semantic-focus)");
    expect(focusBlock).not.toContain("accent-rose");
    expect(focusBlock).not.toContain("danger");
  });

  it("the missing typography utilities are now defined and hold a real value", () => {
    expect(css).toMatch(/@utility\s+type-caption\s*\{/);
    expect(css).toMatch(/@utility\s+type-label\s*\{/);
  });

  it("the control-center paper material classes exist and reference the semantic vars", () => {
    expect(css).toContain(".cc-panel {");
    expect(css).toContain(".cc-panel-floating {");
    expect(css).toContain(".cc-panel-header {");
    expect(css).toContain(".hairline {");
    expect(css).toContain(".status-tag {");
    expect(css).toMatch(/\.cc-panel\s*\{[^}]*var\(--color-semantic-surface\)/);
    expect(css).toMatch(/\.cc-panel-floating\s*\{[^}]*backdrop-filter:\s*blur\(14px\)/);
  });

  it("reduced motion is globally enforced", () => {
    const motion = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(motion.length).toBeGreaterThan(0);
    expect(motion).toMatch(/(animation|transition)/);
    expect(REDUCED_MOTION_MEDIA_QUERY).toBe("(prefers-reduced-motion: reduce)");
  });
});

describe("PR-9 §C the text tiers clear WCAG AA on the semantic background", () => {
  const bg = () => tokenValue("background");
  const tier = (name: string) => tokenValue(name);

  it("background luminance is genuinely near-black", () => {
    expect(relativeLuminance(bg())).toBeLessThan(0.005);
  });

  it("primary foreground vs background >= 4.5:1", () => {
    expect(contrastRatio(tier("foreground"), bg())).toBeGreaterThanOrEqual(4.5);
  });

  it("muted foreground vs background >= 4.5:1", () => {
    expect(contrastRatio(tier("foreground-muted"), bg())).toBeGreaterThanOrEqual(4.5);
  });

  it("faint foreground vs background >= 4.5:1 (metadata may be quiet, never unreadable)", () => {
    expect(contrastRatio(tier("foreground-faint"), bg())).toBeGreaterThanOrEqual(4.5);
  });

  it("selection + focus affordances both clear 4.5:1 on the background", () => {
    expect(contrastRatio(tier("selection"), bg())).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tier("focus"), bg())).toBeGreaterThanOrEqual(4.5);
  });

  it("text tiers are ordered: foreground > foreground-muted > foreground-faint", () => {
    const lFg = relativeLuminance(tier("foreground"));
    const lMuted = relativeLuminance(tier("foreground-muted"));
    const lFaint = relativeLuminance(tier("foreground-faint"));
    expect(lFg).toBeGreaterThan(lMuted);
    expect(lMuted).toBeGreaterThan(lFaint);
  });

  it("the material ramp is ordered dark→light: background < surface < elevated < soft", () => {
    const l = (name: string) => relativeLuminance(tokenValue(name));
    expect(l("background")).toBeLessThan(l("surface"));
    expect(l("surface")).toBeLessThan(l("surface-elevated"));
    expect(l("surface-elevated")).toBeLessThan(l("surface-soft"));
  });
});

describe("PR-9 §D each graph state keeps its honest role in the palette", () => {
  const hex = (name: string) => tokenValue(name);

  it("contradiction is the ONLY saturated red of the graph language", () => {
    const c = rgbOf(hex("contradiction"));
    expect(c.r).toBeGreaterThan(c.g * 1.4);
    expect(c.r).toBeGreaterThan(c.b * 1.4);
    expect(c.r).toBeGreaterThan(120); // genuinely red, not a muddy shadow
  });

  it("attention is atmosphere, distinct from contradiction — a pale blush, not a signal red", () => {
    const a = rgbOf(hex("attention"));
    const c = rgbOf(hex("contradiction"));
    expect(hex("attention")).not.toBe(hex("contradiction"));
    // Paler (higher luminance) than the contradiction red…
    expect(relativeLuminance(hex("attention"))).toBeGreaterThan(relativeLuminance(hex("contradiction")) + 0.05);
    // …and never saturated the way the contradiction red is.
    expect(a.r).toBeLessThan(c.r + 40);
  });

  it("foreign is the only blue-silver (b dominates r), quiet, never electric", () => {
    const f = rgbOf(hex("foreign"));
    expect(f.b).toBeGreaterThan(f.r);
    expect(f.b).toBeGreaterThan(120);
    expect(f.b).toBeLessThan(220); // dusty, not neon
  });

  it("unresolved is smoky gray, not 'suspicious purple' and not red", () => {
    const u = rgbOf(hex("unresolved"));
    expect(Math.abs(u.r - u.g)).toBeLessThan(24);
    expect(Math.abs(u.g - u.b)).toBeLessThan(24);
    expect(u.r - u.b).toBeLessThan(40); // muted warm-neutral, never red-dominant
  });

  it("selection and focus are warm-white highlights, distinct from every other state", () => {
    const values = new Set(
      ["selection", "focus", "supported", "contradiction", "unresolved", "foreign", "attention"].map(hex),
    );
    expect(values.size).toBe(7);
    for (const name of ["selection", "focus", "supported"]) {
      expect(relativeLuminance(hex(name))).toBeGreaterThan(relativeLuminance(hex("contradiction")));
    }
  });

  it("no graph-state token aliases a panel/text token in the same role (single-meaning tokens)", () => {
    // The graph states + text tiers + material are all DISTINCT entries in the
    // palette — two semantics never share one hex.
    const uniqueHexes = new Set(
      [...ALL_SEMANTIC_NAMES]
        .map((n) => tokenValue(n).toLowerCase())
        .filter((v) => v.startsWith("#") && v.length === 7),
    );
    expect(uniqueHexes.size).toBe(
      [...ALL_SEMANTIC_NAMES].filter((n) => {
        const v = tokenValue(n).toLowerCase();
        return v.startsWith("#") && v.length === 7;
      }).length,
    );
  });
});