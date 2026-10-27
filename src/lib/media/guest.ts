import { inspectImage, mediaLimits, validateMediaName, type MediaAsset } from '../../../shared/media.mjs';
import type { MediaAdapter } from './context.ts';

type GuestAsset = MediaAsset & { siteId: string; blob: Blob };
const storeName = 'assets';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器不支持本地媒体库，可继续使用外链图片。')); return; }
    const request = indexedDB.open('animate-studio-media-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(storeName, { keyPath: 'id' });
      store.createIndex('siteId', 'siteId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地媒体库。'));
    request.onblocked = () => reject(new Error('本地媒体库被其他标签页占用，请关闭旧标签页后重试。'));
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error('本地媒体操作失败。')); });
}
function failure(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return new Error('浏览器媒体空间不足，请移除未使用图片或导出备份。');
  return error instanceof Error ? error : new Error('本地媒体操作失败。');
}
async function records(database: IDBDatabase, siteId: string, transaction?: IDBTransaction) {
  const tx = transaction ?? database.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index('siteId');
  return result(index.getAll(IDBKeyRange.only(siteId))) as Promise<GuestAsset[]>;
}
function metadata(asset: GuestAsset): MediaAsset { const { id, name, mime, size, createdAt } = asset; return { id, name, mime, size, createdAt }; }
export function createGuestMediaAdapter(siteId: string): MediaAdapter {
  return {
    kind: 'guest',
    async list() {
      const database = await open();
      try { const values = await records(database, siteId); return values.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(metadata); }
      catch (error) { throw failure(error); } finally { database.close(); }
    },
    async upload(file, id = crypto.randomUUID()) {
      const bytes = new Uint8Array(await file.arrayBuffer()), mime = inspectImage(bytes), name = validateMediaName(file.name || '未命名图片');
      const database = await open();
      try {
        const transaction = database.transaction(storeName, 'readwrite');
        const existing = await records(database, siteId, transaction);
        if (existing.length >= mediaLimits.perSite || existing.some(asset => asset.id === id)) throw new Error(existing.some(asset => asset.id === id) ? '图片标识已存在，请重新上传。' : `每个站点最多保存 ${mediaLimits.perSite} 张图片。`);
        const used = existing.reduce((total, asset) => total + asset.size, 0);
        if (used + bytes.byteLength > mediaLimits.totalBytes) throw new Error('站点图片总容量不能超过 50 MiB。');
        const asset: GuestAsset = { id, siteId, name, mime, size: bytes.byteLength, createdAt: new Date().toISOString(), blob: file.slice(0, file.size, mime) };
        await result(transaction.objectStore(storeName).put(asset));
        return metadata(asset);
      } catch (error) { throw failure(error); } finally { database.close(); }
    },
    async read(id) {
      const database = await open();
      try {
        const asset = await result(database.transaction(storeName, 'readonly').objectStore(storeName).get(id)) as GuestAsset | undefined;
        if (!asset || asset.siteId !== siteId) throw new Error('本地图片不存在或不属于当前站点。');
        return asset.blob;
      } catch (error) { throw failure(error); } finally { database.close(); }
    },
    async remove(id) {
      const database = await open();
      try {
        const transaction = database.transaction(storeName, 'readwrite'), store = transaction.objectStore(storeName);
        const asset = await result(store.get(id)) as GuestAsset | undefined;
        if (!asset || asset.siteId !== siteId) throw new Error('本地图片不存在或不属于当前站点。');
        await result(store.delete(id));
        return { retained: false };
      } catch (error) { throw failure(error); } finally { database.close(); }
    },
  };
}
