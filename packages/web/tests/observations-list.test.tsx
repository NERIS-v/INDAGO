import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ObservationsList } from "@/components/observations/observations-list";
import { ObservationSchema } from "@indago/contracts";

afterEach(cleanup);

const observation = ObservationSchema.parse({
  id: "550e8400-e29b-41d4-a716-446655424200",
  evidenceId: "550e8400-e29b-41d4-a716-446655444200",
  sourceId: "550e8400-e29b-41d4-a716-446655424201",
  type: "FINANCIAL",
  content: "Balance recorded at 42000.00",
  entityIds: ["550e8400-e29b-41d4-a716-446655424202"],
  candidateMentions: ["GTBIT"],
  strength: 0.7,
  provenance: {
    sourceId: "550e8400-e29b-41d4-a716-446655424201",
    artifactId: "550e8400-e29b-41d4-a716-446655424203",
    extractor: "indago-text-canonicalizer",
  },
  createdAt: { value: "2026-08-01T00:00:00.000Z", precision: "exact" },
  updatedAt: { value: "2026-08-01T00:00:00.000Z", precision: "exact" },
  observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "exact" },
});

describe("ObservationsList", () => {
  it("renders observation content and its type", () => {
    render(<ObservationsList items={[observation]} loading={false} error={null} />);
    expect(screen.getByText(observation.content)).toBeInTheDocument();
    expect(screen.getByText(observation.type)).toBeInTheDocument();
  });

  it("renders a linked-entity count", () => {
    render(<ObservationsList items={[observation]} loading={false} error={null} />);
    expect(screen.getByText(/1 linked entit/)).toBeInTheDocument();
  });

  it("renders an empty state when there are no items", () => {
    render(<ObservationsList items={[]} loading={false} error={null} />);
    expect(screen.getByText(/No observations/)).toBeInTheDocument();
  });

  it("renders a loading state", () => {
    render(<ObservationsList items={null} loading error={null} />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("renders an error state with retry", () => {
    const onRetry = vi.fn();
    render(
      <ObservationsList items={null} loading={false} error="Something failed" onRetry={onRetry} />,
    );
    expect(screen.getByText(/Something failed/)).toBeInTheDocument();
    screen.getByRole("button", { name: /Retry/ }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a typed unavailable state when listing is not supported", () => {
    render(
      <ObservationsList items={[]} loading={false} error={null} unavailable />,
    );
    expect(
      screen.getByText("Observations listing not available in this mode"),
    ).toBeInTheDocument();
  });
});