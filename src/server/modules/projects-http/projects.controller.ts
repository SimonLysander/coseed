import { Body, Controller, Get, Header, Inject, Logger, Param, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { executeHttp, input, summary } from './http-adapter.js';
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
import { ProjectContentService } from '../project-content/project-content.service.js';

const context = {
  entrypoint: 'web',
  actorKind: 'human',
  actorLabel: '本机用户（未认证）',
  clientMetadata: { transport: 'http' },
} as const;

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
    return executeHttp(this.logger, action);
  }
}
