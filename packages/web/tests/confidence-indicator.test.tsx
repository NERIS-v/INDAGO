import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";

describe("ConfidenceIndicator", () => {
  it("should display the value to two decimals", () => {
    render(<ConfidenceIndicator value={0.62} />);
    expect(screen.getByText("0.62")).toBeInTheDocument();
  });

  it("should display the default label", () => {
    render(<ConfidenceIndicator value={0.5} />);
    expect(screen.getByText("Confidence")).toBeInTheDocument();
  });

  it("should display a custom label", () => {
    render(<ConfidenceIndicator value={0.5} label="Strength" />);
    expect(screen.getByText("Strength")).toBeInTheDocument();
  });

  it("should clamp out-of-range values", () => {
    render(<ConfidenceIndicator value={1.4} />);
    expect(screen.getByText("1.00")).toBeInTheDocument();
    render(<ConfidenceIndicator value={-0.3} />);
    expect(screen.getByText("0.00")).toBeInTheDocument();
  });

  it("should never use the word probability as visible text", () => {
    render(<ConfidenceIndicator value={0.62} label="Confidence" />);
    // aria-label clarifies "not a probability", but the visible text must not.
    const visibleText = screen.getAllByText(/Confidence|0\.62/)[0].textContent;
    expect(visibleText).not.toContain("probabil");
    expect(screen.queryByText(/probabil/i)).toBeNull();
  });

  it("should expose an accessible label preserving [0,1] analytical semantics, not percent", () => {
    const { container } = render(<ConfidenceIndicator value={0.62} label="Confidence" />);
    const el = container.querySelector('[role="img"]');
    const label = el?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Confidence: 0.62");
    expect(label).toContain("zero to one");
    expect(label).toContain("analytical confidence");
    expect(label).not.toContain("percent");
  });

  it("must not be animated", () => {
    const { container } = render(<ConfidenceIndicator value={0.62} showBar />);
    expect(container.innerHTML).not.toContain("animate-");
  });
});