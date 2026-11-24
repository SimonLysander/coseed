import { Inject, Injectable, Logger } from '@nestjs/common';
import { McpServer, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  exportSnapshotInputSchema,
  getOperationInputSchema,
  getProjectInputSchema,
  listProjectsInputSchema,
  listRevisionsInputSchema,
  mcpResultSchema,
  searchProjectInputSchema,
  readResourcesInputSchema,
  readGuideInputSchema,
  readRevisionInputSchema,
  saveChangesInputSchema,
  type McpResult,
} from '../../contracts/mcp.js';
import { historyBatch, historyPage, historicalContent } from './resources/history.js';
import { ProjectContentService } from '../modules/project-content/project-content.service.js';
import { ContentError, ObjectValidationError } from '../modules/project-content/errors.js';
import { saveAuthoredBatch } from './authoring/compile.js';
import { saveOperationId } from './identity.js';
import { readGuide, readGuideTopics, serverInstructions } from './guides.js';
import { SnapshotExportService } from './snapshots/export.service.js';
import { registerProjectResources, readResourceBatch, readsSource } from './resources/reader.js';
import { ProjectView, projectAddress } from './resources/project-view.js';
import type { ProjectMcpAccess } from '../modules/project-access/project-keys.service.js';
import { packageVersion } from '../package-info.js';

const inputProject = (input: { projectId: string }) => input.projectId;
const jsonValueSchema = z.json();
const messages = {
  PREREQUISITE_MISSING: '本批缺少已经保存的前置资料。',
  INVALID_INPUT: '请求字段不符合工具或内容结构。',
  NOT_FOUND: '指定项目、文件或保存操作不存在。',
  CONFLICT: '读取基准或预期对象修订与当前版本不一致，本批未保存。',
  OPERATION_MISMATCH: '同一操作标记已用于不同请求，本次未保存。',
  INVALID_REFERENCE: '引用不存在、不属于项目、类型不符或不在可见版本范围。',
  MISSING_EVIDENCE: '变更字段缺少来源覆盖，本批未保存。',
  NO_CHANGES: '未发现需要保存的实际变化，项目版本未增加。',
  STORAGE_BUSY: '存储忙碌，本次未保存。',
  STORAGE_CORRUPT: '存储内容或版本约束异常。',
  UNSUPPORTED_CONTENT: '内容包含当前版本不支持的结构。',
} as const;

function success(summary: string, data: unknown, list?: string[], total?: number): McpResult {
  return mcpResultSchema.parse({
    summary,
    data: JSON.parse(JSON.stringify(data)),
    ...(list ? { meta: { total: total ?? list.length, list: list.slice(0, 5) } } : {}),
  });
}

