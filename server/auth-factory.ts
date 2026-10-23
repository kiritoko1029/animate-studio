import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import type { BetterAuthOptions } from 'better-auth';
import type { PageDocument } from '../src/model';
import { validatePage } from './validation.mjs';

/**
 * Shared Better Auth factory for both runtimes.
 *
 * - Email OTP sign-in only (no passwords). OTPs are hashed at rest, expire,
 *   and carry per-identity attempt limits; the library enforces single use.
 * - GitHub OAuth, enabled only when credentials are configured.
 * - Delivery is injectable: Resend in production, a captured sender in tests.
 *   The OTP never appears in API responses or logs in either mode.
 *
 * `database` is a Drizzle instance plus the dialect's auth-table bundle, so the
 * same factory drives D1 on Cloudflare and SQLite/PostgreSQL on Node.
 */

export type SenderConfig = {
  send: (data: { email: string; otp: string; type: string }) => Promise<void>;
};

export type AuthDatabaseContext = {
  db: unknown;
  provider: 'sqlite' | 'pg';
  schema: Record<string, unknown>;
};

export type AccountCapabilities = {
  cloudEnabled: boolean;
  emailEnabled: boolean;
  githubEnabled: boolean;
};

type FactoryOptions = {
  baseURL: string;
  secret: string;
  database: AuthDatabaseContext;
  emailEnabled: boolean;
  githubEnabled: boolean;
  githubClientId?: string;
  githubClientSecret?: string;
  sender?: SenderConfig;
  trustedOrigins?: string[];
};

export function resolveCapabilities(env: Record<string, string | undefined>): AccountCapabilities {
  const emailEnabled = Boolean(env.RESEND_API_KEY && env.RESEND_FROM);
  const githubEnabled = Boolean(env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET);
  return { cloudEnabled: emailEnabled || githubEnabled, emailEnabled, githubEnabled };
}

export function createAuthFactory(options: FactoryOptions) {
  const otpOptions = {
    sendVerificationOTP: async (data: { email: string; otp: string; type: string }) => {
      // Without a configured sender the request must fail loudly: silently
      // storing a hash nobody can deliver would look like a working login.
      if (!options.sender) throw new Error('邮件验证码服务未配置。');
      await options.sender.send(data);
    },
    otpLength: 6,
    expiresIn: 300,
    storeOTP: 'hashed' as const,
    allowedAttempts: 3,
    rateLimit: { window: 60, max: 3 },
  };

  const baseOrigins = new Set([options.baseURL, ...(options.trustedOrigins ?? [])].map(value => new URL(value).origin));
  const authOptions: BetterAuthOptions = {
    baseURL: options.baseURL,
    basePath: '/api/auth',
    secret: options.secret,
    database: drizzleAdapter(options.database.db as never, {
      provider: options.database.provider,
      schema: options.database.schema,
      transaction: false,
    }) as never,
    emailAndPassword: { enabled: false },
    trustedOrigins: [...baseOrigins],
    plugins: options.emailEnabled ? [emailOTP(otpOptions)] : [],
    advanced: {
      cookiePrefix: 'studio',
      useSecureCookies: options.baseURL.startsWith('https://'),
      defaultCookieAttributes: { sameSite: 'lax' },
    },
    user: {
      additionalFields: {},
    },
  };

  if (options.githubEnabled) {
    if (!options.githubClientId || !options.githubClientSecret) {
      throw new Error('GitHub auth enabled but credentials missing');
    }
    authOptions.socialProviders = {
      github: { clientId: options.githubClientId, clientSecret: options.githubClientSecret },
    };
  }

  const auth = betterAuth(authOptions);

  return {
    auth,
    baseURL: options.baseURL,
    handler: (request: Request) => auth.handler(request),
    capabilities: {
      cloudEnabled: options.emailEnabled || options.githubEnabled,
      emailEnabled: options.emailEnabled,
      githubEnabled: options.githubEnabled,
    } satisfies AccountCapabilities,
  };
}

/**
 * Resolve the signed-in user for an incoming request. Returns null for guests,
 * expired sessions. Mutation-origin checks belong to the API boundary.
 * Never throws, so auth unavailability cannot break the editor.
 */
export async function resolveSessionUser(auth: ReturnType<typeof betterAuth>, request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers, asResponse: false });
    return session?.user?.id ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
  } catch {
    return null;
  }
}

export function validateAccountPage(body: unknown): PageDocument {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('请求格式不正确');
  const record = body as Record<string, unknown>;
  if (!('page' in record)) throw new TypeError('缺少页面数据');
  return validatePage(record.page);
}
