import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)!).digest('hex');
}

export function operationId(
  kind: 'create_project' | 'save_changes',
  key: string,
  projectId?: string,
): string {
  return `mcp-${fingerprint({ format: 1, kind, key, projectId: projectId ?? null })}`;
}
