import { validateAccountPage } from './auth-factory.ts';
import { readBoundedJson } from './bounded-body.ts';
import { isValidId, createPageRepository } from '../db/page-repository.ts';
import type { createComponentRepository } from '../db/component-repository.ts';
import { customComponentLimits, validateCustomComponentDefinition, type CustomComponentDefinition } from '../shared/custom-components.mjs';
import { componentFolderLimits, validateComponentFolderName } from '../shared/component-folders.mjs';
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
  /** Account custom components; component endpoints answer 503 without it. */
  components?: ReturnType<typeof createComponentRepository>;
  newPageId: () => string;
  newComponentId?: () => string;
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

  // Public component snapshots. Only the published copy is returned, without
  // the owner or the private component id; closing the share removes it.
  if (path.startsWith('/api/shared/components/')) {
    const token = path.slice('/api/shared/components/'.length);
    if (method !== 'GET' || !/^[A-Za-z0-9_-]{16,64}$/.test(token) || !context.components) return apiError(404, '组件分享不存在或已关闭。');
    const published = await context.components.findPublished(token);
    return published ? json(published) : apiError(404, '组件分享不存在或已关闭。');
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

  const foldersPrefix = '/api/account/component-folders';
  if (path === foldersPrefix || path.startsWith(`${foldersPrefix}/`)) {
    const components = context.components;
    if (!components) return apiError(503, '服务端未启用账号组件存储。');
    if (path === foldersPrefix) {
      if (method === 'GET') return json({ folders: await components.listFolders(session.id) });
      if (method === 'POST') {
        const name = await readFolderName(request);
        if (isApiResponse(name)) return name;
        const result = await components.createFolder(session.id, name, (context.newComponentId ?? context.newPageId)());
        if ('error' in result) return apiError(409, result.error === 'duplicate' ? '已存在同名文件夹。' : `最多保存 ${componentFolderLimits.perLibrary} 个组件文件夹。`);
        return json(result.folder, 201);
      }
      return apiError(405, '不支持此请求方法。');
    }
    const folderId = path.slice(foldersPrefix.length + 1);
    if (!isValidId(folderId)) return apiError(404, '未找到该文件夹。');
    if (method === 'PATCH') {
      const name = await readFolderName(request);
      if (isApiResponse(name)) return name;
      const result = await components.renameFolder(session.id, folderId, name);
      if (!result) return apiError(404, '未找到该文件夹。');
      return 'error' in result ? apiError(409, '已存在同名文件夹。') : json(result.folder);
    }
    if (method === 'DELETE') return await components.removeFolder(session.id, folderId) ? noContent() : apiError(404, '未找到该文件夹。');
    return apiError(405, '不支持此请求方法。');
  }

  const componentsPrefix = '/api/account/components';
  if (path === componentsPrefix || path.startsWith(`${componentsPrefix}/`)) {
    const components = context.components;
    if (!components) return apiError(503, '服务端未启用账号组件存储。');
    if (path === componentsPrefix) {
      if (method === 'GET') return json({ components: await components.list(session.id) });
      if (method === 'POST') {
        const body = await readComponentBody(request, false);
        if (isApiResponse(body)) return body;
        if (await components.count(session.id) >= customComponentLimits.perAccount) {
          return apiError(409, `每个账号最多保存 ${customComponentLimits.perAccount} 个组件，请先删除不需要的组件。`);
        }
        const record = await components.create(session.id, body.component, (context.newComponentId ?? context.newPageId)(), body.folderId ?? null);
        return record ? json(record, 201) : apiError(404, '未找到该文件夹。');
      }
      return apiError(405, '不支持此请求方法。');
    }
    const rest = path.slice(componentsPrefix.length + 1).split('/');
    const componentId = rest[0];
    if (!isValidId(componentId)) return apiError(404, '未找到该组件。');
    if (rest.length === 1) {
      if (method === 'GET') {
        const record = await components.findOwned(session.id, componentId);
        return record ? json(record) : apiError(404, '未找到该组件。');
      }
      if (method === 'PUT') {
        const body = await readComponentBody(request, true);
        if (isApiResponse(body)) return body;
        const result = await components.update(session.id, componentId, body.component, body.baseRevision!);
        if (!result) return apiError(404, '未找到该组件。');
        if ('conflict' in result) return json({ error: '组件已在其他地方更新，请重新打开后再保存，或另存为新组件。', revision: result.conflict }, 409);
        return json(result.record);
      }
      if (method === 'DELETE') {
        const removed = await components.remove(session.id, componentId);
        return removed ? noContent() : apiError(404, '未找到该组件。');
      }
      return apiError(405, '不支持此请求方法。');
    }
    if (rest.length === 2 && rest[1] === 'folder') {
      if (method !== 'PATCH') return apiError(405, '不支持此请求方法。');
      const body = await readJsonBody(request);
      if (isApiResponse(body)) return body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'folderId')) return apiError(400, '请求格式不正确。');
      const { folderId } = body as { folderId: unknown };
      if (folderId !== null && (typeof folderId !== 'string' || !isValidId(folderId))) return apiError(400, '文件夹标识无效。');
      const record = await components.moveToFolder(session.id, componentId, folderId as string | null);
      return record ? json(record) : apiError(404, '未找到组件或文件夹。');
    }
    if (rest.length === 2 && rest[1] === 'share') {
      if (method === 'POST') {
        const published = await components.publish(session.id, componentId, context.newShareToken());
        return published ? json(published) : apiError(404, '未找到该组件。');
      }
      if (method === 'DELETE') {
        const revoked = await components.unpublish(session.id, componentId);
        return revoked ? noContent() : apiError(404, '未找到该组件分享。');
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

async function readFolderName(request: Request): Promise<string | ApiResponse> {
  const body = await readJsonBody(request);
  if (isApiResponse(body)) return body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')) return apiError(400, '请求格式不正确。');
  try { return validateComponentFolderName((body as { name: unknown }).name); }
  catch (error) { return apiError(400, error instanceof Error ? error.message : '文件夹名称无效。'); }
}

/** Creation may pick a folder; source edits keep their current folder independently of code revisions. */
async function readComponentBody(request: Request, update: boolean): Promise<{ component: CustomComponentDefinition; baseRevision?: number; folderId?: string | null } | ApiResponse> {
  const body = await readJsonBody(request);
  if (isApiResponse(body)) return body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) return apiError(400, '请求格式不正确。');
  const record = body as Record<string, unknown>;
  const allowed = update ? ['component', 'baseRevision'] : ['component', 'folderId'];
  if (Object.keys(record).some(key => !allowed.includes(key)) || !('component' in record)) return apiError(400, '请求格式不正确。');
  if (update && (typeof record.baseRevision !== 'number' || !Number.isInteger(record.baseRevision) || record.baseRevision < 1)) return apiError(400, 'baseRevision 必须是正整数。');
  if (!update && Object.hasOwn(record, 'folderId') && record.folderId !== null && (typeof record.folderId !== 'string' || !isValidId(record.folderId))) return apiError(400, '文件夹标识无效。');
  try {
    const component = validateCustomComponentDefinition(record.component);
    return update ? { component, baseRevision: record.baseRevision as number } : { component, ...(Object.hasOwn(record, 'folderId') ? { folderId: record.folderId as string | null } : {}) };
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : '组件数据不正确。');
  }
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
