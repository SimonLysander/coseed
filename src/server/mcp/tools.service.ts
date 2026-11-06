import { Inject, Injectable, Logger } from '@nestjs/common';
import { McpServer, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  createProjectToolInputSchema,
  exportSnapshotInputSchema,
  getOperationInputSchema,
  getProjectInputSchema,
  listProjectsInputSchema,
  listRevisionsInputSchema,
  mcpResultSchema,
  readGuideInputSchema,
  readRevisionInputSchema,
  saveChangesInputSchema,
  type McpResult,
} from '../../contracts/mcp.js';
import type { StoredRevision } from '../../contracts/project-content.js';
import { ProjectContentService } from '../modules/project-content/project-content.service.js';
import { ContentError } from '../modules/project-content/errors.js';
import { resolveChanges } from './changes.js';
import { operationId } from './identity.js';
import { readGuide, serverInstructions } from './guides.js';
import { resolveDiagram, SnapshotExportService } from './snapshots/export.service.js';
import { packageVersion } from '../package-info.js';

const context = {
  entrypoint: 'mcp',
  actorKind: 'agent',
  actorLabel: '本机 MCP Agent（未认证）',
  clientMetadata: { transport: 'stateless_http' },
} as const;
const jsonValueSchema = z.json();
const messages = {
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

  createServer(): McpServer {
    const server = new McpServer(
      { name: 'coseed', version: packageVersion },
      { instructions: serverInstructions },
    );
    const register = <S extends z.ZodType & StandardSchemaWithJSON>(
      name: string,
      description: string,
      inputSchema: S,
      write: boolean,
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
            result = handler(inputSchema.parse(input));
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
                details.currentVersion = this.projects.readProject(input.projectId).version;
                if ('baseVersion' in input && typeof input.baseVersion === 'number')
                  details.baseVersion = input.baseVersion;
              }
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
              result = {
                summary: messages[code],
                error: { code, message: messages[code], details },
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
      '按 topic 读取 CoSeed 使用方法或内容规范，以及该主题的权威 JSON Schema。只读，不写入项目；正文按需加载。',
      readGuideInputSchema,
      false,
      ({ topic }) => success(`已读取 ${topic} 规范`, readGuide(topic)),
    );

    register(
      'list_projects',
      '按稳定 ID 分页列出本机实例的项目名称、ID 和当前版本，可按名称子串筛选。无隐式当前项目；列表为实时发现，不是固定快照。',
      listProjectsInputSchema,
      false,
      ({ name, afterId, limit }) => {
        const rows = this.projects.listProjects({
          ...(name !== undefined ? { name } : {}),
          ...(afterId !== undefined ? { afterId } : {}),
          limit: limit + 1,
        });
        const items = rows.slice(0, limit);
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
      '读取明确项目的基本资料、当前项目版本及当前成功 operationId，不读取全部业务正文。projectId 来自项目列表或创建回执。',
      getProjectInputSchema,
      false,
      ({ projectId }) => {
        const project = this.projects.readProject(projectId);
        return success(`已读取项目“${String(project.project.content.name)}”`, project);
      },
    );

    register(
      'export_snapshot',
      '读取固定项目版本的完整文件清单或单文件字节分块，包含当前资料、来源和必要历史引用。version 来自已读项目；路径和分页位置来自本工具返回。不会在客户端落盘；格式见 export 规范。',
      exportSnapshotInputSchema,
      false,
      (input) =>
        success(
          input.part.kind === 'manifest' ? '已取得固定版本文件清单' : '已读取文件分块',
          this.exports.read(input),
        ),
    );

    register(
      'list_revisions',
      '分页列出一个对象在固定项目 version 内可见的修订元数据，按修订号倒序；不返回全部正文。id、version 来自已读资料，翻页沿用相同 version。',
      listRevisionsInputSchema,
      false,
      ({ projectId, objectType, id, version, beforeRevision, limit }) => {
        const rows = this.projects.readHistory(projectId, objectType, id, {
          version,
          limit: limit + 1,
          ...(beforeRevision === undefined ? {} : { beforeRevision }),
        });
        const items = rows.slice(0, limit);
        return success(
          `已取得 ${items.length} 条修订`,
          {
            projectId,
            objectType,
            id,
            version,
            items,
            nextBeforeRevision: rows.length > limit ? items.at(-1)!.revisionNo : null,
          },
          items.map((item) => `修订 ${item.revisionNo}${item.isDeleted ? '（已移除）' : ''}`),
          items.length,
        );
      },
    );

    register(
      'read_revision',
      '读取固定对象修订的正文及原始来源；target.kind=diagram 时，按指定项目 version 解析整张历史图及成员。固定图自身 revisionNo 不等于固定图成员版本。',
      readRevisionInputSchema,
      false,
      ({ projectId, version, target }) => {
        if (target.kind === 'diagram') {
          const resolved = resolveDiagram(
            this.projects.readSnapshot(projectId, version),
            target.id,
          );
          return success('已读取同一版本的图及成员', {
            ...resolved,
            sources: this.sourcesFor(projectId, version, [resolved.diagram, ...resolved.objects]),
          });
        }
        const revision = this.projects.readRevision(
          projectId,
          target.objectType,
          target.id,
          target.revisionNo,
          version,
        );
        return success(`已读取修订 ${revision.revisionNo}`, {
          projectId,
          version,
          revision,
          sources: this.sourcesFor(projectId, version, [revision]),
        });
      },
    );

    register(
      'get_operation',
      '查询不可变的成功保存回执。可用创建时 requestKey、项目内保存 requestKey，或已返回的 operationId。查不到表示尚无成功回执，不证明其他请求没有在执行。',
      getOperationInputSchema,
      false,
      ({ target }) => {
        const receipt =
          target.kind === 'operation'
            ? this.projects.getOperation(target.projectId, target.operationId)
            : this.projects.findOperation(
                operationId(
                  target.kind,
                  target.requestKey,
                  target.kind === 'save_changes' ? target.projectId : undefined,
                ),
              );
        if (!receipt) throw new ContentError('NOT_FOUND', '未查到成功保存回执。');
        return success('已查询到成功保存回执', { receipt });
      },
    );

    register(
      'create_project',
      '创建空项目，只保存实际提供的名称和可选仓库定位，业务内容为空、版本为0。requestKey 标识一次创建意图，同一 key 同内容重试返回原回执，不重复创建。不会扫描或修改业务仓库。',
      createProjectToolInputSchema,
      true,
      ({ requestKey, ...input }) => {
        const receipt = this.projects.createProject(
          { ...input, operationId: operationId('create_project', requestKey) },
          context,
        );
        return success(`项目“${input.name}”已创建`, { receipt });
      },
    );

    register(
      'save_changes',
      '一次原子保存指定项目的来源、综述、需求、记录或图对象变化，追加修订和来源历史。baseVersion/expectedRevision 必须是实际读取值。新增 ID 用 $临时名称，服务分配正式 ID 并解析同批引用。requestKey 同请求可安全重试，不同内容冲突；无自动合并或隐式准备步骤。HTTP请求上限1 MiB。写作和引用规范见 read_guide。',
      saveChangesInputSchema,
      true,
      (input) => {
        const resolved = resolveChanges(input);
        const receipt = this.projects.save(resolved.input, context);
        return success(
          `已保存 ${receipt.changes.length} 项对象修订`,
          { receipt, allocations: resolved.allocations },
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

  private sourcesFor(projectId: string, version: number, revisions: StoredRevision[]) {
    const ids = new Set<string>();
    for (const revision of revisions) {
      revision.citations.forEach((citation) => ids.add(citation.sourceId));
      revision.inputSourceIds.forEach((id) => ids.add(id));
      for (const key of ['primarySourceId', 'typeSourceId'])
        if (revision.objectType === 'entity' && typeof revision.content[key] === 'string')
          ids.add(revision.content[key] as string);
    }
    return this.projects.readSources(projectId, [...ids], version);
  }
}
