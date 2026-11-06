import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApplication } from '../dist/server/application.js';
import { DatabaseService } from '../dist/server/database/database.service.js';
import { serviceStatusSchema } from '../src/contracts/service-status.js';

describe('built local service', () => {
  let directory: string;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let base: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coseed-service-'));
    app = await createApplication({
      host: '127.0.0.1',
      port: 0,
      dataDir: directory,
      logLevel: 'silent',
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('serves a status matching the shared contract and a real SQLite connection', async () => {
    const response = await fetch(`${base}/api/status`);
    expect(response.status).toBe(200);
    expect(serviceStatusSchema.parse(await response.json()).storage).toBe('ready');
    expect((await stat(join(directory, 'coseed.sqlite'))).isFile()).toBe(true);
    const database = app.get(DatabaseService);
    database.db.run('CREATE TABLE fixture (value TEXT NOT NULL)');
    database.db.run("INSERT INTO fixture (value) VALUES ('persistent')");
    const verification = new Database(join(directory, 'coseed.sqlite'), { readonly: true });
    try {
      expect(verification.prepare('SELECT value FROM fixture').get()).toEqual({
        value: 'persistent',
      });
    } finally {
      verification.close();
    }
  });

  it('serves the production page and its actual JavaScript asset', async () => {
    const response = await fetch(base);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('CoSeed');
    const script = html.match(/src="([^"]+\.js)"/)?.[1];
    expect(script).toBeTruthy();
    const asset = await fetch(new URL(script!, base));
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('javascript');
  });

  it('supports the official MCP client handshake and ping', async () => {
    const client = new Client({ name: 'coseed-integration', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe('coseed');
      await expect(client.ping()).resolves.toEqual({});
    } finally {
      await client.close();
    }
  });

  it('rejects unsupported MCP methods and preserves API 404 behavior', async () => {
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
    expect((await fetch(`${base}/mcp`, { method: 'DELETE' })).status).toBe(405);
    expect((await fetch(`${base}/api/missing`)).status).toBe(404);
  });

  it('can run a development backend without serving production page files', async () => {
    const backend = await createApplication(
      { host: '127.0.0.1', port: 0, dataDir: join(directory, 'headless'), logLevel: 'silent' },
      { serveWeb: false },
    );
    try {
      await backend.listen(0, '127.0.0.1');
      const url = await backend.getUrl();
      expect((await fetch(`${url}/api/status`)).status).toBe(200);
      expect((await fetch(url)).status).toBe(404);
    } finally {
      await backend.close();
    }
  });

  it('rejects foreign origins and rebinding hostnames on local endpoints', async () => {
    expect(
      (await fetch(`${base}/api/status`, { headers: { Origin: 'https://example.com' } })).status,
    ).toBe(403);
    const injected = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/api/status', headers: { host: 'attacker.example' } });
    expect(injected.statusCode).toBe(403);
  });
});
