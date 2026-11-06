# 本地开发和运行

## 环境

使用 `.nvmrc` 指定的 Node.js 正式稳定版本和 `package.json` 指定的 npm。直接依赖精确锁定，使用 `npm ci` 复现安装；不要使用预发布版本或 `--force` 绕过依赖冲突。

```bash
nvm install
nvm use
npm install --global npm@12.2.2
npm ci
```

这里的 npm 安装发生在当前 nvm Node 下。也可以使用其他支持项目级版本的管理工具；无需更改系统 Node。本次开发环境使用独立缓存中的 Node/npm，不依赖修改全局默认值。

npm 12 会控制依赖安装脚本。`package.json` 的 `allowScripts` 只允许已核对的 esbuild 版本；升级时运行 `npm install-scripts ls`，核对脚本后再调整。SQLite 当前版本提供预编译模块，仍需在目标平台实测。

## 开发

```bash
cp .env.example .env
npm run dev
```

前端开发地址为 `http://127.0.0.1:5173`，API 代理到本地服务；MCP 直接连接服务端的 `/mcp`。`.env.example` 默认服务端口为 4310，开发数据在仓库 `.coseed/development/`，不入 Git。

修改开发服务端口时，Vite 代理跟随 `COSEED_PORT`。开发代理固定回环 IPv4 地址，开发环境保持 `COSEED_HOST=127.0.0.1`；正式 CLI 也支持 `localhost` 和 `::1`。

`npm run dev` 同时启动 tsx 服务监视和 Vite。开发服务使用 `--no-web`，仅提供 HTTP/MCP，不依赖或读取生产页面构建产物；页面由 Vite 提供。服务源码由 tsx 执行时，构造器依赖使用显式 `@Inject`，不依赖 tsx 生成类型元数据；正式构建由 TypeScript 编译。

## 生产构建及 CLI

```bash
npm run build
npm start
# 或
node dist/cli/index.js start --port 4310 --data-dir /absolute/path/to/coseed-data
```

CLI 打印实际 Web 和 MCP 地址。端口 `0` 表示自动分配空闲端口；端口冲突会报错退出，不静默切换端口。数据目录须可写。

## 配置

优先级：启动参数 > `COSEED_*` 环境变量 > JSON 配置文件 > 默认值。

| 项           | 环境变量         | 启动参数    | 默认值                               |
| ------------ | ---------------- | ----------- | ------------------------------------ |
| host         | COSEED_HOST      | --host      | 127.0.0.1，仅允许回环地址            |
| port         | COSEED_PORT      | --port      | 4310；0 为动态端口                   |
| dataDir      | COSEED_DATA_DIR  | --data-dir  | 平台对应的数据目录                   |
| logLevel     | COSEED_LOG_LEVEL | --log-level | info；另支持 silent/error/warn/debug |
| 配置文件位置 | COSEED_CONFIG    | --config    | 平台配置目录下的 config.json         |

`env-paths('coseed', { suffix: '' })` 决定平台目录：

| 平台    | 配置目录                                       | 数据目录                                          |
| ------- | ---------------------------------------------- | ------------------------------------------------- |
| macOS   | ~/Library/Preferences/coseed                   | ~/Library/Application Support/coseed              |
| Linux   | $XDG_CONFIG_HOME/coseed，默认 ~/.config/coseed | $XDG_DATA_HOME/coseed，默认 ~/.local/share/coseed |
| Windows | %APPDATA%/coseed/Config                        | %LOCALAPPDATA%/coseed/Data                        |

默认配置文件不存在时使用默认值；显式指定的配置文件不存在、JSON 错误、未知键或字段错误时启动失败。配置加载本身不创建目录或改写文件。

```json
{
  "host": "127.0.0.1",
  "port": 4310,
  "dataDir": "./data",
  "logLevel": "info"
}
```

文件里的相对数据路径相对于该配置文件；环境变量及参数里的相对路径相对于启动工作目录。支持 `~` 和 `~/`，不执行 shell 表达式。服务运行配置重启后生效。

正式 CLI 不自动加载当前目录的 `.env`；只有开发命令显式加载仓库 `.env`，避免从某个被管理仓库误读服务配置。运行配置不等同于项目设置，后者随业务模型设计进入数据库。

## 验证与排错

```bash
npm run check
npm exec playwright install --no-shell chromium
npm run test:e2e
npm run verify:package
```

- `check` 检查服务、页面和测试的类型，执行配置/CLI/真实 SQLite/MCP 集成测试，构建并检查格式及生成的接口契约。
- 浏览器测试启动临时实例，数据放在系统临时目录，检查就绪、弹窗、错误重试及窄屏溢出。
- 安装包验证将 npm tarball 安装到临时目录，只装生产依赖，再从无关目录启动，检查 SQLite、页面资源和 MCP 初始化。
- 缺少页面构建产物：先执行 `npm run build`；不从源码目录直接对外提供未编译页面。
- Native 模块无法加载：核对 Node 版本、操作系统和架构，使用 lockfile 重新安装，保留实际错误。不要用忽略数据库失败的方式启动。
- `403`：检查 Host/Origin 是否为同一本机来源；当前没有局域网访问或跨站浏览器接入能力。

目前只验证基础设施闭环。完整项目读写、业务迁移、图形性能以及其他操作系统的安装验证仍待完成。

## 初始化性能记录

2026-11-05 在本机 macOS ARM64、Node.js 26.13.0 上，安装包验证中的单次启动到状态可读约为 0.7–1.0 秒；样本不足以代表 P95，也不是其他设备的性能承诺。

当前生产首页主 JS gzip 约 259 KB，连接弹窗独立按需加载，X6/ELK 不进入首页导入链。主 JS 原始体积仍超过 Vite 默认的 500 KB 提示线，已保留构建提示；后续依据路由内容和浏览器实测继续优化。完整业务图的加载、布局和交互性能尚未测量。
