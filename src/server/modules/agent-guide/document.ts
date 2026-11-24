import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requirementFieldGuide } from '../../../contracts/content/requirements.js';
import { packageRoot } from '../../package-info.js';

export const guideDocument = readFileSync(
  join(packageRoot, 'docs/operations/agent-integration.md'),
  'utf8',
);

const fieldReference = '需求字段的填写要求以需求内容 Schema 为准。';
if (!requirementFieldGuide || guideDocument.split(fieldReference).length !== 2) {
  throw new Error('共享 Schema 与指南正文未对应。');
}
const standaloneDocument = guideDocument.replace(fieldReference, () => requirementFieldGuide);

export function standaloneGuide(mcpAddress: string): string {
  return standaloneDocument.replace('`/mcp`', () => `\`${mcpAddress}\``);
}
