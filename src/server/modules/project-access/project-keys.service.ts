import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { projectMcpKeys, projects } from '../../database/schema/core.js';
import { ensure } from '../project-content/errors.js';

export type ProjectMcpAccess = { projectId: string; keyId: string };

const publicFields = {
  id: projectMcpKeys.id,
  hint: projectMcpKeys.hint,
  createdAt: projectMcpKeys.createdAt,
};
const digest = (key: string) => createHash('sha256').update(key).digest('hex');

@Injectable()
export class ProjectKeysService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private requireProject(projectId: string) {
    ensure(
      this.database.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get(),
      'NOT_FOUND',
      '项目不存在。',
    );
  }

  list(projectId: string) {
    this.requireProject(projectId);
    return this.database.db
      .select(publicFields)
      .from(projectMcpKeys)
      .where(eq(projectMcpKeys.projectId, projectId))
      .orderBy(desc(projectMcpKeys.createdAt), projectMcpKeys.id)
      .all();
  }

  issue(projectId: string) {
    this.requireProject(projectId);
    const key = 'csk_' + randomBytes(32).toString('base64url');
    const item = { id: randomUUID(), hint: key.slice(-6), createdAt: Date.now() };
    this.database.db
      .insert(projectMcpKeys)
      .values({ ...item, projectId, tokenHash: digest(key) })
      .run();
    return { ...item, key };
  }

  revoke(projectId: string, id: string) {
    const result = this.database.db
      .delete(projectMcpKeys)
      .where(and(eq(projectMcpKeys.id, id), eq(projectMcpKeys.projectId, projectId)))
      .run();
    ensure(result.changes === 1, 'NOT_FOUND', '项目 Key 不存在。');
    return { id };
  }

  authenticate(key: string): ProjectMcpAccess | undefined {
    return this.database.db
      .select({ projectId: projectMcpKeys.projectId, keyId: projectMcpKeys.id })
      .from(projectMcpKeys)
      .where(eq(projectMcpKeys.tokenHash, digest(key)))
      .get();
  }
}
