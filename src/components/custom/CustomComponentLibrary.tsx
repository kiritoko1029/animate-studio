import { useEffect, useState } from 'react';
import { AlertCircle, Cloud, Download, HardDrive, LoaderCircle, MoreHorizontal, Pencil, Plus, Puzzle, RefreshCw, Share2, Trash2, UserRound } from 'lucide-react';
import { StudioButton } from '../StudioUI';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../animate-ui/components/radix/dropdown-menu';
import { useAccount } from '../AccountProvider';
import type { CustomComponentDefinition, CustomComponentSource } from '../../../shared/custom-components.mjs';
import type { PageDocument } from '../../model';
import { pickDefinition, type LocalComponent } from '../../lib/custom-components/library';
import type { CloudComponentSummary } from '../../lib/custom-components/cloud';
import type { DesignerDraft, DesignerTarget } from '../../lib/custom-components/drafts';
import { cloneTemplate, componentTemplates, type ComponentTemplate } from '../../lib/custom-components/templates';
import { countSourceInstances } from '../../lib/custom-components/instances';
import type { DesignerRequest } from './ComponentDesigner';
import { ShareComponentDialog } from './ShareComponentDialog';
import { useLibrary } from './useCustomLibrary';

type Props = {
  page: PageDocument;
  query: string;
  onAdd: (definition: CustomComponentDefinition, source: CustomComponentSource) => void;
  onOpenDesigner: (request: DesignerRequest) => void;
  onRequestLogin: () => void;
  notify: (message: string) => void;
};
type Item = { kind: 'local' | 'cloud'; id: string; name: string; description: string; revision: number; updatedAt: string; shared: boolean };
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const emptyDefinition: CustomComponentDefinition = { name: '', html: '', css: '', js: '' };
const fromLocal = (item: LocalComponent): Item => ({ kind: 'local', id: item.id, name: item.name, description: item.description ?? '', revision: item.revision, updatedAt: item.updatedAt, shared: false });
const fromCloud = (item: CloudComponentSummary): Item => ({ kind: 'cloud', id: item.id, name: item.name, description: item.description, revision: item.revision, updatedAt: item.updatedAt, shared: Boolean(item.shareToken) });

