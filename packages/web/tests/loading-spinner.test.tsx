import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

describe("LoadingSpinner", () => {
  it("should render three breathing dots", () => {
    const { container } = render(<LoadingSpinner />);
    const dots = container.querySelectorAll(".animate-breathe");
    expect(dots.length).toBe(3);
  });

  it("should stagger the dots", () => {
    const { container } = render(<LoadingSpinner />);
    const dots = container.querySelectorAll(".animate-breathe");
    expect((dots[1] as HTMLElement).style.animationDelay).toBe("180ms");
    expect((dots[2] as HTMLElement).style.animationDelay).toBe("360ms");
  });

  it("should render label when provided", () => {
    render(<LoadingSpinner label="Processing" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("should render no label when omitted", () => {
    render(<LoadingSpinner />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it("should apply custom className", () => {
    const { container } = render(<LoadingSpinner className="my-class" />);
    expect(container.firstElementChild?.className).toContain("my-class");
  });
});