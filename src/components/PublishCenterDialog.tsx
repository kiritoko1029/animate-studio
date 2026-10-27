import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, History, LoaderCircle, RotateCcw, Share2, X } from 'lucide-react';
import { StudioButton, StudioDialog } from './StudioUI';
import { blockLabel } from '../i18n/catalog';
import { getLocale, t, translateMessage } from '../i18n';
import { toSiteDocument } from '../../shared/site-document.mjs';
import type { Block, SiteDocument, StudioDocument } from '../model';
import { diffSites, type SiteChangeKind, type SiteDiff } from '../lib/site-diff';
import { jsonEqual, publishHistoryLimit } from '../lib/publishing';
import { accountApi, cloudPagePath, cloudSiteVersionPath, cloudSiteVersionsPath, shareUrl, type CloudPageRecord, type PublishCommit, type PublishResult, type PublishVersionDetail, type PublishVersionSummary } from '../lib/account-api';
import '../publish-center.css';

type Confirmation = 'publish' | 'rollback' | 'restore' | 'unpublish' | null;
type Props = {
  targetId: string | null; cloudEnabled: boolean; getSite: () => SiteDocument;
  onPublish: (expectedPublishedVersion: number | null, siteId: string | null, documentId: string) => Promise<PublishCommit>;
  onRollback: (siteId: string, version: number, expectedPublishedVersion: number) => Promise<PublishResult>;
  onRestoreDraft: (siteId: string, page: StudioDocument) => Promise<void>;
  onClose: () => void; notify: (message: string) => void;
};

function ChangeLabel({ kind }: { kind: SiteChangeKind }) {
  return <span className="publish-change-label" data-change={kind}>{kind === 'added' ? t('新增') : kind === 'removed' ? t('移除') : kind === 'changed' ? t('修改') : t('未变')}</span>;
}
function blockFor(site: SiteDocument | null, pageId: string, blockId: string): Block | undefined {
  return site?.pages.find(entry => entry.id === pageId)?.page.blocks.find(block => block.id === blockId);
}
function blockDetails(block: Block | undefined) {
  return block ? JSON.stringify({ props: block.props, frame: block.frame, bindings: block.bindings, events: block.events }, null, 2) : t('无');
}
function DiffView({ diff, before, after }: { diff: SiteDiff; before: StudioDocument | null; after: StudioDocument }) {
  before = before ? toSiteDocument(before) : null;
  after = toSiteDocument(after);
  const changed = diff.pages.filter(page => page.kind !== 'unchanged'), unchanged = diff.pages.filter(page => page.kind === 'unchanged');
  return <div className="publish-diff" data-testid="publish-diff">
    <p className="publish-diff-summary">{diff.hasChanges ? t('{0} 个页面有变化，{1} 个组件有变化', { 0: diff.changedPages, 1: diff.changedBlocks }) : t('内容一致，不需要生成新的发布版本。')}</p>
    {diff.siteNameChanged && <div className="publish-diff-row"><ChangeLabel kind="changed"/><span>{t('站点名称')}<small>{before?.name} → {after.name}</small></span></div>}
    {diff.pageOrderChanged && <div className="publish-diff-row"><ChangeLabel kind="changed"/><span>{t('页面顺序')}<small>{t('顺序已调整')}</small></span></div>}
    {diff.dataSourceOrderChanged && <div className="publish-diff-row"><ChangeLabel kind="changed"/><span>{t('数据源顺序')}<small>{t('顺序已调整')}</small></span></div>}
    {changed.map(page => <section className="publish-page-change" key={page.id} data-page-change={page.kind}>
      <div className="publish-page-heading"><ChangeLabel kind={page.kind}/><strong>{page.name}</strong><code>{page.path}</code></div>
      <div className="publish-page-meta">{[page.settingsChanged && t('页面设置'), page.layoutChanged && t('共享布局'), page.metadataChanged && t('页面信息或联动'), page.orderChanged && t('组件顺序')].filter(Boolean).join(' · ')}</div>
      {page.blocks.filter(block => block.kind !== 'unchanged').map(change => {
        const previous = blockFor(before, page.id, change.id), current = blockFor(after, page.id, change.id), block = current ?? previous;
        return <details className="publish-block-change" key={change.id}><summary><ChangeLabel kind={change.kind}/><span>{block ? blockLabel(block) : change.type}</span><code>{change.id}</code></summary><div className="publish-json-compare"><div><span>{t('修改前')}</span><pre>{blockDetails(previous)}</pre></div><div><span>{t('修改后')}</span><pre>{blockDetails(current)}</pre></div></div></details>;
      })}
    </section>)}
    {!!unchanged.length && <details className="publish-unchanged"><summary>{t('{0} 个页面未变化', { 0: unchanged.length })}</summary>{unchanged.map(page => <p key={page.id}>{page.name}<code>{page.path}</code></p>)}</details>}
    {[...diff.layouts, ...diff.dataSources].filter(item => item.kind !== 'unchanged').map(item => <div className="publish-diff-row" key={item.id}><ChangeLabel kind={item.kind}/><span>{item.name}<small>{'region' in item ? t('共享布局') : t('数据源')}</small></span></div>)}
    {!!diff.removedPages && <p className="publish-warning" role="alert">{t('公开发布将移除 {0} 个页面及其公开访问入口。', { 0: diff.removedPages })}</p>}
  </div>;
}

