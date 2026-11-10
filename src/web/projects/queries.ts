import { queryOptions } from '@tanstack/react-query';
import {
  createProjectResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  projectOverviewResponseSchema,
  type CreateProjectRequest,
} from '../../contracts/projects-http.js';
import { request } from '../data/http.js';

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: ['projects', id, 'metadata'],
    queryFn: ({ signal }) =>
      request(`/api/projects/${encodeURIComponent(id)}`, projectResponseSchema, { signal }),
  });
export const overviewQuery = (id: string) =>
  queryOptions({
    queryKey: ['projects', id, 'overview'],
    queryFn: ({ signal }) =>
      request(`/api/projects/${encodeURIComponent(id)}/overview`, projectOverviewResponseSchema, {
        signal,
      }),
  });
export const listProjects = (name: string, afterId: string | null, signal: AbortSignal) => {
  const query = new URLSearchParams({ limit: '20' });
  if (name) query.set('name', name);
  if (afterId) query.set('afterId', afterId);
  return request(`/api/projects?${query}`, projectListResponseSchema, { signal });
};
export const createProject = (input: CreateProjectRequest) =>
  request('/api/projects', createProjectResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
export const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}/overview`;

export function readSelectedProject(): string | null {
  try {
    return localStorage.getItem('coseed:selected-project');
  } catch (error) {
    console.warn('无法读取项目选择偏好', error);
    return null;
  }
}
export function saveSelectedProject(id: string): void {
  try {
    localStorage.setItem('coseed:selected-project', id);
  } catch (error) {
    console.warn('无法保存项目选择偏好，当前链接仍可使用', error);
  }
}
