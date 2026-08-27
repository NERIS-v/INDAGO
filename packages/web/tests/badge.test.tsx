import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("should render children", () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("should render accent variant", () => {
    render(<Badge variant="accent">Accent</Badge>);
    expect(screen.getByText("Accent").className).toContain("bg-accent-rose/10");
  });

  it("should render a status dot when dot is set", () => {
    const { container } = render(<Badge variant="success" dot>Ready</Badge>);
    const dot = container.querySelector("span > span");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).className).toContain("rounded-full");
  });

  it("should breathe the dot when dotPulse is set", () => {
    const { container } = render(
      <Badge variant="accent" dot dotPulse>
        Processing
      </Badge>,
    );
    const dot = container.querySelector("span > span");
    expect((dot as HTMLElement).className).toContain("animate-breathe");
  });

  it("should not breathe when dotPulse is false", () => {
    const { container } = render(
      <Badge variant="accent" dot>
        Ready
      </Badge>,
    );
    const dot = container.querySelector("span > span");
    expect((dot as HTMLElement).className).not.toContain("animate-breathe");
  });

  it("should forward HTML props", () => {
    render(<Badge data-testid="b">Hi</Badge>);
    expect(screen.getByTestId("b")).toBeInTheDocument();
  });

  it("should merge custom className", () => {
    render(<Badge className="my-class">Hi</Badge>);
    expect(screen.getByText("Hi").className).toContain("my-class");
  });
});