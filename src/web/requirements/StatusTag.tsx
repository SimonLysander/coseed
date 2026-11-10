import { Tag } from 'antd';
import {
  requirementStatusLabels,
  type RequirementStatus,
} from '../../contracts/content/requirements.js';

export const date = (value: number) =>
  new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
export function StatusTag({ status }: { status: RequirementStatus }) {
  return (
    <Tag variant="filled" className={`requirement-status requirement-status-${status}`}>
      {requirementStatusLabels[status]}
    </Tag>
  );
}
