// ============================================================================
// PR-24 golden corpus — "Operation Financial Shadow" (synthetic, fictional).
//
// Each entry is the exact sequence of MERGED UNITS emitted by the PDF parser
// for one evidence document, as recorded in the corpus ground truth. The suite
// runs these through the real deterministic MA06 → MA07 pipeline, so this
// fixture is the single source of truth for the golden assertions.
//
// The mojibake sequences are written as explicit escapes on purpose: they are
// the legacy-codepage decoding of UTF-8 arrows/quotes that the repair pass must
// normalize, and the fixture must exercise them verbatim.
// ============================================================================

export interface GoldenDocument {
  readonly key: string;
  readonly title: string;
  readonly lines: readonly string[];
  /** Assertive observations expected AFTER PR-24 retention/boilerplate fixes. */
  readonly expectedObservationCount: number;
}

const ARROW = '\u0393\u00E5\u00C6'; // -> →
const LQUOTE = '\u0393\u00C7\u00A3'; // -> “
const RQUOTE = '\u0393\u00C7\u00A5'; // -> ”
const APOS = '\u0393\u00C7\u00D6'; // -> ’

export const GOLDEN_BANNER =
  'SYNTHETIC TEST EVIDENCE - FICTIONAL DATA CREATED FOR INDAGO SOFTWARE TESTING. ' +
  'NOT A REAL PERSON, COMPANY, ACCO Page 1';

/**
 * Case-scoped identity census (PR-31, FIX 2) for the golden case.
 *
 * Mirrors what the platform maps into the M-A07 gazetteer from the payload's
 * optional `identityRoster` — the shared curator-supplied universe of persons,
 * organizations and ledger references. It seeds GAZETTEER_MATCH recognition
 * (recall) only; it never authorizes an entity or bypasses resolution.
 */
export const GOLDEN_IDENTITY_ROSTER: readonly {
  readonly text: string;
  readonly entityType: 'PERSON' | 'ORGANIZATION' | 'ACCOUNT';
}[] = [
  // Named principals
  { text: 'Arjun Mehta', entityType: 'PERSON' },
  { text: 'Neha Kapoor', entityType: 'PERSON' },
  { text: 'Rohan Singh', entityType: 'PERSON' },
  // Organizations
  { text: 'Orion Exports', entityType: 'ORGANIZATION' },
  { text: 'Orion Exports Pvt. Ltd', entityType: 'ORGANIZATION' },
  { text: 'Meridian Trading LLP', entityType: 'ORGANIZATION' },
  { text: 'Blue Dusk Logistics', entityType: 'ORGANIZATION' },
  { text: 'Northstar Warehousing', entityType: 'ORGANIZATION' },
  // Ledger / account references
  { text: 'AX-4471', entityType: 'ACCOUNT' },
  { text: 'ORX-102', entityType: 'ACCOUNT' },
  { text: 'MT-883', entityType: 'ACCOUNT' },
  { text: 'BDL-210', entityType: 'ACCOUNT' },
  { text: 'NW-009', entityType: 'ACCOUNT' },
];

