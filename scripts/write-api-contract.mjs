import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import { serviceStatusSchema } from '../dist/contracts/service-status.js';
import {
  createProjectRequestSchema,
  createProjectResponseSchema,
  projectResponseSchema,
  projectListResponseSchema,
  projectOverviewResponseSchema,
  projectHttpErrorSchema,
  projectIdSchema,
  projectListQuerySchema,
  overviewQuerySchema,
} from '../dist/contracts/projects-http.js';

const body = (schema) => ({ 'application/json': { schema: z.toJSONSchema(schema) } });
const errorResponse = (description) => ({ description, content: body(projectHttpErrorSchema) });
const projectId = {
  name: 'projectId',
  in: 'path',
  required: true,
  schema: z.toJSONSchema(projectIdSchema),
};
const queryParameters = (schema) =>
  Object.entries(z.toJSONSchema(schema).properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: false,
    schema: property,
  }));

const contract = {
  openapi: '3.1.0',
  info: { title: 'CoSeed local HTTP API', version: '0.1.0' },
  paths: {
    '/api/projects': {
      get: {
        operationId: 'listProjects',
        summary: '按稳定 ID 分页发现本机项目，不隐式选择项目',
        parameters: queryParameters(projectListQuerySchema),
        responses: {
          200: {
            description: '项目列表和下一页位置；Cache-Control: no-store',
            content: body(projectListResponseSchema),
          },
          400: errorResponse('查询字段不合法'),
          403: { description: '本机 Host / Origin 约束拒绝请求' },
        },
      },
      post: {
        operationId: 'createProject',
        summary: '创建版本为 0 的空项目；同操作标识同内容重试返回原结果',
        requestBody: { required: true, content: body(createProjectRequestSchema) },
        responses: {
          201: {
            description: '创建回执；无自动生成的综述或需求',
            content: body(createProjectResponseSchema),
          },
          400: errorResponse('输入字段不合法，不接受伪造入口信息'),
          403: { description: '本机 Host / Origin 约束拒绝请求' },
          409: errorResponse('操作标识已用于其他内容'),
          413: { description: '请求超过 1 MiB' },
          503: errorResponse('存储忙碌'),
        },
      },
    },
    '/api/projects/{projectId}': {
      get: {
        operationId: 'getProject',
        summary: '读取项目基本资料及当前版本，不加载所有业务内容',
        parameters: [projectId],
        responses: {
          200: {
            description: '项目资料；Cache-Control: no-store',
            content: body(projectResponseSchema),
          },
          404: errorResponse('项目不存在'),
        },
      },
    },
    '/api/projects/{projectId}/overview': {
      get: {
        operationId: 'getProjectOverview',
        summary: '在同一项目版本读取项目名称和综述，空项目返回 overview=null',
        parameters: [projectId, ...queryParameters(overviewQuerySchema)],
        responses: {
          200: {
            description: '综述读取视图；Cache-Control: no-store',
            content: body(projectOverviewResponseSchema),
          },
          400: errorResponse('版本字段不合法'),
          404: errorResponse('项目或指定版本不存在'),
        },
      },
    },
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
