import { createReadingMarkdown } from '../reading/create-markdown.js';
import source from '../../../docs/operations/agent-integration.md?raw';
import localDevelopmentUrl from '../../../docs/operations/local-development.md?url';

const markdown = createReadingMarkdown();
const renderLink = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  const token = tokens[index]!;
  // Repository references need a bundled asset URL in the installed application.
  if (token.attrGet('href') === 'local-development.md') {
    token.attrSet('href', localDevelopmentUrl);
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
    token.attrSet('title', '打开本地开发说明（Markdown）');
  }
  return renderLink
    ? renderLink(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options);
};

const tokens = markdown.parse(source, {});
export const guideTitle = tokens.find((token, index) => tokens[index - 1]?.tag === 'h1')!.content;
const introductionStart =
  tokens.findIndex((token) => token.type === 'heading_close' && token.tag === 'h1') + 1;
const introductionEnd = tokens.findIndex(
  (token) => token.type === 'heading_open' && token.tag === 'h2',
);
export const guideIntroductionHtml = markdown.renderer.render(
  tokens.slice(introductionStart, introductionEnd),
  markdown.options,
  {},
);

export type GuideSection = { id: string; title: string; headingId: string; html: string };
const sections: GuideSection[] = [];
let start = -1;
let step = 0;

function finish(end: number) {
  if (start < 0) return;
  const section = sections.at(-1)!;
  section.html = markdown.renderer.render(tokens.slice(start, end), markdown.options, {});
}

for (const [index, token] of tokens.entries()) {
  if (token.type === 'hr') {
    finish(index);
    start = -1;
    break;
  }
  if (token.type === 'heading_open' && token.tag === 'h2') {
    finish(index);
    start = index;
    step = 0;
    const id = `guide-section-${sections.length + 1}`;
    const headingId = `${id}-heading`;
    token.attrSet('id', headingId);
    sections.push({
      id,
      headingId,
      title: tokens[index + 1]!.content.replace(/^\d+\.\s*/, ''),
      html: '',
    });
  } else if (token.type === 'heading_open' && token.tag === 'h3' && start >= 0) {
    token.attrSet('id', `${sections.at(-1)!.id}-step-${++step}`);
  }
}
finish(tokens.length);

export const guideSections = sections;
export const guideText = source;
export const guideHref = (id: string) => `#/agent-guide/${id}`;
