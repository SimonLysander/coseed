import { useMemo } from 'react';
import { renderContentMarkdown, type ContentHeadingLevel } from './render-markdown.js';
import './reading.css';

export function Markdown({
  text,
  headingStart = 3,
}: {
  text: string;
  headingStart?: ContentHeadingLevel;
}) {
  const html = useMemo(() => renderContentMarkdown(text, headingStart), [text, headingStart]);
  return <div className="reading-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
