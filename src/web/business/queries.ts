import { queryOptions } from '@tanstack/react-query';
import { request } from '../data/http.js';
import {
  businessIndexResponseSchema,
  businessDiagramResponseSchema,
} from '../../contracts/business-http.js';
export const businessPath = (projectId: string, diagramId?: string, version?: number) =>
  `/projects/${encodeURIComponent(projectId)}/business${diagramId ? `/diagrams/${encodeURIComponent(diagramId)}` : ''}${version === undefined ? '' : `?version=${version}`}`;
export const businessIndexQuery = (projectId: string, version?: number) =>
  queryOptions({
    queryKey: ['projects', projectId, 'business-index', version ?? 'current'],
    queryFn: ({ signal }) =>
      request(
        `/api/projects/${encodeURIComponent(projectId)}/business${version === undefined ? '' : `?version=${version}`}`,
        businessIndexResponseSchema,
        { signal },
      ),
  });
export const businessDiagramQuery = (projectId: string, diagramId: string, version?: number) =>
  queryOptions({
    queryKey: ['projects', projectId, 'business-diagram', diagramId, version ?? 'current'],
    queryFn: ({ signal }) =>
      request(
        `/api/projects/${encodeURIComponent(projectId)}/business/diagrams/${encodeURIComponent(diagramId)}${version === undefined ? '' : `?version=${version}`}`,
        businessDiagramResponseSchema,
        { signal },
      ),
  });
