// ============================================================================
// PR · Cinematic Home Opening · Development Calibration Lab
//
// The lab is an observable VIEW over production defaults: it must never invent
// its own numbers, never escape its bounds, never corrupt an exported config,
// and never be reachable outside development. These tests freeze that contract
// purely — no DOM, no GSAP, no three.
// ============================================================================

import { describe, expect, it, vi } from "vitest";
import {
  CINEMATIC_CALIBRATION_BOUNDS,
  CINEMATIC_CALIBRATION_DEFAULTS,
  CINEMATIC_CALIBRATION_GEOMETRY_KEYS,
  CINEMATIC_INSPECTION_STATES,
  MOMENT_TOLERANCE,
  applyCalibrationPatch,
  calibrationNeedsRebuild,
  calibrationSessionToCode,
  calibrationToCode,
  clampCalibrationValue,
  createCinematicCalibration,
  createCinematicCalibrationSession,
  createShippingCalibrationSession,
  interpolateCalibrationAt,
  momentAt,
  parseCalibration,
  parseCalibrationSession,
  resetCalibration,
  resolveCalibration,
  serializeCalibration,
  serializeCalibrationSession,
  sessionEffective,
  sessionGlobals,
  stripSessionGlobals,
  upsertMoment,
} from "@/components/home/cinematic/cinematic.calibration";
import {
  OPENING_CAMERA_PULLBACK_START,
  OPENING_CAMERA_PUSHIN_START,
  OPENING_DECOMPOSE_WINDOW,
  OPENING_EDGE_OPACITY,
  OPENING_EDGE_WINDOW,
  OPENING_FINAL_ZOOM,
  OPENING_GRAPH_SCALE,
  OPENING_HERO_ZOOM,
  OPENING_LABEL_START,
  OPENING_NODE_SCALE,
  OPENING_POINT_SCALE_MAX,
  OPENING_RELEASE_CURL,
  OPENING_RELEASE_SPREAD,
  OPENING_RELEASE_WINDOW,
  OPENING_WIDE_ZOOM,
} from "@/components/home/cinematic/opening/opening.constants";
import {
  CINEMATIC_CALIBRATE_QUERY_PARAM,
  isCinematicCalibrationRequested,
} from "@/components/home/cinematic/cinematic.constants";

describe("calibration defaults", () => {
  it("reads every shared default from the production constants", () => {
    expect(CINEMATIC_CALIBRATION_DEFAULTS.decomposeStart).toBe(
      OPENING_DECOMPOSE_WINDOW.start,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.decomposeEnd).toBe(
      OPENING_DECOMPOSE_WINDOW.end,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.releaseStart).toBe(
      OPENING_RELEASE_WINDOW.start,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.releaseEnd).toBe(
      OPENING_RELEASE_WINDOW.end,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.edgeStart).toBe(
      OPENING_EDGE_WINDOW.start,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.edgeEnd).toBe(OPENING_EDGE_WINDOW.end);
    expect(CINEMATIC_CALIBRATION_DEFAULTS.heroZoom).toBe(OPENING_HERO_ZOOM);
    expect(CINEMATIC_CALIBRATION_DEFAULTS.pullbackZoom).toBe(OPENING_WIDE_ZOOM);
    expect(CINEMATIC_CALIBRATION_DEFAULTS.graphZoom).toBe(OPENING_FINAL_ZOOM);
    expect(CINEMATIC_CALIBRATION_DEFAULTS.particleScaleMax).toBe(
      OPENING_POINT_SCALE_MAX,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.cameraPullbackStart).toBe(
      OPENING_CAMERA_PULLBACK_START,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.cameraPushInStart).toBe(
      OPENING_CAMERA_PUSHIN_START,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.releaseSpread).toBe(
      OPENING_RELEASE_SPREAD,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.releaseCurl).toBe(
      OPENING_RELEASE_CURL,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.edgeOpacity).toBe(
      OPENING_EDGE_OPACITY,
    );
    expect(CINEMATIC_CALIBRATION_DEFAULTS.labelStart).toBe(OPENING_LABEL_START);
    expect(CINEMATIC_CALIBRATION_DEFAULTS.graphScale).toBe(OPENING_GRAPH_SCALE);
    expect(CINEMATIC_CALIBRATION_DEFAULTS.nodeScale).toBe(OPENING_NODE_SCALE);
  });

  it("is the shipping art-direction look: absolute values from production", () => {
    const c = CINEMATIC_CALIBRATION_DEFAULTS;
    expect(c.wordScale).toBe(1);
    expect(c.wordOpacity).toBe(1);
    expect(c.blurAmount).toBe(1);
    expect(c.particleSize).toBe(1);
    expect(c.particleOpacity).toBe(1);
    expect(c.brightness).toBe(1);
    expect(c.releaseSpread).toBe(OPENING_RELEASE_SPREAD);
    expect(c.releaseCurl).toBe(OPENING_RELEASE_CURL);
    expect(c.edgeOpacity).toBe(OPENING_EDGE_OPACITY);
    expect(c.labelOpacity).toBe(1);
    expect(c.graphScale).toBe(OPENING_GRAPH_SCALE);
    expect(c.nodeScale).toBe(OPENING_NODE_SCALE);
    expect(c.alignmentX).toBe(0);
    expect(c.alignmentY).toBe(0);
  });

  it("returns a fresh mutable copy, not the frozen default record", () => {
    const a = createCinematicCalibration();
    const b = createCinematicCalibration();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a.progress = 0.5;
    expect(CINEMATIC_CALIBRATION_DEFAULTS.progress).toBe(0);
    expect(b.progress).toBe(0);
  });
});

