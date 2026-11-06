/** Compatibility entry for design examples; runtime contracts are authoritative. */
export {
  requirementStatusSchema as requirementStatusDraftSchema,
  type RequirementStatus as RequirementStatusDraft,
  requirementStatusLabels,
  requirementContentSchema as requirementContentDraftSchema,
  progressRecordContentSchema as progressRecordContentDraftSchema,
  retrospectiveContentSchema as retrospectiveContentDraftSchema,
  type RequirementContent as RequirementContentDraft,
  type ProgressRecordContent as ProgressRecordContentDraft,
  type RetrospectiveContent as RetrospectiveContentDraft,
} from '../../src/contracts/content/requirements.js';
