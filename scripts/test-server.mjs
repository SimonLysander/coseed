import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'coseed-browser-'));
const configPath = join(directory, 'config.json');
await writeFile(configPath, '{}');
const child = spawn(
  process.execPath,
  [
    'dist/cli/index.js',
    'start',
    '--host',
    '127.0.0.1',
    '--config',
    configPath,
    '--port',
    '4319',
    '--data-dir',
    directory,
    '--log-level',
    'silent',
  ],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill('SIGTERM'));
child.once('error', async (error) => {
  console.error(error);
  await rm(directory, { recursive: true, force: true });
  process.exitCode = 1;
});
child.once('exit', async (code, signal) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = signal ? 0 : (code ?? 1);
});
