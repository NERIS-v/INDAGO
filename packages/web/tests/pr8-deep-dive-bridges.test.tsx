// ============================================================================
// PR-8 — Deep-dive bridges renderer (deep-dive-bridges.tsx)
//
// Available bridges render as REAL anchors (no href="#" stubs); unavailable
// bridges render as an honest greyed row carrying the note. An object with no
// available surface shows the empty state instead of dead buttons.
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeepDiveBridges } from "@/components/graph/control-center/deep-dive-bridges";
import type { DeepDiveLink } from "@/lib/context/deep-dive-links";

function link(id: string, available: boolean, href = `#${id}`): DeepDiveLink {
  return {
    id,
    label: id.toUpperCase(),
    hint: `hint-${id}`,
    href,
    available,
    ...(available ? {} : { note: `note-${id}` }),
  };
}

afterEach(() => cleanup());

describe("PR-8 — bridges renderer", () => {
  it("available bridges render as real anchors carrying the href", () => {
    const href = "/investigations/x/graph?caseId=y&focus=z";
    render(<DeepDiveBridges links={[link("network", true, href), link("leads", true)]} />);

    const anchor = screen.getByTestId("deep-dive-link-network");
    expect(anchor.tagName.toLowerCase()).toBe("a");
    expect(anchor).toHaveAttribute("href", href);
    expect(anchor.getAttribute("data-link-available")).toBe("true");
    expect(screen.getByTestId("deep-dive-link-leads").getAttribute("data-link-available")).toBe("true");
  });

  it("unavailable bridges render as a non-anchor greyed row with the honest note", () => {
    render(<DeepDiveBridges links={[link("observations", false)]} />);

    const row = screen.getByTestId("deep-dive-link-observations");
    expect(row.tagName.toLowerCase()).not.toBe("a");
    expect(row.getAttribute("data-link-available")).toBe("false");
    expect(row.getAttribute("title")).toBe("note-observations");
    expect(row.textContent).toContain("note-observations");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing is available", () => {
    render(
      <DeepDiveBridges
        links={[link("observations", false), link("cross-case", false)]}
      />,
    );
    expect(screen.getByTestId("deep-dive-bridges-empty").textContent).toContain(
      "No deep-dive surfaces are available",
    );
  });

  it("never emits a dead href for an available bridge", () => {
    const links: DeepDiveLink[] = [
      link("network", true, `#network`),
      link("leads", true, `#leads`),
    ];
    render(<DeepDiveBridges links={links} />);
    for (const id of ["network", "leads"]) {
      expect(screen.getByTestId(`deep-dive-link-${id}`).getAttribute("href")).toBe(`#${id}`);
    }
  });

  it("mixes available and unavailable rows without dropping either", () => {
    render(
      <DeepDiveBridges
        links={[link("network", true), link("observations", false), link("timeline", true)]}
      />,
    );
    expect(screen.getByTestId("deep-dive-link-network").getAttribute("data-link-available")).toBe("true");
    expect(screen.getByTestId("deep-dive-link-observations").getAttribute("data-link-available")).toBe("false");
    expect(screen.getByTestId("deep-dive-link-timeline").getAttribute("data-link-available")).toBe("true");
    expect(screen.queryByTestId("deep-dive-bridges-empty")).not.toBeInTheDocument();
  });
});