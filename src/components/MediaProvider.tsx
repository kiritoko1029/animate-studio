import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StudioDocument } from '../model';
import { collectMediaReferences, type MediaAsset } from '../../shared/media.mjs';
import { MediaContext, type MediaMigration } from '../lib/media/context.ts';
import { blobDataUrl, createCloudMediaAdapter, createGuestMediaAdapter, createMediaAdapter } from '../lib/media/adapters.ts';

export type MediaProviderHandle = { migrationPending: number; migrate: (targetId: string) => Promise<MediaMigration>; exportAssets: (document: StudioDocument) => Promise<Record<string, string>> };
export const MediaProvider = forwardRef<MediaProviderHandle, { siteId: string; document: StudioDocument; cloudPageId?: string; sharedToken?: string; children: ReactNode }>(function MediaProvider({ siteId, document, cloudPageId, sharedToken, children }, ref) {
  const adapter = useMemo(() => createMediaAdapter({ siteId, cloudPageId, sharedToken }), [siteId, cloudPageId, sharedToken]);
  const adapterRef = useRef(adapter); adapterRef.current = adapter;
  const documentRef = useRef(document); documentRef.current = document;
  const [assets, setAssets] = useState<MediaAsset[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [migrationPending, setMigrationPending] = useState(0);
  const pending = useRef(new Set<string>()), mounted = useRef(true);
  const cache = useMemo(() => new Map<string, Promise<string>>(), [adapter]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => {
    for (const request of cache.values()) void request.then(url => URL.revokeObjectURL(url)).catch(() => {});
    cache.clear();
  }, [cache]);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const list = await adapter.list();
      if (mounted.current && adapterRef.current === adapter) { setAssets(list); setLoading(false); }
      return list;
    } catch (cause) {
      if (mounted.current && adapterRef.current === adapter) { setError(cause instanceof Error ? cause.message : '媒体库暂时无法读取。'); setLoading(false); }
      return [];
    }
  }, [adapter]);
  useEffect(() => { setError(''); void refresh(); }, [refresh]);
  const resolve = useCallback((id: string): Promise<string> => {
    const existing = cache.get(id);
    if (existing) return existing;
    const request = (async () => {
      try {
        let blob: Blob;
        try { blob = await adapter.read(id); }
        catch (cause) {
          if (adapter.kind !== 'cloud' || !pending.current.has(id)) throw cause;
          blob = await createGuestMediaAdapter(siteId).read(id);
        }
        return URL.createObjectURL(blob);
      } catch (cause) { cache.delete(id); throw cause; }
    })();
    cache.set(id, request);
    return request;
  }, [adapter, cache, siteId]);
  const referenceKey = collectMediaReferences(document).sort().join(',');
  useEffect(() => { for (const id of referenceKey ? referenceKey.split(',') : []) void resolve(id).catch(() => {}); }, [referenceKey, resolve]);
  useEffect(() => { pending.current.clear(); setMigrationPending(0); }, [siteId]);
  const migrate = useCallback(async (targetId: string): Promise<MediaMigration> => {
    const source = createGuestMediaAdapter(siteId), destination = createCloudMediaAdapter(targetId);
    const ids = collectMediaReferences(documentRef.current), failed: string[] = [];
    let uploaded = 0, metadata: MediaAsset[] = [];
    try { metadata = await source.list(); } catch { /* Every referenced asset gets a recoverable failure below. */ }
    for (const id of ids) {
      try {
        const asset = metadata.find(item => item.id === id);
        if (!asset) throw new Error('本地图片记录不存在。');
        const blob = await source.read(id);
        await destination.upload(new File([blob], asset.name, { type: asset.mime }), id);
        uploaded++;
      } catch { failed.push(id); }
    }
    pending.current = new Set(failed); setMigrationPending(failed.length);
    void refresh();
    return { uploaded, failed: failed.length };
  }, [siteId, refresh]);
  const exportAssets = useCallback(async (document: StudioDocument) => {
    const assets: Record<string, string> = {};
    for (const id of collectMediaReferences(document)) {
      const response = await fetch(await resolve(id));
      if (!response.ok) throw new Error('导出图片读取失败，请检查媒体库后重试。');
      assets[`asset:${id}`] = await blobDataUrl(await response.blob());
    }
    return assets;
  }, [resolve]);
  useImperativeHandle(ref, () => ({ migrate, exportAssets, migrationPending }), [migrate, exportAssets, migrationPending]);
  const upload = useCallback(async (file: File) => { const asset = await adapter.upload(file); await refresh(); return asset; }, [adapter, refresh]);
  const remove = useCallback(async (id: string) => { const result = await adapter.remove(id); await refresh(); return result; }, [adapter, refresh]);
  return <MediaContext.Provider value={{ kind: adapter.kind, document, cloudPageId, assets, loading, error, migrationPending, resolve, refresh, upload, remove, migrate }}>{children}</MediaContext.Provider>;
});
export function useMedia() {
  const context = useContext(MediaContext);
  if (!context) throw new Error('媒体库需要在站点编辑器中使用。');
  return context;
}
