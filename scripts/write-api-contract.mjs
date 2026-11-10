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

import {
  requirementsQuerySchema,
  requirementsResponseSchema,
  requirementResponseSchema,
  recordsQuerySchema,
  recordsResponseSchema,
  historyQuerySchema,
  historyResponseSchema,
  revisionResponseSchema,
  fixedVersionQuerySchema,
  historyTypeSchema,
  revisionParamSchema,
} from '../dist/contracts/requirements-http.js';

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
    required: z.toJSONSchema(schema).required?.includes(name) ?? false,
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
    '/api/projects/{projectId}/requirements': {
      get: {
        operationId: 'listRequirements',
        summary: '固定项目版本，按最近更新优先分页读取需求；正文修订不生成新需求',
        parameters: [projectId, ...queryParameters(requirementsQuerySchema)],
        responses: {
          200: {
            description: '需求列表；后续翻页使用首版返回的项目版本；Cache-Control: no-store',
            content: body(requirementsResponseSchema),
          },
          400: errorResponse('查询字段不合法'),
          404: errorResponse('项目或版本不存在'),
        },
      },
    },
    '/api/projects/{projectId}/requirements/{requirementId}': {
      get: {
        operationId: 'getRequirement',
        summary: '一致读取需求当前内容、当前记录数和真实状态变化时间',
        parameters: [
          projectId,
          {
            name: 'requirementId',
            in: 'path',
            required: true,
            schema: z.toJSONSchema(projectIdSchema),
          },
          ...queryParameters(overviewQuerySchema),
        ],
        responses: {
          200: {
            description: '需求阅读视图；Cache-Control: no-store',
            content: body(requirementResponseSchema),
          },
          400: errorResponse('查询字段不合法'),
          404: errorResponse('需求不存在、已移除或不属于该项目'),
        },
      },
    },
    '/api/projects/{projectId}/requirements/{requirementId}/records': {
      get: {
        operationId: 'listProgressRecords',
        summary: '按首次收录顺序倒序读取当前记录；修订不移动位置；version 必填',
        parameters: [
          projectId,
          {
            name: 'requirementId',
            in: 'path',
            required: true,
            schema: z.toJSONSchema(projectIdSchema),
          },
          ...queryParameters(recordsQuerySchema),
        ],
        responses: {
          200: {
            description: '每个记录身份仅出现一次；Cache-Control: no-store',
            content: body(recordsResponseSchema),
          },
          400: errorResponse('缺少版本或分页位置无效'),
          404: errorResponse('项目、需求或版本不存在'),
        },
      },
    },
    '/api/projects/{projectId}/history/{objectType}/{objectId}': {
      get: {
        operationId: 'listRequirementRevisions',
        summary: '按修订号倒序分页读取需求或记录历史，包括移除记录；version 必填',
        parameters: [
          projectId,
          {
            name: 'objectType',
            in: 'path',
            required: true,
            schema: z.toJSONSchema(historyTypeSchema),
          },
          { name: 'objectId', in: 'path', required: true, schema: z.toJSONSchema(projectIdSchema) },
          ...queryParameters(historyQuerySchema),
        ],
        responses: {
          200: {
            description: '逐版内容、系统保存时间、执行者和状态依据；Cache-Control: no-store',
            content: body(historyResponseSchema),
          },
          400: errorResponse('查询或类型无效'),
          404: errorResponse('对象或版本不存在'),
        },
      },
    },
    '/api/projects/{projectId}/history/{objectType}/{objectId}/revisions/{revisionNo}': {
      get: {
        operationId: 'getRequirementRevision',
        summary: '读取一个确定修订及其原始来源，不把后来的修订替换成旧依据',
        parameters: [
          projectId,
          {
            name: 'objectType',
            in: 'path',
            required: true,
            schema: z.toJSONSchema(historyTypeSchema),
          },
          { name: 'objectId', in: 'path', required: true, schema: z.toJSONSchema(projectIdSchema) },
          {
            name: 'revisionNo',
            in: 'path',
            required: true,
            schema: z.toJSONSchema(revisionParamSchema),
          },
          ...queryParameters(fixedVersionQuerySchema),
        ],
        responses: {
          200: {
            description: '固定修订及来源原文；Cache-Control: no-store',
            content: body(revisionResponseSchema),
          },
          400: errorResponse('缺少项目版本或修订号无效'),
          404: errorResponse('对象、修订或项目版本不存在'),
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
