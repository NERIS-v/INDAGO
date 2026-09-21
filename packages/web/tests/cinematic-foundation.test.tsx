import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, cleanup } from "@testing-library/react";
import { CinematicIntro } from "@/components/home/cinematic/CinematicIntro";
import {
  CINEMATIC_PIN_END,
  CINEMATIC_SCROLL_DISTANCE_SVH,
} from "@/components/home/cinematic/cinematic.constants";
import { OPENING_WORDMARK_TEXT } from "@/components/home/cinematic/opening/opening.constants";

// ============================================================================
// PR1 · Cinematic Home — Opening · Lifecycle
//
// R3F and GSAP are mocked at the module boundary (the real WebGL/scroll engine
// is exercised by the browser, not jsdom). The assertions that matter here are
// structural: the scene mounts Canvas + track with the semantic wordmark, the
// ScrollTrigger is actually wired to the pinned stage, reduced motion skips
// the pin, and teardown kills created triggers so StrictMode double-mounts
// never leave duplicates.
// ============================================================================

type MockTrigger = { kill: ReturnType<typeof vi.fn> };

const hoisted = vi.hoisted(() => {
  const created: MockTrigger[] = [];
  return {
    created,
    registerPlugin: vi.fn(),
    createTrigger: vi.fn(),
    context: vi.fn(),
  };
});

vi.mock("gsap", () => ({
  default: {
    registerPlugin: hoisted.registerPlugin,
    context: hoisted.context,
  },
}));

vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: { create: hoisted.createTrigger },
}));

vi.mock("@react-three/fiber", () => ({
  // The WebGL scene is exercised in the browser, not jsdom — the mock renders
  // the Canvas wrapper only and drops the R3F scene subtree (three intrinsics
  // are not DOM elements and jsdom has no WebGL/canvas implementation).
  Canvas: () => <div data-testid="r3f-canvas" />,
  useFrame: () => undefined,
  useThree: (selector: (state: unknown) => unknown) => {
    const state = {
      scene: {},
      gl: {
        domElement: {
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          getBoundingClientRect: () => ({ width: 0, height: 0 }),
        },
      },
      camera: {},
      size: { width: 1024, height: 768 },
      viewport: { width: 2, height: 2 },
    };
    return selector ? selector(state) : state;
  },
}));

type MatchMediaOpts = Record<string, boolean>;

