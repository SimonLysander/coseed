import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { createTestProject, issueTestKey, projectTransport } from './project-mcp.ts';

export async function verifyProject(base) {
  const client = new Client({ name: 'coseed-docker-smoke', version: '0.0.0' });
  try {
    const { projectId } = await createTestProject(base, 'Docker verification');
    await client.connect(projectTransport(base, (await issueTestKey(base, projectId)).key));
    assert.equal((await client.listTools()).tools.length, 10);
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      assert(!result.isError, JSON.stringify(result));
      return result.structuredContent.data;
    };
    const entries = (await client.listResources()).resources;
    const entry = entries.find((resource) => resource.uri.includes(projectId));
    assert(entry && (await client.readResource({ uri: entry.uri })).contents.length === 1);
    const group = (route, input) => ({
      route,
      input,
      citations: [
        {
          sourceId: '$material',
          side: 'after',
          path: '',
          explanationMd: 'Container verification fixture.',
        },
      ],
    });
    const productSaved = await call('save_changes', {
      projectId,
      requestKey: 'container-overview',
      baseVersion: 0,
      sources: [
        { id: '$material', kind: 'document', rawText: 'Fictional overview verification material.' },
      ],
      changes: [group('overview.product', { markdown: 'Fictional container overview.' })],
    });
    const productSource = productSaved.allocations.find((item) => item.localRef === '$material').id;
    const systemSaved = await call('save_changes', {
      projectId,
      requestKey: 'container-system-diagram',
      baseVersion: productSaved.receipt.version,
      sources: [],
      changes: [
        {
          route: 'overview.system_diagram',
          input: {
            introductionMd: 'The reader opens the application to read the project.',
            nodes: [
              { id: 'reader', kind: 'participant', label: 'Reader' },
              { id: 'app', kind: 'service', label: 'Application' },
            ],
            edges: [{ source: 'reader', target: 'app', label: 'Read the project' }],
          },
          citations: [
            {
              sourceId: productSource,
              side: 'after',
              path: '',
              explanationMd: 'Fictional container overview.',
            },
          ],
        },
      ],
    });
    const businessSaved = await call('save_changes', {
      projectId,
      requestKey: 'container-business',
      baseVersion: systemSaved.receipt.version,
      sources: [
        {
          id: '$material',
          kind: 'document',
          rawText: 'Fictional container business diagram material.',
        },
      ],
      changes: [
        group('design.panorama.nodes', {
          diagramId: '$diagram',
          title: 'Verification diagram',
          items: [
            {
              id: '$module',
              kind: 'module',
              name: 'Verification module',
              summary: 'Fictional business module only.',
              role: 'core',
            },
          ],
        }),
      ],
    });
    const request = {
      projectId,
      requestKey: 'container-mcp-save',
      baseVersion: businessSaved.receipt.version,
      sources: [
        { id: '$material', kind: 'document', rawText: 'Fictional container verification only.' },
      ],
      changes: [
        group('requirements.items', {
          items: [
            {
              id: '$requirement',
              title: 'Container tool verification',
              markdown: 'Fictional fixture only.',
              initialStatus: 'designing',
              scope: { kind: 'project' },
              primaryConcern: 'functionality',
            },
          ],
        }),
      ],
    };
    const saved = await call('save_changes', request);
    assert.equal(saved.receipt.version, 4);
    assert.deepEqual(await call('save_changes', request), saved);
    assert.equal(
      (
        await call('export_snapshot', {
          projectId,
          version: saved.receipt.version,
        })
      ).totalFiles,
      9,
    );
    const guide = await call('read_guide', { topic: 'usage' });
    assert.equal(guide.guideVersion, 11);
    const rawGuide = await fetch(new URL('/agent-writing-guide.md', base));
    assert.equal(rawGuide.status, 200);
    assert.match(rawGuide.headers.get('content-type'), /^text\/plain/);
    const markdown = await rawGuide.text();
    assert(markdown.startsWith('# Agent 写作规范\n'));
    assert(markdown.includes(new URL('/mcp', base).href));
    assert.equal(
      guide.markdown,
      await readFile(
        new URL('../../docs/operations/agent-integration.md', import.meta.url),
        'utf8',
      ),
    );
    assert(
      (await call('read_guide', { topic: 'design' })).markdown.includes('所有节点必须正交完备'),
    );
    const overview = await (await fetch(`${base}/api/projects/${projectId}/overview`)).json();
    assert.equal(overview.project.version, saved.receipt.version);
    assert.equal(overview.overview.content.systemDiagram.edges[0].label, 'Read the project');
    assert.equal(overview.overview.content.product.markdown, 'Fictional container overview.');
    const requirements = await (
      await fetch(`${base}/api/projects/${projectId}/requirements`)
    ).json();
    assert.equal(requirements.project.version, saved.receipt.version);
    assert.equal(requirements.items.length, 1);
    const requirementId = requirements.items[0].id;
    const requirement = await (
      await fetch(`${base}/api/projects/${projectId}/requirements/${requirementId}`)
    ).json();
    assert.equal(requirement.requirement.content.title, 'Container tool verification');
    const progressSaved = await call('save_changes', {
      projectId,
      requestKey: 'container-record',
      baseVersion: saved.receipt.version,
      sources: [
        {
          id: '$material',
          kind: 'document',
          rawText: 'Fictional container progress material.',
        },
      ],
      changes: [
        group('requirements.progress', {
          items: [
            {
              requirementId,
              records: [
                {
                  id: '$progress',
                  title: 'Verification progress',
                  markdown: 'Fictional verification only.',
                  occurredAt: null,
                },
              ],
            },
          ],
        }),
      ],
    });
    const records = await (
      await fetch(
        `${base}/api/projects/${projectId}/requirements/${requirementId}/records?version=${progressSaved.receipt.version}`,
      )
    ).json();
    assert.equal(records.items.length, 1);
    assert.equal(records.items[0].content.title, 'Verification progress');
    const history = await (
      await fetch(
        `${base}/api/projects/${projectId}/history/record/${records.items[0].id}?version=${progressSaved.receipt.version}`,
      )
    ).json();
    assert.equal(history.items[0].actor.entrypoint, 'mcp');
    const revision = await (
      await fetch(
        `${base}/api/projects/${projectId}/history/record/${records.items[0].id}/revisions/1?version=${progressSaved.receipt.version}`,
      )
    ).json();
    assert.equal(revision.sources[0].rawText, 'Fictional container progress material.');
    const diagramId = businessSaved.allocations.find((item) => item.localRef === '$diagram').id;
    const graph = await (
      await fetch(
        `${base}/api/projects/${projectId}/business/diagrams/${diagramId}?version=${progressSaved.receipt.version}`,
      )
    ).json();
    assert.equal(graph.project.version, progressSaved.receipt.version);
    assert.equal(graph.bundle.entities[0].content.name, 'Verification module');
    const beforeGraph = await (
      await fetch(`${base}/api/projects/${projectId}/business?version=1`)
    ).json();
    assert.equal(beforeGraph.diagrams.length, 0);
    return { projectId, requirementId, version: progressSaved.receipt.version };
  } finally {
    await client.close();
  }
}
