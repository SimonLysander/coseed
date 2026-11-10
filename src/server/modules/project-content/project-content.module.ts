import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { RequirementsReadService } from './requirements-read.service.js';
import { ProjectContentService } from './project-content.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProjectContentService, RequirementsReadService],
  exports: [ProjectContentService, RequirementsReadService],
})
export class ProjectContentModule {}
