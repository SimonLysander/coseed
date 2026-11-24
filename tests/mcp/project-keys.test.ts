import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { createApplication } from '../../dist/server/application.js';
import {
  createTestProject,
  issueTestKey,
  projectTransport,
} from '../../scripts/testing/project-mcp.js';

describe('project MCP credentials', () => {
  it('requires a live Key on every request, reveals it once, and revokes only its own connection', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coseed-key-'));
    const app = await createApplication(
      { host: '127.0.0.1', port: 0, dataDir: dir, logLevel: 'silent' },
      { serveWeb: false },
    );
    const client = new Client({ name: 'isolated-fixture', version: '1' });
    try {
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const first = await createTestProject(base, 'Private A');
      const other = await createTestProject(base, 'Private B');
      const key = await issueTestKey(base, first.projectId);
      const backup = await issueTestKey(base, first.projectId);
      const foreignKey = await issueTestKey(base, other.projectId);
      const endpoint = (id: string) => `${base}/api/projects/${id}/mcp-keys`;
      const mcpHeaders = { Authorization: 'Bearer ' + key.key };
      expect((await fetch(base + '/api/projects', { headers: mcpHeaders })).status).toBe(403);
      expect(
        (await fetch(endpoint(other.projectId), { method: 'POST', headers: mcpHeaders })).status,
      ).toBe(403);
      const listing = await fetch(endpoint(first.projectId));
      expect(listing.headers.get('cache-control')).toBe('no-store');
      const publicKeys = (await listing.json()).items;
      expect(publicKeys.map((k: { id: string }) => k.id).sort()).toEqual(
        [key.id, backup.id].sort(),
      );
      for (const item of publicKeys)
        expect(Object.keys(item).sort()).toEqual(['createdAt', 'hint', 'id']);
      const disk = new Database(join(dir, 'coseed.sqlite'), { readonly: true });
      try {
        expect(
          disk.prepare('SELECT token_hash FROM project_mcp_keys WHERE id=?').pluck().get(key.id),
        ).toBe(createHash('sha256').update(key.key).digest('hex'));
      } finally {
        disk.close();
      }
      const ping = (token?: string, suffix = '') =>
        fetch(base + '/mcp' + suffix, {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
        });
      expect((await ping()).status).toBe(401);
      expect((await ping('invalid')).status).toBe(401);
      expect((await ping(undefined, '?key=' + key.key)).status).toBe(401);
      await client.connect(projectTransport(base, key.key));
      expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('create_project');
      expect((await client.listResources()).resources.map((r) => r.name)).toEqual(['Private A']);
      expect(
        (await fetch(endpoint(other.projectId) + '/' + key.id, { method: 'DELETE' })).status,
      ).toBe(404);
      await expect(client.ping()).resolves.toEqual({});
      expect(
        (await fetch(endpoint(first.projectId) + '/' + key.id, { method: 'DELETE' })).status,
      ).toBe(200);
      expect((await ping(key.key)).status).toBe(401);
      expect((await ping(backup.key)).status).toBe(200);
      expect((await ping(foreignKey.key)).status).toBe(200);
      expect((await (await fetch(base + '/api/projects')).json()).items).toHaveLength(2);
      expect(
        (await (await fetch(base + '/api/projects/' + first.projectId)).json()).project.version,
      ).toBe(0);
    } finally {
      await client.close();
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
