import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateBadge } from "@/components/status/state-badge";

describe("StateBadge", () => {
  it("should render CREATED state with correct label", () => {
    render(<StateBadge state="CREATED" />);
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  it("should render INGESTING state", () => {
    render(<StateBadge state="INGESTING" />);
    expect(screen.getByText("Ingesting")).toBeInTheDocument();
  });

  it("should render NORMALIZING state", () => {
    render(<StateBadge state="NORMALIZING" />);
    expect(screen.getByText("Normalizing")).toBeInTheDocument();
  });

  it("should render ANALYZING state", () => {
    render(<StateBadge state="ANALYZING" />);
    expect(screen.getByText("Analyzing")).toBeInTheDocument();
  });

  it("should render FAILED state", () => {
    render(<StateBadge state="FAILED" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("should render COMPLETED state", () => {
    render(<StateBadge state="COMPLETED" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("should render unknown state as raw value", () => {
    render(<StateBadge state="CUSTOM_STATE" />);
    expect(screen.getByText("CUSTOM_STATE")).toBeInTheDocument();
  });

  it("should have testid attribute", () => {
    render(<StateBadge state="CREATED" />);
    expect(screen.getByTestId("state-badge")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    render(<StateBadge state="CREATED" className="my-custom-class" />);
    const badge = screen.getByTestId("state-badge");
    expect(badge.className).toContain("my-custom-class");
  });
});
