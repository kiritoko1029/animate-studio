import { validateAccountPage } from './auth-factory.ts';
import { readBoundedJson } from './bounded-body.ts';
import { isValidId, createPageRepository } from '../db/page-repository.ts';
import type { PageDocument } from '../src/model';

/**
 * Account API endpoints shared by the Express server and the Cloudflare
 * worker. The caller supplies an already-configured auth instance, a Drizzle
 * database plus dialect schema, and id/token generators. Handlers return
 * plain objects; `json()` shapes them into responses with security headers.
 *
 * Every private endpoint resolves the user from the session cookie
 * server-side; page ids are always paired with the owner id in the WHERE
 * clause, so another user's page is indistinguishable from a missing one.
 */

export type AccountApiContext = {
  auth: { api: Record<string, (...args: unknown[]) => Promise<unknown>> };
  repository: ReturnType<typeof createPageRepository>;
  newPageId: () => string;
  newShareToken: () => string;
  capabilities: { cloudEnabled: boolean; emailEnabled: boolean; githubEnabled: boolean };
  resolveUser: (request: Request) => Promise<{ id: string; email: string; name: string } | null>;
  trustedOrigins?: string[];
  /** The deployment's canonical origin (Better Auth baseURL). */
  canonicalOrigin?: string;
};

type ApiResponsePayload = { status: number; body?: unknown; headers?: Record<string, string> };
const securityHeaders: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
class ApiResponse { payload: ApiResponsePayload; constructor(payload: ApiResponsePayload) { this.payload = payload; } }
function json(body: unknown, status = 200): ApiResponse { return new ApiResponse({ status, body, headers: securityHeaders }); }
function noContent(): ApiResponse { return new ApiResponse({ status: 204, headers: securityHeaders }); }
function apiError(status: number, message: string): ApiResponse { return json({ error: message }, status); }
function isApiResponse(value: unknown): value is ApiResponse { return value instanceof ApiResponse; }

export type AccountApiResponse = { status: number; body?: unknown; headers?: Record<string, string> };

export function toResponsePayload(result: ApiResponse): AccountApiResponse {
  return result.payload;
}



export async function handleAccountApi(
  request: Request,
  context: AccountApiContext,
  path: string,
): Promise<ApiResponse | null> {
  const { repository } = context;
  const method = request.method;

  // Public capability discovery. Never throws, so the guest editor works even
  // when no provider is configured.
  if (path === '/api/account/config' && method === 'GET') {
    return json(context.capabilities);
  }

  if (path.startsWith('/api/shared/')) {
    const token = path.slice('/api/shared/'.length);
    if (method !== 'GET' || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return apiError(404, '分享链接不存在或已失效。');
    const published = await repository.findPublished(token);
    if (!published) return apiError(404, '分享链接不存在或已失效。');
    return json(published);
  }

  if (!path.startsWith('/api/account/')) return null;

  // Match complete origins, including scheme and port. A proxy cannot add
  // new trusted sites through Host or X-Forwarded-* headers.
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = request.headers.get('origin');
    const expected = new URL(context.canonicalOrigin ?? request.url).origin;
    const trusted = (context.trustedOrigins ?? []).map(value => new URL(value).origin);
    if ((origin && origin !== expected && !trusted.includes(origin)) || (!origin && request.headers.get('sec-fetch-site') === 'cross-site')) {
      return apiError(403, '此接口仅接受当前站点的请求。');
    }
  }

  const session = await context.resolveUser(request);
  if (!session) return apiError(401, '请先登录后再使用云端页面。');

  const prefix = '/api/account/pages';
  if (path === prefix) {
    if (method === 'GET') return json({ pages: await repository.list(session.id) });
    if (method === 'POST') {
      const page = await readValidatedPage(request);
      if (isApiResponse(page)) return page;
      const record = await repository.create(session.id, page, context.newPageId());
      return json(record, 201);
    }
    return apiError(405, '不支持此请求方法。');
  }

  if (path.startsWith(`${prefix}/`)) {
    const rest = path.slice(prefix.length + 1).split('/');
    const pageId = rest[0];
    if (!isValidId(pageId)) return apiError(404, '未找到该页面。');
    if (rest.length === 1) {
      if (method === 'GET') {
        const record = await repository.findOwned(session.id, pageId);
        return record ? json(record) : apiError(404, '未找到该页面。');
      }
      if (method === 'PUT') {
        const page = await readValidatedPage(request);
        if (isApiResponse(page)) return page;
        const record = await repository.save(session.id, pageId, page);
        return record ? json(record) : apiError(404, '未找到该页面。');
      }
      if (method === 'DELETE') {
        const removed = await repository.remove(session.id, pageId);
        return removed ? noContent() : apiError(404, '未找到该页面。');
      }
      return apiError(405, '不支持此请求方法。');
    }
    if (rest.length === 2 && rest[1] === 'share') {
      if (method === 'POST') {
        const published = await repository.publish(session.id, pageId, context.newShareToken());
        return published ? json(published) : apiError(404, '未找到该页面。');
      }
      if (method === 'DELETE') {
        const revoked = await repository.unpublish(session.id, pageId);
        return revoked ? noContent() : apiError(404, '未找到该页面。');
      }
      return apiError(405, '不支持此请求方法。');
    }
    return apiError(404, '未找到 API。');
  }

  if (path === '/api/account/preferences') {
    if (method === 'GET') return json(await repository.getPreferences(session.id));
    if (method === 'PATCH' || method === 'PUT') {
      const body = await readJsonBody(request);
      if (isApiResponse(body)) return body;
      const preferences = body as { version?: unknown; studioTheme?: unknown } | null;
      if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences) || preferences.version !== 1) {
        return apiError(400, '偏好设置格式不正确。');
      }
      if (preferences.studioTheme !== 'light' && preferences.studioTheme !== 'dark') {
        return apiError(400, 'studioTheme 必须是 light 或 dark。');
      }
      return json(await repository.setPreferences(session.id, preferences.studioTheme));
    }
    return apiError(405, '不支持此请求方法。');
  }

  return null;
}

async function readJsonBody(request: Request): Promise<unknown | ApiResponse> {
  const result = await readBoundedJson(request);
  if (!result.ok) return apiError(result.status, result.message);
  return result.value;
}

async function readValidatedPage(request: Request): Promise<PageDocument | ApiResponse> {
  const body = await readJsonBody(request);
  if (isApiResponse(body)) return body;
  try {
    return validateAccountPage(body);
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : '页面数据不正确。');
  }
}
