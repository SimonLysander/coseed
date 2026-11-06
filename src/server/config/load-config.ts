import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import envPaths from 'env-paths';
import { z } from 'zod';
import {
  configFileSchema,
  runtimeConfigSchema,
  type ConfigOverrides,
  type RuntimeConfig,
} from './schema.js';

export class ConfigurationError extends Error {
  override name = 'ConfigurationError';
}

interface LoadConfigOptions {
  overrides?: ConfigOverrides;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  paths?: { config: string; data: string };
}

function expandPath(value: string, base: string): string {
  const expanded =
    value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;
  return isAbsolute(expanded) ? expanded : resolve(base, expanded);
}

function definedValues(values: ConfigOverrides): ConfigOverrides {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function messageFor(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<RuntimeConfig> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const paths = options.paths ?? envPaths('coseed', { suffix: '' });
  const requestedPath = options.configPath ?? env.COSEED_CONFIG;
  const configPath = expandPath(requestedPath ?? join(paths.config, 'config.json'), cwd);
  let fromFile: ConfigOverrides = {};

  try {
    let text: string | undefined;
    try {
      text = await readFile(configPath, 'utf8');
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT' &&
        requestedPath === undefined
      )) {
        throw error;
      }
    }
    if (text !== undefined) {
      fromFile = configFileSchema.parse(JSON.parse(text));
      if (typeof fromFile.dataDir === 'string') {
        fromFile.dataDir = expandPath(fromFile.dataDir, dirname(configPath));
      }
    }
  } catch (error) {
    throw new ConfigurationError(`配置文件 ${configPath} 无效：${messageFor(error)}`, {
      cause: error,
    });
  }

  const merged = {
    host: '127.0.0.1',
    port: 4310,
    dataDir: paths.data,
    logLevel: 'info',
    ...fromFile,
    ...definedValues({
      host: env.COSEED_HOST,
      port: env.COSEED_PORT,
      dataDir: env.COSEED_DATA_DIR,
      logLevel: env.COSEED_LOG_LEVEL,
    }),
    ...definedValues(options.overrides ?? {}),
  };

  const parsed = runtimeConfigSchema.safeParse(merged);
  if (!parsed.success) throw new ConfigurationError(`运行配置无效：${messageFor(parsed.error)}`);
  return Object.freeze({ ...parsed.data, dataDir: expandPath(parsed.data.dataDir, cwd) });
}
