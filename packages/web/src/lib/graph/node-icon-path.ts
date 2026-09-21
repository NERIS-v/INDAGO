// ============================================================================
// Graph node iconography — single source of truth for the node SVG icons.
//
// The DEMO-visible icon set for graph entities lives here so the workspace
// GraphCanvas and the cinematic home opening's "network resolve" phase share
// one icon vocabulary. `getNodeIconPath` resolves a node's entity label to a
// 24×24 feather-style stroke path, exactly as the graph canvas renders it.
// ============================================================================

export const GRAPH_ICON_PATHS = {
  PERSON:
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  PHONE:
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  LOCATION:
    "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  ACCOUNT:
    "M3 21h18 M3 10h18 M5 6l7-3 7 3 M4 10v11 M20 10v11 M8 14v3 M12 14v3 M16 14v3",
  COMPANY:
    "M3 21h18 M9 8h1 M9 12h1 M9 16h1 M14 8h1 M14 12h1 M14 16h1 M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16",
  ORGANIZATION:
    "M18 10h-2m2-4h-2m4 8h-2m2-4h-6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z M8 6V4H3v16a2 2 0 0 0 2 2h4",
  AGENCY:
    "M9 12l2 2 4-4 M7.5 2h9L19 5l-1 2.5-.5 9.5L17 19l-2 3H9l-2-3 .5-2-.5-9.5L6 5l1.5-3z",
  DOCUMENT:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  DEFAULT: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z",
} as const;

const PERSON_KEYWORDS = [
  "PERSON",
  "VICTOR",
  "WITNESS",
  "CASTELLAN",
  "ALDRIDGE",
  "RICO",
  "CALLAHAN",
  "MCGUIGAN",
  "HITMAN",
  "MARIA",
  "DOWD",
  "FORRESTER",
  "WHEELER",
];
const ACCOUNT_KEYWORDS = ["BANK", "ACCOUNT", "VAULT", "WALLET", "EXCHANGE", "MIXING", "OFFSHORE"];
const AGENCY_KEYWORDS = ["FBI", "SOCTF", "TASK FORCE", "POLICE", "STATE", "AUTHORITY"];
const COMPANY_KEYWORDS = ["COMPANY", "LTD", "TRANSIT", "HOLDINGS", "JAI ALAI", "CORP"];
const ORG_KEYWORDS = ["GANG", "SYNDICATE", "RING", "ASSOCIATION", "CONSORTIUM"];

/** A node whose label resolves to one icon — structurally open so callers can
 *  pass a LayoutNode, a GraphNode, or any synthetic persona. */
export interface NodeIconSource {
  readonly type: string;
  readonly label?: string | null;
}

export function getNodeIconPath(node: NodeIconSource): string {
  if (node.type !== "ENTITY") return GRAPH_ICON_PATHS.DOCUMENT;
  const t = (node.label || "").toUpperCase();
  if (PERSON_KEYWORDS.some((k) => t.includes(k))) return GRAPH_ICON_PATHS.PERSON;
  if (t.includes("PHONE") || t.includes("SIM") || t.includes("+91")) return GRAPH_ICON_PATHS.PHONE;
  if (t.includes("LOCATION") || t.includes("ADDRESS") || t.includes("SOUTHERN HILLS") || t.includes("COUNTRY CLUB"))
    return GRAPH_ICON_PATHS.LOCATION;
  if (ACCOUNT_KEYWORDS.some((k) => t.includes(k))) return GRAPH_ICON_PATHS.ACCOUNT;
  if (AGENCY_KEYWORDS.some((k) => t.includes(k))) return GRAPH_ICON_PATHS.AGENCY;
  if (COMPANY_KEYWORDS.some((k) => t.includes(k))) return GRAPH_ICON_PATHS.COMPANY;
  if (ORG_KEYWORDS.some((k) => t.includes(k))) return GRAPH_ICON_PATHS.ORGANIZATION;
  if (["DOCUMENT", "FIR", "RECORD", "FILING"].some((k) => t.includes(k))) return GRAPH_ICON_PATHS.DOCUMENT;
  return GRAPH_ICON_PATHS.DEFAULT;
}