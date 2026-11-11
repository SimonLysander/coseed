import MarkdownIt from 'markdown-it';

// Project material is content, never executable HTML. markdown-it rejects unsafe link schemes.
const markdown = new MarkdownIt({ html: false, linkify: false });
export type ContentHeadingLevel = 3 | 4 | 5 | 6;

export function renderContentMarkdown(text: string, headingStart: ContentHeadingLevel = 3) {
  const tokens = markdown.parse(text, {});
  const highestHeading = tokens.reduce(
    (level, token) =>
      token.type === 'heading_open' ? Math.min(level, Number(token.tag.slice(1))) : level,
    6,
  );
  // Project Markdown is nested content. Preserve its relative heading order
  // while reserving page and section headings for the surrounding interface.
  for (const token of tokens) {
    if (token.type === 'heading_open' || token.type === 'heading_close') {
      token.tag = `h${Math.min(6, headingStart + Number(token.tag.slice(1)) - highestHeading)}`;
      if (token.type === 'heading_open') token.attrJoin('class', 'reading-content-heading');
    }
  }
  return markdown.renderer.render(tokens, markdown.options, {});
}
