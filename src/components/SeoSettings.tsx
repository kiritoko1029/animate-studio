import { useEffect, useState } from 'react';
import { Globe2, RotateCcw } from 'lucide-react';
import { updateSitePage, type SiteDocument, type SitePageEntry } from '../../shared/site-document.mjs';
import { isSeoImage, resolveSeo } from '../../shared/seo.mjs';
import { t } from '../i18n';
import { StudioButton } from './StudioUI';
import { Switch } from './animate-ui/components/radix/switch';
import { MediaField } from './MediaField';
import { usePageImage } from './PageAssets';
import '../seo-settings.css';

export function SeoSettings({ site, entry, onChange }: { site: SiteDocument; entry?: SitePageEntry; onChange: (site: SiteDocument) => void }) {
  const [image, setImage] = useState(entry?.seo?.imageUrl ?? ''), [imageError, setImageError] = useState('');
  useEffect(() => { setImage(entry?.seo?.imageUrl ?? ''); setImageError(''); }, [entry?.id, entry?.seo?.imageUrl]);
  if (!entry) return null;
  const seo = entry.seo ?? {};
  const preview = resolveSeo(site, entry.path, { origin: window.location.origin, basePath: '/p/share' });
  const imagePreview = usePageImage(seo.imageUrl);
  const change = (patch: Partial<NonNullable<SitePageEntry['seo']>>) => {
    const next = { ...seo, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === '' || next[key] === undefined || next[key] === false) delete next[key];
    onChange(updateSitePage(site, entry.id, { seo: Object.keys(next).length ? next : undefined }));
  };
  const commitImage = (value = image) => {
    setImage(value);
    if (!isSeoImage(value)) { setImageError(t('请输入 https:// 图片地址、站内 / 路径，或从站点媒体库选择。')); return; }
    setImageError(''); change({ imageUrl: value });
  };
  return <section className="property-section seo-settings" data-page-setting="seo">
    <div className="seo-settings-heading"><h3><Globe2 size={14}/>{t('搜索与分享')}</h3><StudioButton aria-label={t('恢复默认搜索与分享设置')} title={t('恢复默认搜索与分享设置')} onClick={() => { setImage(''); setImageError(''); onChange(updateSitePage(site, entry.id, { seo: undefined })); }}><RotateCcw size={13}/></StudioButton></div>
    <p className="field-hint">{t('设置搜索摘要和链接分享效果，发布后生效。')}</p>
    <label className="field"><span className="field-label">{t('搜索标题')}</span><input aria-label={t('搜索标题')} maxLength={120} value={seo.title ?? ''} placeholder={preview.title} onChange={event => change({ title: event.target.value })}/><small>{(seo.title ?? '').length}/120</small></label>
    <label className="field"><span className="field-label">{t('搜索描述')}</span><textarea aria-label={t('搜索描述')} rows={3} maxLength={300} value={seo.description ?? ''} placeholder={preview.description || t('使用页面正文作为摘要')} onChange={event => change({ description: event.target.value })}/><small>{(seo.description ?? '').length}/300</small></label>
    <MediaField label={t('分享图片')} ariaLabel={t('分享图片地址')} value={image} onChange={value => { setImage(value); setImageError(''); }} onCommit={commitImage}/>
    {imageError && <p className="field-error" role="alert">{imageError}</p>}
    <label className="studio-switch-field seo-index-setting"><Switch aria-label={t('允许搜索引擎收录')} disabled={entry.kind !== 'page'} checked={entry.kind === 'page' && !seo.noIndex} onCheckedChange={checked => change({ noIndex: !checked })}/><span>{t('允许搜索引擎收录')}</span></label>
    {entry.kind !== 'page' && <p className="field-hint">{t('详情页和 404 默认不进入站点地图；动态参数需要由实际内容决定。')}</p>}
    <div className="seo-search-preview" data-testid="seo-preview" aria-label={t('搜索摘要预览')}><span>{t('搜索摘要预览')}</span><strong>{preview.title}</strong><p>{preview.description || t('未填写描述时，将使用页面正文。')}</p><small>{preview.canonical}</small></div>
    <div className="seo-share-preview" aria-label={t('链接分享预览')}><span>{t('链接分享预览')}</span><div>{imagePreview !== '#' ? <img key={imagePreview} src={imagePreview} alt=""/> : <div className="seo-share-placeholder"><Globe2 size={22}/></div>}<section><strong>{preview.title}</strong><p>{preview.description || t('未填写描述时，将使用页面正文。')}</p></section></div></div>
    <p className="field-hint">{t('当前仅保存草稿；通过“发布与分享”更新公开页面。')}</p>
  </section>;
}
