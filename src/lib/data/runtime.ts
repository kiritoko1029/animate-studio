import { dataSourceLimits, normalizeDataValue, prepareDataSource, readDataPath, type DataSource, type DataTemplateContext } from '../../../shared/data-sources.mjs';
import type { JsonValue } from '../interactions/types';

export type DataAccess = { scope: 'editor' | 'share' | 'export' | 'preview'; pageId?: string };
const currentOrigin = () => (globalThis as unknown as { location?: { href: string } }).location?.href ?? 'http://studio.local';
export type DataRequestOptions = { context?: DataTemplateContext; access?: DataAccess; signal?: AbortSignal; fetcher?: typeof fetch; page?: number; pageSize?: number };
export class DataRequestError extends Error {
  code: 'offline' | 'timeout' | 'http' | 'shape' | 'cancelled' | 'unavailable';
  status?: number;
  constructor(message: string, code: DataRequestError['code'], status?: number) { super(message); this.code = code; this.status = status; }
}
export async function readBoundedJson(response: Response, limit = dataSourceLimits.responseBytes): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit) throw new DataRequestError('接口响应超过 1 MiB，请减少数据量。', 'shape');
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!response.body) throw new DataRequestError('接口没有返回 JSON 内容。', 'shape');
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new DataRequestError('接口响应超过 1 MiB，请减少数据量。', 'shape'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new DataRequestError('接口返回的不是有效 JSON，请检查响应格式。', 'shape'); }
}
export function dataValueAt(source: DataSource, value: unknown, resolved = false) {
  try { return normalizeDataValue(source, resolved ? value : readDataPath(value, source.responsePath)); }
  catch (cause) { throw new DataRequestError(cause instanceof Error ? cause.message : '接口响应格式无效。', 'shape'); }
}
export async function requestDataSource(source: DataSource, options: DataRequestOptions & { allowWrite?: boolean } = {}): Promise<JsonValue> {
  const method = source.method ?? 'GET';
  if (!options.allowWrite && source.kind === 'rest' && method !== 'GET') throw new DataRequestError('写入数据源只能在用户提交表单并确认后执行。', 'unavailable');
  if (options.allowWrite && (source.kind !== 'rest' || !['POST', 'PUT', 'PATCH'].includes(method))) throw new DataRequestError('请选择 POST、PUT 或 PATCH 数据源作为提交目标。', 'unavailable');
  if (source.transport === 'proxy' || source.credentialId) {
    if (!options.access || options.access.scope !== 'editor' || !options.access.pageId) throw new DataRequestError('私有数据仅在登录后的编辑预览中可用，请使用公开接口进行分享或导出。', 'unavailable');
  }
  const prepared = prepareDataSource(source, options.context);
  if ('value' in prepared) return dataValueAt(source, prepared.value);
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false) throw new DataRequestError('当前处于离线状态，请恢复网络后重试。', 'offline');
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort(); else options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(new DataRequestError('请求超时，请稍后重试。', 'timeout')), Math.min(source.timeoutMs ?? 10000, dataSourceLimits.timeoutMs));
  const fetcher = options.fetcher ?? fetch;
  try {
    let response: Response;
    if (source.transport === 'proxy' || source.credentialId) {
      response = await fetcher('/api/account/data/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: options.access!.pageId, sourceId: source.id, route: options.context?.route ?? {}, state: options.context?.state ?? {}, form: options.context?.form ?? {}, ...(options.allowWrite ? { confirmed: { method, host: new URL(prepared.url!, currentOrigin()).host } } : {}) }), signal: controller.signal });
      const result = await readBoundedJson(response) as { value?: unknown; error?: string };
      if (!response.ok) throw new DataRequestError(typeof result?.error === 'string' ? result.error : `请求失败（${response.status}）`, response.status === 408 || response.status === 504 ? 'timeout' : 'http', response.status);
      return dataValueAt(source, result?.value, true);
    }
    let url = prepared.url!;
    if (source.mode === 'collection' && options.pageSize && options.page !== undefined) {
      const target = new URL(url, currentOrigin());
      if (!target.searchParams.has('page')) target.searchParams.set('page', String(options.page));
      if (!target.searchParams.has('pageSize')) target.searchParams.set('pageSize', String(options.pageSize));
      url = url.startsWith('/') ? `${target.pathname}${target.search}` : target.href;
    }
    response = await fetcher(url, { method, headers: { Accept: 'application/json', ...prepared.headers, ...(prepared.body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(prepared.body === undefined ? {} : { body: JSON.stringify(prepared.body) }), signal: controller.signal });
    if (!response.ok) throw new DataRequestError(`接口返回 HTTP ${response.status}，请检查接口或稍后重试。`, 'http', response.status);
    return dataValueAt(source, await readBoundedJson(response));
  } catch (error) {
    if (error instanceof DataRequestError) throw error;
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason instanceof DataRequestError) throw reason;
      throw new DataRequestError('请求已取消。', 'cancelled');
    }
    throw new DataRequestError('请求失败，请检查网络、接口地址和 CORS 设置。', 'offline');
  } finally {
    globalThis.clearTimeout(timeout); options.signal?.removeEventListener('abort', abort);
  }
}

