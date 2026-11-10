import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { request } from '../data/http.js';
import {
  requirementsResponseSchema,
  requirementResponseSchema,
  recordsResponseSchema,
  historyResponseSchema,
  revisionResponseSchema,
} from '../../contracts/requirements-http.js';
import type { RequirementStatus } from '../../contracts/content/requirements.js';

export const requirementsPath = (projectId: string, requirementId?: string) =>
  `/projects/${encodeURIComponent(projectId)}/requirements${requirementId ? `/${encodeURIComponent(requirementId)}` : ''}`;
const api = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
export function requirementsQuery(
  projectId: string,
  name: string,
  status: RequirementStatus | 'all',
) {
  return infiniteQueryOptions({
    queryKey: ['projects', projectId, 'requirements', 'list', name, status],
    initialPageParam: null as { version: number; afterId: string } | null,
    queryFn: ({ signal, pageParam }) => {
      const query = new URLSearchParams({ limit: '30' });
      if (name.trim()) query.set('name', name.trim());
      if (status !== 'all') query.set('status', status);
      if (pageParam) {
        query.set('version', String(pageParam.version));
        query.set('afterId', pageParam.afterId);
      }
      return request(`${api(projectId)}/requirements?${query}`, requirementsResponseSchema, {
        signal,
      });
    },
    getNextPageParam: (page) =>
      page.nextAfterId ? { version: page.project.version, afterId: page.nextAfterId } : undefined,
  });
}
export const requirementQuery = (projectId: string, requirementId: string) =>
  queryOptions({
    queryKey: ['projects', projectId, 'requirements', requirementId],
    queryFn: ({ signal }) =>
      request(
        `${api(projectId)}/requirements/${encodeURIComponent(requirementId)}`,
        requirementResponseSchema,
        { signal },
      ),
  });
export const recordsQuery = (projectId: string, requirementId: string, version: number) =>
  infiniteQueryOptions({
    queryKey: ['projects', projectId, 'requirements', requirementId, 'records', version],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) => {
      const query = new URLSearchParams({ version: String(version), limit: '30' });
      if (pageParam) query.set('afterId', pageParam);
      return request(
        `${api(projectId)}/requirements/${encodeURIComponent(requirementId)}/records?${query}`,
        recordsResponseSchema,
        { signal },
      );
    },
    getNextPageParam: (page) => page.nextAfterId ?? undefined,
  });
export const historyQuery = (
  projectId: string,
  type: 'requirement' | 'record',
  id: string,
  version: number,
) =>
  infiniteQueryOptions({
    queryKey: ['projects', projectId, 'requirements-history', type, id, version],
    initialPageParam: null as number | null,
    queryFn: ({ signal, pageParam }) => {
      const query = new URLSearchParams({ version: String(version), limit: '20' });
      if (pageParam !== null) query.set('beforeRevision', String(pageParam));
      return request(
        `${api(projectId)}/history/${type}/${encodeURIComponent(id)}?${query}`,
        historyResponseSchema,
        { signal },
      );
    },
    getNextPageParam: (page) => page.nextBeforeRevision ?? undefined,
  });
export const revisionQuery = (
  projectId: string,
  type: 'requirement' | 'record',
  id: string,
  revisionNo: number,
  version: number,
) =>
  queryOptions({
    queryKey: ['projects', projectId, 'requirements-revision', type, id, revisionNo, version],
    queryFn: ({ signal }) =>
      request(
        `${api(projectId)}/history/${type}/${encodeURIComponent(id)}/revisions/${revisionNo}?version=${version}`,
        revisionResponseSchema,
        { signal },
      ),
  });
