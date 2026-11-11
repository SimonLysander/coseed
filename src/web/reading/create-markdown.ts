import MarkdownIt from 'markdown-it';

export function createReadingMarkdown() {
  // markdown-it handles syntax and unsafe links; material never enables raw HTML.
  const markdown = new MarkdownIt({ html: false, linkify: false });
  markdown.renderer.rules.table_open = (tokens, index, options, _environment, renderer) =>
    '<div class="reading-table-scroll" role="region" aria-label="表格内容" tabindex="0">' +
    renderer.renderToken(tokens, index, options);
  markdown.renderer.rules.table_close = (tokens, index, options, _environment, renderer) =>
    renderer.renderToken(tokens, index, options) + '</div>\n';
  markdown.renderer.rules.th_open = (tokens, index, options, _environment, renderer) => {
    tokens[index]!.attrSet('scope', 'col');
    return renderer.renderToken(tokens, index, options);
  };
  return markdown;
}
