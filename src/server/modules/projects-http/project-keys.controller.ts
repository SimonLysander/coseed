import { Controller, Delete, Get, Header, Inject, Logger, Param, Post } from '@nestjs/common';
import { ProjectKeysService } from '../project-access/project-keys.service.js';
import { executeHttp, input } from './http-adapter.js';
import { projectIdSchema, projectKeyInfoSchema } from '../../../contracts/projects-http.js';

@Controller('api/projects/:projectId/mcp-keys')
export class ProjectKeysController {
  private readonly logger = new Logger(ProjectKeysController.name);
  constructor(@Inject(ProjectKeysService) private readonly keys: ProjectKeysService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Param('projectId') id: string) {
    return executeHttp(this.logger, () => ({ items: this.keys.list(input(projectIdSchema, id)) }));
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  issue(@Param('projectId') id: string) {
    return executeHttp(this.logger, () => this.keys.issue(input(projectIdSchema, id)));
  }

  @Delete(':keyId')
  @Header('Cache-Control', 'no-store')
  revoke(@Param('projectId') id: string, @Param('keyId') keyId: string) {
    return executeHttp(this.logger, () =>
      this.keys.revoke(input(projectIdSchema, id), input(projectKeyInfoSchema.shape.id, keyId)),
    );
  }
}
