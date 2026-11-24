import { ContentError } from '../../modules/project-content/errors.js';

// A UTF-8 boundary lets callers concatenate text without losing a multibyte character.
export function textChunk(text: string, offset: number, available: number) {
  const bytes = Buffer.from(text);
  if (offset > bytes.length || (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80))
    throw new ContentError('INVALID_INPUT', '续读位置必须为有效 UTF-8 字节边界。');
  let end = Math.min(bytes.length, offset + available);
  while (end > offset && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
  return {
    text: bytes.toString('utf8', offset, end),
    chunkBytes: end - offset,
    nextOffset: end < bytes.length ? end : null,
  };
}
