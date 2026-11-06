import { z } from 'zod';

export const serviceStatusSchema = z.strictObject({
  name: z.literal('CoSeed'),
  version: z.string().min(1),
  status: z.literal('ready'),
  storage: z.literal('ready'),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
