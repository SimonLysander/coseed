import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

// Project material is content, never executable HTML. markdown-it also rejects unsafe link schemes.
const markdown = new MarkdownIt({ html: false, linkify: false });

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => markdown.render(text), [text]);
  return <div className="reading-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
