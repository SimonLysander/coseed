# CoSeed 开发与版本规范

本规范适用于 **CoSeed 程序本身的源码仓库**；CoSeed 未来内部管理的项目资料 Git 仓库，其提交和发布规则由业务协议另行设计。

## 分支

采用 GitHub Flow：`main` 为唯一长期主分支，保持可构建、验证通过；每项可独立验收的变化从最新 main 创建功能分支，通过 PR 审查后合并。暂不建立 develop 或长期版本分支。

| 前缀                | 用途                     | 示例                     |
| ------------------- | ------------------------ | ------------------------ |
| feat/               | 新功能                   | feat/agent-guide         |
| fix/                | 缺陷修复                 | fix/navigation-overflow  |
| docs/               | 文档                     | docs/mcp-guide           |
| refactor/           | 保持行为的结构调整       | refactor/project-storage |
| perf/               | 性能改进                 | perf/diagram-layout      |
| test/               | 测试                     | test/project-isolation   |
| build/、ci/、chore/ | 构建、持续集成、工程维护 | ci/quality-checks        |
| revert/             | 撤销已合并变化           | revert/project-import    |

分支使用对应前缀加英文小写 kebab-case 描述，围绕一项变化尽快合并；大功能拆成可以独立验证的阶段，不把整个系统长期堆在一个分支。不同任务共用工作区前先检查状态，不覆盖已有修改。

仓库首次没有任何提交时，允许在 main 建立一次经过验证的初始化基线，包含此前积累的工程基础和已完成页面；其后执行上述功能分支流程。

## 提交

采用 Conventional Commits，说明默认使用中文：

```text
feat(agent-guide): 增加接入说明阅读页
fix(navigation): 修复窄屏导航溢出
docs: 补充 MCP 操作规范
```

格式为 `type(scope): description`，scope 可省略；不兼容变化用 `!` 或正文中的 `BREAKING CHANGE:` 明确表达。允许的 type 与分支前缀一致。

分支内按完整、内聚的变化分次提交，提交应可构建并执行相关验证；不为等整个大功能完成而一直不提交，也不将无关修改打包。提交前检查实际暂存内容，排除凭据、个人项目数据、构建产物和临时验证文件。使用已配置的真实 Git 身份，不擅自改为 Agent 或机器人身份。

不得改写 main 或已发布 Tag；已共享的功能分支需要改写历史时先协调。恢复已合并内容优先通过新的 revert／修复提交，不抹掉历史。

## PR 和合并

1. 从最新 main 创建分支，实现一个可独立验收的功能或阶段。
2. 执行与变化风险匹配的验证，完成时审查最终 diff 和模块边界。
3. PR 标题采用 Conventional Commits，描述说明问题、变化、实际验证和重要限制；界面变化附可核对的页面或截图。
4. CI 和审查通过后，默认 **Squash and merge**，让 main 上每次合并代表一个清楚的功能或阶段；合并前核对最终提交说明。
5. 合并后删除已完成分支，下一项任务重新从 main 开始。

需要远程 PR 时，推送到当前项目远程并创建 PR；普通本地 commit 不自动意味着获得发布、部署、推送或合并授权。按任务中已有授权执行，不为已授权动作重复确认。

单维护者项目不强制一名“其他人批准”，避免所有者无法批准自己的 PR。重要产品语义、核心模型和迁移仍遵守项目的人工作业确认边界。

## 检查

使用 `.node-version` 和 `package.json` 固定的 Node/npm，安装执行 `npm ci`。

```bash
npm run check
npm exec playwright install --with-deps --no-shell chromium
npm run test:e2e
npm run test:design
npm run verify:package
```

`check` 覆盖类型、构建、单元／服务集成测试、HTTP 契约同步及格式；浏览器验证覆盖正式前端与设计样板；安装包验证使用临时目录，不接触个人默认数据。

日常开发先运行相关检查；PR CI 执行完整检查。`.github/workflows/ci.yml` 的固定任务名称为 `CoSeed contribution` 和 `CoSeed quality`。前者检查 PR 来源分支和标题，后者运行完整验证；本地复现前者时向 `scripts/verify-contribution.mjs` 提供 `COSEED_PR_BRANCH`、`COSEED_PR_TITLE`。

本地检查通过不代表 GitHub CI 已运行；工作流实际执行后再报告远端结果。当前 CI 首先选择 Ubuntu；本机验证不能替代 Linux 运行结果或其他平台兼容性证明。

## GitHub 主分支保护

首次推送并运行工作流后，在仓库规则中配置 main：

- 修改通过 PR 合并，要求上述两个检查通过，合并前与 main 保持可合并且满足检查要求。
- 禁止强推和删除 main，要求线性提交历史；推荐仅启用 squash 合并。
- 不默认设置必须由另一位维护者批准；团队扩大后再确认审查人数和 CODEOWNERS。

这些是远程设置要求，**提交此文件不会自动启用 GitHub 分支保护**。远程是否已配置须实际检查；本次不使用脚本默默改变仓库权限或管理设置。

## 功能、提交与发布版本

分支组织工作，commit 保存变化，PR 汇总一次可验收交付，Tag 标记发布版本；四者不要求一对一。

目前处于 `0.x` 初期开发，公共接口未稳定。按可验收功能推进和合并；决定发布时更新 package.json 及 lockfile、编写变更说明，在已验证提交上创建对应 `vX.Y.Z` Tag。功能完成不自动增加版本或触发发布。发布后的 Tag 不移动，同名版本内容不覆盖。

以后公共接口稳定进入 1.0：兼容的新能力增加 MINOR，兼容修复增加 PATCH，不兼容变化增加 MAJOR。不要把口语中的“大功能版本”直接等同于 SemVer 的 MAJOR。

## 依据

- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [GitHub 受保护分支](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
