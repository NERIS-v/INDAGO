// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK
// Every visible benchmark artifact must carry a subtle, readable label. These
// are NOT production/field results and NOT independently validated.
// ============================================================================

export const NOTICE_LABELS = {
  banner: 'INTERNAL PILOT EVALUATION',
  corpus: 'SYNTHETIC / DE-IDENTIFIED CORPUS',
  mode: 'PROTOTYPE BENCHMARK',
  disclaimer:
    'Prototype dry-run over synthetic, de-identified benchmark data. ' +
    'The results below are internal prototype observations — not production results, ' +
    'not field results, and not independently validated results.',
  nonEndorsement:
    'This evaluation does not invoke, represent, or endorse any external institution, ' +
    'reviewer, publication, certification, or real-world validation.',
} as const;

/** Wrap any metric value so the label is embedded next to the number. */
export function labeled(value: unknown): { value: unknown; notice: string } {
  return { value, notice: NOTICE_LABELS.banner };
}

/** Machine-readable header block stamped into every JSON artifact. */
export function provenanceHeader(meta: Record<string, unknown>): Record<string, unknown> {
  return {
    _notice: NOTICE_LABELS.banner,
    _corpusNotice: NOTICE_LABELS.corpus,
    _mode: NOTICE_LABELS.mode,
    _disclaimer: NOTICE_LABELS.disclaimer,
    _provenance: meta,
  };
}