export const GOLDEN_DOCUMENTS: readonly GoldenDocument[] = [
  {
    key: 'bank',
    title: 'Evidence 01 - Bank Transfer Report',
    expectedObservationCount: 33,
    lines: [
      GOLDEN_BANNER,
      'Evidence 01 - Bank Transfer Report',
      'Case: Operation Financial Shadow | Evidence ID: FS-EV-001',
      'Source: Synthetic bank operations export. The report summarizes transactions observed in a controlled test dataset',
      'Transaction register',
      'Timestamp Originator Destination Amount Reference',
      '2026-08-07 09:14 Arjun Mehta / AX-4471 Orion Exports / ORX-102 INR 185,000 Invoice 7842',
      '2026-08-10 11:26 Orion Exports /',
      'ORX-102',
      'Meridian Trading LLP /',
      'MT-883',
      'INR 1,850,000 MT-SET-119',
      '2026-08-12 10:03 Arjun Mehta / AX-4471 Meridian Trading LLP /',
      'MT-883',
      'INR 640,000 Consulting advance',
      '2026-08-12 13:41 Meridian Trading LLP /',
      'MT-883',
      'Blue Dusk Logistics /',
      'BDL-210',
      'INR 615,000 BLD-551',
      '2026-08-12 15:08 Blue Dusk Logistics /',
      'BDL-210',
      'Northstar Warehousing /',
      'NW-009',
      'INR 598,000 NW-882',
      '2026-08-18 16:22 Arjun Mehta / AX-4471 Meridian Trading LLP /',
      'MT-883',
      'INR 320,000 Refund adjustment',
      'Account notes',
      'Account AX-4471 is listed under Arjun Mehta . Account ORX-102 is associated with Orion Exports Pvt. Ltd. . Account',
      'MT-883 is associated with Meridian Trading LLP . Account BDL-210 is associated with Blue Dusk Logistics . Account',
      'NW-009 is associated with Northstar Warehousing',
      `The cluster on 2026-08-12 contains three outward transfers within approximately five hours: AX-4471 ${ARROW} MT-883`,
      `MT-883 ${ARROW} BDL-210; BDL-210 ${ARROW} NW-009`,
    ],
  },
  {
    key: 'comms',
    title: 'Evidence 02 - Communications Log',
    expectedObservationCount: 21,
    lines: [
      GOLDEN_BANNER,
      'Evidence 02 - Communications Log',
      'Case: Operation Financial Shadow | Evidence ID: FS-EV-002',
      'Call records',
      'Timestamp From To Duration / Note',
      '2026-08-11 18:42 Arjun Mehta Neha Kapoor 12m 14s',
      '2026-08-12 09:51 Arjun Mehta Neha Kapoor 4m 08s',
      '2026-08-12 14:02 Neha Kapoor Rohan Singh 7m 32s',
      '2026-08-12 14:17 Neha Kapoor Blue Dusk Logistics 3m 44s',
      '2026-08-13 09:03 Arjun Mehta Blue Dusk Logistics 2m 19s',
      '2026-08-18 15:47 Arjun Mehta Neha Kapoor 9m 51s',
      'Email excerpts',
      `2026-08-12 09:58 - Arjun Mehta ${ARROW} Neha Kapoor: ${LQUOTE}The 640,000 advance is released. Please confirm the warehouse`,
      `booking before 15:00.${RQUOTE}`,
      `2026-08-12 14:10 - Neha Kapoor ${ARROW} Rohan Singh: ${LQUOTE}BDL has confirmed the onward booking. Use the same reference`,
      `family as MT-SET-119.${RQUOTE}`,
      `2026-08-18 16:05 - Arjun Mehta ${ARROW} Neha Kapoor: ${LQUOTE}The refund adjustment is now visible on AX-4471. Keep the`,
      `original invoice reference in the notes.${RQUOTE}`,
      'Recorded statement',
      `A synthetic interview note dated 2026-08-19 records Arjun Mehta stating: ${LQUOTE}I did not speak with Neha Kapoor on`,
      `2026-08-12; the 640,000 payment was a routine consulting advance.${RQUOTE} This statement conflicts with the call record at`,
      '09:51 and the 09:58 email excerpt',
    ],
  },
  {
    key: 'invoice',
    title: 'Evidence 03 - Vendor Invoice & Meeting Memo',
    expectedObservationCount: 17,
    lines: [
      GOLDEN_BANNER,
      'Evidence 03 - Vendor Invoice & Meeting Memo',
      'Case: Operation Financial Shadow | Evidence ID: FS-EV-003',
      'Invoice 7842',
      'Issuer: Orion Exports Pvt. Ltd',
      'Contact: Arjun Mehta',
      'Recipient: Meridian Trading LLP',
      'Amount: INR 1,850,000',
      'Invoice date: 2026-08-10',
      'Reference: MT-SET-119',
      'Meeting note',
      'On 2026-08-12 at 08:30 , a synthetic logistics memo records a meeting at Sector 18, Gurugram involving Arjun',
      'Mehta , Neha Kapoor , and Rohan Singh . The stated topic was warehouse allocation for material linked to reference',
      'MT-SET-119',
      'Conflict note',
      `A separate internal note dated 2026-08-13 says the INR 640,000 transfer on 2026-08-12 was described as a ${LQUOTE}routine`,
      `consulting advance,${RQUOTE} while the contemporaneous communication says it was connected to a warehouse booking. This`,
      'is intentionally included as a contradiction for hypothesis testing',
    ],
  },
  {
    key: 'summary',
    title: 'Evidence 04 - Investigator Summary',
    expectedObservationCount: 19,
    lines: [
      GOLDEN_BANNER,
      'Evidence 04 - Investigator Summary',
      'Case: Operation Financial Shadow | Evidence ID: FS-EV-004',
      'Known observations',
      '1. Arjun Mehta is linked to account AX-4471. 2. Neha Kapoor appears in communications with Arjun and Rohan Singh',
      '3. Meridian Trading LLP is associated with account MT-883. 4. Blue Dusk Logistics is associated with account',
      'BDL-210. 5. Northstar Warehousing is associated with account NW-009',
      'Potential relation hypotheses',
      '- Arjun Mehta paid Meridian Trading LLP on 2026-08-12',
      '- Meridian Trading LLP paid Blue Dusk Logistics shortly afterward',
      '- Blue Dusk Logistics paid Northstar Warehousing later the same day',
      '- Neha Kapoor communicated with Arjun Mehta and Blue Dusk Logistics around the same transaction cluster',
      '- Rohan Singh coordinates Northstar Warehousing',
      'Alternative explanations to preserve',
      'Alternative 1: the payments form an ordinary vendor/warehouse settlement chain. Alternative 2: the payments were',
      'coordinated for a specific logistical purpose but are not, by themselves, proof of wrongdoing. Alternative 3: the',
      'communication links reflect routine vendor coordination',
      'Contradiction to test',
      `Arjun Mehta${APOS}s 2026-08-19 statement that he did not speak with Neha Kapoor on 2026-08-12 conflicts with the 09:51`,
      'call record and the 09:58 email excerpt',
    ],
  },
];