export function PublishCenterDialog(props: Props) {
  const latest = useRef(props); latest.current = props;
  const mounted = useRef(true), busyRef = useRef(false), loadSequence = useRef(0), detailSequence = useRef(0);
  const loadController = useRef<AbortController | null>(null), detailController = useRef<AbortController | null>(null);
  const [siteId, setSiteId] = useState(props.targetId), [draft, setDraft] = useState(() => toSiteDocument(props.getSite()));
  const [record, setRecord] = useState<CloudPageRecord | null>(null), [token, setToken] = useState<string | null>(null);
  const [versions, setVersions] = useState<PublishVersionSummary[]>([]), [active, setActive] = useState<PublishVersionDetail | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null), [selected, setSelected] = useState<PublishVersionDetail | null>(null);
  const [view, setView] = useState<'publish' | 'history'>('publish'), [compareDraft, setCompareDraft] = useState(false);
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirmation, setConfirmation] = useState<Confirmation>(null);

  async function load(idOverride?: string) {
    const id = idOverride ?? siteId ?? latest.current.targetId, sequence = ++loadSequence.current;
    loadController.current?.abort(); const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setError('');
    try {
      const nextDraft = toSiteDocument(latest.current.getSite());
      if (!id) {
        if (controller.signal.aborted || sequence !== loadSequence.current) return;
        setDraft(nextDraft); setRecord(null); setToken(null); setVersions([]); setActive(null); setSelectedVersion(null); return;
      }
      const [nextRecord, history] = await Promise.all([
        accountApi<CloudPageRecord>(cloudPagePath(id), { signal: controller.signal }),
        accountApi<{ versions: PublishVersionSummary[] }>(cloudSiteVersionsPath(id), { signal: controller.signal }),
      ]);
      const current = nextRecord.publishedVersion ? await accountApi<PublishVersionDetail>(cloudSiteVersionPath(id, nextRecord.publishedVersion), { signal: controller.signal }) : null;
      if (controller.signal.aborted || sequence !== loadSequence.current || !mounted.current) return;
      setSiteId(id); setDraft(nextDraft); setRecord(nextRecord); setToken(nextRecord.shareToken); setVersions(history.versions); setActive(current);
      setSelectedVersion(previous => history.versions.some(item => item.version === previous) ? previous : current?.version ?? history.versions[0]?.version ?? null);
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current && sequence === loadSequence.current) setError(failure instanceof Error ? failure.message : t('发布状态读取失败，请重试。'));
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; loadController.current?.abort(); detailController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (view !== 'history' || !siteId || !selectedVersion || selected?.version === selectedVersion) return;
    const sequence = ++detailSequence.current;
    detailController.current?.abort(); const controller = new AbortController(); detailController.current = controller;
    setDetailLoading(true); setSelected(null); setError('');
    void accountApi<PublishVersionDetail>(cloudSiteVersionPath(siteId, selectedVersion), { signal: controller.signal }).then(detail => {
      if (!controller.signal.aborted && sequence === detailSequence.current && mounted.current) setSelected(detail);
    }).catch(failure => {
      if (!controller.signal.aborted && mounted.current) setError(failure instanceof Error ? failure.message : t('版本内容读取失败，请重试。'));
    }).finally(() => { if (mounted.current && sequence === detailSequence.current) setDetailLoading(false); });
  }, [view, siteId, selectedVersion]);

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : t('操作失败，请重试。')); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const publish = () => run(async () => {
    if (!draftDiff.hasChanges || latest.current.getSite() !== draft) {
      setDraft(toSiteDocument(latest.current.getSite())); setConfirmation(null); setNotice(t('草稿已变化，请检查新的差异后再发布。')); return;
    }
    const commit = await latest.current.onPublish(active?.version ?? null, siteId, draft.id);
    if (!mounted.current) return;
    setSiteId(commit.record.id); setToken(commit.result.token); setConfirmation(null);
    const message = commit.result.unchanged ? t('内容没有变化，未生成重复版本。') : t('版本 {0} 已发布，分享链接保持不变。', { 0: commit.result.version });
    setNotice(message);
    await load(commit.record.id);
  });
  const rollback = () => run(async () => {
    if (!siteId || !active || !selected) return;
    const result = await latest.current.onRollback(siteId, selected.version, active.version);
    if (!mounted.current) return;
    setToken(result.token); setConfirmation(null);
    const message = result.unchanged ? t('公开内容已经是该版本，无需回滚。') : t('已回滚公开内容并生成版本 {0}，当前草稿未改变。', { 0: result.version });
    setNotice(message);
    await load(siteId);
  });
  const restore = () => run(async () => {
    if (!siteId || !selected) return;
    await latest.current.onRestoreDraft(siteId, selected.page);
    if (!mounted.current) return;
    setDraft(toSiteDocument(latest.current.getSite())); setConfirmation(null);
    const message = t('已恢复版本 {0} 到编辑草稿，可撤销；公开站点未改变。', { 0: selected.version });
    setNotice(message);
  });
  const unpublish = () => run(async () => {
    if (!siteId) return;
    await accountApi(cloudPagePath(siteId) + '/share', { method: 'DELETE' });
    if (!mounted.current) return;
    setToken(null); setActive(null); setConfirmation(null);
    const message = t('分享已关闭，原链接已失效；发布历史仍保留。');
    setNotice(message);
    await load(siteId);
  });
  const copy = async () => {
    if (!token) return;
    try { await navigator.clipboard.writeText(shareUrl(token)); latest.current.notify(t('分享链接已复制')); }
    catch { setError(t('请选中分享链接，手动复制。')); }
  };

  const draftDiff = diffSites(active?.page ?? null, draft);
  const selectedDiff = selected ? diffSites(compareDraft ? draft : active?.page ?? null, selected.page) : null;
  const rollbackDiff = selected && active ? diffSites(active.page, selected.page) : null;
  const unchangedDraft = !!selected && jsonEqual(selected.page, draft);
  const time = (date: string) => new Date(date).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
  const close = () => { if (!busyRef.current) props.onClose(); };
  const confirmationText = confirmation === 'publish' ? t('将把上述差异公开到当前分享链接，草稿之后仍可独立修改。')
    : confirmation === 'rollback' && selected ? t('公开内容将回到版本 {0}，并创建一个新版本。当前草稿不变，分享链接不变。', { 0: selected.version })
    : confirmation === 'restore' && selected ? t('版本 {0} 将替换当前草稿，公开站点不变。恢复后可用一次撤销回到当前草稿。', { 0: selected.version })
    : confirmation === 'unpublish' ? t('关闭后，原分享链接立即失效。历史版本保留，可之后重新发布。') : '';
  const confirmAction = confirmation === 'publish' ? publish : confirmation === 'rollback' ? rollback : confirmation === 'restore' ? restore : unpublish;

  return <StudioDialog title={t('发布与分享')} className="publish-center-dialog" onClose={close} dismissOutside={!busy}>
    <header className="publish-center-header"><div><h2>{t('发布与分享')}</h2><p>{t('先检查差异，再决定公开什么。')}</p></div><StudioButton className="icon-button" aria-label={t('关闭发布与分享')} disabled={busy} onClick={close}><X size={17}/></StudioButton></header>
    <div className="publish-center-tabs" role="tablist" aria-label={t('发布与分享视图')} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')], current = tabs.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (Math.max(0, current) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
    }}>
      <StudioButton role="tab" tabIndex={view === 'publish' ? 0 : -1} aria-selected={view === 'publish'} aria-controls="publish-current-panel" id="publish-current-tab" className={view === 'publish' ? 'is-active' : ''} onClick={() => { setView('publish'); setConfirmation(null); }}><Share2 size={14}/>{t('发布内容')}</StudioButton>
      <StudioButton role="tab" tabIndex={view === 'history' ? 0 : -1} aria-selected={view === 'history'} aria-controls="publish-history-panel" id="publish-history-tab" className={view === 'history' ? 'is-active' : ''} onClick={() => { setView('history'); setConfirmation(null); }}><History size={14}/>{t('版本记录')}<span>{versions.length}</span></StudioButton>
    </div>
    <div className="publish-center-body">
      {loading && <p className="publish-loading" role="status"><LoaderCircle size={14} className="spin"/>{record ? t('正在刷新发布状态…') : t('正在读取发布状态…')}</p>}
      {error && <div className="account-error" role="alert"><p>{translateMessage(error)}</p><StudioButton disabled={busy} onClick={() => void load()}>{t('重新读取')}</StudioButton></div>}
      {notice && <p className="publish-notice" role="status"><Check size={14}/>{notice}</p>}
      {view === 'publish' ? <section id="publish-current-panel" role="tabpanel" aria-labelledby="publish-current-tab">
        <div className="publish-current-status"><span>{active ? t('当前公开版本 {0}', { 0: active.version }) : t('当前未公开')}</span>{record?.publishedAt && active && <small>{time(record.publishedAt)}</small>}</div>
        {token && <div className="publish-share-link"><input aria-label={t('分享链接')} readOnly value={shareUrl(token)} onFocus={event => event.target.select()}/><StudioButton className="icon-button" aria-label={t('复制分享链接')} onClick={() => void copy()}><Copy size={15}/></StudioButton><a href={shareUrl(token)} target="_blank" rel="noreferrer" aria-label={t('打开分享预览')}><ExternalLink size={14}/></a></div>}
        <div className="publish-comparison-heading"><h3>{active ? t('当前公开 → 当前草稿') : t('未公开 → 当前草稿')}</h3><StudioButton disabled={busy || loading} onClick={() => void load()}>{t('刷新')}</StudioButton></div>
        <DiffView diff={draftDiff} before={active?.page ?? null} after={draft}/>
      </section> : <section id="publish-history-panel" role="tabpanel" aria-labelledby="publish-history-tab">
        <div className="publish-history-layout"><div className="publish-version-list" aria-label={t('发布版本列表')}>
          {!versions.length && !loading && <p className="account-hint">{t('还没有发布版本。第一次公开发布后，可在这里查看和恢复。')}</p>}
          {versions.map(version => <StudioButton key={version.id} className={selectedVersion === version.version ? 'publish-version is-active' : 'publish-version'} aria-pressed={selectedVersion === version.version} onClick={() => { setSelectedVersion(version.version); setConfirmation(null); }}>
            <strong>{t('版本 {0}', { 0: version.version })}</strong><small>{time(version.createdAt)}</small>
            <span>{[active?.version === version.version ? t('当前公开') : '', version.sourceVersion ? t('回滚自版本 {0}', { 0: version.sourceVersion }) : active?.version === version.version ? '' : t('公开发布')].filter(Boolean).join(' · ')}</span>
          </StudioButton>)}
        </div><div className="publish-version-detail">
          {detailLoading && <p className="publish-loading" role="status"><LoaderCircle size={14} className="spin"/>{t('正在读取版本内容…')}</p>}
          {selected && selectedDiff ? <>
            <label className="publish-compare-select">{t('对比基准')}<select aria-label={t('历史对比基准')} value={compareDraft ? 'draft' : 'public'} onChange={event => { setCompareDraft(event.target.value === 'draft'); setConfirmation(null); }}><option value="public">{t('当前公开')}</option><option value="draft">{t('当前草稿')}</option></select></label>
            <h3>{compareDraft ? t('当前草稿') : t('当前公开')}{t(' → 版本 {0}', { 0: selected.version })}</h3>
            <DiffView diff={selectedDiff} before={compareDraft ? draft : active?.page ?? null} after={selected.page}/>
          </> : !detailLoading && selectedVersion && <p className="account-hint">{t('选择版本后读取差异。')}</p>}
        </div></div>
      </section>}
      {confirmation && <div className="publish-confirmation" role="alert"><p>{confirmationText}</p></div>}
    </div>
    <footer className="publish-center-footer">
      <div className="publish-footer-status">{view === 'publish' ? <span>{active ? t('公开版本 {0}', { 0: active.version }) : t('下一版本 {0}', { 0: (versions[0]?.version ?? 0) + 1 })}</span> : selected ? <span>{t('已选版本 {0}', { 0: selected.version })}</span> : <span>{t('保留最近 {0} 个发布版本', { 0: publishHistoryLimit })}</span>}</div>
      <div className="publish-footer-actions">
        {confirmation ? <><StudioButton disabled={busy} onClick={() => setConfirmation(null)}>{t('取消')}</StudioButton><StudioButton className="primary-button" disabled={busy || loading} onClick={() => void confirmAction()}>{busy ? <LoaderCircle size={14} className="spin"/> : confirmation === 'publish' ? t('确认公开发布') : confirmation === 'rollback' ? t('确认公开回滚') : confirmation === 'restore' ? t('确认恢复草稿') : t('确认关闭分享')}</StudioButton></>
          : view === 'publish' ? <>{token && <StudioButton disabled={busy} onClick={() => setConfirmation('unpublish')}>{t('关闭分享')}</StudioButton>}<StudioButton className="primary-button" disabled={busy || loading || !props.cloudEnabled || !draftDiff.hasChanges} title={!draftDiff.hasChanges ? t('当前草稿与公开内容一致') : undefined} onClick={() => setConfirmation('publish')}>{token ? t('检查并更新分享') : t('检查并发布')}</StudioButton></>
          : selected && <><StudioButton disabled={busy || unchangedDraft} title={unchangedDraft ? t('当前草稿已是该版本') : undefined} onClick={() => setConfirmation('restore')}><RotateCcw size={14}/>{t('恢复到编辑草稿')}</StudioButton><StudioButton className="primary-button" disabled={busy || !active || !rollbackDiff?.hasChanges} title={!active ? t('分享已关闭，请重新发布') : !rollbackDiff?.hasChanges ? t('公开内容已是该版本') : undefined} onClick={() => setConfirmation('rollback')}>{t('回滚公开内容')}</StudioButton></>}
      </div>
    </footer>
  </StudioDialog>;
}
