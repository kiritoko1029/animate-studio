import { inspectImage, mediaLimits, type MediaAsset } from '../../../shared/media.mjs';
import { createGuestMediaAdapter } from './guest.ts';
import type { MediaAdapter } from './context.ts';
export { createGuestMediaAdapter } from './guest.ts';

async function error(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  return new Error(typeof body?.error === 'string' ? body.error : `媒体请求失败（${response.status}）。`);
}
export function createCloudMediaAdapter(pageId: string): MediaAdapter {
  const path = `/api/account/sites/${encodeURIComponent(pageId)}/media`;
  return {
    kind: 'cloud',
    async list() {
      const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw await error(response);
      const body = await response.json() as { assets: MediaAsset[] };
      return body.assets;
    },
    async upload(file, id) {
      const mime = inspectImage(new Uint8Array(await file.arrayBuffer()));
      const response = await fetch(`${path}?name=${encodeURIComponent(file.name || '未命名图片')}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': mime, ...(id ? { 'X-Media-Id': id } : {}) }, body: file, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw await error(response);
      return response.json() as Promise<MediaAsset>;
    },
    async read(id) {
      const response = await fetch(`${path}/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw await error(response);
      return response.blob();
    },
    async remove(id) {
      const response = await fetch(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw await error(response);
      const body = await response.json() as { retained: boolean };
      return { retained: body.retained };
    },
  };
}
export function createSharedMediaAdapter(token: string): MediaAdapter {
  return {
    kind: 'shared',
    async list() { return []; },
    async upload() { throw new Error('公开分享页不能上传图片。'); },
    async read(id) {
      const response = await fetch(`/api/shared/${encodeURIComponent(token)}/media/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw await error(response);
      return response.blob();
    },
    async remove() { throw new Error('公开分享页不能移除图片。'); },
  };
}
export function createMediaAdapter(scope: { siteId: string; cloudPageId?: string; sharedToken?: string }): MediaAdapter {
  if (scope.sharedToken) return createSharedMediaAdapter(scope.sharedToken);
  if (scope.cloudPageId) return createCloudMediaAdapter(scope.cloudPageId);
  return createGuestMediaAdapter(scope.siteId);
}
export async function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('无法读取导出图片。'));
    reader.readAsDataURL(blob);
  });
}
export { mediaLimits };
