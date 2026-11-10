import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { ProjectContentModule } from './modules/project-content/project-content.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { ProjectsHttpModule } from './modules/projects-http/projects-http.module.js';
import { StatusController } from './modules/system/status.controller.js';
import type { RuntimeConfig } from './config/schema.js';

@Module({})
export class AppModule {
  static register(config: RuntimeConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ runtime: config })],
        }),
        DatabaseModule,
        ProjectContentModule,
        McpModule,
        ProjectsHttpModule,
      ],
      controllers: [StatusController],
    };
  }
}
