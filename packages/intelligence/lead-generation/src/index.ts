export {
  LEAD_IDENTITY_NAMESPACE,
  buildLeadIdentityKey,
  deterministicLeadId,
} from './identity.js';
export type { LeadIdentityInput } from './identity.js';

export { generateAlternativeExplanations } from './alternative-explanations.js';
export type { AlternativeExplanationContext } from './alternative-explanations.js';

export {
  buildBridgeLeadDraft,
  buildTemporalBurstLeadDraft,
  buildCommunityLeadDraft,
  buildCrossCaseLeadDraft,
} from './lead-drafts.js';
export type {
  EntityNameLookup,
  BridgeLeadCandidateInput,
  BuildBridgeLeadDraftParams,
  TemporalBurstLeadCandidateInput,
  BuildTemporalBurstLeadDraftParams,
  CommunityLeadCandidateInput,
  BuildCommunityLeadDraftParams,
  CrossCaseLeadCandidateInput,
  BuildCrossCaseLeadDraftParams,
} from './lead-drafts.js';
