const day = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short' });
const clock = new Intl.DateTimeFormat('zh-CN', { timeStyle: 'short' });

export function TimelineTime({ label, value }: { label: string; value: number }) {
  return (
    <div className="timeline-time-entry">
      <span className="timeline-time-label">{label}</span>
      <time className="timeline-time-value" dateTime={new Date(value).toISOString()}>
        <span>{day.format(value)}</span>
        <span>{clock.format(value)}</span>
      </time>
    </div>
  );
}
