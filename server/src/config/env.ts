import { z } from 'zod';
import logger from '../utils/logger.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('3001').transform(Number),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    process.stderr.write('❌ Invalid environment variables:\n');
    process.stderr.write(JSON.stringify(parsed.error.format(), null, 2) + '\n');
    throw new Error('Invalid environment configuration');
  }

  env = parsed.data;

  // Validate JWT secrets are different
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }

  // Warn about weak secrets in development
  const weakSecrets = ['secret', 'password', 'your-super-secret', 'change-in-production'];
  if (weakSecrets.some(weak => env!.JWT_SECRET.toLowerCase().includes(weak))) {
    logger.warn('JWT_SECRET appears to be a weak or default value');
  }

  return env;
}

export function getEnv(): Env {
  if (!env) {
    throw new Error('Environment not loaded. Call loadEnv() first.');
  }
  return env;
}

// Export individual env getters for convenience
export const isDevelopment = () => getEnv().NODE_ENV === 'development';
export const isProduction = () => getEnv().NODE_ENV === 'production';
export const isTest = () => getEnv().NODE_ENV === 'test';
