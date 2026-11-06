/** Compatibility entry for design examples; runtime contracts are authoritative. */
export {
  businessEntityContentSchema as businessEntityContentDraftSchema,
  businessRelationshipContentSchema as businessRelationshipContentDraftSchema,
  technicalNoteContentSchema as technicalNoteContentDraftSchema,
  designDiagramContentSchema as designDiagramContentDraftSchema,
  businessDesignBundleSchema as businessDesignBundleDraftSchema,
  type BusinessDesignBundle as BusinessDesignBundleDraft,
} from '../../src/contracts/content/business-design.js';
