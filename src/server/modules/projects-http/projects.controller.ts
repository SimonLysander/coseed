import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Inject,
  Logger,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createProjectRequestSchema,
  createProjectResponseSchema,
  overviewQuerySchema,
  projectIdSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectOverviewResponseSchema,
  projectResponseSchema,
} from '../../../contracts/projects-http.js';
import type { StoredRevision } from '../../../contracts/project-content.js';
import { ProjectContentService } from '../project-content/project-content.service.js';
import { ContentError } from '../project-content/errors.js';

const context = {
  entrypoint: 'web',
  actorKind: 'human',
  actorLabel: '本机用户（未认证）',
  clientMetadata: { transport: 'http' },
} as const;
const summary = (project: StoredRevision, version: number) => ({
  ...project.content,
  id: project.id,
  version,
  createdAt: project.createdAt,
});
function input<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new HttpException(
      { error: { code: 'INVALID_INPUT', message: '请求字段不符合结构约定。' } },
      400,
    );
  return result.data;
}

// The HTTP adapter owns transport validation and projection; writes remain in the shared service.
@Controller('api/projects')
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);
  constructor(@Inject(ProjectContentService) private readonly projects: ProjectContentService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() raw: unknown) {
    return this.execute(() => {
      const { limit, name, afterId } = input(projectListQuerySchema, raw);
      const rows = this.projects.listProjects({
        ...(name === undefined ? {} : { name }),
        ...(afterId === undefined ? {} : { afterId }),
        limit: limit + 1,
      });
      const items = rows.slice(0, limit);
      return projectListResponseSchema.parse({
        items,
        nextAfterId: rows.length > limit ? items.at(-1)!.id : null,
      });
    });
  }

  @Post()
  create(@Body() raw: unknown) {
    return this.execute(() => {
      const receipt = this.projects.createProject(input(createProjectRequestSchema, raw), context);
      return createProjectResponseSchema.parse({
        projectId: receipt.projectId,
        operationId: receipt.operationId,
        version: receipt.version,
        savedAt: receipt.savedAt,
      });
    });
  }

  @Get(':projectId')
  @Header('Cache-Control', 'no-store')
  get(@Param('projectId') projectId: string) {
    return this.execute(() => {
      const current = this.projects.readProject(input(projectIdSchema, projectId));
      return projectResponseSchema.parse({ project: summary(current.project, current.version) });
    });
  }

  @Get(':projectId/overview')
  @Header('Cache-Control', 'no-store')
  overview(@Param('projectId') projectId: string, @Query() raw: unknown) {
    return this.execute(() => {
      const { version } = input(overviewQuerySchema, raw);
      const current = this.projects.readOverview(input(projectIdSchema, projectId), version);
      return projectOverviewResponseSchema.parse({
        project: summary(current.project, current.version),
        overview: current.overview
          ? {
              revisionNo: current.overview.revisionNo,
              savedAt: current.overview.savedAt,
              content: current.overview.content,
            }
          : null,
      });
    });
  }

  private execute<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error('项目读取视图不符合响应契约', error.stack);
        throw new HttpException(
          { error: { code: 'INVALID_RESPONSE', message: '服务内容不符合当前响应协议。' } },
          500,
        );
      }
      if (error instanceof ContentError) {
        const statuses = {
          NOT_FOUND: 404,
          CONFLICT: 409,
          OPERATION_MISMATCH: 409,
          STORAGE_BUSY: 503,
          STORAGE_CORRUPT: 500,
        };
        const status = statuses[error.code as keyof typeof statuses] ?? 400;
        throw new HttpException({ error: { code: error.code, message: error.message } }, status);
      }
      throw error;
    }
  }
}
