#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '../server/config/load-config.js';
import { packageVersion } from '../server/package-info.js';

const program = new Command();
program.name('coseed').description('CoSeed 本地项目认知工作台').version(packageVersion);

program
  .command('start')
  .description('启动 Web 和 MCP 本地服务')
  .option('--host <host>', '监听地址，仅支持本机回环地址')
  .option('--port <port>', '监听端口，0 表示自动分配')
  .option('--data-dir <path>', '数据目录')
  .option('--config <path>', '显式指定 JSON 配置文件')
  .option('--no-web', '仅启动 HTTP/MCP，页面由独立开发服务器提供')
  .option('--log-level <level>', 'silent / error / warn / info / debug')
  .action(
    async (options: {
      host?: string;
      port?: string;
      dataDir?: string;
      config?: string;
      logLevel?: string;
      web: boolean;
    }) => {
      const config = await loadConfig({
        ...(options.config === undefined ? {} : { configPath: options.config }),
        overrides: {
          host: options.host,
          port: options.port,
          dataDir: options.dataDir,
          logLevel: options.logLevel,
        },
      });
      const { createApplication } = await import('../server/application.js');
      const app = await createApplication(config, { serveWeb: options.web });
      try {
        await app.listen(config.port, config.host);
        const url = await app.getUrl();
        console.info(
          `CoSeed ${packageVersion}\n${options.web ? 'Web' : 'HTTP'}: ${url}\nMCP: ${url}/mcp`,
        );
      } catch (error) {
        await app.close();
        throw error;
      }
    },
  );

try {
  await program.parseAsync();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
