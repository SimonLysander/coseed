import { BusinessController } from './business.controller.js';
import { Module } from '@nestjs/common';
import { ProjectContentModule } from '../project-content/project-content.module.js';
import { RequirementsController } from './requirements.controller.js';
import { ProjectsController } from './projects.controller.js';

@Module({
  imports: [ProjectContentModule],
  controllers: [ProjectsController, RequirementsController, BusinessController],
})
export class ProjectsHttpModule {}
