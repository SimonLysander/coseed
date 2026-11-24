# 使用 Docker 部署 CoSeed

首次启动只需 Docker 和 Compose。在含有 `compose.yaml` 的源码目录执行以下命令即可使用默认配置。

```bash
docker compose up --build -d --wait
```

打开工作台，创建或选中项目。需要连接 Agent 时，在该项目的「接入指南」生成密钥，复制页面提供的 MCP 地址，并将密钥填入 Agent 客户端的 Bearer Token 栏。[打开默认工作台](http://127.0.0.1:4310)

| 运行配置           | 默认值 | 何时调整                                                               |
| ------------------ | ------ | ---------------------------------------------------------------------- |
| `COSEED_PORT`      | `4310` | 宿主机端口已被占用时更换。网页和 MCP 共用此端口，容器内固定使用 4310。 |
| `COSEED_LOG_LEVEL` | `info` | 排错时可设为 `debug`，也可设为 `warn`、`error` 或 `silent`。           |

需要调整时，在 `compose.yaml` 同目录的 `.env` 写入所需项，再执行启动命令。例如 `COSEED_PORT=4311` 对应的网页地址为 `http://127.0.0.1:4311`。端口仅向宿主机回环地址开放。

- **数据和备份。** Compose 将项目专属的命名卷 `coseed-data` 挂载到 `/var/lib/coseed`，保存 SQLite 数据库、修订历史和实例身份。执行 `docker compose down` 会保留卷，`down --volumes` 会删除卷。备份时先执行 `docker compose stop`，备份整个卷后运行 `docker compose start`。
- **更新。** 在原 Compose 项目中取得新版源码，再次执行启动命令。新容器会挂载原卷并应用数据库迁移。Compose 默认使用目录名作为项目名，更换目录时请沿用原项目名。
- **排错。** 使用 `docker compose ps` 查看健康状态，使用 `docker compose logs coseed` 查看日志。

## 更换构建下载源

Docker 默认从 Docker Hub 获取 Node 基础镜像，再在构建容器中从 npm 官方仓库安装依赖。访问默认源受限时，在 `compose.yaml` 同目录的 `.env` 中加入对应行，再执行启动命令。

| 下载内容      | 可选配置示例                                               |
| ------------- | ---------------------------------------------------------- |
| npm 依赖包    | `NPM_CONFIG_REGISTRY=https://registry.npmmirror.com/`      |
| Node 基础镜像 | `NODE_IMAGE_REPOSITORY=public.ecr.aws/docker/library/node` |

可以使用团队自己的镜像仓库。Node 镜像填写完整仓库路径，构建时使用 Dockerfile 指定的标签。构建器已配置 Docker Hub 镜像加速时，可省略这一项。[Docker 镜像加速](https://docs.docker.com/docker-hub/image-library/mirror/)

npm 从所选源下载锁定版本，并按 `package-lock.json` 校验包内容。构建参数只填不含密码或令牌的地址。[npm 配置](https://docs.npmjs.com/cli/using-npm/config/#replace-registry-host)
