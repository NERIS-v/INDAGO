import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("should render children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("should apply variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-danger/10");
  });

  it("should apply size classes", () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button", { name: "Small" }).className).toContain("h-8");
  });

  it("should render loading breathing dot and disable the button", () => {
    render(<Button loading>Submit</Button>);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-breathe")).not.toBeNull();
  });

  it("should respect disabled prop", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("should merge custom className", () => {
    render(<Button className="my-class">X</Button>);
    expect(screen.getByRole("button", { name: "X" }).className).toContain("my-class");
  });
});