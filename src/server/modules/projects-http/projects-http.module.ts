import { ProjectAccessModule } from '../project-access/project-access.module.js';
import { ProjectKeysController } from './project-keys.controller.js';
import { BusinessController } from './business.controller.js';
import { Module } from '@nestjs/common';
import { ProjectContentModule } from '../project-content/project-content.module.js';
import { RequirementsController } from './requirements.controller.js';
import { ProjectsController } from './projects.controller.js';

@Module({
  imports: [ProjectContentModule, ProjectAccessModule],
  controllers: [
    ProjectKeysController,
    ProjectsController,
    RequirementsController,
    BusinessController,
  ],
})
export class ProjectsHttpModule {}
