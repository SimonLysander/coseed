import { Controller, Get, Header, Inject, Logger, Param, Query } from '@nestjs/common';
import { overviewQuerySchema, projectIdSchema } from '../../../contracts/projects-http.js';
import {
  businessIndexResponseSchema,
  businessDiagramResponseSchema,
} from '../../../contracts/business-http.js';
import { BusinessReadService } from '../project-content/business-read.service.js';
import { input, executeHttp } from './http-adapter.js';
@Controller('api/projects/:projectId/business')
export class BusinessController {
  private readonly logger = new Logger(BusinessController.name);
  constructor(@Inject(BusinessReadService) private readonly business: BusinessReadService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Param('projectId') projectId: string, @Query() raw: unknown) {
    return executeHttp(this.logger, () =>
      businessIndexResponseSchema.parse(
        this.business.list(
          input(projectIdSchema, projectId),
          input(overviewQuerySchema, raw).version,
        ),
      ),
    );
  }
  @Get('diagrams/:diagramId')
  @Header('Cache-Control', 'no-store')
  diagram(
    @Param('projectId') projectId: string,
    @Param('diagramId') diagramId: string,
    @Query() raw: unknown,
  ) {
    return executeHttp(this.logger, () =>
      businessDiagramResponseSchema.parse(
        this.business.diagram(
          input(projectIdSchema, projectId),
          input(projectIdSchema, diagramId),
          input(overviewQuerySchema, raw).version,
        ),
      ),
    );
  }
}