describe("resetCalibration", () => {
  it("restores the exact shipping defaults", () => {
    const dirty = applyCalibrationPatch(createCinematicCalibration(), {
      progress: 0.5,
      wordScale: 2.2,
      particleSize: 3,
      glyphAudit: true,
      progressLocked: true,
      alignmentX: 120,
    });
    expect(dirty.progress).toBe(0.5);
    expect(resetCalibration()).toEqual(CINEMATIC_CALIBRATION_DEFAULTS);
  });
});

describe("clamping and sanitization", () => {
  it("clamps every numeric key inside its declared bound", () => {
    for (const key of Object.keys(
      CINEMATIC_CALIBRATION_BOUNDS,
    ) as (keyof typeof CINEMATIC_CALIBRATION_BOUNDS)[]) {
      const bound = CINEMATIC_CALIBRATION_BOUNDS[key];
      expect(clampCalibrationValue(key, bound.min - 1000)).toBe(bound.min);
      expect(clampCalibrationValue(key, bound.max + 1000)).toBe(bound.max);
    }
  });

  it("turns a non-finite value back into the default", () => {
    expect(clampCalibrationValue("progress", Number.NaN)).toBe(0);
    expect(clampCalibrationValue("particleSize", Infinity)).toBe(1);
  });

  it("clamps progress into [0,1]", () => {
    expect(applyCalibrationPatch(createCinematicCalibration(), { progress: 4 }).progress).toBe(1);
    expect(applyCalibrationPatch(createCinematicCalibration(), { progress: -3 }).progress).toBe(0);
  });

  it("repairs an inverted window instead of allowing it", () => {
    const inverted = applyCalibrationPatch(createCinematicCalibration(), {
      decomposeStart: 0.8,
      decomposeEnd: 0.2,
    });
    expect(inverted.decomposeStart).toBeLessThan(inverted.decomposeEnd);
    expect(inverted.decomposeEnd).toBeGreaterThan(0.8);
  });

  it("never mutates the record it is given", () => {
    const base = createCinematicCalibration();
    const snapshot = { ...base };
    resolveCalibration(base);
    applyCalibrationPatch(base, { progress: 0.9 });
    expect(base).toEqual(snapshot);
  });

  it("ignores unknown keys and non-number numerics", () => {
    const sanitized = resolveCalibration({
      ...createCinematicCalibration(),
      progress: "0.5",
      nope: 12,
    } as never);
    expect(sanitized.progress).toBe(0);
    expect((sanitized as Record<string, unknown>).nope).toBeUndefined();
  });
});

describe("geometry vs visual controls", () => {
  it("declares exactly the DOM↔particle spatial keys", () => {
    expect(CINEMATIC_CALIBRATION_GEOMETRY_KEYS).toEqual([
      "wordScale",
      "letterSpacing",
    ]);
  });

  it("requests a glyph rebuild only for spatial changes", () => {
    const base = createCinematicCalibration();
    const visual = applyCalibrationPatch(base, {
      particleSize: 2,
      brightness: 0.4,
      alignmentX: 30,
      graphScale: 1.4,
    });
    expect(calibrationNeedsRebuild(base, visual)).toBe(false);

    const scaled = applyCalibrationPatch(base, { wordScale: 1.4 });
    expect(calibrationNeedsRebuild(base, scaled)).toBe(true);

    const spaced = applyCalibrationPatch(base, { letterSpacing: 4 });
    expect(calibrationNeedsRebuild(base, spaced)).toBe(true);
  });
});

