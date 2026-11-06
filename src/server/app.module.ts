import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database/database.service.js';
import { McpController } from './mcp/mcp.controller.js';
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
      ],
      controllers: [StatusController, McpController],
      providers: [DatabaseService],
    };
  }
}
