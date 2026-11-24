import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigurationError, loadConfig } from './load-config.js';

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'coseed-config-'));
  directories.push(directory);
  return {
    directory,
    configPath: join(directory, 'config.json'),
    paths: { config: directory, data: join(directory, 'data') },
  };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('configuration boundary', () => {
  it('starts with safe defaults and does not create files during configuration loading', async () => {
    const { paths } = await fixture();
    const config = await loadConfig({ env: {}, paths });
    expect(config).toEqual({
      host: '127.0.0.1',
      port: 4310,
      logLevel: 'info',
      dataDir: paths.data,
    });
    expect(Object.isFrozen(config)).toBe(true);
    await expect(stat(paths.data)).rejects.toHaveProperty('code', 'ENOENT');
  });

  it('applies CLI > environment > file > defaults without losing unspecified values', async () => {
    const { configPath, paths } = await fixture();
    await writeFile(
      configPath,
      JSON.stringify({ port: 4400, logLevel: 'warn', dataDir: './stored' }),
    );
    const config = await loadConfig({
      paths,
      env: { COSEED_PORT: '4500' },
      overrides: { port: '4600', host: undefined },
    });
    expect(config.port).toBe(4600);
    expect(config.logLevel).toBe('warn');
    expect(config.host).toBe('127.0.0.1');
    expect(config.dataDir).toBe(join(paths.config, 'stored'));
    expect(JSON.parse(await readFile(configPath, 'utf8')).port).toBe(4400);
  });

  it('resolves environment and CLI data paths against the invoking directory', async () => {
    const { directory, paths } = await fixture();
    const config = await loadConfig({
      paths,
      cwd: directory,
      env: { COSEED_DATA_DIR: 'env-data' },
      overrides: { dataDir: 'cli-data' },
    });
    expect(config.dataDir).toBe(join(directory, 'cli-data'));
  });

  it('does not ignore an explicitly requested missing file', async () => {
    const { configPath, paths } = await fixture();
    await expect(loadConfig({ paths, configPath, env: {} })).rejects.toThrow(ConfigurationError);
    await expect(loadConfig({ paths, env: { COSEED_CONFIG: configPath } })).rejects.toThrow(
      ConfigurationError,
    );
  });

  it.each(['{"port":', '{"porrt":4310}', '{"dataDir":""}', '{"host":"0.0.0.0"}'])(
    'rejects invalid configuration file %s',
    async (text) => {
      const { configPath, paths } = await fixture();
      await writeFile(configPath, text);
      await expect(loadConfig({ paths, env: {} })).rejects.toThrow(ConfigurationError);
    },
  );

  it.each(['', 'port', '12.5', '-1', '65536'])('rejects invalid port %s', async (port) => {
    const { paths } = await fixture();
    await expect(loadConfig({ paths, env: { COSEED_PORT: port } })).rejects.toThrow(
      ConfigurationError,
    );
  });

  it('accepts a dynamic port for isolated instances and tests', async () => {
    const { paths } = await fixture();
    expect((await loadConfig({ paths, env: { COSEED_PORT: '0' } })).port).toBe(0);
  });
});
