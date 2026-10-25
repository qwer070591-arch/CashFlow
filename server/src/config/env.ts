import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.url().default('http://127.0.0.1:5173'),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  SESSION_SECRET: z.string().min(32).refine((value) => !value.startsWith('replace-')),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(values: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(values);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`環境變數設定無效：${fields}`);
  }
  return result.data;
}