export type DataResult = { status: 'loading' | 'ready' | 'error'; value: JsonValue; items: Record<string, JsonValue>[]; error: string; page: number; pageCount: number; refresh: () => void; setPage: (page: number) => void };
type Entry = { key: string; result: DataResult; controller?: AbortController; request?: Promise<void> };
/** A page-scoped store. A source has one request regardless of how many blocks consume it. */
export function createDataStore(sources: DataSource[], access: DataAccess, fetcher?: typeof fetch) {
  let context: DataTemplateContext = {};
  let revision = 0;
  const entries = new Map<string, Entry>();
  const placeholders = new Map<string, DataResult>();
  const listeners = new Set<() => void>();
  const emit = () => { revision++; for (const listener of [...listeners]) listener(); };
  const sourceFor = (id: string) => sources.find(source => source.id === id);
  const keyFor = (id: string) => {
    const source = sourceFor(id);
    if (!source) return `${id}:missing`;
    try { return `${id}:${JSON.stringify(prepareDataSource(source, context))}`; }
    catch { return `${id}:${JSON.stringify(context)}`; }
  };
  const value = (source: DataSource): JsonValue => source.mode === 'collection' ? [] : null;
  const load = (id: string, key: string, page = 1, force = false) => {
    const source = sourceFor(id);
    if (!source) return;
    const previous = entries.get(id);
    if (previous?.key === key && previous.result.status === 'ready' && previous.result.page === page && !force) return previous.request;
    if (previous?.key === key && previous.result.status === 'loading' && previous.result.page === page && !force) return previous.request;
    previous?.controller?.abort(new DataRequestError('请求已被新的筛选条件替代。', 'cancelled'));
    const controller = new AbortController();
    const pageSize = source.pageSize ?? (source.mode === 'collection' ? 5 : 100);
    const result: DataResult = { status: 'loading', value: value(source), items: [], error: '', page, pageCount: 1, refresh: () => { void load(id, keyFor(id), entries.get(id)?.result.page ?? 1, true); }, setPage: next => { void load(id, keyFor(id), Math.max(1, Math.min(next, entries.get(id)?.result.pageCount ?? 100))); } };
    const entry: Entry = { key, result, controller };
    entries.set(id, entry); emit();
    entry.request = requestDataSource(source, { context, access, signal: controller.signal, fetcher, page, pageSize }).then(data => {
      if (entries.get(id) !== entry) return;
      const items = Array.isArray(data) ? data.map(item => item !== null && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, JsonValue> : { value: item as JsonValue }) : [];
      const pageCount = source.kind !== 'rest' ? Math.max(1, Math.ceil(items.length / pageSize)) : Math.max(1, page + (items.length >= pageSize ? 1 : 0));
      const visible = source.kind !== 'rest' ? items.slice((page - 1) * pageSize, page * pageSize) : items;
      entry.result = { ...result, status: 'ready', value: data, items: visible, pageCount };
      if (page > pageCount) entry.result.setPage(pageCount);
    }).catch((error: unknown) => {
      if (entries.get(id) !== entry) return;
      entry.result = { ...result, status: 'error', error: error instanceof Error ? error.message : '数据读取失败，请稍后重试。' };
    }).finally(() => { if (entries.get(id) === entry) { entry.controller = undefined; emit(); } });
    return entry.request;
  };
  return {
    sources, access,
    setContext(next: DataTemplateContext) { context = next; },
    keyFor,
    sourceFor,
    get(id: string): DataResult {
      const source = sourceFor(id);
      if (entries.has(id)) return entries.get(id)!.result;
      if (!placeholders.has(id)) placeholders.set(id, { status: source ? 'loading' : 'error', value: source ? value(source) : null, items: [], error: source ? '' : '数据源不存在或已删除。', page: 1, pageCount: 1, refresh: () => { void load(id, keyFor(id), 1, true); }, setPage: page => { void load(id, keyFor(id), page); } });
      return placeholders.get(id)!;
    },
    values() { return Object.fromEntries(sources.map(source => [source.id, entries.get(source.id)?.result.value ?? value(source)])); },
    load,
    refreshAll() { for (const id of entries.keys()) void load(id, keyFor(id), entries.get(id)?.result.page ?? 1, true); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getRevision() { return revision; },
    dispose() { for (const entry of entries.values()) entry.controller?.abort(); entries.clear(); listeners.clear(); },
  };
}
export type DataStore = ReturnType<typeof createDataStore>;
