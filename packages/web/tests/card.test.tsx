import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

describe("Card", () => {
  it("should render children", () => {
    render(<Card>Body</Card>);
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("should apply padding class", () => {
    render(<Card padding="lg">Body</Card>);
    expect(screen.getByText("Body").className).toContain("p-8");
  });

  it("should apply hover transition when interactive", () => {
    render(<Card interactive>Body</Card>);
    const el = screen.getByText("Body");
    expect(el.className).toContain("hover:bg-surface-100");
    expect(el.className).toContain("duration-normal");
  });

  it("should not be interactive by default", () => {
    render(<Card>Body</Card>);
    expect(screen.getByText("Body").className).not.toContain("hover:bg-surface-100");
  });

  it("CardTitle should use type scale class", () => {
    render(<CardTitle>Title</CardTitle>);
    expect(screen.getByText("Title").className).toContain("type-section");
  });

  it("CardDescription should use caption type scale", () => {
    render(<CardDescription>Desc</CardDescription>);
    expect(screen.getByText("Desc").className).toContain("type-caption");
  });

  it("CardContent should render children", () => {
    render(<CardContent>Content</CardContent>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});