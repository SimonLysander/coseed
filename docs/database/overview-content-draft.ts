/** Compatibility entry for design examples; runtime contracts are authoritative. */
export {
  overviewConceptsSchema as overviewConceptsDraftSchema,
  overviewExamplesSchema as overviewExamplesDraftSchema,
  projectOverviewContentSchema as projectOverviewContentDraftSchema,
  projectOverviewDocumentSchema as projectOverviewDocumentDraftSchema,
  type ProjectOverviewContent as ProjectOverviewContentDraft,
  type ProjectOverviewDocument as ProjectOverviewDocumentDraft,
} from '../../src/contracts/content/overview.js';
