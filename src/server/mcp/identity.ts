import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)!).digest('hex');
}

export function saveOperationId(projectId: string, key: string): string {
  return `mcp-${fingerprint({ format: 1, kind: 'save_changes', key, projectId })}`;
}
