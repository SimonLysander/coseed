import { z } from 'zod';
import { projectSummarySchema, projectIdSchema } from './projects-http.js';
import {
  businessDesignBundleSchema,
  designDiagramContentSchema,
} from './content/business-design.js';
const id = projectIdSchema;
export const diagramSummarySchema = z.strictObject({
  id,
  revisionNo: z.number().int().positive(),
  savedAt: z.number().int().nonnegative(),
  title: z.string(),
  scope: designDiagramContentSchema.shape.scope,
  scopeName: z.string(),
});
export const businessIndexResponseSchema = z.strictObject({
  project: projectSummarySchema,
  diagrams: z.array(diagramSummarySchema),
  landingDiagramId: id.nullable().describe('仅在恰好一张项目全景图时提供，不按名称猜测默认图'),
});
export const businessDiagramResponseSchema = z.strictObject({
  project: projectSummarySchema,
  diagram: diagramSummarySchema,
  bundle: businessDesignBundleSchema,
  sourcePaths: z.array(z.strictObject({ id, path: z.string().min(1) })),
  moduleDiagrams: z.array(diagramSummarySchema),
  projectDiagrams: z.array(diagramSummarySchema),
});
export type BusinessIndexResponse = z.infer<typeof businessIndexResponseSchema>;
export type BusinessDiagramResponse = z.infer<typeof businessDiagramResponseSchema>;
export type DiagramSummary = z.infer<typeof diagramSummarySchema>;
