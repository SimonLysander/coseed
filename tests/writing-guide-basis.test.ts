import { expect, it } from 'vitest';
import { writingTopics, writingBasis } from '../src/web/writing-guide/content.js';

it('does not promote document evidence into confirmed user decisions', () => {
  const agreements = writingTopics.flatMap((topic) =>
    topic.sections.flatMap((section) => section.agreements),
  );
  const document = agreements.find((agreement) => agreement.source.kind === 'document')!;
  const conversation = agreements.find((agreement) => agreement.source.kind === 'conversation')!;
  expect(writingBasis([document])).toBe('文档记录；原始确认待核对');
  expect(writingBasis([document, conversation])).toBe('含用户原话；文档细节待核对');
  expect(writingBasis([conversation])).toBe('可见用户原话');
  expect(writingBasis([])).toBe('缺少依据，待核对');
});
