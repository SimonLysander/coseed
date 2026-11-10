import { Controller, Get, Header, Inject, Logger, Param, Query } from '@nestjs/common';
import { projectIdSchema, overviewQuerySchema } from '../../../contracts/projects-http.js';
import {
  fixedVersionQuerySchema,
  historyQuerySchema,
  historyResponseSchema,
  historyTypeSchema,
  recordsQuerySchema,
  recordsResponseSchema,
  requirementResponseSchema,
  requirementsQuerySchema,
  requirementsResponseSchema,
  revisionParamSchema,
  revisionResponseSchema,
} from '../../../contracts/requirements-http.js';
import { RequirementsReadService } from '../project-content/requirements-read.service.js';
import { executeHttp, input } from './http-adapter.js';

@Controller('api/projects/:projectId')
export class RequirementsController {
  private readonly logger = new Logger(RequirementsController.name);
  constructor(
    @Inject(RequirementsReadService) private readonly requirements: RequirementsReadService,
  ) {}

  @Get('requirements')
  @Header('Cache-Control', 'no-store')
  list(@Param('projectId') projectId: string, @Query() raw: unknown) {
    return executeHttp(this.logger, () =>
      requirementsResponseSchema.parse(
        this.requirements.list(
          input(projectIdSchema, projectId),
          input(requirementsQuerySchema, raw),
        ),
      ),
    );
  }

  @Get('requirements/:requirementId')
  @Header('Cache-Control', 'no-store')
  detail(
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
    @Query() raw: unknown,
  ) {
    return executeHttp(this.logger, () =>
      requirementResponseSchema.parse(
        this.requirements.detail(
          input(projectIdSchema, projectId),
          input(projectIdSchema, requirementId),
          input(overviewQuerySchema, raw).version,
        ),
      ),
    );
  }

  @Get('requirements/:requirementId/records')
  @Header('Cache-Control', 'no-store')
  records(
    @Param('projectId') projectId: string,
    @Param('requirementId') requirementId: string,
    @Query() raw: unknown,
  ) {
    return executeHttp(this.logger, () =>
      recordsResponseSchema.parse(
        this.requirements.records(
          input(projectIdSchema, projectId),
          input(projectIdSchema, requirementId),
          input(recordsQuerySchema, raw),
        ),
      ),
    );
  }

  @Get('history/:objectType/:objectId')
  @Header('Cache-Control', 'no-store')
  history(
    @Param('projectId') projectId: string,
    @Param('objectType') type: string,
    @Param('objectId') id: string,
    @Query() raw: unknown,
  ) {
    return executeHttp(this.logger, () =>
      historyResponseSchema.parse(
        this.requirements.history(
          input(projectIdSchema, projectId),
          input(historyTypeSchema, type),
          input(projectIdSchema, id),
          input(historyQuerySchema, raw),
        ),
      ),
    );
  }

  @Get('history/:objectType/:objectId/revisions/:revisionNo')
  @Header('Cache-Control', 'no-store')
  revision(
    @Param('projectId') projectId: string,
    @Param('objectType') type: string,
    @Param('objectId') id: string,
    @Param('revisionNo') revisionNo: string,
    @Query() raw: unknown,
  ) {
    return executeHttp(this.logger, () =>
      revisionResponseSchema.parse(
        this.requirements.revision(
          input(projectIdSchema, projectId),
          input(historyTypeSchema, type),
          input(projectIdSchema, id),
          input(revisionParamSchema, revisionNo),
          input(fixedVersionQuerySchema, raw).version,
        ),
      ),
    );
  }
}
