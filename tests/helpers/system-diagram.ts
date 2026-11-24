import type { SystemDiagram } from '../../src/contracts/content/overview.js';

export const fixtureSystemDiagram = {
  introductionMd: '测试读者通过应用查阅项目资料。',
  nodes: [
    { id: 'reader', kind: 'participant', label: '测试读者' },
    { id: 'app', kind: 'service', label: '测试应用' },
  ],
  edges: [{ source: 'reader', target: 'app', label: '查阅资料' }],
} satisfies SystemDiagram;
