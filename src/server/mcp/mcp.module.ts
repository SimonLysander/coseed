import { Module } from '@nestjs/common';
import { ProjectContentModule } from '../modules/project-content/project-content.module.js';
import { McpController } from './mcp.controller.js';
import { McpToolsService } from './tools.service.js';
import { SnapshotExportService } from './snapshots/export.service.js';

@Module({
  imports: [ProjectContentModule],
  controllers: [McpController],
  providers: [McpToolsService, SnapshotExportService],
})
export class McpModule {}
