import { BusinessReadService } from './business-read.service.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { RequirementsReadService } from './requirements-read.service.js';
import { ProjectContentService } from './project-content.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProjectContentService, RequirementsReadService, BusinessReadService],
  exports: [ProjectContentService, RequirementsReadService, BusinessReadService],
})
export class ProjectContentModule {}
