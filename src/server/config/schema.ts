import { z } from 'zod';

export const runtimeConfigSchema = z.strictObject({
  host: z.enum(['127.0.0.1', 'localhost', '::1']),
  port: z
    .union([z.number(), z.string().trim().min(1)])
    .pipe(z.coerce.number<string | number>().int().min(0).max(65_535)),
  dataDir: z.string().trim().min(1),
  logLevel: z.enum(['silent', 'error', 'warn', 'info', 'debug']),
});

export const configFileSchema = runtimeConfigSchema.partial();
export type RuntimeConfig = Readonly<z.infer<typeof runtimeConfigSchema>>;
export type ConfigOverrides = Partial<Record<keyof RuntimeConfig, unknown>>;
