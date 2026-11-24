import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));

describe('CLI startup', () => {
  it('provides help without starting the application', () => {
    const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('start');
    expect(result.stdout).not.toContain('MCP:');
  });

  it('fails before startup when configuration is invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'coseed-cli-'));
    const config = join(directory, 'config.json');
    await writeFile(config, '{}');
    try {
      const result = spawnSync(
        process.execPath,
        [cli, 'start', '--config', config, '--port', 'invalid'],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('运行配置无效');
      expect(result.stdout).not.toContain('Web:');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
