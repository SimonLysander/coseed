import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ProjectKeysService } from './project-keys.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProjectKeysService],
  exports: [ProjectKeysService],
})
export class ProjectAccessModule {}
