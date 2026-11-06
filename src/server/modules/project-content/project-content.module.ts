import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ProjectContentService } from './project-content.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProjectContentService],
  exports: [ProjectContentService],
})
export class ProjectContentModule {}
