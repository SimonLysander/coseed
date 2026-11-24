// For isolated smoke tests and contract generation. Provision through the same local Web API as the UI.
import { randomUUID } from 'node:crypto';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export async function createTestProject(
  base: string | URL,
  name: string,
  operationId: string = randomUUID(),
) {
  const response = await fetch(new URL('/api/projects', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, operationId }),
  });
  if (!response.ok) throw new Error(`Fixture project creation failed (${response.status})`);
  return (await response.json()) as {
    projectId: string;
    operationId: string;
    version: number;
    savedAt: number;
  };
}
export async function issueTestKey(base: string | URL, projectId: string) {
  const response = await fetch(
    new URL(`/api/projects/${encodeURIComponent(projectId)}/mcp-keys`, base),
    { method: 'POST' },
  );
  if (!response.ok) throw new Error(`Fixture key creation failed (${response.status})`);
  return (await response.json()) as { key: string; id: string; hint: string; createdAt: number };
}
export function projectTransport(base: string | URL, key: string) {
  return new StreamableHTTPClientTransport(new URL('/mcp', base), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
}
