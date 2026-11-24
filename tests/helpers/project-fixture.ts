import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fixtureCitations, saveRequirementFixture } from './requirements-fixture.js';
import type { APIRequestContext } from '@playwright/test';
import { createProjectResponseSchema } from '../../src/contracts/projects-http.js';
import type { ProjectOverviewContent } from '../../src/contracts/content/overview.js';

export async function createFixture(request: APIRequestContext, name: string) {
  const response = await request.post('/api/projects', {
    data: { operationId: randomUUID(), name },
  });
  if (!response.ok()) throw new Error(`测试项目创建失败：${response.status()}`);
  return createProjectResponseSchema.parse(await response.json());
}

export async function saveFixtureOverview(
  base: string,
  projectId: string,
  content: ProjectOverviewContent,
) {
  const head = await (
    await fetch(new URL('/api/projects/' + projectId + '/overview', base))
  ).json();
  let version: number = head.project.version;
  let revision: number | null = head.overview?.revisionNo ?? null;
  const current: ProjectOverviewContent | undefined = head.overview?.content;
  const group = (route: string, input: unknown) => ({
    route,
    input,
    citations: fixtureCitations(),
  });
  const save = async (changes: unknown[]) => {
    if (!changes.length) return;
    const result = await saveRequirementFixture(base, projectId, version, changes);
    version = result.receipt.version;
    revision = (revision ?? 0) + 1;
  };
  if (!isDeepStrictEqual(current?.product, content.product))
    await save([group('overview.product', content.product)]);
  if (content.systemDiagram && !isDeepStrictEqual(current?.systemDiagram, content.systemDiagram))
    await save([group('overview.system_diagram', content.systemDiagram)]);
  const items = <T extends { id: string }>(previous: T[] = [], next: T[], kind: string) => ({
    items: isDeepStrictEqual(previous, next) ? [] : next,
    remove: previous
      .filter((item) => !next.some((other) => item.id === other.id))
      .map((item) => ({ id: item.id, kind, citations: fixtureCitations('before') })),
  });
  const setup: unknown[] = [];
  const concepts = items(current?.concepts.entries, content.concepts.entries, 'concept');
  if (concepts.items.length || concepts.remove.length)
    setup.push(group('overview.concepts', concepts));
  if ((current?.examples.introductionMd ?? null) !== content.examples.introductionMd)
    setup.push(
      group('overview.example_context', { introductionMd: content.examples.introductionMd }),
    );
  const detail: unknown[] = [];
  const relations = items(
    current?.concepts.relations,
    content.concepts.relations,
    'concept_relation',
  );
  if (relations.items.length || relations.remove.length)
    detail.push(group('overview.concept_relations', relations));
  const actors = items(current?.examples.actors, content.examples.actors, 'actor');
  const cases = items(current?.examples.useCases, content.examples.useCases, 'use_case');
  const sections = items(current?.examples.sections, content.examples.sections, 'example');
  const remove = [...actors.remove, ...cases.remove, ...sections.remove];
  if (actors.items.length || cases.items.length || sections.items.length || remove.length)
    detail.push(
      group('overview.examples', {
        actors: actors.items,
        useCases: cases.items,
        sections: sections.items,
        remove,
      }),
    );
  await save(setup);
  await save(detail);
  return { revision: revision!, version };
}
