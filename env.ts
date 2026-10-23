import { defineEnv, string } from 'void/env';

// Optional configuration keeps guest editing available before account setup.
export default defineEnv({
  BETTER_AUTH_SECRET: string().optional(),
  BETTER_AUTH_URL: string().optional(),
  RESEND_API_KEY: string().optional(),
  RESEND_FROM: string().optional(),
  AUTH_GITHUB_CLIENT_ID: string().optional(),
  AUTH_GITHUB_CLIENT_SECRET: string().optional(),
  STUDIO_TRUSTED_ORIGINS: string().optional(),
  DATABASE_URL: string().optional(),
});
