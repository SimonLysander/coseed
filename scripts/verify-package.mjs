import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const directory = await mkdtemp(join(tmpdir(), 'coseed-package-'));
let child;

function npm(args, cwd = process.cwd()) {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8', timeout: 120_000 });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`npm ${args[0]} 失败\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

function serviceUrl(process) {
  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`服务启动超时：${errorOutput}`));
    }, 15_000);
    const onData = (data) => {
      output = (output + data.toString()).slice(-10_000);
      const match = output.match(/Web: (http:\/\/[^\s]+)/);
      if (match) {
        cleanup();
        resolve(match[1]);
      }
    };
    const onErrorData = (data) => {
      errorOutput = (errorOutput + data.toString()).slice(-10_000);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`服务提前退出 ${code}：${errorOutput}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      process.stdout.off('data', onData);
      process.stderr.off('data', onErrorData);
      process.off('exit', onExit);
      process.off('error', reject);
    };
    process.stdout.on('data', onData);
    process.stderr.on('data', onErrorData);
    process.once('exit', onExit);
    process.once('error', reject);
  });
}

try {
  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', directory])).coseed;
  assert(packed.files.some((entry) => entry.path === 'dist/web/index.html'));
  for (const name of [
    '0000_coordination.sql',
    '0001_project_overview.sql',
    '0002_business_design.sql',
    '0003_requirements.sql',
    'meta/_journal.json',
  ]) {
    assert(packed.files.some((entry) => entry.path === `migrations/${name}`));
  }
  assert(!packed.files.some((entry) => entry.path.includes('.test.')));
  const installed = join(directory, 'installed');
  await mkdir(installed);
  await writeFile(
    join(installed, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  npm(
    [
      'install',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--registry=https://registry.npmjs.org',
      join(directory, packed.filename),
    ],
    installed,
  );
  const cli = join(installed, 'node_modules', 'coseed', 'dist', 'cli', 'index.js');
  const unrelatedCwd = join(directory, 'elsewhere');
  await mkdir(unrelatedCwd);
  const dataDir = join(directory, 'data');
  await writeFile(join(directory, 'config.json'), '{}');
  const started = performance.now();
  child = spawn(
    process.execPath,
    [
      cli,
      'start',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--data-dir',
      dataDir,
      '--log-level',
      'silent',
    ],
    {
      cwd: unrelatedCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, COSEED_CONFIG: join(directory, 'config.json') },
    },
  );
  const base = await serviceUrl(child);
  const response = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).storage, 'ready');
  const readyMs = Math.round(performance.now() - started);
  const html = await (await fetch(base)).text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert(asset);
  assert.equal((await fetch(new URL(asset, base))).status, 200);
  const mcp = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'coseed-package-smoke', version: '0.0.0' },
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(mcp.status, 200);
  assert.equal((await mcp.json()).result.serverInfo.name, 'coseed');
  const client = new Client({ name: 'coseed-package-tools', version: '0.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    assert.equal((await client.listTools()).tools.length, 9);
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      assert(!result.isError, JSON.stringify(result));
      return result.structuredContent.data;
    };
    const created = await call('create_project', {
      requestKey: 'package-mcp-create',
      name: 'Fictional MCP package fixture',
    });
    const request = {
      projectId: created.receipt.projectId,
      requestKey: 'package-mcp-save',
      baseVersion: 0,
      sources: [
        { id: '$material', kind: 'document', rawText: 'Fictional package verification only.' },
      ],
      changes: [
        {
          action: 'upsert',
          objectType: 'requirement',
          id: '$requirement',
          expectedRevision: null,
          content: {
            title: 'Package tool verification',
            markdown: 'Fictional fixture only.',
            status: 'designing',
          },
          citations: [
            {
              sourceId: '$material',
              side: 'after',
              path: '',
              explanationMd: 'This material supports the fictional fixture.',
            },
          ],
        },
      ],
    };
    const saved = await call('save_changes', request);
    assert.equal(saved.receipt.version, 1);
    assert.deepEqual(await call('save_changes', request), saved);
    assert.equal(
      (await call('export_snapshot', { projectId: created.receipt.projectId, version: 1 }))
        .totalFiles,
      4,
    );
    const guide = await call('read_guide', { topic: 'usage' });
    assert.equal(guide.guideVersion, 2);
    assert.equal(
      guide.markdown,
      await readFile(new URL('../docs/operations/agent-integration.md', import.meta.url), 'utf8'),
    );
    assert(
      (await call('read_guide', { topic: 'design' })).markdown.includes('所有节点必须正交完备'),
    );
    await call('save_changes', {
      projectId: created.receipt.projectId,
      requestKey: 'package-overview',
      baseVersion: 1,
      sources: [
        { id: '$material', kind: 'document', rawText: 'Fictional overview verification material.' },
      ],
      changes: [
        {
          action: 'upsert',
          objectType: 'overview',
          id: created.receipt.projectId,
          expectedRevision: null,
          content: {
            product: { markdown: 'Fictional installed-package overview.' },
            concepts: { entries: [], relations: [] },
            examples: { introductionMd: null, actors: [], useCases: [], sections: [] },
          },
          citations: [
            { sourceId: '$material', side: 'after', path: '', explanationMd: 'Fixture only.' },
          ],
        },
      ],
    });
    const overview = await (
      await fetch(`${base}/api/projects/${created.receipt.projectId}/overview`)
    ).json();
    assert.equal(overview.project.version, 2);
    assert.equal(
      overview.overview.content.product.markdown,
      'Fictional installed-package overview.',
    );
    const requirements = await (
      await fetch(`${base}/api/projects/${created.receipt.projectId}/requirements`)
    ).json();
    assert.equal(requirements.project.version, 2);
    assert.equal(requirements.items.length, 1);
    const requirementId = requirements.items[0].id;
    const requirement = await (
      await fetch(`${base}/api/projects/${created.receipt.projectId}/requirements/${requirementId}`)
    ).json();
    assert.equal(requirement.requirement.content.title, 'Package tool verification');
    await call('save_changes', {
      projectId: created.receipt.projectId,
      requestKey: 'package-record',
      baseVersion: 2,
      sources: [
        {
          id: '$material',
          kind: 'document',
          rawText: 'Fictional installed-package progress material.',
        },
      ],
      changes: [
        {
          action: 'upsert',
          objectType: 'record',
          id: '$progress',
          expectedRevision: null,
          content: {
            requirementId,
            title: 'Installed package progress',
            markdown: 'Fictional verification only.',
            occurredAt: null,
          },
          citations: [
            {
              sourceId: '$material',
              side: 'after',
              path: '',
              explanationMd: 'Fictional fixture only.',
            },
          ],
        },
      ],
    });
    const records = await (
      await fetch(
        `${base}/api/projects/${created.receipt.projectId}/requirements/${requirementId}/records?version=3`,
      )
    ).json();
    assert.equal(records.items.length, 1);
    assert.equal(records.items[0].content.title, 'Installed package progress');
    const history = await (
      await fetch(
        `${base}/api/projects/${created.receipt.projectId}/history/record/${records.items[0].id}?version=3`,
      )
    ).json();
    assert.equal(history.items[0].actor.entrypoint, 'mcp');
    const revision = await (
      await fetch(
        `${base}/api/projects/${created.receipt.projectId}/history/record/${records.items[0].id}/revisions/1?version=3`,
      )
    ).json();
    assert.equal(revision.sources[0].rawText, 'Fictional installed-package progress material.');
    const businessSaved = await call('save_changes', {
      projectId: created.receipt.projectId,
      requestKey: 'package-business',
      baseVersion: 3,
      sources: [
        {
          id: '$material',
          kind: 'document',
          rawText: 'Fictional installed-package business diagram material.',
        },
      ],
      changes: [
        {
          objectType: 'entity',
          id: '$module',
          content: {
            kind: 'module',
            name: 'Installed module',
            summary: 'Fictional business module only.',
            role: 'core',
          },
        },
        {
          objectType: 'diagram',
          id: '$diagram',
          content: {
            title: 'Installed diagram',
            scope: { kind: 'project' },
            entityIds: ['$module'],
            relationshipIds: [],
            noteIds: [],
          },
        },
      ].map((change) => ({
        ...change,
        action: 'upsert',
        expectedRevision: null,
        citations: [
          {
            sourceId: '$material',
            side: 'after',
            path: '',
            explanationMd: 'Fictional verification supports content.',
          },
        ],
      })),
    });
    const diagramId = businessSaved.allocations.find((item) => item.localRef === '$diagram').id;
    const graph = await (
      await fetch(
        `${base}/api/projects/${created.receipt.projectId}/business/diagrams/${diagramId}?version=4`,
      )
    ).json();
    assert.equal(graph.project.version, 4);
    assert.equal(graph.bundle.entities[0].content.name, 'Installed module');
    const beforeGraph = await (
      await fetch(`${base}/api/projects/${created.receipt.projectId}/business?version=3`)
    ).json();
    assert.equal(beforeGraph.diagrams.length, 0);
    const canvasAsset = packed.files.find((entry) =>
      /^dist\/web\/assets\/BusinessCanvas-.*\.js$/.test(entry.path),
    );
    assert(canvasAsset);
    assert.equal((await fetch(`${base}/${canvasAsset.path.replace('dist/web/', '')}`)).status, 200);
    const worker = packed.files.find((entry) =>
      /^dist\/web\/assets\/elk-worker.*\.js$/.test(entry.path),
    );
    assert(worker);
    assert.equal((await fetch(`${base}/${worker.path.replace('dist/web/', '')}`)).status, 200);
  } finally {
    await client.close();
  }
  assert((await stat(join(dataDir, 'coseed.sqlite'))).isFile());
  const storage = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { pathToFileURL } from 'node:url';
    const root = process.env.COSEED_VERIFICATION_PACKAGE;
    const { createApplication } = await import(pathToFileURL(root + '/dist/server/application.js').href);
    const { ProjectContentService } = await import(pathToFileURL(root + '/dist/server/modules/project-content/project-content.service.js').href);
    const app = await createApplication({ host: '127.0.0.1', port: 0, dataDir: process.env.COSEED_VERIFICATION_DATA_DIR, logLevel: 'silent' }, { serveWeb: false });
    try {
      const service = app.get(ProjectContentService);
      const context = { entrypoint: 'system', actorKind: 'system', actorLabel: 'Fictional package verification' };
      const created = service.createProject({ operationId: 'package-create', name: 'Fictional package fixture' }, context);
      const receipt = service.save({ projectId: created.projectId, operationId: 'package-save', baseVersion: 0,
        sources: [{ id: 'package-source', kind: 'document', rawText: 'Fictional verification material.' }],
        changes: [{ action: 'upsert', objectType: 'requirement', id: 'package-requirement', expectedRevision: null,
          content: { title: 'Verify storage', markdown: 'Fictional fixture only.', status: 'designing' },
          citations: [{ sourceId: 'package-source', side: 'after', path: '', explanationMd: 'Fixture supports this content.' }] }] }, context);
      assert.equal(receipt.version, 1);
      assert.equal(service.readSnapshot(created.projectId).objects.length, 1);
      assert.equal(service.readSnapshot(created.projectId, 0).objects.length, 0);
      assert.equal(service.readHistory(created.projectId, 'requirement', 'package-requirement').length, 1);
      assert.deepEqual(service.getOperation(created.projectId, receipt.operationId), receipt);
    } finally { await app.close(); }
  `,
    ],
    {
      cwd: unrelatedCwd,
      env: {
        ...process.env,
        COSEED_VERIFICATION_PACKAGE: join(installed, 'node_modules', 'coseed'),
        COSEED_VERIFICATION_DATA_DIR: dataDir,
      },
      encoding: 'utf8',
      timeout: 15_000,
    },
  );
  if (storage.error) throw storage.error;
  assert.equal(storage.status, 0, storage.stderr || storage.stdout);
  console.info(
    JSON.stringify(
      {
        package: packed.filename,
        packageBytes: packed.size,
        readyMs,
        checks: [
          'production-only install',
          'unrelated working directory',
          'SQLite',
          'Web asset',
          'MCP initialize',
          'MCP discovery/create/save/retry/export/guide',
          'HTTP project overview and bundled ELK worker asset',
          'HTTP requirement timeline/revisions/sources over MCP writes',
          'formal migrations and project-content save/history',
          'HTTP versioned business diagrams over MCP writes and bundled canvas',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const exited = await Promise.race([
      once(child, 'exit').then(() => true),
      delay(5_000).then(() => false),
    ]);
    if (!exited) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
  }
  await rm(directory, { recursive: true, force: true });
}
