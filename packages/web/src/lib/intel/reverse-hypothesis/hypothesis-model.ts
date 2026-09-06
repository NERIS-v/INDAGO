// ============================================================================
// F-PR9 — Reverse Hypothesis model
//
// A PURE, deterministic module that:
//   1. interprets a free-text hypothesis into a structured, testable condition;
//   2. generates predicate-aware INVERSE conditions (the "try to prove me
//      wrong" framing — Reverse Hypothesis, never a verdict);
//   3. classifies retrieved observations as SUPPORTING / CONTRADICTING /
//      UNRESOLVED against those conditions;
//   4. derives an epistemic status WITHOUT any confidence, probability,
//      Bayesian, or "true/false" output.
//
// Contract with the provider layer:
//   - The model imports NOTHING from the demo/live providers and nothing from
//     the demo fixtures. It accepts entities, observations and contradictions
//     as plain structural inputs so it stays fully testable and reusable.
//   - "Absence is not contradiction": an observation that fails to match a
//     condition is unresolved or retrieved-but-neutral — it can never falsify.
//   - "Distinct destination is not a rebuttal": A→C never contradicts A→B
//     unless the hypothesis asserts exclusivity.
// ============================================================================

// ============================================================================
// Types
// ============================================================================

export type HypothesisPredicate =
  | "TRANSFER"
  | "LOCATED_AT"
  | "CONTACT"
  | "OWNERSHIP"
  | "OTHER";

export interface EntityAlias {
  readonly id: string;
  /** Canonical display label (e.g. entity.canonicalName). */
  readonly label: string;
  /** Lower-cased match tokens; the dictionary drives deterministic resolution. */
  readonly aliases: string[];
}

export type TemporalRef =
  | { readonly kind: "year"; readonly year: number }
  | { readonly kind: "month"; readonly month: string } // "2024-02"
  | { readonly kind: "day"; readonly day: string } // "YYYY-MM-DD"
  | { readonly kind: "range"; readonly start: string; readonly end: string };

export interface HypothesisCondition {
  readonly predicate: HypothesisPredicate;
  readonly subject: EntityAlias;
  readonly object?: EntityAlias;
  readonly temporal?: TemporalRef;
  /** Canonical vocabulary term the text matched (e.g. "received funds from"). */
  readonly verbToken: string;
  /** Human sentence describing exactly what must be true to support. */
  readonly assertion: string;
}

export interface Interpretation {
  readonly text: string;
  readonly predicate: HypothesisPredicate;
  readonly subject?: EntityAlias;
  readonly object?: EntityAlias;
  readonly temporal?: TemporalRef;
  readonly conditions: readonly HypothesisCondition[];
  /** Role/entity tokens the text used that could not be resolved. Surfaced
   *  honestly in the UI — never silently guessed. */
  readonly unresolved: readonly string[];
  /** Human reading of how the hypothesis was structured. */
  readonly reading: string;
  /** True when at least one structured, subject-resolved condition exists. */
  readonly resolute: boolean;
}

export type InverseConditionKind =
  | "REVERSE_DIRECTION"
  | "DIFFERENT_DESTINATION"
  | "DIFFERENT_SENDER"
  | "DIFFERENT_LOCATION"
  | "EXPLICIT_NEGATION";

export interface InverseCondition {
  readonly kind: InverseConditionKind;
  readonly predicate: HypothesisPredicate;
  readonly description: string;
  /** Whether fulfilling this inverse condition counts as a contradiction.
   *  Absence of the inverse is NEVER a contradiction. */
  readonly contradicting: boolean;
  readonly reason: string;
}

export type ContradictionType =
  | "DIRECT_CONFLICT"
  | "TEMPORAL_CONFLICT"
  | "DIRECTION_CONFLICT"
  | "LOCATION_CONFLICT"
  | "IDENTITY_CONFLICT"
  | "EXCLUSIVITY_CONFLICT"
  | "EXPLICIT_NEGATION"
  | "OTHER";

export type EvidenceClassification = "SUPPORTING" | "CONTRADICTING" | "UNRESOLVED";

export interface InverseMatch {
  readonly kind: InverseConditionKind;
  readonly description: string;
}

export interface EvidenceFinding {
  readonly observationId: string;
  readonly type: string;
  readonly content: string;
  readonly entityIds: readonly string[];
  readonly observedAt?: string;
  readonly evidenceId?: string;
  readonly sourceId?: string;
  readonly classification: EvidenceClassification;
  readonly why: string;
  readonly matchedConditions?: readonly string[];
  readonly inverseMatch?: InverseMatch;
  readonly contradictionType?: ContradictionType;
  readonly canonicalContradictionId?: string;
}

export type AssessmentStatus =
  | "SUPPORTED"
  | "SUPPORTED_WITH_CONFLICT"
  | "CONTRADICTED"
  | "UNRESOLVED";

export type HypothesisTestError =
  | "HYPOTHESIS_PARSE_ERROR"
  | "NO_SUPPORTING_EVIDENCE"
  | "NO_CONTRADICTING_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE"
  | "PROVIDER_UNAVAILABLE"
  | "RUNTIME_ERROR";

export type RunStage =
  | "IDLE"
  | "INTERPRETING"
  | "RETRIEVING_SUPPORT"
  | "BUILDING_INVERSE"
  | "RETRIEVING_CONTRADICTION"
  | "VALIDATING"
  | "READY"
  | "ERROR";

