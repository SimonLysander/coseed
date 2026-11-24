import { Grid, Timeline } from 'antd';
import { Link } from 'react-router';
import { requirementsPath } from '../queries.js';
import { StatusTag, date } from '../StatusTag.js';
import { ConcernTag } from '../ConcernTag.js';
import { foundations } from '../../design-system/tokens.js';
import { contentPreview } from '../../reading/render-markdown.js';
import type { RequirementsResponse } from '../../../contracts/requirements-http.js';
import { TimelineTime } from './TimelineTime.js';
import './timeline.css';

function RequirementTime({ value, scopeNames }: { value: number; scopeNames: string[] }) {
  return (
    <div className="progress-time">
      <TimelineTime label="创建于" value={value} />
      {scopeNames.length > 0 && (
        <span className="requirement-scope" aria-label="涉及范围">
          {scopeNames.join('、')}
        </span>
      )}
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
      {...(md ? { titleSpan: foundations.layout.timelineMetadataColumn } : {})}
      items={requirements.map((requirement) => ({
        key: requirement.id,
        color: 'var(--ds-color-accent-solid)',
        title: md ? (
          <RequirementTime value={requirement.createdAt} scopeNames={requirement.scopeNames} />
        ) : undefined,
        content: (
          <div className="requirement-subject">
            {!md && (
              <RequirementTime value={requirement.createdAt} scopeNames={requirement.scopeNames} />
            )}
            <Link className="requirement-list-row" to={requirementsPath(projectId, requirement.id)}>
              <div className="requirement-list-title">
                <div className="requirement-title-with-concern">
                  <span className="requirement-title-text">{requirement.title}</span>
                  <ConcernTag concern={requirement.primaryConcern} />
                </div>
                <StatusTag status={requirement.status} />
              </div>
              <p className="requirement-preview">{contentPreview(requirement.markdown)}</p>
              {requirement.recentRecords.length > 0 && (
                <div className="requirement-record-preview-group">
                  <span className="requirement-record-preview-heading">最近进展</span>
                  <ol className="requirement-record-previews" aria-label="最近进展记录">
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
