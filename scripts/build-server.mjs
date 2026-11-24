import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await Promise.all(
  ['cli', 'server', 'contracts'].map((name) =>
    rm(new URL(`dist/${name}`, root), { recursive: true, force: true }),
  ),
);
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)),
    '--build',
    'tsconfig.server.json',
    '--force',
  ],
  { cwd: fileURLToPath(root), stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