export interface RetrievalSummary {
  /** Observations the hypothesis's semantics reached (deterministic pool). */
  readonly pool: number;
  readonly supporting: number;
  readonly contradicting: number;
  readonly unresolved: number;
}

export interface HypothesisAssessment {
  readonly hypothesisText: string;
  readonly interpretation: Interpretation;
  /** Status is null ONLY for a terminal parse error (no test was possible). */
  readonly status: AssessmentStatus | null;
  readonly error?: HypothesisTestError;
  /** Informational notices; preserves the spec's explicit finding vocabulary
   *  without ever turning absence into a verdict. */
  readonly notices: readonly string[];
  /** Ordered, completed run-stage trail (facts, never faked progress). */
  readonly stages: readonly RunStage[];
  readonly supporting: readonly EvidenceFinding[];
  readonly contradicting: readonly EvidenceFinding[];
  readonly unresolved: readonly EvidenceFinding[];
  readonly inverseConditions: readonly InverseCondition[];
  readonly retrieval: RetrievalSummary;
  readonly generatedAt: string;
}

export type HypothesisDecision =
  | "ACCEPT_AS_WORKING_HYPOTHESIS"
  | "REVISE_HYPOTHESIS"
  | "KEEP_UNRESOLVED"
  | "OPEN_EVIDENCE";

export interface HypothesisTestInput {
  readonly hypothesis: string;
}

export interface HypothesisDecisionInput {
  readonly hypothesis: string;
  readonly decision: HypothesisDecision;
}

export interface HypothesisDecisionRecord {
  readonly investigationId: string;
  readonly hypothesisText: string;
  readonly decision: HypothesisDecision;
  readonly at: string;
}

/** Structural contradiction record the model consumes (adapted from the
 *  web-side ObservationContradiction projection). */
export interface ContradictionRecord {
  readonly id?: string;
  readonly leftObservationId: string;
  readonly rightObservationId: string;
  readonly contradictionType: string;
}

// ============================================================================
// Lexicons (deterministic vocabulary — the "AI" interpretation is rule-based
// and fully inspectable; nothing is guessed probabilistically).
// ============================================================================

const MONTHS: readonly string[] = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const PREDICATE_VERBS: readonly { readonly predicate: HypothesisPredicate; readonly verbs: readonly string[] }[] = [
  {
    predicate: "TRANSFER",
    verbs: [
      "received funds from", "received funds", "transferred", "transfer",
      "wire", "wired", "disbursed", "paid", "passed", "remitted", "funds from",
    ],
  },
  {
    predicate: "LOCATED_AT",
    verbs: [
      "shares a residential address", "shares an address", "residential address",
      "address", "residence", "located at", "lives at", "rue", "domiciled",
    ],
  },
  {
    predicate: "CONTACT",
    verbs: [
      "corresponded", "contacted", "communicated with", "emailed", "messaged",
      "communication", "correspondence", "in contact",
    ],
  },
  {
    predicate: "OWNERSHIP",
    verbs: [
      "beneficial owner", "owns", "owner", "controls", "control", "director of",
      "director", "controlling", "beneficiary",
    ],
  },
];

const NEGATION_VERBS: readonly string[] = [
  "did not", "didn't", "never", "no transfer", "no wire", "no funds",
  "no communication", "no correspondence", "does not own", "does not control",
  "no longer", "without",
];

const LOCATION_TOKENS: readonly string[] = [
  "address", "residence", "residential", "rue", "street", "domicil", "located",
  "shared", "restaurant", "apartment",
];

const RANGE_REGEX =
  /\bbetween\s+([\d]{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)[\w,]*\s+\d{4})\s+and\s+([\d]{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)[\w,]*\s+\d{4})\b/i;

const GENERIC_STOPWORDS: readonly string[] = [
  "the", "and", "with", "for", "from", "into", "account", "s.", "ltd.", "a",
  "of", "to", "intermediary",
];

// ============================================================================
// Entity resolution
// ============================================================================

/** Derive deterministic match aliases from a canonical entity label. */
export function deriveAliases(label: string): string[] {
  const lower = label.toLowerCase().replace(/\s+/g, " ").trim();
  const noSuffix = lower
    .replace(/\s*s\.a\.\s*$/, "")
    .replace(/\s*ltd\.\s*$/, "")
    .replace(/\s*inc\.\s*$/, "")
    .trim();
  const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);

  const aliases = new Set<string>([lower, noSuffix]);
  for (const token of tokens) {
    if (token.length >= 4 && !GENERIC_STOPWORDS.includes(token)) {
      aliases.add(token);
    }
  }
  const accountNumber = lower.match(/\b\d{4,}\b/);
  if (accountNumber) aliases.add(accountNumber[0]);
  return [...aliases];
}

/** Build an entity catalog (canonical aliases + optional domain alias map). */
export function buildEntityCatalog(
  entities: readonly { readonly id: string; readonly canonicalName: string }[],
  extraAliases?: Readonly<Record<string, readonly string[]>>,
): EntityAlias[] {
  return entities.map((e) => {
    const domain = (extraAliases && extraAliases[e.id]) || [];
    const aliases = new Set<string>([...deriveAliases(e.canonicalName), ...domain]);
    return { id: e.id, label: e.canonicalName, aliases: [...aliases] };
  });
}

/** Resolve every entity mention in a text against a catalog. Longest alias
 *  wins; entities that look like mentions but resolve to nothing are reported
 *  as unresolved (never guessed). */
