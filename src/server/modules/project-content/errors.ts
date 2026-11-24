import type { ObjectType } from '../../../contracts/project-content.js';
export type ContentErrorCode =
  | 'PREREQUISITE_MISSING'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OPERATION_MISMATCH'
  | 'INVALID_REFERENCE'
  | 'MISSING_EVIDENCE'
  | 'NO_CHANGES'
  | 'STORAGE_BUSY'
  | 'STORAGE_CORRUPT'
  | 'UNSUPPORTED_CONTENT';

export class ContentError extends Error {
  constructor(
    public readonly code: ContentErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ContentError';
  }
}

export function ensure(
  condition: unknown,
  code: ContentErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new ContentError(code, message);
}
export type ContentIssue = {
  objectType: ObjectType;
  id: string;
  field: string;
  requires: string;
  group?: number;
  path?: string;
};
export class ObjectValidationError extends ContentError {
  constructor(
    code: ContentErrorCode,
    message: string,
    readonly issues: ContentIssue[],
  ) {
    super(code, message);
  }
}
