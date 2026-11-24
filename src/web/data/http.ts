import { z } from 'zod';
import { projectHttpErrorSchema } from '../../contracts/projects-http.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const deadline = AbortSignal.timeout(15_000);
  const response = await fetch(path, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = projectHttpErrorSchema.safeParse(body);
    throw new HttpError(
      response.status,
      error.success ? error.data.error.code : 'HTTP_ERROR',
      error.success
        ? error.data.error.message
        : `服务返回 ${response.status}，请检查服务是否正常运行。`,
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success)
    throw new HttpError(502, 'INVALID_RESPONSE', '服务返回的信息不符合预期，请检查前后端版本。');
  return parsed.data;
}
