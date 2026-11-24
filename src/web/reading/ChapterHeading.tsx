import './reading.css';

export function ChapterHeading({ number, title }: { number: number; title: string }) {
  return (
    <h2 className="reading-chapter-heading">
      <span className="reading-chapter-number" aria-hidden="true">
        {number}
      </span>
      {title}
    </h2>
  );
}
