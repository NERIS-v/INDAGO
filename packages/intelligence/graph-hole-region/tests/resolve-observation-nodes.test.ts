import { describe, it, expect } from 'vitest';
import { resolveSeedNodeIds } from '../src/index.js';
import { OBS_1, OBS_2, NODE_CENTER, NODE_LEAF_A, ENT_UNKNOWN_CASE } from './helpers/fixtures.js';

describe('resolveSeedNodeIds', () => {
  const graphHas: (id: string) => boolean = (id) =>
    id === NODE_CENTER || id === NODE_LEAF_A;

  it('resolves only entity ids present in the graph', () => {
    const resolution = resolveSeedNodeIds(
      [
        { id: OBS_1, entityIds: [NODE_CENTER] },
        { id: OBS_2, entityIds: [ENT_UNKNOWN_CASE] },
      ],
      graphHas,
    );
    expect(resolution.resolvedNodeIds).toEqual([NODE_CENTER]);
    expect(resolution.unresolvedEntityIds).toEqual([ENT_UNKNOWN_CASE]);
    expect(resolution.resolvedPerObservation).toEqual([
      { observationId: OBS_1, resolvedNodeIds: [NODE_CENTER], unresolvedEntityIds: [] },
      { observationId: OBS_2, resolvedNodeIds: [], unresolvedEntityIds: [ENT_UNKNOWN_CASE] },
    ]);
  });

  it('deduplicates entities across observations and sorts ids', () => {
    const resolution = resolveSeedNodeIds(
      [
        { id: OBS_2, entityIds: [NODE_LEAF_A, NODE_CENTER] },
        { id: OBS_1, entityIds: [NODE_CENTER, NODE_CENTER] },
      ],
      graphHas,
    );
    expect(resolution.resolvedNodeIds).toEqual([NODE_CENTER, NODE_LEAF_A]);
    expect(resolution.resolvedPerObservation[0]).toMatchObject({
      observationId: OBS_1,
      resolvedNodeIds: [NODE_CENTER],
    });
  });

  it('is independent of input observation order', () => {
    const graph: (id: string) => boolean = (id) => id === NODE_CENTER || id === NODE_LEAF_A;
    const a = resolveSeedNodeIds(
      [
        { id: OBS_2, entityIds: [NODE_LEAF_A] },
        { id: OBS_1, entityIds: [NODE_CENTER] },
      ],
      graph,
    );
    const b = resolveSeedNodeIds(
      [
        { id: OBS_1, entityIds: [NODE_CENTER] },
        { id: OBS_2, entityIds: [NODE_LEAF_A] },
      ],
      graph,
    );
    expect(a.resolvedPerObservation.map((o) => o.observationId)).toEqual(
      b.resolvedPerObservation.map((o) => o.observationId),
    );
    expect(a.resolvedNodeIds).toEqual(b.resolvedNodeIds);
  });

  it('a fully unresolvable seed produces empty resolved ids (no invented nodes)', () => {
    const resolution = resolveSeedNodeIds([{ id: OBS_1, entityIds: [ENT_UNKNOWN_CASE] }], () => false);
    expect(resolution.resolvedNodeIds).toEqual([]);
    expect(resolution.unresolvedEntityIds).toEqual([ENT_UNKNOWN_CASE]);
  });
});