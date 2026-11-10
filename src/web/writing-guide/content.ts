import catalog from '../../../docs/requirements/authoring-review/catalog.json' with { type: 'json' };
export const writingTopics = catalog.topics;
export type WritingTopic = (typeof writingTopics)[number];
export type Agreement = WritingTopic['sections'][number]['agreements'][number];
export const writingPath = (topic = 'overview', section?: string) =>
  `/writing-guide/${topic}${section ? `/${section}` : ''}`;

// Evidence origin is visible; a document reference does not prove user confirmation.
export function writingBasis(agreements: readonly Agreement[]) {
  if (!agreements.length) return '缺少依据，待核对';
  const hasConversation = agreements.some((agreement) => agreement.source.kind === 'conversation');
  const hasDocument = agreements.some((agreement) => agreement.source.kind === 'document');
  return hasDocument
    ? hasConversation
      ? '含用户原话；文档细节待核对'
      : '文档记录；原始确认待核对'
    : '可见用户原话';
}
