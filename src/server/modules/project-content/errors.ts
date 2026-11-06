export type ContentErrorCode =
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
