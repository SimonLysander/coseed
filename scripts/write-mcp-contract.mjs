import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApplication } from '../dist/server/application.js';
import { serverInstructions } from '../dist/server/mcp/guides.js';

// Generate from the real SDK discovery path, not a second hand-maintained catalog.
const dataDir = await mkdtemp(join(tmpdir(), 'coseed-mcp-contract-'));
let app;
let client;
try {
  app = await createApplication(
    { host: '127.0.0.1', port: 0, dataDir, logLevel: 'silent' },
    { serveWeb: false },
  );
  await app.listen(0, '127.0.0.1');
  client = new Client({ name: 'coseed-contract-generator', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', await app.getUrl())));
  const { tools } = await client.listTools();
  const contract = {
    formatVersion: 1,
    transport: 'stateless-streamable-http',
    path: '/mcp',
    instructions: serverInstructions,
    tools,
  };
  const path = new URL('../docs/api/mcp-tools.json', import.meta.url);
  if (process.argv.includes('--check')) {
    if (!isDeepStrictEqual(JSON.parse(await readFile(path, 'utf8')), contract))
      throw new Error('MCP 契约已变化，请执行 npm run api:generate');
  } else {
    await writeFile(
      path,
      await format(JSON.stringify(contract), {
        ...(await resolveConfig(fileURLToPath(path))),
        parser: 'json',
      }),
    );
  }
} finally {
  await client?.close();
  await app?.close();
  await rm(dataDir, { recursive: true, force: true });
}
