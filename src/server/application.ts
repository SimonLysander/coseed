import 'reflect-metadata';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { LogLevel } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import type { RuntimeConfig } from './config/schema.js';
import { packageRoot } from './package-info.js';
import { protectLocalRequests } from './security/local-requests.js';

function loggerLevels(level: RuntimeConfig['logLevel']): LogLevel[] | false {
  if (level === 'silent') return false;
  const levels: LogLevel[] = ['error'];
  if (level !== 'error') levels.push('warn');
  if (level === 'info' || level === 'debug') levels.push('log');
  if (level === 'debug') levels.push('debug', 'verbose');
  return levels;
}

export async function createApplication(
  config: RuntimeConfig,
  { serveWeb = true }: { serveWeb?: boolean } = {},
): Promise<NestFastifyApplication> {
  const webRoot = join(packageRoot, 'dist', 'web');
  if (serveWeb) {
    try {
      await access(join(webRoot, 'index.html'));
    } catch (error) {
      throw new Error('缺少前端构建产物，请先执行 npm run build。', { cause: error });
    }
  }
  const adapter = new FastifyAdapter({ bodyLimit: 1024 * 1024, trustProxy: false });
  protectLocalRequests(adapter.getInstance());
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config),
    adapter,
    {
      logger: loggerLevels(config.logLevel),
      abortOnError: false,
    },
  );
  try {
    if (serveWeb) app.useStaticAssets({ root: webRoot, prefix: '/' });
    app.enableShutdownHooks();
    await app.init();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