/** The “我的组件” section of the component library. */
export function CustomComponentLibrary({ page, query, onAdd, onOpenDesigner, onRequestLogin, notify }: Props) {
  const library = useLibrary();
  const { user, capabilities } = useAccount();
  const [source, setSource] = useState<'local' | 'cloud'>('local');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [share, setShare] = useState<{ target: DesignerTarget; name: string } | null>(null);
  useEffect(() => { if (source === 'cloud') library.ensureCloud(); }, [source, user?.id, library.cloud.status]);
  useEffect(() => { if (!user) setSource('local'); }, [user?.id]);

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : '操作失败，请重试。'); } finally { setBusy(null); }
  }
  const startNew = (template: ComponentTemplate) => onOpenDesigner({ target: null, definition: cloneTemplate(template), revision: null, origin: 'template' });
  async function definitionOf(item: Item): Promise<{ definition: CustomComponentDefinition; revision: number }> {
    if (item.kind === 'local') {
      const component = library.findLocal(item.id);
      if (!component) throw new Error('这个组件已不在本机，可能已在其他标签页删除。');
      return { definition: pickDefinition(component), revision: component.revision };
    }
    const record = await library.loadCloud(item.id);
    return { definition: record.component, revision: record.revision };
  }
  const add = (item: Item) => run(`add:${item.id}`, async () => {
    const { definition, revision } = await definitionOf(item);
    onAdd(definition, { kind: item.kind, id: item.id, revision });
  });
  const edit = (item: Item) => run(`edit:${item.id}`, async () => {
    const { definition, revision } = await definitionOf(item);
    onOpenDesigner({ target: { kind: item.kind, id: item.id }, definition, revision });
  });
  const resume = (draft: DesignerDraft) => run(`draft:${draft.updatedAt}`, async () => {
    if (!draft.target) { onOpenDesigner({ target: null, definition: emptyDefinition, revision: null, restoreDraft: true }); return; }
    const item = draft.target.kind === 'local' ? library.findLocal(draft.target.id) : null;
    if (draft.target.kind === 'local' && !item) {
      // The component was deleted elsewhere: keep the work as a new component.
      library.discardDraft(draft.target);
      onOpenDesigner({ target: null, definition: { ...draft.definition }, revision: null });
      notify('原组件已删除，草稿已作为新组件打开');
      return;
    }
    const { definition, revision } = draft.target.kind === 'local' ? { definition: pickDefinition(item!), revision: item!.revision } : await library.loadCloud(draft.target.id).then(record => ({ definition: record.component, revision: record.revision }));
    onOpenDesigner({ target: draft.target, definition, revision, restoreDraft: true });
  });
  const copyToAccount = (item: Item) => run(`copy:${item.id}`, async () => {
    if (!user) { onRequestLogin(); return; }
    const { definition } = await definitionOf(item);
    await library.createCloud(definition);
    notify('已复制到账号，本机副本仍保留'); setSource('cloud');
  });
  const copyToLocal = (item: Item) => run(`local:${item.id}`, async () => {
    const { definition } = await definitionOf(item);
    library.saveLocal(definition, { origin: 'cloud' });
    notify('已复制到本机组件');
  });
  const remove = (item: Item) => run(`delete:${item.id}`, async () => {
    if (item.kind === 'local') library.deleteLocal(item.id); else await library.deleteCloud(item.id);
    setDeleting(null);
    notify(countSourceInstances(page, item) ? '组件已删除，页面中已插入的副本不受影响' : '组件已删除');
  });
  function backupAndReset() {
    try {
      const raw = library.resetDamaged();
      if (raw) {
        const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
        const link = window.document.createElement('a');
        link.href = url; link.download = 'animate-studio-components-backup.json'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notify('已下载原数据备份，并重置本机组件库');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '无法重置本机组件库。'); }
  }

  const needle = query.trim().toLowerCase();
  const matches = (item: Item) => !needle || `${item.name} ${item.description}`.toLowerCase().includes(needle);
  const items = (source === 'local' ? library.local.components.map(fromLocal) : library.cloud.items.map(fromCloud)).filter(matches);
  const cloudCount = library.cloud.status === 'ready' ? String(library.cloud.items.length) : '·';
  const draftName = (draft: DesignerDraft) => draft.definition.name || '未命名组件';

  return <section className="custom-library" aria-label="我的组件">
    <div className="custom-library-head">
      <div><h3><Puzzle size={14}/>我的组件</h3><p>用 HTML、CSS 和 JavaScript 编写组件，保存后点击即可添加到页面。</p></div>
      <StudioButton className="primary-button" onClick={() => startNew(componentTemplates[0])}><Plus size={13}/>新建组件</StudioButton>
    </div>
    {library.drafts.length > 0 && <div className="custom-drafts" role="status">
      <strong>未保存的修改</strong>
      {library.drafts.slice(0, 3).map(draft => <div key={`${draft.target?.kind ?? 'new'}:${draft.target?.id ?? ''}`}><span title={draftName(draft)}>{draftName(draft)}<small>{draft.target ? (draft.target.kind === 'cloud' ? '账号组件' : '本机组件') : '新组件'} · {time(draft.updatedAt)}</small></span><StudioButton className="text-button" disabled={Boolean(busy)} onClick={() => void resume(draft)}>继续编辑</StudioButton><StudioButton className="text-button" onClick={() => library.discardDraft(draft.target)}>丢弃</StudioButton></div>)}
    </div>}
    <div className="custom-source-switch" role="tablist" aria-label="组件保存位置">
      <button type="button" role="tab" aria-selected={source === 'local'} className={source === 'local' ? 'active' : ''} onClick={() => setSource('local')}><HardDrive size={12}/>本机<span>{library.local.components.length}</span></button>
      <button type="button" role="tab" aria-selected={source === 'cloud'} className={source === 'cloud' ? 'active' : ''} onClick={() => setSource('cloud')}><Cloud size={12}/>账号<span>{user ? cloudCount : '—'}</span></button>
    </div>
    {error && <p className="custom-library-error" role="alert"><AlertCircle size={13}/>{error}</p>}
    {source === 'local' && library.local.damaged && <div className="custom-library-error" role="alert"><AlertCircle size={13}/><span>本机组件库数据无法读取，原数据尚未覆盖。可以先下载备份，再重置后继续使用。</span><StudioButton className="text-button" onClick={backupAndReset}><Download size={12}/>备份并重置</StudioButton></div>}
    {source === 'local' && library.local.hidden > 0 && <p className="custom-library-note">有 {library.local.hidden} 个本机组件无法读取，已隐藏并原样保留。</p>}

    {source === 'cloud' && !user ? <div className="custom-empty">
      <UserRound size={24}/><strong>登录后使用账号组件</strong>
      <p>保存到账号的组件可以在其他设备继续编辑，也可以发布分享链接。登录不会上传或覆盖本机组件。</p>
      {capabilities.cloudEnabled ? <StudioButton className="secondary-button" onClick={onRequestLogin}><UserRound size={13}/>登录</StudioButton> : <small>当前站点未开启账号登录，组件可以保存在本机。</small>}
    </div> : source === 'cloud' && library.cloud.status === 'loading' && !library.cloud.items.length ? <p className="custom-library-note"><LoaderCircle size={13} className="spin"/> 正在读取账号组件…</p>
      : source === 'cloud' && library.cloud.status === 'error' ? <div className="custom-library-error" role="alert"><AlertCircle size={13}/><span>{library.cloud.error}</span><StudioButton className="text-button" onClick={() => void library.refreshCloud()}><RefreshCw size={12}/>重试</StudioButton></div>
      : !items.length ? (needle ? <p className="custom-library-note">没有名称或说明包含“{query.trim()}”的组件。</p> : source === 'local' ? <div className="custom-empty">
        <Puzzle size={24}/><strong>还没有自己的组件</strong>
        <p>从一个模板开始：修改代码、运行预览、保存，就能像内置组件一样添加到页面。</p>
        <div className="custom-template-grid">{componentTemplates.map(template => <button key={template.id} type="button" onClick={() => startNew(template)}><strong>{template.name}</strong><span>{template.summary}</span></button>)}</div>
      </div> : <div className="custom-empty"><Cloud size={24}/><strong>账号中还没有组件</strong><p>在设计器中点击“保存到账号”，或在本机组件的菜单中选择“复制到账号”。</p></div>)
      : <div className="custom-list">{items.map(item => {
        const used = countSourceInstances(page, item);
        return <article key={`${item.kind}:${item.id}`} className="custom-item">
          <button type="button" className="custom-item-main" disabled={Boolean(busy)} onClick={() => void add(item)} aria-label={`添加「${item.name}」到页面`} title="点击添加到页面（插入的是副本）">
            <span className="custom-item-icon">{busy === `add:${item.id}` ? <LoaderCircle size={15} className="spin"/> : <Puzzle size={15}/>}</span>
            <span className="custom-item-text"><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}<small className="custom-item-meta">v{item.revision} · {time(item.updatedAt)}{item.shared ? ' · 已分享' : ''}{used ? ` · 本页 ${used} 个` : ''}</small></span>
          </button>
          <div className="custom-item-actions">
            <StudioButton className="icon-button" aria-label={`编辑「${item.name}」`} title="在设计器中编辑" disabled={Boolean(busy)} onClick={() => void edit(item)}><Pencil size={13}/></StudioButton>
            <DropdownMenu><DropdownMenuTrigger asChild><StudioButton className="icon-button" aria-label={`「${item.name}」的更多操作`}><MoreHorizontal size={14}/></StudioButton></DropdownMenuTrigger><DropdownMenuContent className="studio-menu" align="end" sideOffset={6}>
              <DropdownMenuItem onSelect={() => void add(item)}><Plus size={14}/>添加到页面</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void edit(item)}><Pencil size={14}/>编辑</DropdownMenuItem>
              {item.kind === 'cloud' ? <>
                <DropdownMenuItem onSelect={() => setShare({ target: { kind: 'cloud', id: item.id }, name: item.name })}><Share2 size={14}/>分享…</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copyToLocal(item)}><HardDrive size={14}/>复制到本机</DropdownMenuItem>
              </> : <DropdownMenuItem onSelect={() => void copyToAccount(item)}><Cloud size={14}/>复制到账号</DropdownMenuItem>}
              <DropdownMenuSeparator/>
              <DropdownMenuItem onSelect={() => setDeleting(item.id)}><Trash2 size={14}/>删除…</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </div>
          {deleting === item.id && <div className="custom-delete-confirm" role="alertdialog" aria-label={`删除「${item.name}」`}><p>删除「{item.name}」？{item.kind === 'cloud' ? '分享链接会一起失效。' : ''}{used ? `本页已插入的 ${used} 个副本不受影响。` : '已插入页面的副本不受影响。'}</p><div><StudioButton className="secondary-button" onClick={() => setDeleting(null)}>取消</StudioButton><StudioButton className="primary-button" disabled={Boolean(busy)} onClick={() => void remove(item)}>删除</StudioButton></div></div>}
        </article>;
      })}</div>}
    {source === 'cloud' && user && library.cloud.status === 'ready' && <StudioButton className="text-button custom-refresh" onClick={() => void library.refreshCloud()}><RefreshCw size={12}/>刷新账号组件</StudioButton>}
    {share && <ShareComponentDialog target={share.target} revision={null} dirty={false} name={share.name} onSaveToAccount={async () => false} onClose={() => setShare(null)} notify={notify}/>}
  </section>;
}