describe("export / import", () => {
  it("serializes clean, finite, ref-free JSON that round-trips", () => {
    const cal = applyCalibrationPatch(createCinematicCalibration(), {
      progress: 0.5,
      wordScale: 1.25,
      alignmentX: 12,
    });
    const json = serializeCalibration(cal);
    expect(json).not.toMatch(/undefined|function|\[object/);
    const parsed = parseCalibration(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.value).toEqual(resolveCalibration(cal));
  });

  it("rejects invalid JSON", () => {
    const result = parseCalibration("{ not json");
    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
  });

  it("rejects strings and non-finite numbers", () => {
    expect(parseCalibration('{"progress":"high"}').ok).toBe(false);
    expect(parseCalibration('{"progress":1e999}').ok).toBe(false);
    expect(parseCalibration("[]").ok).toBe(false);
  });

  it("clamps (does not reject) out-of-range pasted numbers", () => {
    const result = parseCalibration('{"progress":9,"particleSize":40}');
    expect(result.ok).toBe(true);
    expect(result.value?.progress).toBe(1);
    expect(result.value?.particleSize).toBe(4);
  });

  it("emits compilable TypeScript for the calibrated record", () => {
    const code = calibrationToCode(createCinematicCalibration());
    expect(code).toContain("export const CALIBRATED_CINEMATIC");
    expect(code).toContain("as const");
    expect(code).not.toContain("undefined");
  });
});

describe("inspection states", () => {
  it("lists the nine canonical frames in ascending order", () => {
    expect(CINEMATIC_INSPECTION_STATES).toHaveLength(9);
    expect(CINEMATIC_INSPECTION_STATES[0]?.progress).toBe(0);
    expect(CINEMATIC_INSPECTION_STATES.at(-1)?.progress).toBe(1);
    for (let i = 1; i < CINEMATIC_INSPECTION_STATES.length; i += 1) {
      expect(CINEMATIC_INSPECTION_STATES[i]!.progress).toBeGreaterThan(
        CINEMATIC_INSPECTION_STATES[i - 1]!.progress,
      );
    }
  });
});

describe("route safety", () => {
  it("activates only for ?cinematicCalibrate=1 in development", () => {
    window.history.replaceState(null, "", "/");
    expect(isCinematicCalibrationRequested()).toBe(false);
    window.history.replaceState(
      null,
      "",
      `/?${CINEMATIC_CALIBRATE_QUERY_PARAM}=1`,
    );
    expect(isCinematicCalibrationRequested()).toBe(true);
    window.history.replaceState(null, "", "/dashboard");
    expect(isCinematicCalibrationRequested()).toBe(false);
  });

  it("is compiled out of production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import(
      "@/components/home/cinematic/cinematic.constants"
    );
    expect(mod.IS_DEV).toBe(false);
    expect(mod.isCinematicCalibrationRequested()).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("timeline session", () => {
  it("starts neutral: defaults everywhere and an empty timeline", () => {
    const session = createCinematicCalibrationSession();
    expect(session.progress).toBe(0);
    expect(session.progressLocked).toBe(false);
    expect(session.worldSpace).toBe(false);
    expect(session.glyphAudit).toBe(false);
    expect(session.keyframes).toEqual([]);
    expect(sessionEffective(session)).toEqual(CINEMATIC_CALIBRATION_DEFAULTS);
  });

  it("runs the production defaults when the timeline is empty", () => {
    const globals = createCinematicCalibrationSession();
    const effective = interpolateCalibrationAt([], 0.7, sessionGlobals(globals));
    expect(effective).toEqual({
      ...CINEMATIC_CALIBRATION_DEFAULTS,
      progress: 0.7,
    });
  });

  it("seeds the lab with the approved shipping timeline on load/reset", () => {
    const session = createShippingCalibrationSession();
    expect(session.keyframes.length).toBe(7);
    const at = sessionEffective(session);
    // Baseline: at rest the seed reproduces the first approved moment.
    expect(at.particleSize).toBe(1);
    // The size ramp is visible on scrub, not frozen at the defaults.
    const mid = interpolateCalibrationAt(
      session.keyframes,
      0.882,
      sessionGlobals(session),
    );
    expect(mid.particleSize).toBeGreaterThan(at.particleSize);
    expect(mid.particleSize).toBeLessThan(4);
    const late = interpolateCalibrationAt(
      session.keyframes,
      1,
      sessionGlobals(session),
    );
    expect(late.particleSize).toBe(4);
    expect(late.brightness).toBe(0.73);
  });

  it("holds the nearest moment before the first and after the last", () => {
    const m0 = {
      progress: 0,
      values: applyCalibrationPatch(createCinematicCalibration(), {
        wordScale: 1.1,
      }),
    };
    const m1 = {
      progress: 1,
      values: applyCalibrationPatch(createCinematicCalibration(), {
        wordScale: 2.4,
      }),
    };
    const globals = sessionGlobals(createCinematicCalibrationSession());
    expect(interpolateCalibrationAt([m0, m1], 0.5, globals).wordScale).toBe(1.75);
    expect(interpolateCalibrationAt([m0, m1], 0, globals).wordScale).toBe(1.1);
    expect(interpolateCalibrationAt([m0, m1], 1, globals).wordScale).toBe(2.4);
    expect(interpolateCalibrationAt([m1], 0.5, globals).wordScale).toBe(2.4);
  });

  it("interpolates every numeric scene key between bracketing moments", () => {
    const m0 = {
      progress: 0,
      values: applyCalibrationPatch(createCinematicCalibration(), {
        particleSize: 1,
        graphZoom: 0.9,
        cameraPullbackStart: 0.14,
      }),
    };
    const m1 = {
      progress: 1,
      values: applyCalibrationPatch(createCinematicCalibration(), {
        particleSize: 3,
        graphZoom: 1.6,
        cameraPullbackStart: 0.5,
      }),
    };
    const globals = sessionGlobals(createCinematicCalibrationSession());
    const mid = interpolateCalibrationAt([m0, m1], 0.5, globals);
    expect(mid.particleSize).toBeCloseTo(2, 5);
    expect(mid.graphZoom).toBeCloseTo(1.25, 5);
    expect(mid.cameraPullbackStart).toBeCloseTo(0.32, 5);
    expect(mid.particleSize).toBeGreaterThan(1);
    expect(mid.particleSize).toBeLessThan(3);
  });

  it("blends a nullable letter-spacing only when both ends are set", () => {
    const globals = sessionGlobals(createCinematicCalibrationSession());
    const nullEnd = interpolateCalibrationAt(
      [
        {
          progress: 0,
          values: applyCalibrationPatch(createCinematicCalibration(), {
            letterSpacing: 4,
          }),
        },
        {
          progress: 1,
          values: createCinematicCalibration(),
        },
      ],
      0.5,
      globals,
    );
    expect(nullEnd.letterSpacing).toBe(4);

    const bothSet = interpolateCalibrationAt(
      [
        {
          progress: 0,
          values: applyCalibrationPatch(createCinematicCalibration(), {
            letterSpacing: 0,
          }),
        },
        {
          progress: 1,
          values: applyCalibrationPatch(createCinematicCalibration(), {
            letterSpacing: 8,
          }),
        },
      ],
      0.25,
      globals,
    );
    expect(bothSet.letterSpacing).toBeCloseTo(2, 5);
  });

  it("holds the preceding moment's phase toggle (no boolean lerping)", () => {
    const globals = sessionGlobals(createCinematicCalibrationSession());
    const timeline = [
      {
        progress: 0,
        values: applyCalibrationPatch(createCinematicCalibration(), {
          particlesOnly: true,
        }),
      },
      {
        progress: 1,
        values: createCinematicCalibration(),
      },
    ];
    expect(interpolateCalibrationAt(timeline, 0.5, globals).particlesOnly).toBe(
      true,
    );
  });

  it("picks the correct bracketing pair across three moments", () => {
    const globals = sessionGlobals(createCinematicCalibrationSession());
    const timeline = [0, 0.5, 1].map((progress) => ({
      progress,
      values: applyCalibrationPatch(createCinematicCalibration(), {
        wordScale: 1 + progress,
      }),
    }));
    const quarter = interpolateCalibrationAt(timeline, 0.25, globals);
    expect(quarter.wordScale).toBeCloseTo(1.25, 5);
    const threeQuarter = interpolateCalibrationAt(timeline, 0.75, globals);
    expect(threeQuarter.wordScale).toBeCloseTo(1.75, 5);
  });

  it("upsert replaces a moment at the same progress and keeps others", () => {
    const first = upsertMoment(
      [],
      {
        progress: 0.5,
        values: applyCalibrationPatch(createCinematicCalibration(), {
          wordScale: 2,
        }),
      },
    );
    const second = upsertMoment(first, {
      progress: 0.5004,
      values: applyCalibrationPatch(createCinematicCalibration(), {
        wordScale: 2.5,
      }),
    });
    expect(second).toHaveLength(1);
    expect(second[0]!.values.wordScale).toBe(2.5);

    const third = upsertMoment(second, {
      progress: 0.8,
      values: createCinematicCalibration(),
    });
    expect(third).toHaveLength(2);
  });

  it("momentAt finds the moment within the tolerance and not outside it", () => {
    const keyframes = [
      {
        progress: 0,
        values: createCinematicCalibration(),
      },
      {
        progress: 0.7,
        values: createCinematicCalibration(),
      },
    ];
    expect(momentAt(keyframes, 0.7005)).toBe(keyframes[1]);
    expect(momentAt(keyframes, 0.701)).toBeUndefined();
    expect(momentAt([], 0.1)).toBeUndefined();
    expect(MOMENT_TOLERANCE).toBeGreaterThan(0);
  });

  it("stripSessionGlobals neutralises every viewer field of a record", () => {
    const dirty = applyCalibrationPatch(createCinematicCalibration(), {
      progress: 0.9,
      progressLocked: true,
      worldSpace: true,
      overlayDom: true,
      overlayCenter: true,
      glyphAudit: true,
      particleSize: 2.5,
    });
    const stripped = stripSessionGlobals(dirty);
    expect(stripped.progress).toBe(0);
    expect(stripped.progressLocked).toBe(false);
    expect(stripped.worldSpace).toBe(false);
    expect(stripped.overlayDom).toBe(false);
    expect(stripped.overlayCenter).toBe(false);
    expect(stripped.glyphAudit).toBe(false);
    expect(stripped.particleSize).toBe(2.5);
  });
});

describe("timeline export / import", () => {
  const sample = (): Parameters<typeof serializeCalibrationSession>[0] => {
    const session = createCinematicCalibrationSession();
    session.progress = 0.5;
    session.progressLocked = true;
    session.worldSpace = true;
    session.keyframes = [
      {
        progress: 0,
        values: applyCalibrationPatch(createCinematicCalibration(), {
          wordScale: 1.1,
          particlesOnly: true,
        }),
      },
      {
        progress: 1,
        values: applyCalibrationPatch(createCinematicCalibration(), {
          wordScale: 2.4,
          particleSize: 1.8,
        }),
      },
    ];
    return session;
  };

  it("round-trips every moment and the session globals", () => {
    const json = serializeCalibrationSession(sample());
    expect(json).not.toMatch(/undefined|function|\[object/);
    const parsed = parseCalibrationSession(json);
    expect(parsed.ok).toBe(true);
    const value = parsed.value!;
    expect(value.progress).toBe(0.5);
    expect(value.progressLocked).toBe(true);
    expect(value.worldSpace).toBe(true);
    expect(value.keyframes).toHaveLength(2);
    const sorted = [...value.keyframes].sort((a, b) => a.progress - b.progress);
    expect(sorted[0]!.values.wordScale).toBe(1.1);
    expect(sorted[0]!.values.particlesOnly).toBe(true);
    expect(sorted[1]!.values.wordScale).toBe(2.4);
    expect(sorted[1]!.values.particleSize).toBe(1.8);
  });

  it("excludes viewer fields from the per-moment values", () => {
    const parsed = parseCalibrationSession(serializeCalibrationSession(sample()));
    for (const moment of parsed.value?.keyframes ?? []) {
      expect(moment.values.progress).toBe(0);
      expect(moment.values.progressLocked).toBe(false);
      expect(moment.values.glyphAudit).toBe(false);
      expect(moment.values.overlayRaster).toBe(false);
    }
  });

  it("rejects invalid JSON, strings, non-finite numbers and malformed moments", () => {
    expect(parseCalibrationSession("{ nope").ok).toBe(false);
    expect(parseCalibrationSession('{"progress":"fast"}').ok).toBe(false);
    expect(parseCalibrationSession('{"progress":1e999}').ok).toBe(false);
    expect(parseCalibrationSession("[]").ok).toBe(false);
    expect(
      parseCalibrationSession('{"keyframes":[{"progress":"now"}]}').ok,
    ).toBe(false);
    expect(
      parseCalibrationSession('{"keyframes":[{"progress":0.2}]}').ok,
    ).toBe(false);
  });

  it("clamps out-of-range progress and values on paste", () => {
    const parsed = parseCalibrationSession(
      '{"progress":7,"keyframes":[{"progress":-1,"values":{"particleSize":99}}]}',
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.value!.progress).toBe(1);
    expect(parsed.value!.keyframes[0]!.progress).toBe(0);
    expect(parsed.value!.keyframes[0]!.values.particleSize).toBe(4);
  });

  it("emits compilable TypeScript incl every moment", () => {
    const code = calibrationSessionToCode(sample());
    expect(code).toContain("export const CALIBRATED_CINEMATIC_SESSION");
    expect(code).toContain("keyframes");
    expect(code).toContain("progress: 0");
    expect(code).not.toContain("undefined");
    expect(code).not.toContain("NaN");
  });
});
