import type { AccountApiResponse } from './account-api.ts';
import type { createPageRepository } from '../db/page-repository.ts';
import type { createMediaRepository } from '../db/media-repository.ts';
import type { MediaStorage } from './media-storage.ts';
import { readBoundedImage } from './bounded-media.ts';
import { collectMediaReferences, inspectImage, isMediaId, isMediaId as validAssetId, mediaLimits, validateMediaName, type MediaAsset } from '../shared/media.mjs';

export type MediaServices = {
  repository: ReturnType<typeof createMediaRepository>;
  storage: MediaStorage | null;
  newId: () => string;
};
export type MediaAccountContext = MediaServices & {
  pages: ReturnType<typeof createPageRepository>;
};
const error = (status: number, message: string): AccountApiResponse => ({ status, body: { error: message }, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const present = (asset: MediaAsset) => ({ id: asset.id, name: asset.name, mime: asset.mime, size: asset.size, createdAt: asset.createdAt });
async function read(request: Request, context: MediaAccountContext, asset: { mime: string; hash: string; storageKey: string }): Promise<AccountApiResponse> {
  const stored = await context.storage!.get(asset.storageKey);
  if (!stored) return error(404, '图片不存在或已移除。');
  try { if (inspectImage(stored.bytes) !== asset.mime) return error(404, '图片不存在或已移除。'); }
  catch { return error(404, '图片不存在或已移除。'); }
  return { status: 200, body: stored.bytes, headers: { 'Content-Type': asset.mime, 'Content-Length': String(stored.bytes.byteLength), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ETag: `"${asset.hash}"` } };
}
export async function handleMediaAccountApi(request: Request, context: MediaAccountContext, path: string, userId?: string): Promise<AccountApiResponse | null> {
  if (!context.storage) return path.includes('/media') ? error(503, '媒体存储尚未配置，页面编辑和外部图片仍可使用。') : null;
  const shared = path.match(/^\/api\/shared\/([A-Za-z0-9_-]{16,64})\/media\/([^/]+)$/);
  if (shared) {
    if (request.method !== 'GET') return error(405, '不支持此请求方法。');
    const [, token, id] = shared;
    if (!isMediaId(id)) return error(404, '图片不存在或已移除。');
    const published = await context.pages.findPublished(token);
    if (!published || !collectMediaReferences(published.page).includes(id)) return error(404, '图片不存在或已移除。');
    const asset = await context.repository.findShared(token, id);
    return asset ? read(request, context, asset) : error(404, '图片不存在或已移除。');
  }
  if (!userId) return null;
  const match = path.match(/^\/api\/account\/sites\/([^/]+)\/media(?:\/([^/]+))?$/);
  if (!match) return null;
  const [, pageId, id] = match;
  if (!isMediaId(pageId) || id && !validAssetId(id)) return error(404, '未找到该站点或图片。');
  const owned = await context.pages.findOwned(userId, pageId);
  if (!owned) return error(404, '未找到该站点。');
  if (!id) {
    if (request.method === 'GET') return { status: 200, body: { assets: (await context.repository.list(userId, pageId)).map(present), usage: await context.repository.usage(userId, pageId), limits: mediaLimits }, headers: { 'Cache-Control': 'no-store' } };
    if (request.method !== 'POST') return error(405, '不支持此请求方法。');
    const input = await readBoundedImage(request);
    if (!input.ok) return error(input.status, input.message);
    let name: string, assetId: string;
    try {
      name = validateMediaName(new URL(request.url).searchParams.get('name') || '未命名图片');
      assetId = request.headers.get('x-media-id') || context.newId();
      if (!isMediaId(assetId)) return error(400, '图片标识无效，请重新上传。');
    } catch (cause) { return error(400, cause instanceof Error ? cause.message : '图片名称无效。'); }
    const existing = await context.repository.find(userId, pageId, assetId, true);
    const digest = await crypto.subtle.digest('SHA-256', input.bytes.slice().buffer as ArrayBuffer);
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (existing) return existing.hash === hash ? { status: 200, body: present(existing), headers: { 'Cache-Control': 'no-store' } } : error(409, '图片标识已被其他内容使用，请重新上传。');
    const storageKey = `${pageId}/${assetId}`;
    try {
      await context.storage.put(storageKey, input.bytes, input.mime);
      const result = await context.repository.create(userId, pageId, { id: assetId, name, mime: input.mime, size: input.bytes.byteLength, hash, storageKey });
      if (result.status !== 'created') {
        await context.storage.remove(storageKey);
        return result.status === 'limit' ? error(409, '站点图片数量或容量已达上限，请先移除未使用的图片。') : error(409, '图片已存在，请刷新媒体库后重试。');
      }
      return { status: 201, body: present(result.asset), headers: { 'Cache-Control': 'no-store' } };
    } catch { await context.storage.remove(storageKey).catch(() => {}); return error(500, '图片上传失败，请稍后重试。'); }
  }
  if (request.method === 'GET') {
    const asset = await context.repository.find(userId, pageId, id, true);
    return asset ? read(request, context, asset) : error(404, '图片不存在或已移除。');
  }
  if (request.method === 'DELETE') {
    const result = await context.repository.remove(userId, pageId, id);
    if (result.status === 'missing') return error(404, '图片不存在或已移除。');
    if (result.status === 'used') return error(409, '当前草稿仍使用这张图片，请先更换或解除图片引用。');
    if (result.storageKey) await context.storage.remove(result.storageKey);
    return { status: 200, body: { removed: true, retained: result.status === 'retained' }, headers: { 'Cache-Control': 'no-store' } };
  }
  return error(405, '不支持此请求方法。');
}
