import { drizzle } from 'drizzle-orm/d1';
import { createAuthFactory, resolveCapabilities, resolveSessionUser } from './auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createComponentRepository } from '../db/component-repository.ts';
import { handleAccountApi, toResponsePayload } from './account-api.ts';
import { createResendSender } from './resend-sender.ts';
import * as sqliteSchema from '../db/schema.ts';
import { randomUUID } from 'node:crypto';

/**
 * Cloudflare-side account API.
 *
 * Storage selection is explicit, not "D1 because it exists":
 * - `database: 'pg'` in void.config.ts (or HYPERDRIVE/DATABASE_URL bindings)
 *   selects PostgreSQL through Hyperdrive;
 * - otherwise the D1 binding `DB` (Void-managed inference) is used.
 *
 * PostgreSQL pools exist for one request only and are always ended in a
 * finally block, including on the auth handler path and on errors. D1 needs
 * no cleanup — the runtime owns the binding.
 */

type Env = {
  DB?: unknown;
  HYPERDRIVE?: { connectionString?: string };
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  AUTH_GITHUB_CLIENT_ID?: string;
  AUTH_GITHUB_CLIENT_SECRET?: string;
  STUDIO_TRUSTED_ORIGINS?: string;
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});

export async function handleCloudAccountApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const database = await createCloudDatabase(env);
  if (!database) {
    return json({ error: '服务端未配置账号数据库。' }, 503);
  }
  try {
    const secret = env.BETTER_AUTH_SECRET || '';
    if (!secret) return json({ error: '服务端未配置账号密钥。' }, 503);

    const capabilities = resolveCapabilities(env as unknown as Record<string, string | undefined>);
    // The canonical configured origin wins over the request host so a reverse
    // proxy or workers.dev route cannot downgrade CSRF comparisons to http.
    const origin = env.BETTER_AUTH_URL?.replace(/\/$/, '') || new URL(request.url).origin;
    const factory = createAuthFactory({
      baseURL: origin,
      secret,
      database: { db: database.db, provider: database.provider, schema: database.schema },
      emailEnabled: capabilities.emailEnabled,
      githubEnabled: capabilities.githubEnabled,
      githubClientId: env.AUTH_GITHUB_CLIENT_ID,
      githubClientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
      sender: capabilities.emailEnabled ? createResendSender(env.RESEND_API_KEY!, env.RESEND_FROM!) : undefined,
      trustedOrigins: env.STUDIO_TRUSTED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean),
    });

    if (path.startsWith('/api/auth/')) {
      return factory.handler(request);
    }

    const repository = createPageRepository(database.db as never, database.schema as never, database.provider);
    const result = await handleAccountApi(request, {
      auth: factory.auth as never,
      repository,
      components: createComponentRepository(database.db as never, database.schema as never, database.provider),
      newPageId: () => randomUUID(),
      newShareToken: () => randomUUID().replaceAll('-', ''),
      canonicalOrigin: origin,
      capabilities: factory.capabilities,
      trustedOrigins: env.STUDIO_TRUSTED_ORIGINS?.split(',').map(v => v.trim()).filter(Boolean),
      resolveUser: req => resolveSessionUser(factory.auth, req),
    }, path);
    if (!result) return json({ error: '未找到 API。' }, 404);
    const payload = toResponsePayload(result);
    if (payload.status === 204) return new Response(null, { status: 204, headers: payload.headers });
    return json(payload.body, payload.status, payload.headers ?? {});
  } catch {
    return json({ error: '服务暂时无法处理请求，请重试。' }, 500);
  } finally {
    await database.dispose();
  }
}

type CloudDatabase = {
  db: unknown;
  provider: 'sqlite' | 'pg';
  schema: Record<string, unknown>;
  dispose: () => Promise<void>;
};

async function createCloudDatabase(env: Env): Promise<CloudDatabase | null> {
  // PostgreSQL is selected by Hyperdrive/DATABASE_URL. A present DB binding
  // does not force D1: a pg connection configured explicitly means pg.
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (connectionString) {
    const { drizzle: drizzlePg } = await import('drizzle-orm/node-postgres');
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString, max: 5 });
    const schema = (await import('../db/schema-pg.ts')) as unknown as Record<string, unknown>;
    const db = drizzlePg(pool, { schema: schema as never });
    return { db, provider: 'pg', schema, dispose: async () => { await pool.end(); } };
  }
  const d1 = env.DB;
  if (d1) {
    const db = drizzle(d1 as never, { schema: sqliteSchema });
    return {
      db,
      provider: 'sqlite',
      schema: sqliteSchema as unknown as Record<string, unknown>,
      dispose: async () => {},
    };
  }
  return null;
}