export function resolveEntities(
  text: string,
  catalog: readonly EntityAlias[],
): { resolved: EntityAlias[]; unresolved: string[] } {
  const lower = text.toLowerCase();
  const resolved: EntityAlias[] = [];
  const matchedAliases = new Set<string>();
  const usedEntities = new Set<string>();
  const unresolved: string[] = [];

  const mentionCandidates: { id: string; alias: string }[] = [];
  for (const entry of catalog) {
    for (const alias of entry.aliases) {
      if (alias.length < 4) continue;
      if (lower.includes(alias)) {
        mentionCandidates.push({ id: entry.id, alias });
      }
    }
  }
  mentionCandidates.sort((a, b) => b.alias.length - a.alias.length);

  for (const match of mentionCandidates) {
    if (matchedAliases.has(match.alias)) continue;
    if (usedEntities.has(match.id) && resolved.some((r) => r.id === match.id)) continue;
    const entry = catalog.find((e) => e.id === match.id);
    if (!entry) continue;
    matchedAliases.add(match.alias);
    if (!usedEntities.has(match.id)) {
      usedEntities.add(match.id);
      resolved.push(entry);
    }
  }

  // Role/capitalized tokens that look like proper nouns but were not resolved.
  for (const raw of text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []) {
    const key = raw.toLowerCase();
    if (matchedAliases.has(key) || key.length < 4) continue;
    if (catalog.some((e) => e.aliases.includes(key))) continue;
    if (!unresolved.includes(key)) unresolved.push(key);
  }

  return { resolved, unresolved };
}

// ============================================================================
// Temporal parsing
// ============================================================================

/** "between 5 February 2024 and 10 March 2024" */
function parseRange(text: string): TemporalRef | undefined {
  const m = text.match(RANGE_REGEX);
  if (!m || !m[1] || !m[2]) return undefined;
  const start = canonicalDate(m[1]);
  const end = canonicalDate(m[2]);
  if (!start || !end) return undefined;
  return { kind: "range", start, end };
}

function canonicalDate(phrase: string): string | undefined {
  const m = phrase.trim().match(
    /^(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)[\w,]*\s+(\d{4})$/i,
  );
  if (!m || !m[1] || !m[2] || !m[3]) return undefined;
  const month = (MONTHS.indexOf(m[2].toLowerCase()) + 1).toString().padStart(2, "0");
  const day = m[1].padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

/** Parse the most specific temporal reference mentioned (day > range > month > year). */
export function parseTemporalRef(text: string): TemporalRef | undefined {
  const lower = text.toLowerCase();

  const day = lower.match(
    /\b(?:on\s+)?(\d{4})-(\d{2})-(\d{2})\b/,
  ) || lower.match(
    /\b(?:on\s+)?(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)[\w,]*\s+(\d{4})\b/,
  );
  if (day && day[1] && day[2] && day[3]) {
    if (day[2].length === 2) {
      return { kind: "day", day: `${day[1]}-${day[2]}-${day[3]}` };
    }
    const monthIndex = MONTHS.indexOf(day[2].toLowerCase());
    const month = (monthIndex + 1).toString().padStart(2, "0");
    return { kind: "day", day: `${day[3]}-${month}-${day[1].padStart(2, "0")}` };
  }

  const range = parseRange(text);
  if (range) return range;

  const month = lower.match(
    /\b(?:in|during|within)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/,
  );
  if (month && month[1] && month[2]) {
    const idx = MONTHS.indexOf(month[1].toLowerCase());
    return { kind: "month", month: `${month[2]}-${(idx + 1).toString().padStart(2, "0")}` };
  }

  const year = lower.match(/\b(?:in|during|within)\s+(\d{4})\b/);
  if (year && year[1]) {
    return { kind: "year", year: Number(year[1]) };
  }

  return undefined;
}

/** Format a temporal reference for display (deterministic). */
export function temporalLabel(ref: TemporalRef): string {
  switch (ref.kind) {
    case "year":
      return `during ${ref.year}`;
    case "month":
      return `during ${ref.month}`;
    case "day":
      return `on ${ref.day}`;
    case "range":
      return `between ${ref.start} and ${ref.end}`;
  }
}

/** True when an observedAt value (YYYY-MM-DD…) lies inside the ref, inclusive. */
export function observationInWindow(
  observedAtValue: string | undefined,
  temporal: TemporalRef | undefined,
): boolean {
  if (!temporal) return true;
  if (!observedAtValue) return true;
  const date = observedAtValue.slice(0, 10);
  switch (temporal.kind) {
    case "year":
      return date.startsWith(`${temporal.year}-`);
    case "month":
      return date.startsWith(`${temporal.month}-`);
    case "day":
      return date === temporal.day;
    case "range":
      return date >= temporal.start && date <= temporal.end;
  }
}

// ============================================================================
// Predicate detection
// ============================================================================

/** Detect the most specific predicate the text asserts. */
export function detectPredicate(text: string): HypothesisPredicate {
  const lower = text.toLowerCase();
  let best: HypothesisPredicate = "OTHER";
  let bestIdx = Number.MAX_SAFE_INTEGER;
  for (const group of PREDICATE_VERBS) {
    for (const verb of group.verbs) {
      const idx = lower.indexOf(verb);
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
        best = group.predicate;
      }
    }
  }
  return best;
}

function verbFor(predicate: HypothesisPredicate): string {
  switch (predicate) {
    case "TRANSFER":
      return "received funds from / transferred to";
    case "LOCATED_AT":
      return "shares a residential address";
    case "CONTACT":
      return "corresponded / contacted";
    case "OWNERSHIP":
      return "owns / controls";
    case "OTHER":
      return "— (no structured form)";
  }
}

