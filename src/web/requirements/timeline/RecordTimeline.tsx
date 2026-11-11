import { Button, Grid, Timeline } from 'antd';
import { Markdown } from '../../reading/Markdown.js';
import { date } from '../StatusTag.js';
import type { Inspection } from '../HistoryReader.js';
import type { RecordView } from '../../../contracts/requirements-http.js';
import './timeline.css';

function RecordTime({ record }: { record: RecordView }) {
  return (
    <div className="progress-time">
      {record.content.occurredAt === null ? (
        <span>发生时间未知</span>
      ) : (
        <time dateTime={new Date(record.content.occurredAt).toISOString()}>
          {date(record.content.occurredAt)}
        </time>
      )}
      <span className="progress-captured">收录于 {date(record.createdAt)}</span>
    </div>
  );
}

export function RecordTimeline({
  records,
  onInspect,
}: {
  records: RecordView[];
  onInspect: (target: Inspection) => void;
}) {
  const { md } = Grid.useBreakpoint();
  return (
    <Timeline
      className="requirements-timeline"
      {...(md ? { titleSpan: '8em' } : {})}
      items={records.map((record) => ({
        key: record.id,
        color: 'var(--ds-color-accent-solid)',
        title: md ? <RecordTime record={record} /> : undefined,
        content: (
          <article className="progress-record" aria-label={record.content.title}>
            {!md && <RecordTime record={record} />}
            <h3>{record.content.title}</h3>
            <Markdown text={record.content.markdown} headingStart={4} />
            <div className="progress-record-actions">
              {record.revisionNo > 1 && (
                <span className="requirement-meta">
                  第 {record.revisionNo} 版 · 修订于 {date(record.savedAt)}
                </span>
              )}
              <Button
                type="link"
                size="small"
                onClick={() => onInspect({ type: 'record', id: record.id })}
              >
                修订历史与来源
              </Button>
            </div>
          </article>
        ),
      }))}
    />
  );
}
