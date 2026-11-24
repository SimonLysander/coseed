import {
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer,
} from '@modelcontextprotocol/server';
import type { ProjectContentService } from '../../modules/project-content/project-content.service.js';
import { ContentError } from '../../modules/project-content/errors.js';
import { textChunk } from './chunks.js';
import { ProjectView, projectAddress, segment } from './project-view.js';

function resolveAddress(uri: URL) {
  const match = /^coseed:\/\/projects\/([^/]+)\/(current|v(0|[1-9]\d*)\/.+)$/.exec(uri.href);
  if (!match) throw new ContentError('NOT_FOUND', '资源地址不属于项目目录。');
  const token = match[1]!;
  const projectId = token.startsWith('~')
    ? Buffer.from(token.slice(1), 'base64url').toString('utf8')
    : token;
  const version = match[3] === undefined ? undefined : Number(match[3]);
  if (
    !projectId ||
    segment(projectId) !== token ||
    (version !== undefined && !Number.isSafeInteger(version))
  )
    throw new ContentError('NOT_FOUND', '项目或版本无效。');
  return { projectId, version };
}

export function readsSource(uri: string) {
  return /\/sources$|\/source\/[^/]+$/.test(uri);
}
export function registerProjectResources(
  server: McpServer,
  projects: ProjectContentService,
  allowedProject: string,
) {
  const read = (uri: URL) => {
    try {
      const { projectId, version } = resolveAddress(uri);
      if (projectId !== allowedProject) throw new ContentError('NOT_FOUND', '资源不存在。');
      const view = new ProjectView(
        projects.readSnapshot(projectId, version, { includeSources: readsSource(uri.href) }),
      );
      const body = version === undefined ? view.index() : view.read(uri.href);
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(body) }],
      };
    } catch (error) {
      if (error instanceof ContentError && ['NOT_FOUND', 'INVALID_INPUT'].includes(error.code))
        throw new ResourceNotFoundError(uri.href);
      throw error;
    }
  };
  const metadata = { mimeType: 'application/json' };
  server.registerResource(
    'project-current',
    new ResourceTemplate('coseed://projects/{projectId}/current', {
      list: () => ({
        resources: projects.listProjects({ projectId: allowedProject }).map((p) => ({
          uri: projectAddress(p.id),
          name: p.name,
          description: '打开项目当前目录，取得固定版本的资料入口。',
        })),
      }),
    }),
    { ...metadata, description: '当前项目资料目录。' },
    read,
  );
  server.registerResource(
    'project-section',
    new ResourceTemplate('coseed://projects/{projectId}/v{version}/{section}', { list: undefined }),
    { ...metadata, description: '固定版本目录或综述。section 取自项目目录。' },
    read,
  );
  server.registerResource(
    'project-object',
    new ResourceTemplate('coseed://projects/{projectId}/v{version}/{type}/{id}', {
      list: undefined,
    }),
    { ...metadata, description: '固定版本的项目对象、完整图或来源。使用目录返回的 URI。' },
    read,
  );
}

export function readResourceBatch(
  view: ProjectView,
  items: { uri: string; offset: number }[],
  budget: number,
) {
  let remaining = budget;
  const results = items.map(({ uri, offset }) => {
    try {
      if (!uri.startsWith(view.root + '/'))
        throw new ContentError('INVALID_REFERENCE', '地址必须属于指定项目和固定版本。');
      const chunk = textChunk(JSON.stringify(view.read(uri)), offset, remaining);
      remaining -= chunk.chunkBytes;
      return { uri, offset, ...chunk };
    } catch (error) {
      if (error instanceof ContentError)
        return { uri, error: { code: error.code, message: error.message } };
      throw error;
    }
  });
  return { projectId: view.snapshot.projectId, version: view.snapshot.version, items: results };
}
