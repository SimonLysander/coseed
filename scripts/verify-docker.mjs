import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyProject } from './testing/verify-project.mjs';

const project = `coseed-smoke-${randomUUID()}`;
const composeFile = fileURLToPath(new URL('../compose.yaml', import.meta.url));

function compose(args, capture = false) {
  return execFileSync('docker', ['compose', '-f', composeFile, '-p', project, ...args], {
    env: { ...process.env, COSEED_PORT: '0', COSEED_LOG_LEVEL: 'warn' },
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

function address() {
  const binding = compose(['port', 'coseed', '4310'], true).trim();
  assert.match(binding, /^127\.0\.0\.1:\d+$/u);
  return new URL(`http://${binding}`);
}

try {
  compose(['up', '--build', '-d', '--wait', '--wait-timeout', '90']);
  const url = address();
  assert.notEqual(compose(['exec', '-T', 'coseed', 'id', '-u'], true).trim(), '0');
  assert.equal(
    compose(['exec', '-T', 'coseed', 'printenv', 'COSEED_LOG_LEVEL'], true).trim(),
    'warn',
  );
  const status = await fetch(new URL('/api/status', url));
  assert.equal(status.status, 200);
  assert.equal((await status.json()).storage, 'ready');
  const html = await (await fetch(url)).text();
  const asset = html.match(/src="([^"]+\.js)"/u)?.[1];
  assert.ok(asset);
  assert.equal((await fetch(new URL(asset, url))).status, 200);
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'licenses/animateicons-notices.txt']) {
    assert.equal(
      compose(['exec', '-T', 'coseed', 'cat', `/app/${file}`], true),
      readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
    );
  }
  const licenses = await fetch(new URL('/dependency-licenses.md', url));
  assert.equal(licenses.status, 200);
  assert.match(await licenses.text(), /\breact - [\d.]+/u);
  const assets = compose(['exec', '-T', 'coseed', 'ls', '-1', '/app/dist/web/assets'], true).split(
    '\n',
  );
  for (const pattern of [/^BusinessCanvas-.*\.js$/, /^elk-worker.*\.js$/]) {
    const name = assets.find((file) => pattern.test(file));
    assert.ok(name, `镜像中缺少图形资源 ${pattern}`);
    assert.equal((await fetch(new URL('/assets/' + name, url))).status, 200);
  }
  const forbidden = await fetch(new URL('/api/status', url), {
    headers: { origin: 'https://other.invalid' },
  });
  assert.equal(forbidden.status, 403);

  const unauthorized = await fetch(new URL('/mcp', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  assert.equal(unauthorized.status, 401);

  const { projectId, requirementId, version } = await verifyProject(url.origin);
  compose(['up', '--force-recreate', '-d', '--wait', '--wait-timeout', '90']);
  const response = await fetch(
    new URL(`/api/projects/${projectId}/requirements/${requirementId}`, address()),
  );
  assert.equal(response.status, 200);
  const restored = await response.json();
  assert.equal(restored.project.version, version);
  assert.equal(restored.requirement.content.title, 'Container tool verification');
  process.stdout.write(
    'Docker image, Web assets, MCP writes and persistent project data verified.\n',
  );
} finally {
  compose(['down', '--volumes', '--rmi', 'local']);
}
