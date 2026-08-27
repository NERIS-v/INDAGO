import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusIndicator } from "@/components/ui/status-indicator";

describe("StatusIndicator", () => {
  it("should render a label", () => {
    render(<StatusIndicator tone="success" label="Ready" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("should render a colored status dot", () => {
    const { container } = render(<StatusIndicator tone="success" label="Ready" />);
    const dot = container.querySelector("span > span");
    expect((dot as HTMLElement).className).toContain("bg-success");
  });

  it("should breathe for processing tone", () => {
    const { container } = render(<StatusIndicator tone="processing" />);
    const dot = container.querySelector("span > span");
    expect((dot as HTMLElement).className).toContain("animate-breathe");
  });

  it("should not breathe for static tones", () => {
    const { container } = render(<StatusIndicator tone="danger" label="Failed" />);
    const dot = container.querySelector("span > span");
    expect((dot as HTMLElement).className).not.toContain("animate-breathe");
  });

  it("should add an accessible label when no visible label is given", () => {
    render(<StatusIndicator tone="warning" />);
    const indicator = screen.getByLabelText("warning");
    expect(indicator).toBeInTheDocument();
  });

  it("should convey status by text in addition to color", () => {
    render(<StatusIndicator tone="danger" label="Failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});