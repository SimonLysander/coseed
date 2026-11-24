import { startApplication } from '../dist/server/application.js';
import { loadConfig } from '../dist/server/config/load-config.js';

const config = await loadConfig();
// Docker forwards the host's loopback port to the container network interface.
await startApplication(config, { listenHost: '0.0.0.0' });
if (config.logLevel === 'info' || config.logLevel === 'debug') {
  console.info(`CoSeed 已在容器端口 ${config.port} 启动。`);
}
