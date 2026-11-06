import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import { serviceStatusSchema } from '../dist/contracts/service-status.js';

const contract = {
  openapi: '3.1.0',
  info: { title: 'CoSeed local HTTP API', version: '0.1.0' },
  paths: {
    '/api/status': {
      get: {
        operationId: 'getServiceStatus',
        summary: '检查本地服务与 SQLite 连接',
        responses: {
          200: {
            description: '服务和数据库已就绪',
            content: { 'application/json': { schema: z.toJSONSchema(serviceStatusSchema) } },
          },
          403: { description: 'Host 或 Origin 不符合本地访问约束' },
          503: { description: '数据库不可用' },
        },
      },
    },
  },
};
const path = new URL('../docs/api/openapi.json', import.meta.url);
const content = await format(JSON.stringify(contract), {
  ...(await resolveConfig(fileURLToPath(path))),
  parser: 'json',
});
if (process.argv.includes('--check')) {
  if (!isDeepStrictEqual(JSON.parse(await readFile(path, 'utf8')), contract))
    throw new Error('接口契约已变化，请执行 npm run api:generate');
} else {
  await mkdir(new URL('./', path), { recursive: true });
  await writeFile(path, content);
}
