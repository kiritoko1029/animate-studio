import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Copy, Home, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { SiteDocument, SitePageEntry, SiteRegion } from '../../shared/site-document.mjs';
import { createLayoutDocument, createSitePage, duplicateSitePage, inspectSiteLinks, moveSitePage, normalizeSitePath, removeSitePage, reorderSitePage, setSiteHomePage, updateSitePage } from '../../shared/site-document.mjs';
import { createBlock } from '../model';
import { validateSite } from '../../server/validation.mjs';
import { StudioButton, StudioDialog } from './StudioUI';
import { t } from '../i18n';

type Props = { site: SiteDocument; target: string; disabled?: boolean; onSelect: (target: string) => void; onChange: (site: SiteDocument, target?: string) => void; notify: (message: string) => void };
type Dialog = { type: 'create' } | { type: 'edit'; page: SitePageEntry } | { type: 'delete'; page: SitePageEntry } | { type: 'scope'; region: SiteRegion } | { type: 'removeLayout'; region: SiteRegion } | null;
export function SiteNavigator({ site, target, disabled, onSelect, onChange, notify }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState(''), [path, setPath] = useState(''), [group, setGroup] = useState(''), [kind, setKind] = useState<'page' | 'detail' | 'notFound'>('page');
  const [scope, setScope] = useState<string[]>([]);
  const change = (next: SiteDocument, nextTarget?: string) => {
    try { onChange(validateSite(JSON.parse(JSON.stringify(next))), nextTarget); setDialog(null); } catch (error) { notify(error instanceof Error ? error.message : t('站点修改失败')); }
  };
  const openEdit = (page: SitePageEntry) => { setName(page.name); setPath(page.path); setGroup(page.group ?? ''); setKind(page.kind); setDialog({ type: 'edit', page }); };
  const create = (event: FormEvent) => {
    event.preventDefault();
    try {
      const entry = createSitePage(site, name.trim() || t('新页面'), kind); entry.path = normalizeSitePath(path || entry.path); entry.group = group.trim() || undefined;
      if (kind !== 'notFound') {
        const title = createBlock('heading'); title.props = { ...title.props, title: entry.name, fontSize: 36, padding: 20 }; title.frame = { x: 48, y: 72, width: 1000, height: 130 };
        const text = createBlock('text'); text.props = { ...text.props, text: kind === 'detail' ? t('在这里介绍详情内容。数据绑定将在后续数据中心中配置。') : t('在这里添加列表内容，或从组件库拖入表格、卡片和按钮。'), fontSize: 18, padding: 20 }; text.frame = { x: 48, y: 218, width: 1100, height: 160 };
        entry.page.blocks = [title, text];
      }
      change({ ...site, pages: [...site.pages, entry] }, entry.id);
    } catch (error) { notify(error instanceof Error ? error.message : t('无法创建页面')); }
  };
  const layoutButton = (region: SiteRegion) => {
    const exists = !!site.sharedLayout[region], label = region === 'header' ? t('共享页头') : t('共享页脚');
    return <div className={`site-layout-row ${target === region ? 'active' : ''}`}><StudioButton onClick={() => exists ? onSelect(region) : change({ ...site, sharedLayout: { ...site.sharedLayout, [region]: createLayoutDocument(region, site.pages[0].page.settings) } }, region)}><Layers size={14}/><span>{label}</span></StudioButton>{exists && <><StudioButton aria-label={t('设置{0}应用范围', { 0: label })} onClick={() => { setScope(site.pages.filter(entry => entry.layout.includes(region)).map(entry => entry.id)); setDialog({ type: 'scope', region }); }}><MoreHorizontal size={13}/></StudioButton><StudioButton aria-label={t('删除{0}', { 0: label })} onClick={() => setDialog({ type: 'removeLayout', region })}><Trash2 size={12}/></StudioButton></>}</div>;
  };
  const groups = [...new Set(site.pages.map(entry => entry.group?.trim() || t('页面')))];
  const missing = inspectSiteLinks(site).filter(link => link.missing).length;
  return <div className="site-navigator">
    <div className="site-nav-heading"><div><h2>{t('站点页面')}</h2><span>{site.pages.length}/24</span></div><StudioButton className="primary-button" disabled={disabled || site.pages.length >= 24} onClick={() => { setName(t('新页面')); setPath(`/page-${site.pages.length + 1}`); setGroup(''); setKind('page'); setDialog({ type: 'create' }); }}><Plus size={14}/>{t('新建页面')}</StudioButton></div>
    <label className="site-name-field"><span>{t('站点名称')}</span><input aria-label={t('站点名称')} value={site.name} maxLength={120} disabled={disabled} onChange={event => onChange({ ...site, name: event.target.value })}/></label>
    <div className="site-tree">{groups.map(group => <section key={group}><h3>{group}</h3>{site.pages.map((entry, index) => ({ entry, index })).filter(({ entry }) => (entry.group?.trim() || t('页面')) === group).map(({ entry, index }) => <div className={`site-page-row ${target === entry.id ? 'active' : ''}`} key={entry.id} draggable={!disabled} onDragStart={event => event.dataTransfer.setData('application/x-studio-page', entry.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('application/x-studio-page'); if (id) change(reorderSitePage(site, id, entry.id)); }}>
      <StudioButton className="site-page-open" disabled={disabled} onClick={() => onSelect(entry.id)}><span>{entry.name}</span><small>{entry.path}</small></StudioButton>{entry.id === site.homePageId && <Home size={12} aria-label={t('首页')}/>} {entry.kind === 'notFound' && <span className="site-kind-badge">404</span>}
      <div className="site-page-actions"><StudioButton aria-label={t('上移{0}', { 0: entry.name })} disabled={disabled || index === 0} onClick={() => change(moveSitePage(site, entry.id, -1))}><ArrowUp size={12}/></StudioButton><StudioButton aria-label={t('下移{0}', { 0: entry.name })} disabled={disabled || index === site.pages.length - 1} onClick={() => change(moveSitePage(site, entry.id, 1))}><ArrowDown size={12}/></StudioButton><StudioButton aria-label={t('复制页面{0}', { 0: entry.name })} disabled={disabled || site.pages.length >= 24} onClick={() => { const result = duplicateSitePage(site, entry.id); change(result.site, result.id); }}><Copy size={12}/></StudioButton><StudioButton aria-label={t('编辑页面{0}', { 0: entry.name })} disabled={disabled} onClick={() => openEdit(entry)}><Pencil size={12}/></StudioButton><StudioButton aria-label={t('设为首页{0}', { 0: entry.name })} disabled={disabled || entry.id === site.homePageId || entry.kind === 'notFound'} onClick={() => change(setSiteHomePage(site, entry.id))}><Home size={12}/></StudioButton><StudioButton aria-label={t('删除页面{0}', { 0: entry.name })} disabled={disabled || entry.id === site.homePageId || site.pages.length === 1} onClick={() => setDialog({ type: 'delete', page: entry })}><Trash2 size={12}/></StudioButton></div>
    </div>)}</section>)}</div>
    <div className="site-layouts"><h3>{t('共享布局')}</h3>{layoutButton('header')}{layoutButton('footer')}<p>{t('页面内容独立编辑，页头和页脚可按需共用。')}</p></div>
    {missing > 0 && <p className="site-link-warning" role="status">{t('{0} 个站内链接的目标不存在，请检查页面路径。', { 0: missing })}</p>}
    {(dialog?.type === 'create' || dialog?.type === 'edit') && <StudioDialog title={dialog.type === 'create' ? t('新建站点页面') : t('页面设置')} className="site-page-dialog" onClose={() => setDialog(null)}><h2>{dialog.type === 'create' ? t('新建站点页面') : t('页面设置')}</h2><form onSubmit={event => {
      event.preventDefault();
      if (dialog.type === 'create') { create(event); return; }
      try { const home = dialog.page.id === site.homePageId; const nextKind = home ? 'page' : kind; change(updateSitePage(site, dialog.page.id, { name: name.trim(), path: home ? '/' : normalizeSitePath(path), kind: nextKind, group: group.trim() || undefined }), dialog.page.id); } catch (error) { notify(error instanceof Error ? error.message : t('页面设置无效')); }
    }}>
      <label><span>{t('页面名称')}</span><input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label>
      <label><span>{t('页面类型')}</span><select value={kind} disabled={dialog.type === 'edit' && dialog.page.id === site.homePageId} onChange={event => { const value = event.target.value as typeof kind; setKind(value); if (value === 'detail' && !path.includes(':')) setPath('/details/:id'); if (value === 'notFound') setPath('/404'); }}><option value="page">{t('普通页面')}</option><option value="detail">{t('详情页（可读取路径参数）')}</option><option value="notFound" disabled={dialog.type === 'edit' && dialog.page.id === site.homePageId}>{t('404 页面')}</option></select></label>
      <label><span>{t('站内路径')}</span><input required value={path} readOnly={dialog.type === 'edit' && dialog.page.id === site.homePageId} onChange={event => setPath(event.target.value)} placeholder="/products/:id"/></label>
      <label><span>{t('分组（可选）')} </span><input maxLength={40} value={group} onChange={event => setGroup(event.target.value)} placeholder={t('例如：产品与案例')}/></label>
      <p>{t('使用 /products/:id 这样的路径后，预览和导出都可以打开对应详情页。')}</p>
      <div className="site-dialog-actions"><StudioButton onClick={() => setDialog(null)}>{t('取消')}</StudioButton><StudioButton type="submit" className="primary-button">{t('保存页面设置')}</StudioButton></div>
    </form></StudioDialog>}
    {dialog?.type === 'delete' && <StudioDialog title={t('删除站点页面')} className="site-page-dialog" onClose={() => setDialog(null)}><h2>{t('删除「{0}」？', { 0: dialog.page.name })}</h2><p>{t('指向此页面的 {0} 个链接将回到页首；整次操作可撤销。', { 0: inspectSiteLinks(site).filter(link => link.url === dialog.page.path).length })}</p><div className="site-dialog-actions"><StudioButton onClick={() => setDialog(null)}>{t('取消')}</StudioButton><StudioButton className="primary-button" onClick={() => change(removeSitePage(site, dialog.page.id), site.homePageId)}>{t('删除页面并清理链接')}</StudioButton></div></StudioDialog>}
    {dialog?.type === 'scope' && <StudioDialog title={t('共享布局应用范围')} className="site-page-dialog" onClose={() => setDialog(null)}><h2>{t('选择使用{0}的页面', { 0: dialog.region === 'header' ? t('共享页头') : t('共享页脚') })}</h2><p>{t('确认后将一次应用到选中的 {0} 个页面，可撤销。', { 0: scope.length })}</p>{site.pages.map(entry => <label className="site-scope-option" key={entry.id}><input type="checkbox" checked={scope.includes(entry.id)} onChange={event => setScope(values => event.target.checked ? [...values, entry.id] : values.filter(id => id !== entry.id))}/>{entry.name}</label>)}<div className="site-dialog-actions"><StudioButton onClick={() => setDialog(null)}>{t('取消')}</StudioButton><StudioButton className="primary-button" onClick={() => change({ ...site, pages: site.pages.map(entry => ({ ...entry, layout: eventRegion(scope.includes(entry.id), dialog.region, entry.layout) })) })}>{t('确认应用范围')}</StudioButton></div></StudioDialog>}
    {dialog?.type === 'removeLayout' && <StudioDialog title={t('删除共享布局')} className="site-page-dialog" onClose={() => setDialog(null)}><h2>{t('删除这个共享布局？')}</h2><p>{t('它当前应用于 {0} 个页面。只会移除共享区域，不删除页面正文，可撤销。', { 0: site.pages.filter(entry => entry.layout.includes(dialog.region)).length })}</p><div className="site-dialog-actions"><StudioButton onClick={() => setDialog(null)}>{t('取消')}</StudioButton><StudioButton className="primary-button" onClick={() => { const next = { ...site, pages: site.pages.map(entry => ({ ...entry, layout: entry.layout.filter(region => region !== dialog.region) })), sharedLayout: { ...site.sharedLayout } }; delete next.sharedLayout[dialog.region]; change(next, site.homePageId); }}>{t('确认删除布局')}</StudioButton></div></StudioDialog>}
  </div>;
}
function eventRegion(selected: boolean, region: SiteRegion, current: SiteRegion[]) { return selected ? [...new Set([...current, region])] : current.filter(value => value !== region); }
