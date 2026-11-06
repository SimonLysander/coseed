const types = '(?:feat|fix|docs|refactor|perf|test|build|ci|chore|revert)';
const branchPattern = new RegExp(`^${types}/[a-z0-9]+(?:-[a-z0-9]+)*$`);
const titlePattern = new RegExp(`^${types}(?:\\([a-z][a-z0-9-]*\\))?!?: \\S[^\\r\\n]*$`);
const branch = process.env.COSEED_PR_BRANCH ?? '';
const title = process.env.COSEED_PR_TITLE ?? '';
const failures = [];

if (!branchPattern.test(branch)) {
  failures.push('来源分支需使用 feat/、fix/、docs/ 等约定前缀及英文小写 kebab-case 描述。');
}
if (!titlePattern.test(title) || title.trim() !== title) {
  failures.push('PR 标题需采用 Conventional Commits，例如 feat(projects): 增加项目管理。');
}
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.info('来源分支和 PR 标题符合贡献规范。');
}