function stubMatchMedia(matchesByQuery: MatchMediaOpts): void {
  window.matchMedia = ((query: string) => ({
    matches: matchesByQuery[query] ?? false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

function wireMocks(): void {
  hoisted.context.mockReset();
  hoisted.context.mockImplementation((setup: () => void) => {
    setup();
    const ctx = {
      revert: vi.fn(() => {
        for (const trigger of hoisted.created) trigger.kill();
      }),
    };
    return ctx;
  });
  hoisted.createTrigger.mockReset();
  hoisted.createTrigger.mockImplementation(() => {
    const trigger: MockTrigger = { kill: vi.fn() };
    hoisted.created.push(trigger);
    return trigger;
  });
}

beforeEach(() => {
  hoisted.created.length = 0;
  hoisted.registerPlugin.mockClear();
  wireMocks();
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  window.history.replaceState({}, "", "/");
});

describe("PR1 cinematic scene mount", () => {
  it("renders the pinned stage, the deferred track and the Canvas", () => {
    const { container } = render(<CinematicIntro />);
    expect(container.querySelector("[data-cinematic-stage]")).not.toBeNull();
    expect(container.querySelector("[data-cinematic-track]")).not.toBeNull();
    expect(container.querySelector('[data-testid="r3f-canvas"]')).not.toBeNull();
  });

  it("wraps the stage inside the track and wires ScrollTrigger to pin it", () => {
    const { container } = render(<CinematicIntro />);
    const track = container.querySelector("[data-cinematic-track]");
    const stage = container.querySelector("[data-cinematic-stage]");
    expect(track?.contains(stage)).toBe(true);
    expect(hoisted.registerPlugin).toHaveBeenCalled();
    expect(hoisted.createTrigger).toHaveBeenCalledTimes(1);
    expect(hoisted.createTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: track,
        pin: stage,
        start: "top top",
        end: CINEMATIC_PIN_END,
        pinSpacing: false,
        anticipatePin: 1,
        markers: false,
      }),
    );
  });

  it("reserves the full-motion scroll distance on the track", () => {
    const { container } = render(<CinematicIntro />);
    const track = container.querySelector("[data-cinematic-track]") as HTMLElement;
    expect(track.style.getPropertyValue("--cinematic-scroll-length")).toBe(
      `${CINEMATIC_SCROLL_DISTANCE_SVH}svh`,
    );
  });

  it("pins to the scroller maximum, never a window.innerHeight-derived px distance", () => {
    render(<CinematicIntro />);
    const config = hoisted.createTrigger.mock.calls[0]![0];
    expect(config.end).toBe(CINEMATIC_PIN_END);
    // The end must stay scroller-relative: svh (track height) and innerHeight
    // (JS) diverge on dynamic-toolbar devices, and a px end landing short of
    // maxScroll is what caused the reverse-scroll pin release jump.
    expect(typeof config.end).toBe("string");
    expect(CINEMATIC_PIN_END).toBe("max");
  });

  it("keeps the semantic wordmark visible while hiding only the decorative layers", () => {
    const { container } = render(<CinematicIntro />);
    const stage = container.querySelector("[data-cinematic-stage]");
    const wordmark = stage?.querySelector("h1.cinematic-scene__wordmark");
    // The section and the real H1 stay in the accessibility tree (the wordmark
    // IS the heading) — only the canvas, labels and scroll cue hide.
    expect(stage?.getAttribute("aria-hidden")).toBeNull();
    expect(wordmark?.getAttribute("aria-label")).toBe(OPENING_WORDMARK_TEXT);
    expect(wordmark?.textContent).toBe("INDAGO");
    for (const span of Array.from(wordmark?.querySelectorAll("span[data-letter]") ?? [])) {
      expect(span.getAttribute("aria-hidden")).toBe("true");
    }
    const canvasWrap = container.querySelector(".cinematic-scene__canvas-wrap");
    expect(canvasWrap?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the scroll cue and NO hero tagline in the stage", () => {
    const { container } = render(<CinematicIntro />);
    const stage = container.querySelector("[data-cinematic-stage]");
    // The rework removed the old summary line — the wordmark IS the copy.
    expect(stage?.querySelector(".cinematic-scene__tagline")).toBeNull();
    expect(stage?.querySelector(".cinematic-scene__scroll-cue")).not.toBeNull();
  });
});

describe("PR1 reduced motion", () => {
  it("collapses the scroll distance in reduced motion", () => {
    stubMatchMedia({ "(prefers-reduced-motion: reduce)": true });
    const { container } = render(<CinematicIntro />);
    expect(hoisted.createTrigger).not.toHaveBeenCalled();
    const track = container.querySelector("[data-cinematic-track]") as HTMLElement;
    expect(track.style.getPropertyValue("--cinematic-scroll-length")).toBe("0svh");
  });

  it("keeps full scroll choreography when reduced motion is off", () => {
    stubMatchMedia({ "(prefers-reduced-motion: reduce)": false });
    render(<CinematicIntro />);
    expect(hoisted.createTrigger).toHaveBeenCalledTimes(1);
  });
});

describe("PR1 diagnostics stay opt-in", () => {
  it("renders no ScrollTrigger markers when the query param is absent", () => {
    render(<CinematicIntro />);
    const config = hoisted.createTrigger.mock.calls[0]![0] as { markers: boolean };
    expect(config.markers).toBe(false);
  });

  it("renders markers only for the explicit ?cinematicDebug=1 dev flag", () => {
    window.history.replaceState({}, "", "/?cinematicDebug=1");
    render(<CinematicIntro />);
    expect(
      (hoisted.createTrigger.mock.calls[0]![0] as { markers: boolean }).markers,
    ).toBe(true);
  });

  it("treats ?cinematicDebug=0 as off", () => {
    window.history.replaceState({}, "", "/?cinematicDebug=0");
    render(<CinematicIntro />);
    expect(
      (hoisted.createTrigger.mock.calls[0]![0] as { markers: boolean }).markers,
    ).toBe(false);
  });
});

describe("PR1 teardown / StrictMode safety", () => {
  it("unmounting kills the created trigger and reverts the context", () => {
    const { unmount } = render(<CinematicIntro />);
    const trigger = hoisted.created[0]!;
    unmount();
    expect(trigger.kill).toHaveBeenCalled();
  });

  it("StrictMode double-mount leaves exactly one live trigger", () => {
    render(
      <StrictMode>
        <CinematicIntro />
      </StrictMode>,
    );
    expect(hoisted.created.length).toBe(2);
    const live = hoisted.created.filter((t) => t.kill.mock.calls.length === 0);
    expect(live.length).toBe(1);
    expect(hoisted.created[0]!.kill).toHaveBeenCalled();
    expect(hoisted.created[1]!.kill).not.toHaveBeenCalled();
  });
});