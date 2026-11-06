/** Disposable format experiment; not a production codec or benchmark. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'coseed-format-research-'));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 });
  if (result.error) throw result.error;
  return result;
}
try {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true }));
  // Research dependencies stay in the disposable directory, never in CoSeed's lockfile.
  const installed = run('npm', [
    'install',
    '--prefix',
    directory,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    'yaml@2.9.1',
    'gray-matter@4.0.3',
  ]);
  if (installed.status !== 0)
    throw new Error(`Research dependency install failed: ${installed.stderr}`);
  const require = createRequire(join(directory, 'package.json'));
  const yaml = require('yaml');
  const matter = require('gray-matter');
  const parseYaml = (text) => {
    const document = yaml.parseDocument(text, { schema: 'core', uniqueKeys: true });
    if (document.errors.length || document.warnings.length)
      throw new Error('Unsupported or invalid YAML');
    return document.toJS({ maxAliasCount: 0 });
  };
  const rejectExecutable = () => {
    throw new Error('Executable frontmatter is excluded from this experiment');
  };
  const matterOptions = {
    language: 'yaml',
    engines: {
      yaml: { parse: parseYaml, stringify: (value) => yaml.stringify(value) },
      js: rejectExecutable,
      javascript: rejectExecutable,
      coffee: rejectExecutable,
      coffeescript: rejectExecutable,
    },
  };
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const formats = {
    json: {
      encode: (value) => ({ 'entry.json': json(value) }),
      decode: (files) => JSON.parse(files['entry.json']),
    },
    yaml: {
      encode: (value) => ({ 'entry.yaml': yaml.stringify(value) }),
      decode: (files) => parseYaml(files['entry.yaml']),
    },
    markdown_frontmatter: {
      encode: ({ markdown, ...metadata }) => ({
        'entry.md': matter.stringify(markdown, metadata, matterOptions),
      }),
      decode: (files) => {
        const parsed = matter(files['entry.md'], matterOptions);
        return { ...parsed.data, markdown: parsed.content };
      },
    },
    json_and_markdown: {
      encode: ({ markdown, ...metadata }) => ({
        'entry.json': json(metadata),
        'body.md': markdown,
      }),
      decode: (files) => ({ ...JSON.parse(files['entry.json']), markdown: files['body.md'] }),
    },
  };
  const base = {
    schemaVersion: 1,
    kind: 'requirement',
    id: 'req-demo',
    title: '资料格式实验',
    status: 'designing',
    occurredAt: null,
  };
  const body = [
    '# 资料存储格式比较',
    '',
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `第 ${index + 1} 段：核对项目现有资料和相关代码，保留具体的讨论依据，说明本次结论以及它对当前设计产生的影响。`,
    ),
    '',
    '| 字段 | 含义 |',
    '| --- | --- |',
    '| id | 稳定身份 |',
    '',
    '```ts',
    'type Order = { id: string; /* 订单身份 */ };',
    '```',
    '',
    '---',
    '',
    '正文中的分隔线属于 Markdown 内容。',
    '',
  ].join('\n');
  const examples = [
    { name: 'rich_markdown', value: { ...base, markdown: body } },
    {
      name: 'quoted_metadata',
      value: { ...base, title: '名称: "引号" # 标记', label: '2026-11-06', markdown: '正文\n' },
    },
    { name: 'no_final_newline', value: { ...base, markdown: '一句没有末尾换行的正文' } },
    { name: 'leading_blank_line', value: { ...base, markdown: '\n第一段之前有空行。\n' } },
    { name: 'crlf_body', value: { ...base, markdown: '第一行\r\n第二行\r\n' } },
    { name: 'empty_body', value: { ...base, markdown: '' } },
  ];
  const results = [];
  for (const [name, codec] of Object.entries(formats)) {
    const roundTrips = examples.map(({ name, value }) => {
      const parsed = codec.decode(codec.encode(value));
      let exact = true;
      try {
        assert.deepEqual(parsed, value);
      } catch {
        exact = false;
      }
      return { fixture: name, exact, markdownExact: parsed.markdown === value.markdown };
    });
    const value = examples[0].value;
    const changed = {
      ...value,
      markdown: value.markdown.replace(
        '第 6 段：核对项目现有资料',
        '第 6 段：首先核对项目现有资料',
      ),
    };
    const before = codec.encode(value);
    const after = codec.encode(changed);
    const formatDir = join(directory, name);
    for (const [side, files] of [
      ['before', before],
      ['after', after],
    ]) {
      mkdirSync(join(formatDir, side), { recursive: true });
      for (const [path, content] of Object.entries(files))
        writeFileSync(join(formatDir, side, path), content);
    }
    const args = [
      'diff',
      '--no-index',
      '--no-ext-diff',
      '--no-color',
      '--unified=0',
      join(formatDir, 'before'),
      join(formatDir, 'after'),
    ];
    const diff = run('git', args);
    assert.equal(diff.status, 1, diff.stderr);
    const changedLines = diff.stdout
      .split('\n')
      .filter(
        (line) =>
          (line.startsWith('+') && !line.startsWith('+++')) ||
          (line.startsWith('-') && !line.startsWith('---')),
      );
    results.push({
      format: name,
      filesPerEntry: Object.keys(before).length,
      storedBytes: Object.values(before).reduce((sum, value) => sum + Buffer.byteLength(value), 0),
      changedLines: changedLines.length,
      changedLineBytes: changedLines.reduce((sum, line) => sum + Buffer.byteLength(line) + 1, 0),
      roundTrips,
    });
  }
  assert.throws(() => matter('---js\n({title: "excluded"})\n---\nbody', matterOptions), /excluded/);
  assert.throws(() => parseYaml('id: first\nid: duplicate\n'), /invalid/);
  console.log(
    JSON.stringify(
      {
        purpose:
          'Format research fixture only; not a schema decision or workload performance result',
        dependencies: {
          yaml: JSON.parse(readFileSync(join(directory, 'node_modules/yaml/package.json'))).version,
          grayMatter: JSON.parse(
            readFileSync(join(directory, 'node_modules/gray-matter/package.json')),
          ).version,
        },
        method:
          'Same synthetic document, one paragraph changed, UTF-8 bytes of added/deleted Git diff lines; strict parsed-value round trips',
        checks: [
          'isolated_dependencies',
          'executable_frontmatter_rejected',
          'duplicate_yaml_keys_rejected',
        ],
        results,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
