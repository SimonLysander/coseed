import type {
  ObjectType,
  ProjectSnapshot,
  StoredRevision,
} from '../../../contracts/project-content.js';
import { authoringState } from '../../modules/project-content/validation/authoring.js';
import { ContentError } from '../../modules/project-content/errors.js';
import { resolveDiagram } from '../snapshots/export.service.js';

const titles: Record<ObjectType, string> = {
  project: '项目',
  overview: '项目综述',
  requirement: '需求',
  record: '推进记录',
  retrospective: '回顾',
  entity: '节点',
  relationship: '关系',
  diagram: '业务图',
  note: '技术说明',
};

// Persisted IDs may contain slashes or dot segments. Every ID must occupy exactly one URI segment.
export function segment(id: string): string {
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(id)
    ? id
    : '~' + Buffer.from(id).toString('base64url');
}
export function projectAddress(id: string, version?: number) {
  const root = 'coseed://projects/' + segment(id);
  return version === undefined ? root + '/current' : root + '/v' + version;
}

type Entry = { title: string; type: string; uri: string; id?: string };
function titleOf(item: StoredRevision) {
  const title = item.content.title ?? item.content.name ?? item.content.summary;
  return typeof title === 'string' ? title : titles[item.objectType];
}

export class ProjectView {
  readonly root: string;
  readonly indexUri: string;
  readonly overview: StoredRevision | undefined;
  private readonly byUri = new Map<string, StoredRevision>();
  readonly snapshot: ProjectSnapshot;

  constructor(snapshot: ProjectSnapshot) {
    this.snapshot = snapshot;
    this.root = projectAddress(snapshot.projectId, snapshot.version);
    this.indexUri = this.root + '/index';
    this.overview = this.ofType('overview')[0];
    for (const row of [snapshot.project, ...snapshot.objects])
      this.byUri.set(this.entry(row).uri, row);
  }

  ofType(type: ObjectType) {
    return this.snapshot.objects.filter((row) => row.objectType === type);
  }

  entry(row: StoredRevision): Entry {
    const path =
      row.objectType === 'overview' ? 'overview' : row.objectType + '/' + segment(row.id);
    return { type: row.objectType, id: row.id, title: titleOf(row), uri: this.root + '/' + path };
  }
  private directory(path: string, title: string): Entry {
    return { type: 'directory', title, uri: this.root + '/' + path };
  }
  get conditions() {
    return authoringState(this.snapshot).conditions;
  }
  index() {
    return {
      projectId: this.snapshot.projectId,
      version: this.snapshot.version,
      title: titleOf(this.snapshot.project),
      indexUri: this.indexUri,
      conditions: this.conditions,
      entries: [
        ...(this.overview ? [this.entry(this.overview)] : []),
        this.directory('requirements', '需求推进'),
        this.directory('design', '业务设计'),
        this.directory('objects', '项目对象'),
        this.directory('sources', '原始材料'),
      ],
    };
  }
  private sourceEntry(id: string, title: string) {
    return { type: 'source', id, title, uri: this.root + '/source/' + segment(id) };
  }
  read(uri: string): unknown {
    if (uri === this.indexUri) return this.index();
    const { projectId, version } = this.snapshot;
    const envelope = { projectId, version };
    if (uri === this.root + '/requirements')
      return {
        ...envelope,
        entries: this.ofType('requirement')
          .toSorted((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
          .map((row) => this.entry(row)),
      };
    if (uri === this.root + '/design') {
      const diagrams = this.ofType('diagram');
      return {
        ...envelope,
        entries: diagrams.map((row) => ({ ...this.entry(row), scope: row.content.scope })),
      };
    }
    if (uri === this.root + '/objects')
      return { ...envelope, entries: [...this.byUri.values()].map((row) => this.entry(row)) };
    if (uri === this.root + '/sources')
      return {
        ...envelope,
        entries: this.snapshot.sources.map((row) => this.sourceEntry(row.id, row.kind)),
      };
    if (uri.startsWith(this.root + '/source/')) {
      const source = this.snapshot.sources.find(
        (row) => this.sourceEntry(row.id, row.kind).uri === uri,
      );
      if (source) return { ...envelope, source };
    }
    const row = this.byUri.get(uri);
    if (!row) throw new ContentError('NOT_FOUND', '所读项目版本中没有此资源。');
    const sources = [
      ...new Set([
        ...row.citations.map((c) => c.sourceId),
        ...row.inputSourceIds,
        ...[row.content.primarySourceId, row.content.typeSourceId].filter(
          (id): id is string => typeof id === 'string',
        ),
      ]),
    ].map((id) => this.sourceEntry(id, '来源'));
    if (row.objectType === 'diagram') {
      const graph = resolveDiagram(this.snapshot, row.id);
      const ownerIds = new Set(
        graph.objects.flatMap((item) => {
          const owner = item.content.owner as { id: string } | undefined;
          return owner ? [owner.id] : [];
        }),
      );
      const owners = this.ofType('entity').filter((item) => ownerIds.has(item.id));
      return { ...graph, sources, owners, members: graph.objects.map((item) => this.entry(item)) };
    }
    if (row.objectType === 'requirement') {
      const records = this.ofType('record')
        .filter((item) => item.content.requirementId === row.id)
        .reverse();
      return {
        ...envelope,
        revision: row,
        sources,
        records: records.map((item) => this.entry(item)),
      };
    }
    if (row.objectType === 'record') {
      const parent = this.ofType('requirement').find(
        (item) => item.id === row.content.requirementId,
      );
      return {
        ...envelope,
        revision: row,
        sources,
        requirement: parent ? this.entry(parent) : null,
      };
    }
    if (['entity', 'relationship', 'note'].includes(row.objectType)) {
      const field =
        row.objectType === 'entity'
          ? 'entityIds'
          : row.objectType === 'relationship'
            ? 'relationshipIds'
            : 'noteIds';
      const diagrams = this.ofType('diagram').filter((graph) =>
        (graph.content[field] as string[]).includes(row.id),
      );
      return {
        ...envelope,
        revision: row,
        sources,
        diagrams: diagrams.map((item) => this.entry(item)),
      };
    }
    return { ...envelope, revision: row, sources };
  }

  search(query: string, offset: number, limit: number) {
    const needle = query.toLowerCase();
    const hits = [];
    for (const row of this.byUri.values()) {
      const fields: string[] = [titleOf(row)];
      JSON.stringify(row.content, (_key, value) => {
        if (typeof value === 'string') fields.push(value);
        return value;
      });
      const field = fields.find((value) => value.toLowerCase().includes(needle));
      if (field === undefined) continue;
      const position = field.toLowerCase().indexOf(needle);
      hits.push({
        ...this.entry(row),
        excerpt: field.slice(Math.max(0, position - 44), position + needle.length + 88),
      });
    }
    return {
      projectId: this.snapshot.projectId,
      version: this.snapshot.version,
      items: hits.slice(offset, offset + limit),
      total: hits.length,
      nextOffset: hits.length > offset + limit ? offset + limit : null,
    };
  }
}
