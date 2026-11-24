import { Tag } from 'antd';
import {
  requirementConcernLabels,
  type RequirementConcern,
} from '../../contracts/content/requirements.js';

export function ConcernTag({ concern }: { concern: RequirementConcern | undefined }) {
  return concern ? (
    <Tag className="requirement-concern">{requirementConcernLabels[concern]}</Tag>
  ) : null;
}
