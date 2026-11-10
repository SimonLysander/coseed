import catalog from '../../../docs/requirements/authoring-review/catalog.json' with { type: 'json' };
export const writingTopics = catalog.topics;
export type WritingTopic = (typeof writingTopics)[number];
export type Agreement = WritingTopic['sections'][number]['agreements'][number];
export const writingPath = (topic = 'overview', section?: string) =>
  `/writing-guide/${topic}${section ? `/${section}` : ''}`;
