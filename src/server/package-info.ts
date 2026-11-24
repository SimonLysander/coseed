import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Both src/server and dist/server sit two levels below the package root.
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
export const packageVersion = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
