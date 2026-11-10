import { HttpException, type Logger } from '@nestjs/common';
import { z } from 'zod';
import type { StoredRevision } from '../../../contracts/project-content.js';
import { ContentError } from '../project-content/errors.js';

export const summary = (project: StoredRevision, version: number) => ({
  ...project.content,
  id: project.id,
  version,
  createdAt: project.createdAt,
});
export function input<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new HttpException(
      { error: { code: 'INVALID_INPUT', message: '请求字段不符合结构约定。' } },
      400,
    );
  return result.data;
}

export function executeHttp<T>(logger: Logger, action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('项目读取视图不符合响应契约', error.stack);
      throw new HttpException(
        { error: { code: 'INVALID_RESPONSE', message: '服务内容不符合当前响应协议。' } },
        500,
      );
    }
    if (error instanceof ContentError) {
      const statuses = {
        NOT_FOUND: 404,
        CONFLICT: 409,
        OPERATION_MISMATCH: 409,
        STORAGE_BUSY: 503,
        STORAGE_CORRUPT: 500,
      };
      const status = statuses[error.code as keyof typeof statuses] ?? 400;
      throw new HttpException({ error: { code: error.code, message: error.message } }, status);
    }
    throw error;
  }
}