function assertionFor(
  predicate: HypothesisPredicate,
  subject: EntityAlias,
  object: EntityAlias | undefined,
  temporal: TemporalRef | undefined,
): string {
  const window = temporal ? ` ${temporalLabel(temporal)}` : "";
  switch (predicate) {
    case "TRANSFER":
      return `${subject.label} transferred funds to ${
        object ? object.label : "(an account)"
      }${window}.`;
    case "LOCATED_AT":
      return object
        ? `${subject.label} shares a residential address with ${object.label}${window}.`
        : `${subject.label} is recorded at a residential address${window}.`;
    case "CONTACT":
      return object
        ? `${subject.label} was in contact with ${object.label}${window}.`
        : `${subject.label} engaged in correspondence${window}.`;
    case "OWNERSHIP":
      return object
        ? `${subject.label} owns or controls ${object.label}${window}.`
        : `${subject.label} is a beneficial owner${window}.`;
    case "OTHER":
      return subject.label;
  }
}

function appearanceIndex(text: string, entry: EntityAlias): number {
  const lower = text.toLowerCase();
  let best = Number.MAX_SAFE_INTEGER;
  for (const alias of entry.aliases) {
    if (alias.length < 4) continue;
    const idx = lower.indexOf(alias);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best;
}

/** Order resolved entities by their first appearance in the text — the
 *  grammatical subject typically surfaces first. Deterministic. */
function orderedByAppearance(
  text: string,
  resolved: readonly EntityAlias[],
): EntityAlias[] {
  return [...resolved].sort(
    (a, b) => appearanceIndex(text, a) - appearanceIndex(text, b),
  );
}

function resolveEntry(
  phrase: string,
  catalog: readonly EntityAlias[],
): EntityAlias | undefined {
  const id = resolveBestAlias(phrase, catalog);
  return id ? catalog.find((e) => e.id === id) : undefined;
}

/** Read the sender/recipient roles out of a TRANSFER hypothesis ("X received
 *  funds from Y" ⇒ Y→X; "X transferred N to Y" ⇒ X→Y). */
function parseTransferParties(
  text: string,
  catalog: readonly EntityAlias[],
): { sender?: EntityAlias; recipient?: EntityAlias } {
  const received = text.match(
    /([\w .'-]{2,}?)\s+received\s+(?:[\w,.]+\s+)*?from\s+([\w .'-]{2,}?)(?=\s+(?:in|during|within|between)|,|\.|;|$|\s+and)/i,
  );
  if (received && received[1] && received[2]) {
    return {
      recipient: resolveEntry(received[1], catalog),
      sender: resolveEntry(received[2], catalog),
    };
  }
  const transferred = text.match(
    /([\w .'-]{2,}?)\s+transferred\s+[\w,.%]+\s+to\s+([\w .'-]{2,}?)(?=\s+(?:in|during|within|between)|,|\.|;|$|\s+and)/i,
  );
  if (transferred && transferred[1] && transferred[2]) {
    return {
      sender: resolveEntry(transferred[1], catalog),
      recipient: resolveEntry(transferred[2], catalog),
    };
  }
  return {};
}

// ============================================================================
// Interpretation
// ============================================================================

export function interpretHypothesis(
  text: string,
  catalog: readonly EntityAlias[],
): Interpretation {
  const trimmed = text.trim();
  const { resolved, unresolved } = resolveEntities(trimmed, catalog);
  const predicate = detectPredicate(trimmed);
  const temporal = parseTemporalRef(trimmed);
  const ordered = orderedByAppearance(trimmed, resolved);
  let subject: EntityAlias | undefined;
  let object: EntityAlias | undefined;
  if (predicate === "TRANSFER") {
    const parties = parseTransferParties(trimmed, catalog);
    subject = parties.sender ?? ordered[0];
    object =
      parties.recipient ??
      (parties.sender ? ordered.find((e) => e.id !== subject?.id) : undefined);
    if (!object && ordered.length > 1) {
      object = ordered.find((e) => e.id !== subject?.id);
    }
  } else {
    subject = ordered[0];
    object = ordered.length > 1 ? ordered[1] : undefined;
  }

  const conditions: HypothesisCondition[] = [];
  if (subject) {
    conditions.push({
      predicate,
      subject,
      object,
      temporal,
      verbToken: verbFor(predicate),
      assertion: assertionFor(predicate, subject, object, temporal),
    });
  }

  const resolute = conditions.length > 0;
  const reading = resolute && conditions[0]
    ? `Structured as: ${conditions[0].assertion}${
        unresolved.length > 0
          ? ` (unresolved tokens: ${unresolved.join(", ")})`
          : ""
      }`
    : `Could not structure "${trimmed}" into a testable condition.`;

  return {
    text: trimmed,
    predicate,
    subject,
    object,
    temporal,
    conditions,
    unresolved,
    reading,
    resolute,
  };
}

// ============================================================================
// Inverse conditions (predicate-aware — the core of Reverse Hypothesis)
// ============================================================================

export function buildInverseConditions(
  interpretation: Interpretation,
): InverseCondition[] {
  const { predicate, subject, object } = interpretation;
  if (!subject) return [];

  switch (predicate) {
    case "TRANSFER": {
      const window = interpretation.temporal
        ? ` ${temporalLabel(interpretation.temporal)}`
        : "";
      return [
        {
          kind: "REVERSE_DIRECTION",
          predicate,
          description: `the same pair moved money the other way (${object?.label ?? "the counterparty"} → ${
            subject.label
          })${window}`,
          contradicting: true,
          reason:
            "A reverse-direction movement on the same pair in the same window rebuts the asserted direction.",
        },
        {
          kind: "DIFFERENT_DESTINATION",
          predicate,
          description: `funds moved from ${subject.label} to a different destination than ${
            object?.label ?? "the claimed recipient"
          }${window}`,
          contradicting: false,
          reason:
            "A distinct destination is a separate transfer. Without an asserted exclusivity, A→C does not rebut A→B.",
        },
        {
          kind: "DIFFERENT_SENDER",
          predicate,
          description: `funds arrived at ${
            object?.label ?? "the recipient"
          } from a different sender than ${subject.label}${window}`,
          contradicting: false,
          reason:
            "A different sender is not a rebuttal — the tested inbound may still exist alongside it.",
        },
        {
          kind: "EXPLICIT_NEGATION",
          predicate,
          description: "a record explicitly states no such transfer occurred",
          contradicting: true,
          reason:
            "An explicit negation is direct rebuttal of the assertion (absence is not).",
        },
      ];
    }
    case "LOCATED_AT":
      return [
        {
          kind: "DIFFERENT_LOCATION",
          predicate,
          description: `${subject.label} or ${
            object?.label ?? "a counterparty"
          } is recorded at a different address`,
          contradicting: true,
          reason:
            "Two different addresses for the same entity/pair in overlapping time is a genuine contradiction (registry-confirmed).",
        },
        {
          kind: "EXPLICIT_NEGATION",
          predicate,
          description: "a record states the entities do not share a residential address",
          contradicting: true,
          reason: "An explicit negation directly rebuts a shared-address assertion.",
        },
      ];
    case "CONTACT":
      return [
        {
          kind: "EXPLICIT_NEGATION",
          predicate,
          description: "a record explicitly states there was no communication between the parties",
          contradicting: true,
          reason: "Only an explicit negation rebuts a contact assertion.",
        },
      ];
    case "OWNERSHIP":
      return [
        {
          kind: "DIFFERENT_SENDER",
          predicate,
          description: "a registry record lists a different owner for the target",
          contradicting: false,
          reason:
            "A different listed owner is not a rebuttal without exclusivity; the tested ownership may coexist.",
        },
        {
          kind: "EXPLICIT_NEGATION",
          predicate,
          description: "a registry record explicitly states the subject does not own or control the target",
          contradicting: true,
          reason: "An explicit registry negation directly rebuts the ownership assertion.",
        },
      ];
    case "OTHER":
      return [];
  }
}

// ============================================================================
// Direction extraction for financial observations
// ============================================================================

export function resolveBestAlias(text: string, catalog: readonly EntityAlias[]): string | undefined {
  const lower = text.toLowerCase();
  let bestId: string | undefined;
  let bestLength = -1;
  for (const entry of catalog) {
    for (const alias of entry.aliases) {
      if (alias.length >= 4 && alias.length > bestLength && lower.includes(alias)) {
        bestLength = alias.length;
        bestId = entry.id;
      }
    }
  }
  return bestId;
}

export interface TransferEdge {
  readonly fromId?: string;
  readonly toId?: string;
}

/** Extract a deterministic directional transfer edge from observation content.
 *  Falls back to the observation's primary entity when content states a
 *  receiver without naming it. */
export function extractTransferEdge(
  content: string,
  catalog: readonly EntityAlias[],
  primaryEntityId: string | undefined,
): TransferEdge {
  const received = content.match(
    /received\s+(?:[\w,.]+\s+)*from\s+([\w .'-]{2,}?)(?=\s+and|\s+within|\.|;|$)/i,
  );
  if (received && received[1]) {
    const from = resolveBestAlias(received[1], catalog);
    if (from) return { fromId: from, toId: primaryEntityId };
  }

  const transferred = content.match(
    /([\w .'-]{2,}?)\s+transferred\s+[\w,.%]+\s+to\s+([\w .'-]{2,}?)(?=\s+and|\.|;|$)/i,
  );
  if (transferred && transferred[1] && transferred[2]) {
    const from = resolveBestAlias(transferred[1], catalog);
    const to = resolveBestAlias(transferred[2], catalog);
    if (from && to) return { fromId: from, toId: to };
  }

  const passed = content.match(/passed\s+them\s+to\s+([\w .'-]{2,}?)(?=\s+and|\.|;|$)/i);
  if (passed && passed[1]) {
    const to = resolveBestAlias(passed[1], catalog);
    if (to) return { fromId: primaryEntityId, toId: to };
  }

  return {};
}

// ============================================================================
// Condition validation
// ============================================================================

export function observationReferences(
  observation: { readonly entityIds: readonly string[]; readonly content: string },
  entityId: string,
  catalog: readonly EntityAlias[],
): boolean {
  if (observation.entityIds.includes(entityId)) return true;
  const entry = catalog.find((e) => e.id === entityId);
  if (!entry) return false;
  const lower = observation.content.toLowerCase();
  return entry.aliases.some((alias) => alias.length >= 4 && lower.includes(alias));
}

function contentHasLocationMeaning(content: string): boolean {
  const lower = content.toLowerCase();
  return LOCATION_TOKENS.some((token) => lower.includes(token));
}

function contentAssertsSharedAddress(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("shared with") ||
    lower.includes("shared-address") ||
    lower.includes("same address") ||
    lower.includes("residential address shared")
  );
}

function contentIsExplicitNegation(content: string): boolean {
  const lower = content.toLowerCase();
  return NEGATION_VERBS.some((v) => lower.includes(v));
}

/** Does an observation fulfil one hypothesis condition? Deterministic. */
export function observationSupportsCondition(
  observation: {
    readonly id: string;
    readonly type: string;
    readonly content: string;
    readonly entityIds: readonly string[];
    readonly observedAt?: string;
  },
  condition: HypothesisCondition,
  catalog: readonly EntityAlias[],
): { supported: boolean; matchedConditions?: string[] } {
  if (!observationInWindow(observation.observedAt, condition.temporal)) {
    return { supported: false };
  }

  switch (condition.predicate) {
    case "TRANSFER": {
      if (observation.type !== "FINANCIAL") return { supported: false };
      const edge = extractTransferEdge(
        observation.content,
        catalog,
        observation.entityIds[0],
      );
      const supported =
        edge.fromId === condition.subject.id &&
        edge.toId === condition.object?.id &&
        edge.toId !== undefined;
      return supported
        ? { supported: true, matchedConditions: [condition.assertion] }
        : { supported: false };
    }
    case "LOCATED_AT": {
      const referencesSubject = observationReferences(observation, condition.subject.id, catalog);
      const referencesObject = condition.object
        ? observationReferences(observation, condition.object.id, catalog)
        : true;
      const locationMeaning = contentHasLocationMeaning(observation.content);
      const shared = contentAssertsSharedAddress(observation.content);
      if (
        referencesSubject &&
        referencesObject &&
        locationMeaning &&
        shared
      ) {
        return { supported: true, matchedConditions: [condition.assertion] };
      }
      return { supported: false };
    }
    case "CONTACT": {
      if (observation.type !== "COMMUNICATION") return { supported: false };
      const referencesSubject = observationReferences(observation, condition.subject.id, catalog);
      const referencesObject = condition.object
        ? observationReferences(observation, condition.object.id, catalog)
        : true;
      return referencesSubject && referencesObject
        ? { supported: true, matchedConditions: [condition.assertion] }
        : { supported: false };
    }
    case "OWNERSHIP": {
      if (observation.type !== "RELATIONAL" && observation.type !== "RECORD") {
        return { supported: false };
      }
      const referencesSubject = observationReferences(observation, condition.subject.id, catalog);
      const referencesObject = condition.object
        ? observationReferences(observation, condition.object.id, catalog)
        : true;
      const ownershipMeaning = /owns|owner|benefic|director|control|registry|filing/i.test(
        observation.content,
      );
      return referencesSubject && referencesObject && ownershipMeaning
        ? { supported: true, matchedConditions: [condition.assertion] }
        : { supported: false };
    }
    case "OTHER":
      return { supported: false };
  }
}

// ============================================================================
// Classification
// ============================================================================

export interface ObservationInput {
  readonly id: string;
  readonly type: string;
  readonly content: string;
  readonly entityIds: readonly string[];
  readonly observedAt?: string;
  readonly evidenceId?: string;
  readonly sourceId?: string;
}

export interface ClassificationResult {
  readonly supporting: EvidenceFinding[];
  readonly contradicting: EvidenceFinding[];
  readonly unresolved: EvidenceFinding[];
}

function finding(
  observation: ObservationInput,
  classification: EvidenceClassification,
  why: string,
  extra: Partial<EvidenceFinding> = {},
): EvidenceFinding {
  return {
    observationId: observation.id,
    type: observation.type,
    content: observation.content,
    entityIds: observation.entityIds,
    observedAt: observation.observedAt,
    evidenceId: observation.evidenceId,
    sourceId: observation.sourceId,
    classification,
    why,
    ...extra,
  };
}

function contradictionTypeFromRegistry(rawType: string): ContradictionType {
  switch (rawType) {
    case "DIRECT_REFUTATION":
    case "DIRECT_CONFLICT":
      return "DIRECT_CONFLICT";
    case "TEMPORAL_IMPOSSIBILITY":
    case "TEMPORAL_CONFLICT":
      return "TEMPORAL_CONFLICT";
    case "LOGICAL":
      return "OTHER";
    default:
      return "OTHER";
  }
}

/**
 * Retrieve and classify the pool of observations semantically in reach of the
 * hypothesis. Order is deterministic (input order preserved).
 *
 * Rules honored:
 *  - Only observations the hypothesis's semantics reach enter the pool.
 *  - AN observation is CONTRADICTING only via a real inverse match (explicit
 *    negation, reverse direction, or a canonical contradiction-record partner
 *    of a supporting observation). Everything else is unresolved.
 */
export function classifyReverseHypothesis(
  observations: readonly ObservationInput[],
  interpretation: Interpretation,
  catalog: readonly EntityAlias[],
  contradictions: readonly ContradictionRecord[] = [],
): ClassificationResult {
  const condition = interpretation.conditions[0];
  const subject = interpretation.subject;

  const supporting: EvidenceFinding[] = [];
  const contradicting: EvidenceFinding[] = [];
  const unresolved: EvidenceFinding[] = [];

  if (!condition || !subject) {
    return { supporting, contradicting, unresolved };
  }

  const inReach = (obs: ObservationInput): boolean => {
    const entityReach =
      observationReferences(obs, subject.id, catalog) ||
      (condition.object
        ? observationReferences(obs, condition.object.id, catalog)
        : false);
    if (condition.predicate === "LOCATED_AT") {
      return (
        entityReach &&
        (contentHasLocationMeaning(obs.content) ||
          contradictions.some(
            (c) => c.leftObservationId === obs.id || c.rightObservationId === obs.id,
          ))
      );
    }
    if (condition.predicate === "TRANSFER") {
      return obs.type === "FINANCIAL" && entityReach;
    }
    if (condition.predicate === "CONTACT") {
      return entityReach || obs.type === "COMMUNICATION";
    }
    if (condition.predicate === "OWNERSHIP") {
      return entityReach;
    }
    return entityReach;
  };

  const pool = observations.filter(inReach);

  const supportIds = new Set<string>();
  for (const obs of pool) {
    // Registry-confirmed pairs are classified by the contradiction branch, not
    // by fuzzy shared-address text matching (a refuting filing may mention the
    // same address line).
    if (
      condition.predicate === "LOCATED_AT" &&
      contradictions.some(
        (c) => c.leftObservationId === obs.id || c.rightObservationId === obs.id,
      )
    ) {
      continue;
    }
    const verdict = observationSupportsCondition(obs, condition, catalog);
    if (verdict.supported) {
      supporting.push(
        finding(
          obs,
          "SUPPORTING",
          condition.predicate === "TRANSFER"
            ? `Financial record in the window. Money moved ${condition.subject.label} → ${
                condition.object?.label ?? ""
              }, matching the structured assertion.`
            : `Observation references ${condition.subject.label}${
                condition.object ? ` and ${condition.object.label}` : ""
              } and asserts ${condition.assertion}.`,
          { matchedConditions: verdict.matchedConditions ?? [condition.assertion] },
        ),
      );
      supportIds.add(obs.id);
    }
  }

  // Contradicting passes — deterministic, never from absence.
  for (const obs of pool) {
    if (supportIds.has(obs.id)) continue;

    const negation = contentIsExplicitNegation(obs.content);
    if (negation) {
      contradicting.push(
        finding(
          obs,
          "CONTRADICTING",
          "The observation explicitly negates the asserted relationship.",
          {
            inverseMatch: {
              kind: "EXPLICIT_NEGATION",
              description: "explicit negation of the asserted relationship",
            },
            contradictionType: "EXPLICIT_NEGATION",
          },
        ),
      );
      continue;
    }

    if (condition.predicate === "TRANSFER") {
      const edge = extractTransferEdge(obs.content, catalog, obs.entityIds[0]);
      if (
        edge.fromId === condition.object?.id &&
        edge.toId === condition.subject.id &&
        observationInWindow(obs.observedAt, condition.temporal)
      ) {
        contradicting.push(
          finding(
            obs,
            "CONTRADICTING",
            `The same pair moved money the reverse direction (${
              condition.object?.label ?? ""
            } → ${condition.subject.label}) inside the same window.`,
            {
              inverseMatch: {
                kind: "REVERSE_DIRECTION",
                description: "reverse-direction movement on the same pair",
              },
              contradictionType: "DIRECTION_CONFLICT",
            },
          ),
        );
        continue;
      }

      if (
        edge.fromId === condition.subject.id &&
        edge.toId !== undefined &&
        edge.toId !== condition.object?.id &&
        observationInWindow(obs.observedAt, condition.temporal)
      ) {
        unresolved.push(
          finding(
            obs,
            "UNRESOLVED",
            `Financial observation in the window: funds left ${condition.subject.label} toward a distinct destination (${
              edge.toId ? labelOf(edge.toId, catalog) : "unidentified"
            }), not the tested recipient. A distinct destination is not a contradiction without an asserted exclusivity.`,
          ),
        );
        continue;
      }

      if (
        edge.fromId !== undefined &&
        edge.fromId !== condition.subject.id &&
        edge.toId === condition.object?.id
      ) {
        unresolved.push(
          finding(
            obs,
            "UNRESOLVED",
            `Financial observation in the window: funds reached ${
              condition.object?.label ?? ""
            } from a different sender (${
              labelOf(edge.fromId, catalog)
            }), not the tested source. A different sender is not counted as a contradiction.`,
          ),
        );
        continue;
      }

      unresolved.push(
        finding(
          obs,
          "UNRESOLVED",
          observationInWindow(obs.observedAt, condition.temporal)
            ? `Observation referencing ${condition.subject.label} that does not assert the tested ${
                condition.subject.label
              } → ${condition.object?.label ?? ""} transfer.`
            : `Observation referencing ${condition.subject.label} outside the tested window — not evaluated as support or rebuttal.`,
        ),
      );
      continue;
    }

    if (condition.predicate === "LOCATED_AT") {
      const registryHit = contradictions.find(
        (c) => c.leftObservationId === obs.id || c.rightObservationId === obs.id,
      );
      if (registryHit) {
        const partnerId =
          registryHit.leftObservationId === obs.id
            ? registryHit.rightObservationId
            : registryHit.leftObservationId;
        if (supportIds.has(partnerId)) {
          contradicting.push(
            finding(
              obs,
              "CONTRADICTING",
              `References ${condition.subject.label}; the canonical contradiction registry flags a ${registryHit.contradictionType} against a supporting filing. Two different addresses for the same entity/pair is a genuine contradiction.`,
              {
                inverseMatch: {
                  kind: "DIFFERENT_LOCATION",
                  description:
                    "a different recorded address for the same entity/pair",
                },
                contradictionType: contradictionTypeFromRegistry(
                  registryHit.contradictionType,
                ),
                canonicalContradictionId: registryHit.id,
              },
            ),
          );
          continue;
        }
        if (observationSupportsCondition(obs, condition, catalog).supported) {
          supporting.push(
            finding(
              obs,
              "SUPPORTING",
              `Observation references ${condition.subject.label}${
                condition.object ? ` and ${condition.object.label}` : ""
              } and asserts ${condition.assertion}.`,
              { matchedConditions: [condition.assertion] },
            ),
          );
          supportIds.add(obs.id);
          continue;
        }
      }
      unresolved.push(
        finding(
          obs,
          "UNRESOLVED",
          `Observation referencing ${condition.subject.label}${
            condition.object ? ` and ${condition.object.label}` : ""
          } that does not assert the shared-address condition. This is not evidence against it.`,
        ),
      );
      continue;
    }

    if (condition.predicate === "CONTACT") {
      unresolved.push(
        finding(
          obs,
          "UNRESOLVED",
          `Observation reaching ${condition.subject.label} that does not establish a matched contact claim. Not counted against the hypothesis.`,
        ),
      );
      continue;
    }

    if (condition.predicate === "OWNERSHIP") {
      unresolved.push(
        finding(
          obs,
          "UNRESOLVED",
          `Observation referencing ${condition.subject.label} that does not assert the structured ownership/control condition. Not counted against the hypothesis.`,
        ),
      );
      continue;
    }

    unresolved.push(
      finding(
        obs,
        "UNRESOLVED",
        `Observation referencing ${condition.subject.label} outside the structured condition. Absence of a match is not a contradiction.`,
      ),
    );
  }

  return { supporting, contradicting, unresolved };
}

function labelOf(entityId: string, catalog: readonly EntityAlias[]): string {
  return catalog.find((e) => e.id === entityId)?.label ?? entityId;
}

// ============================================================================
// Assessment assembly
// ============================================================================

function deriveStatus(
  supporting: readonly EvidenceFinding[],
  contradicting: readonly EvidenceFinding[],
): AssessmentStatus {
  const support = supporting.length > 0;
  const conflict = contradicting.length > 0;
  if (support && conflict) return "SUPPORTED_WITH_CONFLICT";
  if (support) return "SUPPORTED";
  if (conflict) return "CONTRADICTED";
  return "UNRESOLVED";
}

export interface AssessmentInput {
  readonly hypothesisText: string;
  readonly interpretation: Interpretation;
  readonly supporting: readonly EvidenceFinding[];
  readonly contradicting: readonly EvidenceFinding[];
  readonly unresolved: readonly EvidenceFinding[];
  readonly inverseConditions: readonly InverseCondition[];
  readonly generatedAt: string;
  readonly error?: HypothesisTestError;
}

export function assembleAssessment(input: AssessmentInput): HypothesisAssessment {
  const { interpretation } = input;
  const stages: RunStage[] = [];
  const notices: string[] = [];

  if (!interpretation.resolute) {
    stages.push(
      "INTERPRETING",
      "ERROR",
    );
    return {
      hypothesisText: input.hypothesisText,
      interpretation,
      status: null,
      error: "HYPOTHESIS_PARSE_ERROR",
      notices: ["HYPOTHESIS_PARSE_ERROR — the text could not be structured into a testable condition."],
      stages,
      supporting: [],
      contradicting: [],
      unresolved: [],
      inverseConditions: input.inverseConditions,
      retrieval: { pool: 0, supporting: 0, contradicting: 0, unresolved: 0 },
      generatedAt: input.generatedAt,
    };
  }

  const pool =
    input.supporting.length + input.contradicting.length + input.unresolved.length;

  if (pool === 0) {
    stages.push(
      "INTERPRETING",
      "RETRIEVING_SUPPORT",
      "BUILDING_INVERSE",
      "RETRIEVING_CONTRADICTION",
      "VALIDATING",
      "READY",
    );
    return {
      hypothesisText: input.hypothesisText,
      interpretation,
      status: "UNRESOLVED",
      error: "NO_SUPPORTING_EVIDENCE",
      notices: [
        "NO_SUPPORTING_EVIDENCE — no saved observation semantically reaches this hypothesis, so it cannot be tested. This absence is not evidence against it.",
      ],
      stages,
      supporting: [],
      contradicting: [],
      unresolved: [],
      inverseConditions: input.inverseConditions,
      retrieval: { pool: 0, supporting: 0, contradicting: 0, unresolved: 0 },
      generatedAt: input.generatedAt,
    };
  }

  const status = deriveStatus(input.supporting, input.contradicting);
  const support = input.supporting.length;
  const conflict = input.contradicting.length;

  if (support > 0 && conflict === 0) {
    notices.push(
      "NO_CONTRADICTING_EVIDENCE — no contradictory observation was found. Absence of contradiction is not evidence of truth.",
    );
  }
  if (support === 0 && conflict === 0 && pool < 2) {
    notices.push(
      "INSUFFICIENT_EVIDENCE — too few observations in scope to reach a meaningful classification.",
    );
  }

  stages.push(
    "INTERPRETING",
    "RETRIEVING_SUPPORT",
    "BUILDING_INVERSE",
    "RETRIEVING_CONTRADICTION",
    "VALIDATING",
    "READY",
  );

  return {
    hypothesisText: input.hypothesisText,
    interpretation,
    status,
    error: input.error,
    notices,
    stages,
    supporting: input.supporting,
    contradicting: input.contradicting,
    unresolved: input.unresolved,
    inverseConditions: input.inverseConditions,
    retrieval: {
      pool,
      supporting: support,
      contradicting: conflict,
      unresolved: input.unresolved.length,
    },
    generatedAt: input.generatedAt,
  };
}