import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, ImagePlus, LoaderCircle, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { collectMediaReferences, mediaLimits, mediaReference, type MediaAsset } from '../../shared/media.mjs';
import { t } from '../i18n';
import { StudioButton, StudioDialog } from './StudioUI';
import { useMedia } from './MediaProvider';
import { usePageImage } from './PageAssets';
import '../media-library.css';

function MediaImage({ asset }: { asset: MediaAsset }) {
  const url = usePageImage(mediaReference(asset.id));
  return url === '#' ? <span className="media-image-pending"><ImageIcon size={25}/></span> : <img src={url} alt={asset.name} loading="lazy"/>;
}
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
export function MediaLibraryDialog({ onClose, onSelect }: { onClose: () => void; onSelect?: (reference: string) => void }) {
  const media = useMedia(), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [pendingDelete, setPendingDelete] = useState<MediaAsset | null>(null);
  useEffect(() => { void media.refresh(); }, [media.refresh]);
  const used = useMemo(() => new Set(collectMediaReferences(media.document)), [media.document]);
  const assets = media.assets.filter(asset => asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const upload = async (files: FileList | null) => {
    if (!files?.length || busy) return;
    setBusy(true); setError(''); setMessage('');
    let completed = 0;
    try {
      for (const file of Array.from(files)) {
        try { await media.upload(file); completed++; }
        catch (cause) { setError(cause instanceof Error ? cause.message : t('图片上传失败，请重试。')); break; }
      }
      if (completed) setMessage(t('已上传 {0} 张图片，可选择并应用到页面。', { 0: completed }));
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const migrate = async () => {
    if (!media.cloudPageId || busy) return;
    setBusy(true); setError('');
    const result = await media.migrate(media.cloudPageId);
    if (result.failed) setError(t('仍有 {0} 张图片未迁移，请检查网络和云端存储后重试。', { 0: result.failed }));
    else setMessage(t('图片迁移已完成。'));
    setBusy(false);
  };
  const remove = async () => {
    if (!pendingDelete || busy) return;
    setBusy(true); setError('');
    try {
      const result = await media.remove(pendingDelete.id);
      setMessage(result.retained ? t('已从媒体库隐藏；已发布版本和历史回滚仍可读取这张图片。') : t('未使用的图片已移除。'));
      setPendingDelete(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('图片移除失败，请重试。')); }
    finally { setBusy(false); }
  };
  return <StudioDialog title={t('站点媒体库')} className="media-library-dialog" onClose={() => { if (!busy) onClose(); }} dismissOutside={false}>
    <header className="media-library-heading"><div><h2>{t('站点媒体库')}</h2><p>{media.kind === 'guest' ? t('上传、选择并复用当前站点的图片。') : t('管理当前云端站点的图片与公开引用。')}</p></div><StudioButton className="icon-button" aria-label={t('关闭媒体库')} disabled={busy} onClick={onClose}><X size={18}/></StudioButton></header>
    <div className="media-library-toolbar"><label className="media-search"><Search size={14}/><input aria-label={t('搜索图片')} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('按图片名称搜索')}/></label><input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={event => void upload(event.target.files)}/><StudioButton className="primary-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle size={14} className="spin"/> : <Upload size={14}/>} {t('上传图片')}</StudioButton></div>
    <div className="media-library-meta"><span>{t('{0} 张图片 · 单张不超过 5 MiB', { 0: media.assets.length })}</span><span>PNG / JPEG / WebP / GIF</span></div>
    {media.migrationPending > 0 && <div className="media-migration" role="status"><span>{t('{0} 张图片尚未迁移到云端。', { 0: media.migrationPending })}</span><StudioButton disabled={busy || !media.cloudPageId} onClick={() => void migrate()}><RefreshCw size={13}/>{t('重试迁移')}</StudioButton></div>}
    {(error || media.error) && <p className="media-error" role="alert">{error || media.error}</p>}
    {message && <p className="media-message" role="status">{message}</p>}
    <div className="media-library-content">
      {media.loading && assets.length === 0 ? <div className="media-empty"><LoaderCircle size={24} className="spin"/><p>{t('正在读取媒体库…')}</p></div> : assets.length ? <div className="media-grid">{assets.map(asset => <article className="media-card" key={asset.id}><div className="media-card-image"><MediaImage asset={asset}/></div><div className="media-card-copy"><strong title={asset.name}>{asset.name}</strong><small>{size(asset.size)}</small></div><div className="media-card-actions">{onSelect && <StudioButton className="primary-button" aria-label={t('使用图片 {0}', { 0: asset.name })} onClick={() => onSelect(mediaReference(asset.id))}>{t('使用图片')}</StudioButton>}<StudioButton className="danger" aria-label={t('移除图片 {0}', { 0: asset.name })} disabled={busy} onClick={() => { if (used.has(asset.id)) setError(t('当前草稿仍使用这张图片，请先更换或解除图片引用。')); else { setError(''); setPendingDelete(asset); } }}><Trash2 size={13}/></StudioButton></div></article>)}</div> : <div className="media-empty"><ImagePlus size={30}/><h3>{query ? t('没有找到匹配的图片') : t('从第一张图片开始')}</h3><p>{query ? t('尝试缩短名称或清空搜索。') : t('上传后可重复用于图片、Logo 和分享图，无需复制地址。')}</p>{query ? <StudioButton onClick={() => setQuery('')}>{t('清空搜索')}</StudioButton> : <StudioButton className="primary-button" onClick={() => input.current?.click()}><Upload size={14}/>{t('选择本地图片')}</StudioButton>}</div>}
    </div>
    {pendingDelete && <div className="media-delete-confirm" role="alert"><div><strong>{t('移除「{0}」？', { 0: pendingDelete.name })}</strong><p>{t('若已发布或历史版本仍在使用，只会从媒体库隐藏，不会破坏旧页面。')}</p></div><StudioButton disabled={busy} onClick={() => setPendingDelete(null)}>{t('取消')}</StudioButton><StudioButton className="primary-button" disabled={busy} onClick={() => void remove()}>{t('确认移除')}</StudioButton></div>}
    <footer className="media-library-footer"><span>{media.kind === 'guest' ? t('图片保存在此浏览器；保存到云端时会迁移实际使用的图片。') : t('图片属于当前站点；发布更新后，公开分享才会使用新内容。')}</span><span>{t('最多 {0} 张 / 50 MiB', { 0: mediaLimits.perSite })}</span></footer>
  </StudioDialog>;
}