@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);
  constructor(
    @Inject(ProjectContentService) private readonly projects: ProjectContentService,
    @Inject(SnapshotExportService) private readonly exports: SnapshotExportService,
  ) {}

  createServer(access: ProjectMcpAccess): McpServer {
    const context = {
      entrypoint: 'mcp',
      actorKind: 'agent',
      actorLabel: '项目 MCP Agent',
      clientMetadata: { transport: 'stateless_http', keyId: access.keyId },
    } as const;
    const server = new McpServer(
      { name: 'coseed', version: packageVersion },
      {
        instructions: serverInstructions,
        capabilities: { resources: { listChanged: false }, tools: { listChanged: false } },
      },
    );
    registerProjectResources(server, this.projects, access.projectId);
    const register = <S extends z.ZodType & StandardSchemaWithJSON>(
      name: string,
      description: string,
      inputSchema: S,
      write: boolean,
      projectOf: 'connection' | ((input: z.output<S>) => string),
      handler: (input: z.output<S>) => McpResult,
    ) => {
      server.registerTool<typeof mcpResultSchema, StandardSchemaWithJSON>(
        name,
        {
          description,
          inputSchema,
          outputSchema: mcpResultSchema,
          annotations: {
            readOnlyHint: !write,
            destructiveHint: name === 'save_changes',
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (input) => {
          let result: McpResult;
          try {
            const parsed = inputSchema.parse(input);
            if (projectOf !== 'connection' && projectOf(parsed) !== access.projectId)
              throw new ContentError('NOT_FOUND', '项目不存在。');
            result = handler(parsed);
          } catch (error) {
            if (error instanceof ContentError || error instanceof z.ZodError) {
              const code = error instanceof ContentError ? error.code : 'INVALID_INPUT';
              const details: Record<string, z.infer<typeof jsonValueSchema>> = {};
              if (
                code === 'CONFLICT' &&
                typeof input === 'object' &&
                input !== null &&
                'projectId' in input &&
                typeof input.projectId === 'string'
              ) {
                details.currentVersion = this.projects.readProject(access.projectId).version;
                if ('baseVersion' in input && typeof input.baseVersion === 'number')
                  details.baseVersion = input.baseVersion;
              }
              if (error instanceof ObjectValidationError) details.issues = error.issues;
              const cause = error instanceof z.ZodError ? error : error.cause;
              if (cause instanceof z.ZodError)
                details.issues = cause.issues.map((issue) => ({
                  path: issue.path.map(String),
                  message: issue.message,
                }));
              // Business validation messages carry locations but never SQL or raw source contents.
              if (
                code === 'INVALID_INPUT' ||
                code === 'INVALID_REFERENCE' ||
                code === 'MISSING_EVIDENCE'
              )
                details.reason = error.message;
              const message =
                error instanceof ObjectValidationError ? error.message : messages[code];
              result = {
                summary: message,
                error: { code, message, details },
              };
            } else {
              this.logger.error(
                `工具 ${name} 执行失败`,
                error instanceof Error ? error.stack : String(error),
              );
              result = {
                summary: '工具执行发生内部错误，保存结果尚未确认。',
                error: {
                  code: 'INTERNAL_ERROR',
                  message: '工具执行发生内部错误，保存结果尚未确认。',
                },
              };
            }
          }
          const receipt = result.data?.receipt;
          const scope =
            typeof input === 'object' &&
            input !== null &&
            'projectId' in input &&
            typeof input.projectId === 'string'
              ? { projectId: input.projectId }
              : {};
          const saved =
            receipt && typeof receipt === 'object' && !Array.isArray(receipt)
              ? {
                  projectId: receipt.projectId,
                  operationId: receipt.operationId,
                  version: receipt.version,
                }
              : {};
          const event = JSON.stringify({
            tool: name,
            status: result.error ? 'error' : 'ok',
            summary: result.summary,
            ...scope,
            ...saved,
            ...(result.error ? { code: result.error.code } : {}),
            ...(result.meta ? { total: result.meta.total } : {}),
          });
          if (result.error) this.logger.warn(event);
          else if (write) this.logger.log(event);
          else this.logger.debug(event);
          return {
            isError: Boolean(result.error),
            structuredContent: result,
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          };
        },
      );
    };

    register(
      'read_guide',
      '按 topic 或 topics 读取接入指南和业务 Schema。多主题合并相同章节。',
      readGuideInputSchema,
      false,
      'connection',
      ({ topic, topics }) =>
        topics
          ? success('已读取所选规范', readGuideTopics(topics))
          : success(`已读取 ${topic} 规范`, readGuide(topic!)),
    );

    register(
      'list_projects',
      '读取当前凭证所属项目的名称、ID 和版本，支持按名称筛选。',
      listProjectsInputSchema,
      false,
      'connection',
      ({ name, afterId, limit }) => {
        const rows = this.projects.listProjects({
          projectId: access.projectId,
          ...(name !== undefined ? { name } : {}),
          ...(afterId !== undefined ? { afterId } : {}),
          limit: limit + 1,
        });
        const items = rows.slice(0, limit).map((p) => ({ ...p, currentUri: projectAddress(p.id) }));
        return success(
          `已取得 ${items.length} 个项目`,
          { items, nextAfterId: rows.length > limit ? items.at(-1)!.id : null },
          items.map((item) => item.name),
          items.length,
        );
      },
    );

    register(
      'get_project',
      '读取项目资料、当前版本和固定目录 indexUri。建档条件分别表示产品正文已保存、工作方式导读与概览图已一同保存、业务全景已有模块。projectId 来自本次连接的项目目录。',
      getProjectInputSchema,
      false,
      inputProject,
      ({ projectId }) => {
        const project = this.projects.readProject(projectId);
        const view = new ProjectView(
          this.projects.readSnapshot(projectId, project.version, { includeSources: false }),
        );
        return success(`已读取项目“${String(project.project.content.name)}”`, {
          ...project,
          currentUri: projectAddress(projectId),
          indexUri: view.indexUri,
          conditions: view.conditions,
        });
      },
    );

    register(
      'search_project',
      '在明确项目的固定版本中搜索综述、需求、记录及图中对象的标题和正文。命中项返回摘录和固定资源地址，下一页使用 nextOffset。',
      searchProjectInputSchema,
      false,
      inputProject,
      ({ projectId, version, query, offset, limit }) => {
        const result = new ProjectView(
          this.projects.readSnapshot(projectId, version, { includeSources: false }),
        ).search(query, offset, limit);
        return success(
          '已搜索项目正文',
          result,
          result.items.map((item) => item.title),
          result.total,
        );
      },
    );
    register(
      'read_resources',
      '批量读取同一版本下的目录或正文。逐项按输入顺序返回 text 或 error。按同一 URI 与 nextOffset 续读，null 表示读完。',
      readResourcesInputSchema,
      false,
      inputProject,
      ({ projectId, version, items, maxBytes }) =>
        success(
          '已读取项目资源',
          readResourceBatch(
            new ProjectView(
              this.projects.readSnapshot(projectId, version, {
                includeSources: items.some((i) => readsSource(i.uri)),
              }),
            ),
            items,
            maxBytes,
          ),
        ),
    );
    register(
      'export_snapshot',
      '读取固定项目版本的文件清单或一组文件分块，包含全部当前有效资料、来源及必要的固定历史引用；已移除对象仅出现在必要历史中。历史图成员按同一 projectVersion 解析。只返回数据，不在客户端落盘；下载和校验字段见输入 Schema。',
      exportSnapshotInputSchema,
      false,
      inputProject,
      (input) =>
        success(
          input.part.kind === 'manifest' ? '已取得固定版本文件清单' : '已读取文件分块',
          this.exports.read(input),
        ),
    );

    register(
      'list_revisions',
      '按修订号倒序列出固定项目版本内的历史。单项使用 objectType、id，批量使用 targets。批内每项独立分页。',
      listRevisionsInputSchema,
      false,
      inputProject,
      ({ projectId, version, targets, maxBytes, objectType, id, beforeRevision, limit }) => {
        if (targets) {
          this.projects.readOverview(projectId, version);
          return success('已取得指定对象的修订清单', {
            projectId,
            version,
            ...historyBatch(targets, maxBytes, (t) =>
              historyPage(this.projects, projectId, version, t, true),
            ),
          });
        }
        const page = historyPage(this.projects, projectId, version, {
          objectType: objectType!,
          id: id!,
          beforeRevision,
          limit: limit ?? 30,
        });
        return success(
          '已读取对象修订清单',
          page,
          page.items.map((i) => '修订 ' + i.revisionNo),
          page.items.length,
        );
      },
    );
    register(
      'read_revision',
      '读取指定修订及原始来源，或按项目版本解析历史图及成员。批量按输入顺序返回。完整条目的 sourceIds 对应本批 sources。超出预算的条目用 nextOffset 接续其独立 JSON 正文。',
      readRevisionInputSchema,
      false,
      inputProject,
      ({ projectId, version, target, targets, maxBytes }) => {
        if (targets) {
          this.projects.readOverview(projectId, version);
          return success('已读取指定历史内容', {
            projectId,
            version,
            ...historyBatch(targets, maxBytes, (t) =>
              historicalContent(this.projects, projectId, version, t),
            ),
          });
        }
        return success(
          '已读取指定历史内容',
          historicalContent(this.projects, projectId, version, target!),
        );
      },
    );
    register(
      'get_operation',
      '用本项目的保存 requestKey 或 operationId 查询已完成的操作。查不到表示尚无成功回执，不证明其他请求没有在执行。',
      getOperationInputSchema,
      false,
      (input) => input.target.projectId,
      ({ target }) => {
        const id =
          target.kind === 'operation'
            ? target.operationId
            : saveOperationId(access.projectId, target.requestKey);
        const receipt = this.projects.getOperation(access.projectId, id);
        return success('已查询到成功保存回执', { receipt });
      },
    );

    register(
      'save_changes',
      '按业务路由分组保存项目变更，整批原子提交。每批按已读版本验证建档次序，返回 receipt、allocations 及按输入顺序的 items。无变化返回 NO_CHANGES 且不增加版本，版本冲突整批未保存，无自动合并或准备步骤。HTTP 请求上限 1 MiB，超出返回 413、整批未保存；无分块上传或自动拆批。内容写法见 read_guide。',
      saveChangesInputSchema,
      true,
      inputProject,
      (input) => {
        const saved = saveAuthoredBatch(this.projects, input, context);
        const { receipt } = saved;
        return success(
          `已保存 ${receipt.changes.length} 项对象修订`,
          saved,
          receipt.changes.map(
            (change) =>
              `${change.objectType} · 修订 ${change.revisionNo}${change.isDeleted ? '（移除）' : ''}`,
          ),
          receipt.changes.length,
        );
      },
    );
    return server;
  }
}
