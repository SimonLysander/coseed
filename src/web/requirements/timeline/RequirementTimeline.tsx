import { Grid, Timeline } from 'antd';
import { Link } from 'react-router';
import { requirementsPath } from '../queries.js';
import { StatusTag, date } from '../StatusTag.js';
import { contentPreview } from '../../reading/render-markdown.js';
import type { RequirementsResponse } from '../../../contracts/requirements-http.js';
import './timeline.css';

function RequirementTime({ value }: { value: number }) {
  return (
    <div className="progress-time">
      <span>创建于</span>
      <time className="requirement-created-time" dateTime={new Date(value).toISOString()}>
        <span>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short' }).format(value)}</span>
        <span>{new Intl.DateTimeFormat('zh-CN', { timeStyle: 'short' }).format(value)}</span>
      </time>
    </div>
  );
}

export function RequirementTimeline({
  projectId,
  requirements,
}: {
  requirements: RequirementsResponse['items'];
  projectId: string;
}) {
  const { md } = Grid.useBreakpoint();
  return (
    <Timeline
      className="requirements-timeline requirements-subject-timeline"
      {...(md ? { titleSpan: '8em' } : {})}
      items={requirements.map((requirement) => ({
        key: requirement.id,
        color: 'var(--ds-color-accent-solid)',
        title: md ? <RequirementTime value={requirement.createdAt} /> : undefined,
        content: (
          <div className="requirement-subject">
            {!md && <RequirementTime value={requirement.createdAt} />}
            <Link className="requirement-list-row" to={requirementsPath(projectId, requirement.id)}>
              <div className="requirement-list-title">
                <span>{requirement.title}</span>
                <StatusTag status={requirement.status} />
              </div>
              <p className="requirement-preview">{contentPreview(requirement.markdown)}</p>
              {requirement.recentRecords.length > 0 && (
                <div className="requirement-record-preview-group">
                  <span className="requirement-record-preview-heading">最近记录</span>
                  <ol className="requirement-record-previews" aria-label="最近推进记录">
                    {requirement.recentRecords.map((record) => (
                      <li key={record.id}>
                        <span className="requirement-record-preview-title">{record.title}</span>
                        <p>{contentPreview(record.markdown)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="requirement-preview-footer">
                <span className="requirement-list-times requirement-meta">
                  更新于{' '}
                  <time dateTime={new Date(requirement.savedAt).toISOString()}>
                    {date(requirement.savedAt)}
                  </time>
                </span>
                {requirement.recordCount > 0 && (
                  <span className="requirement-preview-more">
                    查看全部 {requirement.recordCount} 条记录
                  </span>
                )}
              </div>
            </Link>
          </div>
        ),
      }))}
    />
  );
}
