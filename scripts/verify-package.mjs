import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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
  assert((await stat(join(dataDir, 'coseed.sqlite'))).isFile());
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
