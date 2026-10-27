import { readBoundedJson } from './bounded-body.ts';
import { isSiteDocument } from '../shared/site-document.mjs';
import type { DataTemplateContext } from '../shared/data-sources.mjs';
import { createPageRepository, isValidId } from '../db/page-repository.ts';
import { createDataCredentialRepository } from '../db/data-credential-repository.ts';
import { encryptDataCredential } from './data-credential-crypto.ts';
import { checkDataRateLimit, DataQueryError, executeDataQuery, normalizeAllowedHosts, type DataQueryOptions } from './data-query.ts';

export type DataAccountContext = {
  repository: ReturnType<typeof createPageRepository>;
  credentials?: ReturnType<typeof createDataCredentialRepository>;
  encryptionSecret?: string;
  canonicalOrigin?: string;
  query?: Omit<DataQueryOptions, 'source' | 'context' | 'origin' | 'credential' | 'encryptionSecret' | 'confirmed'>;
};
type Result = { status: number; body?: unknown };
const result = (status: number, body?: unknown): Result => ({ status, ...(body === undefined ? {} : { body }) });
const error = (status: number, message: string) => result(status, { error: message });
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('请求格式不正确。');
  JSON.stringify(value, (key, item) => { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('请求包含不安全的字段。'); return item; });
}
const isResult = (value: unknown): value is Result => plain(value) && typeof value.status === 'number' && plain(value.body) && typeof value.body.error === 'string';
async function body(request: Request, limit = 65536) {
  const parsed = await readBoundedJson(request, limit, '数据');
  return parsed.ok ? parsed.value : error(parsed.status, parsed.message);
}
export async function handleDataAccountApi(request: Request, context: DataAccountContext, path: string, userId: string): Promise<Result | null> {
  if (!path.startsWith('/api/account/data/')) return null;
  if (path === '/api/account/data/query') {
    if (request.method !== 'POST') return error(405, '不支持此请求方法。');
    if (!checkDataRateLimit(userId)) return error(429, '数据请求过于频繁，请稍后重试。');
    const input = await body(request);
    if (isResult(input)) return input;
    try {
      record(input, ['pageId', 'sourceId', 'route', 'state', 'form', 'confirmed']);
      if (!isValidId(input.pageId) || typeof input.sourceId !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(input.sourceId)) return error(400, '数据源标识无效。');
      for (const key of ['route', 'state', 'form']) if (input[key] !== undefined) {
        if (!plain(input[key])) return error(400, `${key} 必须是普通对象。`);
        JSON.stringify(input[key], (name, item) => { if (['__proto__', 'prototype', 'constructor'].includes(name)) throw new Error('请求包含不安全的字段。'); return item; });
      }
      const page = await context.repository.findOwned(userId, input.pageId);
      if (!page || !isSiteDocument(page.page)) return error(404, '未找到该站点的数据源。');
      const source = page.page.dataSources?.find(item => item.id === input.sourceId);
      if (!source) return error(404, '数据源不存在，请先保存当前站点。');
      if (source.kind !== 'rest' || source.transport !== 'proxy' && !source.credentialId) return error(400, '公开接口请使用浏览器直接请求。');
      const credential = source.credentialId ? await context.credentials?.findOwned(userId, source.credentialId) : null;
      if (source.credentialId && !credential) return error(404, '凭据不存在，请重新关联凭据。');
      if (credential && !context.encryptionSecret) return error(503, '服务端未配置数据凭据密钥。');
      const confirmed = input.confirmed;
      if (confirmed !== undefined) {
        record(confirmed, ['method', 'host']);
        if (typeof confirmed.method !== 'string' || typeof confirmed.host !== 'string') return error(400, '写入确认无效。');
      }
      const dataContext: DataTemplateContext = { route: input.route as DataTemplateContext['route'], state: input.state as DataTemplateContext['state'], form: input.form as DataTemplateContext['form'] };
      const value = await executeDataQuery({ ...context.query, source, context: dataContext, origin: context.canonicalOrigin ?? new URL(request.url).origin, credential, encryptionSecret: context.encryptionSecret, confirmed: confirmed as { method: string; host: string } | undefined });
      return result(200, { value });
    } catch (cause) {
      if (cause instanceof DataQueryError) return error(cause.status, cause.message);
      return error(400, cause instanceof Error ? cause.message.slice(0, 300) : '数据请求格式不正确。');
    }
  }
  if (path === '/api/account/data/credentials') {
    if (!context.credentials) return error(503, '服务端未启用数据凭据存储。');
    if (request.method === 'GET') return result(200, { credentials: await context.credentials.list(userId) });
    if (request.method !== 'POST') return error(405, '不支持此请求方法。');
    if (!context.encryptionSecret) return error(503, '服务端未配置数据凭据密钥。');
    const input = await body(request, 8192);
    if (isResult(input)) return input;
    try {
      record(input, ['name', 'kind', 'allowedHosts', 'secret']);
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || !['bearer', 'api-key'].includes(String(input.kind)) || typeof input.secret !== 'string' || !input.secret || input.secret.length > 4096 || /[\u0000-\u001f\u007f]/.test(input.secret)) return error(400, '凭据名称、类型或密钥无效。');
      const created = await context.credentials.create(userId, { name: input.name.trim(), kind: input.kind as 'bearer' | 'api-key', allowedHosts: normalizeAllowedHosts(input.allowedHosts), encryptedSecret: encryptDataCredential(input.secret, context.encryptionSecret) });
      if (created === 'limit') return error(409, '每个账号最多保存 10 个数据凭据。');
      return result(201, created);
    } catch { return error(400, '凭据配置无效，请检查名称、主机和密钥。'); }
  }
  if (path.startsWith('/api/account/data/credentials/')) {
    if (!context.credentials) return error(503, '服务端未启用数据凭据存储。');
    const id = path.slice('/api/account/data/credentials/'.length);
    if (!isValidId(id)) return error(404, '未找到该凭据。');
    if (request.method !== 'DELETE') return error(405, '不支持此请求方法。');
    return await context.credentials.remove(userId, id) ? result(204) : error(404, '未找到该凭据。');
  }
  return null;
}
