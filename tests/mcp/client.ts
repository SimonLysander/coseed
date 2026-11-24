import { createTestProject, issueTestKey } from '../../scripts/testing/project-mcp.js';
import { expect } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApplication } from '../../dist/server/application.js';
import { mcpResultSchema } from '../../src/contracts/mcp.js';

export const source = (
  id = '$evidence',
  rawText = 'Fictional test evidence.\r\n Not real project history. 中文。',
) => ({ id, kind: 'document', rawText, occurredAt: null });
export const cite = (sourceId = '$evidence', side = 'after') => [
  {
    sourceId,
    side,
    path: '',
    explanationMd: 'Fictional test material covers the complete change.',
  },
];
export const group = (route: string, input: unknown, citations = cite()) => ({
  route,
  input,
  citations,
});

export async function startTestMcp(directory: string, previousKey?: string) {
  const app = await createApplication(
    { host: '127.0.0.1', port: 0, dataDir: directory, logLevel: 'silent' },
    { serveWeb: false },
  );
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const client = new Client({ name: 'fictional-test-client', version: '0.0.0' });
  let key =
    previousKey ??
    (await issueTestKey(base, (await createTestProject(base, 'Test connection')).projectId)).key;
  async function createProject(name: string) {
    const project = await createTestProject(base, name);
    key = (await issueTestKey(base, project.projectId)).key;
    return project;
  }
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', base), {
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set('Authorization', 'Bearer ' + key);
        return fetch(url, { ...init, headers });
      },
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const raw = await client.callTool({ name, arguments: args });
    const result = mcpResultSchema.parse(raw.structuredContent);
    expect(Boolean(raw.isError)).toBe(Boolean(result.error));
    const text = raw.content?.find((part) => part.type === 'text');
    expect(text && 'text' in text ? JSON.parse(text.text) : null).toEqual(result);
    return result;
  };
  const data = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(name, args);
    expect(result.error, JSON.stringify(result.error)).toBeUndefined();
    return result.data as Record<string, any>;
  };
  return { app, base, client, call, data, createProject, currentKey: () => key };
}
