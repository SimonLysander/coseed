import {
  createProjectRequestSchema,
  type CreateProjectRequest,
} from '../../contracts/projects-http.js';

const key = 'coseed:pending-project-creation';
export function readPendingCreation(): CreateProjectRequest | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? createProjectRequestSchema.parse(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn('无法恢复待确认的项目创建请求', error);
    return null;
  }
}
export function keepPendingCreation(value: CreateProjectRequest | null): void {
  if (value) sessionStorage.setItem(key, JSON.stringify(value));
  else sessionStorage.removeItem(key);
}
