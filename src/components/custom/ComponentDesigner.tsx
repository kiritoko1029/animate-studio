import { t, getLocale, translateMessage } from '../../i18n';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertCircle, BookOpen, Check, Cloud, Code2, Copy, Eye, HardDrive, LayoutTemplate, LoaderCircle, MoreHorizontal, Play, Plus, RotateCcw, Save, Settings2, Share2, Terminal, Trash2, TriangleAlert, X } from 'lucide-react';
import { StudioButton, StudioDialog } from '../StudioUI';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../animate-ui/components/radix/dropdown-menu';
import { Switch } from '../animate-ui/components/radix/switch';
import { useAccount } from '../AccountProvider';
import { customComponentLimits, customFieldKeys, customFieldLabels, customFieldLimits, isSafeCustomUrl, validateCustomComponentDefinition, type CustomComponentDefinition, type CustomComponentSource, type CustomFieldKey } from '../../../shared/custom-components.mjs';
import type { PageDocument } from '../../model';
import { getTheme, type ThemeId } from '../../lib/themes';
import { getLocalComponent, pickDefinition, RevisionConflictError, type LocalComponent } from '../../lib/custom-components/library';
import { CloudConflictError } from '../../lib/custom-components/cloud';
import { clearDesignerDraft, markRunFinished, markRunStarted, previousRunUnfinished, readDesignerDraft, writeDesignerDraft, type DesignerDraft, type DesignerTarget } from '../../lib/custom-components/drafts';
import { codeHints, type CodePanel } from '../../lib/custom-components/hints';
import { cloneTemplate, componentTemplates } from '../../lib/custom-components/templates';
import { countSourceInstances, customComponentTheme } from '../../lib/custom-components/instances';
import { guardLoops } from '../../lib/custom-components/loop-guard';
import type { FrameMessage } from '../../lib/custom-components/protocol';
import { CustomComponentFrame, type FrameStatus } from './CustomComponentFrame';
import { CodePanelEditor, type CodePanelHandle } from './CodePanelEditor';
import { DesignerGuide } from './DesignerGuide';
import { ShareComponentDialog } from './ShareComponentDialog';
import { useLibrary } from './useCustomLibrary';
import '../../custom-designer.css';

export type DesignerRequest = {
  /** null: a new, not yet saved component. */
  target: DesignerTarget;
  definition: CustomComponentDefinition;
  revision: number | null;
  origin?: LocalComponent['origin'];
  /** Initial library folder; kept outside the portable component definition. */
  folder?: { kind: 'local' | 'cloud'; id: string | null };
  /** Apply this target's stored draft without asking (the user chose “继续编辑”). */
  restoreDraft?: boolean;
};
type Props = {
  request: DesignerRequest;
  page: PageDocument;
  onClose: () => void;
  onAddToPage: (definition: CustomComponentDefinition, source: CustomComponentSource) => boolean;
  onRequestLogin: () => void;
  notify: (message: string) => void;
};
type Message = { id: number; kind: 'error' | 'warning' | 'log'; level?: string; message: string; line?: number; panel?: CodePanel };
type PreviewTheme = 'page' | 'animate-light' | 'animate-dark';
type Steps = { edit: boolean; run: boolean; save: boolean; add: boolean };

const panels: { id: CodePanel | 'settings'; label: string }[] = [{ id: 'html', label: 'HTML' }, { id: 'css', label: 'CSS' }, { id: 'js', label: 'JavaScript' }, { id: 'settings', label: '设置' }];
const stepsHiddenKey = 'animate-studio:custom-designer-steps-hidden';
const autoRunKey = 'animate-studio:custom-designer-autorun';
const codeOf = (definition: CustomComponentDefinition) => ({ name: definition.name, html: definition.html, css: definition.css, js: definition.js });
const sameDefinition = (a: CustomComponentDefinition, b: CustomComponentDefinition) => JSON.stringify(pickDefinition(a)) === JSON.stringify(pickDefinition(b));
const readFlag = (key: string, fallback: boolean) => { try { const value = localStorage.getItem(key); return value === null ? fallback : value === '1'; } catch { return fallback; } };
const writeFlag = (key: string, value: boolean) => { try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* Preference only. */ } };
const errorText = (error: unknown) => error instanceof Error ? error.message : t("操作失败，请重试。");
const time = (value: string) => new Date(value).toLocaleString(getLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ComponentDesigner({ request, page, onClose, onAddToPage, onRequestLogin, notify }: Props) {
  const library = useLibrary();
  const { user, capabilities } = useAccount();
  const [target, setTarget] = useState<DesignerTarget>(request.target);
  const cloudOwner = useRef(request.target?.kind === 'cloud' ? user?.id ?? null : null);
  const [revision, setRevision] = useState<number | null>(request.revision);
  const [baseline, setBaseline] = useState<CustomComponentDefinition>(() => pickDefinition(request.definition));
  const [draft, setDraft] = useState<CustomComponentDefinition>(() => pickDefinition(request.definition));
  const draftRef = useRef(draft); draftRef.current = draft;
  const [panel, setPanel] = useState<CodePanel | 'settings'>('html');
  const [mobileView, setMobileView] = useState<'code' | 'preview'>('code');
  const [guide, setGuide] = useState(false);
  const [stepsHidden, setStepsHidden] = useState(() => readFlag(stepsHiddenKey, false));
  const [steps, setSteps] = useState<Steps>({ edit: false, run: false, save: request.target !== null, add: false });
  const [autoRun, setAutoRun] = useState(() => readFlag(autoRunKey, true));
  const [paused, setPaused] = useState(() => previousRunUnfinished());
  const [run, setRun] = useState(() => ({ code: codeOf(request.definition), key: 0 }));
  const [status, setStatus] = useState<FrameStatus>('loading');
  const [messages, setMessages] = useState<Message[]>([]);
  const [consoleTab, setConsoleTab] = useState<'problems' | 'logs'>('problems');
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('page');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [dialog, setDialog] = useState<null | 'close' | 'delete' | 'templates' | 'login' | 'share' | { conflict: 'local' | 'cloud'; deleted: boolean } | { restore: DesignerDraft }>(null);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const editors = useRef<Partial<Record<CodePanel, CodePanelHandle | null>>>({});
  const messageId = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const dirty = !sameDefinition(draft, baseline);
  const isNew = target === null;
  const size = draft.size ?? { width: 360, height: 240 };
  const hints = useMemo(() => codeHints(draft), [draft.html, draft.css, draft.js]);
  const instances = target ? countSourceInstances(page, target) : 0;

  // Offer the stored draft once, before the user starts editing.
  useEffect(() => {
    const stored = readDesignerDraft(request.target, undefined, cloudOwner.current);
    if (!stored || sameDefinition(stored.definition, request.definition)) return;
    if (request.restoreDraft) applyDraft(stored);
    else setDialog({ restore: stored });
  }, []);
  function applyDraft(stored: DesignerDraft) {
    setDraft(pickDefinition(stored.definition));
    if (stored.target) setRevision(stored.baseRevision ?? 0);
    setSteps(value => ({ ...value, edit: true }));
  }

  // Mirror unsaved work to this browser so a closed tab or crash does not lose it.
  useEffect(() => {
    if (!dirty || (dialog && typeof dialog === 'object' && 'restore' in dialog)) return;
    const timer = window.setTimeout(persistDraft, 600);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, target, revision]);
  function persistDraft() {
    const stored = writeDesignerDraft({ target, baseRevision: revision, ownerId: cloudOwner.current ?? undefined, definition: draftRef.current });
    setDraftStorageFailed(!stored);
    library.refreshDrafts();
  }
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      writeDesignerDraft({ target, baseRevision: revision, ownerId: cloudOwner.current ?? undefined, definition: draftRef.current });
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, target, revision]);

  // Preserve private work for its original owner, then close it on account changes.
  useEffect(() => {
    if (target?.kind !== 'cloud' || cloudOwner.current === (user?.id ?? null)) return;
    if (dirty) writeDesignerDraft({ target, baseRevision: revision, ownerId: cloudOwner.current ?? undefined, definition: draftRef.current });
    library.refreshDrafts();
    onClose();
    notify(t("登录账号已改变，已关闭原账号组件；未保存内容可在原账号登录后恢复。"));
  }, [user?.id, target]);

  const startRun = useCallback(() => {
    setMessages([]); setPaused(false); markRunStarted();
    setRun(current => ({ code: codeOf(draftRef.current), key: current.key + 1 }));
  }, []);
  useEffect(() => { if (!paused) markRunStarted(); return () => markRunFinished(); }, []);
  useEffect(() => {
    if (!autoRun || paused) return;
    const next = codeOf(draft);
    if (next.html === run.code.html && next.css === run.code.css && next.js === run.code.js) return;
    const timer = window.setTimeout(startRun, 700);
    return () => window.clearTimeout(timer);
  }, [draft.html, draft.css, draft.js, autoRun, paused]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setStageSize({ width: rect.width, height: rect.height }); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mobileView]);
  const scale = stageSize.width && stageSize.height ? Math.min(1, (stageSize.width - 32) / size.width, (stageSize.height - 32) / size.height) : 1;

  const previewSettings = useMemo(() => {
    if (previewTheme === 'page') return page.settings;
    const preset = getTheme(previewTheme as ThemeId);
    return { ...page.settings, theme: previewTheme as ThemeId, accent: preset.accent, background: preset.canvas };
  }, [previewTheme, page.settings]);
  const theme = customComponentTheme({ props: {} }, previewSettings);
  const fieldValues = useMemo(() => Object.fromEntries(customFieldKeys.filter(key => draft.fields?.[key] !== undefined).map(key => [key, draft.fields![key]!])), [draft.fields]);

  const onFrameMessage = useCallback((message: FrameMessage) => {
    if (message.type !== 'error' && message.type !== 'warning' && message.type !== 'log') {
      if (message.type === 'open-link') setMessages(items => [...items.slice(-199), { id: ++messageId.current, kind: 'log', level: 'info', message: t("打开链接：{0}", { 0: message.href }) }]);
      return;
    }
    const entry: Message = message.type === 'log'
      ? { id: ++messageId.current, kind: 'log', level: message.level, message: message.message }
      : { id: ++messageId.current, kind: message.type, message: message.message, line: message.line, panel: message.line ? 'js' : undefined };
    setMessages(items => [...items.slice(-199), entry]);
    if (message.type === 'error') setConsoleTab('problems');
  }, []);
  const onFrameStatus = useCallback((next: FrameStatus) => {
    setStatus(next);
    if (next === 'ready' || next === 'timeout') markRunFinished();
    if (next === 'timeout') setMessages(items => [...items, { id: ++messageId.current, kind: 'error', message: t("组件在 6 秒内没有完成启动，可能存在长时间运行的脚本，已停止预览。修改代码后重新运行。") }]);
  }, []);
  useEffect(() => { if (status === 'ready' && run.key > 0) setSteps(value => ({ ...value, run: true })); }, [status, run.key]);

  function change(patch: Partial<CustomComponentDefinition>) {
    setDraft(current => ({ ...current, ...patch }));
    setSteps(value => value.edit ? value : { ...value, edit: true });
    setError('');
  }
  function setField(key: CustomFieldKey, enabled: boolean, value?: string) {
    const fields = { ...draftRef.current.fields };
    if (!enabled) delete fields[key]; else fields[key] = value ?? fields[key] ?? '';
    change({ fields });
  }

  async function guard(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (failure) { setError(errorText(failure)); } finally { busyRef.current = false; setBusy(false); }
  }
  function validated() {
    try { return validateCustomComponentDefinition(pickDefinition(draftRef.current)); }
    catch (failure) {
      const message = errorText(failure);
      if (/component\.(name|description|fields|size)/.test(message)) setPanel('settings');
      throw new Error(t("无法保存：{0}", { 0: message.replace(/^component\./, '') }));
    }
  }
  type SavedLocation = { target: NonNullable<DesignerTarget>; revision: number; definition: CustomComponentDefinition };
  function saved(nextTarget: NonNullable<DesignerTarget>, nextRevision: number, definition: CustomComponentDefinition, message: string): SavedLocation {
    clearDesignerDraft(target, undefined, cloudOwner.current);
    if (nextTarget.kind === 'cloud') cloudOwner.current = user?.id ?? null;
    clearDesignerDraft(nextTarget, undefined, cloudOwner.current); library.refreshDrafts();
    setTarget(nextTarget); setRevision(nextRevision); setBaseline(pickDefinition(definition));
    setSteps(value => ({ ...value, save: true }));
    const count = countSourceInstances(page, nextTarget);
    notify(count ? t("{0}。当前页面中 {1} 个已插入的实例仍使用旧版本，可在属性面板中更新", { 0: message, 1: count }) : message);
    return { target: nextTarget, revision: nextRevision, definition: pickDefinition(definition) };
  }
  /** Save to the current place: this browser for new and local components, the account for account components. */
  async function save(force = false): Promise<SavedLocation | null> {
    let location: SavedLocation | null = null;
    await guard(async () => {
      const definition = validated();
      try {
        if (target?.kind === 'cloud') {
          if (!user) { setDialog('login'); return; }
          const base = force ? (await library.loadCloud(target.id)).revision : revision ?? 1;
          const record = await library.updateCloud(target.id, definition, base);
          location = saved({ kind: 'cloud', id: record.id }, record.revision, definition, t("已保存到账号（版本 {0}）", { 0: record.revision }));
        } else {
          // An explicit overwrite is based on whatever is stored now.
          const base = force && target ? getLocalComponent(target.id)?.revision ?? null : revision;
          const component = target ? library.saveLocal(definition, { id: target.id, baseRevision: base }) : library.saveLocal(definition, { origin: request.origin, folderId: request.folder?.kind === 'local' ? request.folder.id : undefined });
          location = saved({ kind: 'local', id: component.id }, component.revision, definition, t("已保存到本机（版本 {0}）", { 0: component.revision }));
        }
      } catch (failure) {
        if (failure instanceof RevisionConflictError) { setDialog({ conflict: 'local', deleted: failure.current === null }); return; }
        if (failure instanceof CloudConflictError) { setDialog({ conflict: 'cloud', deleted: false }); return; }
        throw failure;
      }
    });
    return location;
  }
  /** Copy to the account; the browser copy stays where it is. */
  async function saveToAccount(): Promise<SavedLocation | null> {
    if (!user) { setDialog('login'); return null; }
    let location: SavedLocation | null = null;
    await guard(async () => {
      const definition = validated();
      const record = await library.createCloud(definition, request.folder?.kind === 'cloud' ? request.folder.id : undefined);
      const fromLocal = target?.kind === 'local';
      location = saved({ kind: 'cloud', id: record.id }, record.revision, definition, fromLocal ? t("已复制到账号，本机副本仍保留") : t("已保存到账号"));
    });
    return location;
  }
  async function saveAsNew() {
    await guard(async () => {
      const definition = validated();
      const component = library.saveLocal({ ...definition, name: definition.name.length > 54 ? definition.name : t("{0} 副本", { 0: definition.name }) }, { origin: request.origin, folderId: target?.kind === 'local' ? library.findLocal(target.id)?.folderId : request.folder?.kind === 'local' ? request.folder.id : undefined });
      saved({ kind: 'local', id: component.id }, component.revision, { ...definition, name: component.name }, t("已另存为新的本机组件"));
      setDraft(current => ({ ...current, name: component.name }));
    });
  }
  async function addToPage() {
    const location = dirty || isNew || !target || !revision ? await save() : { target, revision, definition: pickDefinition(draftRef.current) };
    if (!location) return;
    const source = { kind: location.target.kind, id: location.target.id, revision: location.revision };
    if (onAddToPage(location.definition, source)) { setSteps(value => ({ ...value, add: true })); closeAfterSave(location); }
  }
  function closeAfterSave(location: SavedLocation) {
    if (sameDefinition(draftRef.current, location.definition)) closeNow();
    else { setDialog(null); notify(t("保存期间的新修改仍保留在设计器中，请继续保存。")); }
  }
  async function remove() {
    await guard(async () => {
      if (!target) { clearDesignerDraft(null); library.refreshDrafts(); closeNow(); return; }
      if (target.kind === 'local') library.deleteLocal(target.id); else await library.deleteCloud(target.id);
      notify(instances ? t("组件已删除。页面中已插入的 {0} 个副本不受影响", { 0: instances }) : t("组件已删除"));
      closeNow();
    });
  }
  function closeNow() { markRunFinished(); onClose(); }
  function requestClose() { if (busyRef.current) return; if (dirty) { persistDraft(); setDialog('close'); } else closeNow(); }
  function discardAndClose() { clearDesignerDraft(target, undefined, cloudOwner.current); library.refreshDrafts(); closeNow(); }
  function applyTemplate(id: string) {
    const template = componentTemplates.find(item => item.id === id);
    if (!template) return;
    const definition = cloneTemplate(template);
    // Keep the name of an existing component; a new one takes the template name.
    change(isNew ? definition : { ...definition, name: draftRef.current.name, description: draftRef.current.description });
    setDialog(null); setPendingTemplate(null); setPanel('html');
    window.setTimeout(startRun, 0);
  }
  function jump(entry: { panel?: CodePanel; line?: number }) {
    if (!entry.panel || !entry.line) return;
    setPanel(entry.panel); setMobileView('code');
    window.requestAnimationFrame(() => editors.current[entry.panel!]?.reveal(entry.line!));
  }
  function onKeyDown(event: ReactKeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
    else if (event.key === 'Enter') { event.preventDefault(); startRun(); }
  }

  const location = target?.kind === 'cloud' ? t("账号") : target?.kind === 'local' ? t("本机") : t("新组件");
  const problems = [...hints.map((hint, index) => ({ id: -index - 1, kind: 'warning' as const, message: hint.message, line: hint.line, panel: hint.panel })), ...messages.filter(entry => entry.kind !== 'log')];
  const logs = messages.filter(entry => entry.kind === 'log');
  const errors = problems.filter(entry => entry.kind === 'error').length;
  const stepItems: [keyof Steps, string][] = [['edit', t("选择模板或修改代码")], ['run', t("运行预览，查看控制台")], ['save', t("保存到本机或账号")], ['add', t("添加到页面")]];

  return <StudioDialog title={t("自定义组件设计器")} className="component-designer" onClose={requestClose} dismissOutside={false}>
    <div className="ccd-root" onKeyDown={onKeyDown}>
      <header className="ccd-header">
        <div className="ccd-title">
          <Code2 size={17}/>
          <input className="ccd-name" aria-label={t("组件名称")} value={draft.name} maxLength={customComponentLimits.name} placeholder={t("组件名称")} onChange={event => change({ name: event.target.value })}/>
          <span className={`ccd-location ccd-location--${target?.kind ?? 'new'}`} title={target ? t("{0}组件 · 版本 {1}", { 0: location, 1: revision }) : t("还没有保存到本机或账号")}>{target?.kind === 'cloud' ? <Cloud size={12}/> : <HardDrive size={12}/>}{location}{revision ? ` · v${revision}` : ''}</span>
          {dirty && <span className="ccd-dirty" role="status"><span aria-hidden="true"/>{t("有未保存的修改")}</span>}
        </div>
        <div className="ccd-actions">
          <StudioButton className="secondary-button" aria-label={t("运行")} onClick={startRun} title={t("运行（⌘/Ctrl + Enter）")}><Play size={13}/><span>{t("运行")}</span></StudioButton>
          <StudioButton className="primary-button" aria-label={target?.kind === 'cloud' ? t("保存到账号") : isNew ? t("保存到本机") : t("保存")} disabled={busy} onClick={() => void save()} title={t("保存（⌘/Ctrl + S）")}>{busy ? <LoaderCircle size={13} className="spin"/> : <Save size={13}/>}<span>{target?.kind === 'cloud' ? t("保存到账号") : isNew ? t("保存到本机") : t("保存")}</span></StudioButton>
          {target?.kind !== 'cloud' && <StudioButton className="secondary-button" aria-label={t("保存到账号")} disabled={busy} onClick={() => void saveToAccount()} title={user ? t("在账号中保存一份，可在其他设备使用") : t("登录后可保存到账号")}><Cloud size={13}/><span>{t("保存到账号")}</span></StudioButton>}
          <StudioButton className="secondary-button" aria-label={dirty || isNew ? t("保存并添加到页面") : t("添加到页面")} title={dirty || isNew ? t("保存并添加到页面") : t("添加到页面")} disabled={busy} onClick={() => void addToPage()}><Plus size={13}/><span>{dirty || isNew ? t("保存并添加到页面") : t("添加到页面")}</span></StudioButton>
          <StudioButton className="icon-button" aria-label={t("分享组件")} title={t("分享组件")} onClick={() => setDialog(target?.kind === 'cloud' ? 'share' : user ? 'share' : 'login')}><Share2 size={15}/></StudioButton>
          <DropdownMenu><DropdownMenuTrigger asChild><StudioButton className="icon-button" aria-label={t("更多组件操作")}><MoreHorizontal size={16}/></StudioButton></DropdownMenuTrigger><DropdownMenuContent className="studio-menu" align="end" sideOffset={6}>
            <DropdownMenuItem onSelect={() => setDialog('templates')}><LayoutTemplate size={14}/>{t("换用起步模板…")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void saveAsNew()}><Copy size={14}/>{t("另存为新的本机组件")}</DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={() => setDialog('delete')}><Trash2 size={14}/>{isNew ? t("放弃这个新组件") : t("删除组件…")}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
          <StudioButton className={`icon-button ${guide ? 'active' : ''}`} aria-pressed={guide} aria-label={t("编写指南")} title={t("编写指南")} onClick={() => setGuide(value => !value)}><BookOpen size={15}/></StudioButton>
          <StudioButton className="icon-button" aria-label={t("关闭设计器")} onClick={requestClose}><X size={17}/></StudioButton>
        </div>
      </header>
      {!stepsHidden && <ol className="ccd-steps" aria-label={t("上手步骤")}>{stepItems.map(([key, label], index) => <li key={key} className={steps[key] ? 'done' : ''}><span>{steps[key] ? <Check size={11}/> : index + 1}</span>{t(label)}</li>)}<li className="ccd-steps-end"><StudioButton className="text-button" onClick={() => setGuide(true)}>{t("查看编写指南")}</StudioButton><StudioButton className="icon-button" aria-label={t("隐藏上手步骤")} onClick={() => { setStepsHidden(true); writeFlag(stepsHiddenKey, true); }}><X size={12}/></StudioButton></li></ol>}
      {error && <p className="ccd-error" role="alert"><AlertCircle size={14}/>{translateMessage(error)}</p>}
      {dirty && draftStorageFailed && <p className="ccd-error" role="alert"><AlertCircle size={14}/>{t("浏览器未能暂存草稿，请先保存组件，或保持此窗口打开以保留修改。")}</p>}
      {target && instances > 0 && <p className="ccd-note">{t("当前页面有")}{instances} {t("个此组件的实例。它们是插入时的副本，保存后不会自动改变，可在属性面板中选择“更新此实例”。")}</p>}
      <div className="ccd-mobile-switch" role="tablist" aria-label={t("设计器视图")}>{([['code', t("代码"), Code2], ['preview', t("预览"), Eye]] as const).map(([id, label, Icon]) => <StudioButton key={id} role="tab" aria-selected={mobileView === id} className={mobileView === id ? 'active' : ''} onClick={() => setMobileView(id)}><Icon size={14}/>{t(label)}{id === 'preview' && errors > 0 && <span className="ccd-badge">{errors}</span>}</StudioButton>)}</div>
      <div className={`ccd-body ccd-body--${mobileView}${guide ? ' ccd-body--guide' : ''}`}>
        <section className="ccd-code" aria-label={t("组件代码")}>
          <div className="ccd-tabs" role="tablist" aria-label={t("代码面板")}>{panels.map(item => <button key={item.id} type="button" role="tab" id={`ccd-tab-${item.id}`} aria-selected={panel === item.id} className={panel === item.id ? 'active' : ''} onClick={() => setPanel(item.id)}>{item.id === 'settings' && <Settings2 size={12}/>}{t(item.label)}{item.id !== 'settings' && hints.some(hint => hint.panel === item.id) && <TriangleAlert size={11} aria-label={t("有提示")}/>}</button>)}</div>
          <div className="ccd-editor" data-escape-local>
            {(['html', 'css', 'js'] as const).map(id => <CodePanelEditor key={id} ref={handle => { editors.current[id] = handle; }} panel={id} hidden={panel !== id} value={draft[id]} onChange={value => change({ [id]: value })} onRun={startRun} onSave={() => void save()}/>)}
            {panel === 'settings' && <div className="ccd-settings" role="tabpanel" aria-labelledby="ccd-tab-settings">
              <label className="ccd-field"><span>{t("说明")}</span><textarea rows={2} value={draft.description ?? ''} maxLength={customComponentLimits.description} placeholder={t("一句话介绍这个组件，会显示在组件库和分享页中")} onChange={event => change({ description: event.target.value || undefined })}/></label>
              <fieldset className="ccd-field"><legend>{t("默认尺寸")}</legend><div className="ccd-size">{(['width', 'height'] as const).map(key => <label key={key}><span>{key === 'width' ? t("宽") : t("高")}</span><input type="number" aria-label={key === 'width' ? t("默认宽度") : t("默认高度")} min={key === 'width' ? customComponentLimits.minWidth : customComponentLimits.minHeight} max={key === 'width' ? customComponentLimits.maxWidth : customComponentLimits.maxHeight} value={size[key]} onChange={event => { const value = Math.round(Number(event.target.value)); if (Number.isFinite(value) && value > 0) change({ size: { ...size, [key]: value } }); }}/><small>px</small></label>)}</div><p>{t("插入页面时使用此尺寸，之后可在画布中调整。宽")}{customComponentLimits.minWidth}–{customComponentLimits.maxWidth}{t("、高")}{customComponentLimits.minHeight}–{customComponentLimits.maxHeight}。</p></fieldset>
              <fieldset className="ccd-field"><legend>{t("实例字段")}</legend><p>{t("启用后，页面中的每个实例都能在属性面板中单独修改这些值。代码中用")}<code>{t("data-prop=\"字段名\"")}</code> {t("或")}<code>{t("component.props.字段名")}</code> {t("读取。")}</p>
                {customFieldKeys.map(key => { const enabled = draft.fields?.[key] !== undefined; const value = draft.fields?.[key] ?? ''; const invalid = enabled && (key === 'url' || key === 'imageUrl') && !isSafeCustomUrl(value, key === 'imageUrl'); return <div key={key} className={`ccd-prop ${enabled ? 'enabled' : ''}`}>
                  <label className="ccd-prop-toggle"><Switch aria-label={t("启用实例字段 {0}", { 0: t(customFieldLabels[key]) })} checked={enabled} onCheckedChange={checked => setField(key, checked)}/><span>{t(customFieldLabels[key])}</span><code>{key}</code></label>
                  {enabled && (key === 'text' ? <textarea rows={2} aria-label={t("{0} 默认值", { 0: t(customFieldLabels[key]) })} maxLength={customFieldLimits[key]} value={value} onChange={event => setField(key, true, event.target.value)}/> : <input aria-label={t("{0} 默认值", { 0: t(customFieldLabels[key]) })} maxLength={customFieldLimits[key]} value={value} placeholder={key === 'url' ? 'https://example.com' : key === 'imageUrl' ? 'https://example.com/image.png' : t("默认值")} aria-invalid={invalid} onChange={event => setField(key, true, event.target.value)}/>)}
                  {invalid && <small className="ccd-prop-error">{t("请使用 https://、http://、站内 / 路径")}{key === 'url' ? t("、#锚点、mailto: 或 tel:") : ''}。</small>}
                </div>; })}
              </fieldset>
            </div>}
          </div>
        </section>
        <section className="ccd-preview" aria-label={t("实时预览")}>
          <div className="ccd-preview-toolbar">
            <span className={`ccd-run-status ccd-run-status--${paused ? 'paused' : status}`} role="status">{paused ? t("已暂停") : status === 'ready' ? (errors ? t("运行完成 · {0} 个错误", { 0: errors }) : t("运行正常")) : status === 'timeout' ? t("已停止") : t("运行中…")}</span>
            <label className="ccd-inline"><span>{t("预览主题")}</span><select aria-label={t("预览主题")} value={previewTheme} onChange={event => setPreviewTheme(event.target.value as PreviewTheme)}><option value="page">{t("当前页面")}</option><option value="animate-light">{t("浅色")}</option><option value="animate-dark">{t("深色")}</option></select></label>
            <label className="ccd-inline ccd-autorun"><Switch aria-label={t("自动运行")} checked={autoRun} onCheckedChange={checked => { setAutoRun(checked); writeFlag(autoRunKey, checked); }}/><span>{t("自动运行")}</span></label>
            <StudioButton className="icon-button" aria-label={t("重新运行预览")} title={t("重新运行")} onClick={startRun}><RotateCcw size={14}/></StudioButton>
          </div>
          <div className="ccd-stage" ref={stage} style={{ background: theme.canvas }}>
            <span className="ccd-stage-size">{size.width} × {size.height}{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}</span>
            {paused ? <div className="ccd-paused"><TriangleAlert size={22}/><strong>{t("上次预览没有正常结束")}</strong><p>{t("为避免页面再次卡住，已暂停自动运行。检查循环或长时间运行的代码后再运行。")}</p><StudioButton className="primary-button" onClick={startRun}><Play size={13}/>{t("运行预览")}</StudioButton></div>
              : <div className="ccd-stage-frame" style={{ width: size.width, height: size.height, transform: `scale(${Math.max(.1, scale)})` }}>
                <CustomComponentFrame code={run.code} runKey={run.key} props={fieldValues} theme={theme} title={t("{0} 预览", { 0: draft.name || t('组件') })} interactive transformScript={guardLoops} readyTimeoutMs={6000} onMessage={onFrameMessage} onStatus={onFrameStatus}/>
              </div>}
          </div>
          <div className="ccd-console">
            <div className="ccd-console-tabs" role="tablist" aria-label={t("控制台")}>
              <button type="button" role="tab" aria-selected={consoleTab === 'problems'} className={consoleTab === 'problems' ? 'active' : ''} onClick={() => setConsoleTab('problems')}><AlertCircle size={12}/>{t("问题")}<span>{problems.length}</span></button>
              <button type="button" role="tab" aria-selected={consoleTab === 'logs'} className={consoleTab === 'logs' ? 'active' : ''} onClick={() => setConsoleTab('logs')}><Terminal size={12}/>{t("日志")}<span>{logs.length}</span></button>
              <button type="button" className="ccd-console-clear" onClick={() => setMessages([])}>{t("清空")}</button>
            </div>
            <div className="ccd-console-list" role="log" aria-live="polite">
              {(consoleTab === 'problems' ? problems : logs).map(entry => <div key={entry.id} className={`ccd-console-entry ccd-console-entry--${entry.kind === 'log' ? entry.level : entry.kind}`}>
                {entry.panel && entry.line ? <button type="button" onClick={() => jump(entry)} title={t("跳到代码位置")}>{entry.panel === 'js' ? 'JS' : entry.panel.toUpperCase()} {t("第")}{entry.line} {t("行")}</button> : <span className="ccd-console-kind">{entry.kind === 'error' ? t("错误") : entry.kind === 'warning' ? t("提示") : entry.level === 'warn' ? t("警告") : entry.level === 'error' ? t("错误") : t("日志")}</span>}
                <span>{entry.kind === 'log' ? entry.message : translateMessage(entry.message)}</span>
              </div>)}
              {!(consoleTab === 'problems' ? problems : logs).length && <p className="ccd-console-empty">{consoleTab === 'problems' ? t("没有发现问题。运行时错误、被安全策略阻止的操作会显示在这里。") : t("用 console.log 或 component.log 输出的内容会显示在这里。")}</p>}
            </div>
          </div>
        </section>
        {guide && <DesignerGuide onClose={() => setGuide(false)}/>}
      </div>
    </div>

    {dialog === 'close' && <StudioDialog role="alertdialog" title={t("保存修改？")} className="studio-confirm ccd-confirm" onClose={() => setDialog(null)}>
      <h2>{t("保存对「")}{draft.name || t("未命名组件")}{t("」的修改？")}</h2><p>{draftStorageFailed ? t("浏览器未能暂存草稿。请保存或继续编辑，关闭页面会丢失未保存的修改。") : t("未保存的修改已暂存在当前浏览器，下次打开这个组件时可以恢复。放弃后将无法找回。")}</p>
      <div><StudioButton className="secondary-button" onClick={() => setDialog(null)}>{t("继续编辑")}</StudioButton><StudioButton className="secondary-button" onClick={discardAndClose}>{t("放弃修改")}</StudioButton><StudioButton className="primary-button" disabled={busy} onClick={() => void save().then(location => { if (location) closeAfterSave(location); else setDialog(current => current === 'close' ? null : current); })}>{t("保存并关闭")}</StudioButton></div>
    </StudioDialog>}
    {dialog === 'delete' && <StudioDialog role="alertdialog" title={t("删除组件")} className="studio-confirm ccd-confirm" onClose={() => setDialog(null)}>
      <h2>{isNew ? t("放弃这个新组件？") : t("删除「{0}」？", { 0: baseline.name })}</h2><p>{isNew ? t("组件还没有保存，放弃后内容不会保留。") : t("{0}已插入页面的副本不受影响。", { 0: target?.kind === 'cloud' ? t('账号中的组件及其分享链接会一起删除。') : t('组件会从当前浏览器删除。') })}</p>
      <div><StudioButton className="secondary-button" onClick={() => setDialog(null)}>{t("取消")}</StudioButton><StudioButton className="primary-button" disabled={busy} onClick={() => void remove()}>{isNew ? t("放弃") : t("删除")}</StudioButton></div>
    </StudioDialog>}
    {dialog === 'templates' && <StudioDialog title={t("起步模板")} className="ccd-template-dialog" onClose={() => { setDialog(null); setPendingTemplate(null); }}>
      <header className="ccd-dialog-heading"><h2>{t("换用起步模板")}</h2><StudioButton className="icon-button" aria-label={t("关闭")} onClick={() => { setDialog(null); setPendingTemplate(null); }}><X size={16}/></StudioButton></header>
      <p className="ccd-dialog-text">{t("模板会替换当前的三个代码面板、字段与尺寸")}{isNew ? t("和名称") : t("，组件名称保持不变")}{t("。未保存的修改会被覆盖。需要保留时，请取消并先保存当前组件。")}</p>
      <div className="ccd-template-list">{componentTemplates.map(template => <button key={template.id} type="button" className={pendingTemplate === template.id ? 'selected' : ''} onClick={() => setPendingTemplate(template.id)}><strong>{t(template.name)}</strong><span>{t(template.summary)}</span><small>{template.uses.map(value => t(value)).join(' · ')}</small></button>)}</div>
      <div className="ccd-dialog-actions"><StudioButton className="secondary-button" onClick={() => { setDialog(null); setPendingTemplate(null); }}>{t("取消")}</StudioButton><StudioButton className="primary-button" disabled={!pendingTemplate} onClick={() => pendingTemplate && applyTemplate(pendingTemplate)}>{t("使用模板")}</StudioButton></div>
    </StudioDialog>}
    {dialog === 'login' && <StudioDialog role="alertdialog" title={t("登录后可用")} className="studio-confirm ccd-confirm" onClose={() => setDialog(null)}>
      <h2>{t("登录后保存到账号与分享")}</h2>
      <ul className="ccd-login-list"><li>{t("保存组件到账号，在其他设备继续使用")}</li><li>{t("发布分享链接，让其他人预览并复制组件")}</li><li>{t("本机组件保留在当前浏览器，登录不会自动上传或覆盖")}</li></ul>
      {!capabilities.cloudEnabled && <p className="ccd-dialog-text">{t("当前站点未开启账号登录，组件仍可保存在本机。")}</p>}
      <div><StudioButton className="secondary-button" onClick={() => setDialog(null)}>{t("暂不登录")}</StudioButton><StudioButton className="primary-button" disabled={!capabilities.cloudEnabled} onClick={() => { setDialog(null); onRequestLogin(); }}>{t("登录")}</StudioButton></div>
    </StudioDialog>}
    {dialog === 'share' && <ShareComponentDialog target={target} revision={revision} dirty={dirty} name={draft.name} onSaveToAccount={async () => Boolean(target?.kind === 'cloud' ? await save() : await saveToAccount())} onClose={() => setDialog(null)} notify={notify}/>}
    {dialog && typeof dialog === 'object' && 'conflict' in dialog && <StudioDialog role="alertdialog" title={t("组件已在别处修改")} className="studio-confirm ccd-confirm" onClose={() => setDialog(null)}>
      <h2>{dialog.deleted ? t("这个组件已被删除") : t("这个组件已在其他地方修改")}</h2>
      <p>{dialog.deleted ? t("它可能在另一个标签页中被删除。你可以把当前内容另存为新的本机组件。") : t("{0}的组件比你打开时更新。可以用当前内容覆盖，或另存为新组件以保留两份。", { 0: dialog.conflict === 'cloud' ? t('账号中') : t('本机') })}</p>
      <div><StudioButton className="secondary-button" onClick={() => setDialog(null)}>{t("取消")}</StudioButton><StudioButton className="secondary-button" onClick={() => { setDialog(null); void saveAsNew(); }}>{t("另存为新组件")}</StudioButton>{!dialog.deleted && <StudioButton className="primary-button" onClick={() => { setDialog(null); void save(true); }}>{t("覆盖为当前内容")}</StudioButton>}</div>
    </StudioDialog>}
    {dialog && typeof dialog === 'object' && 'restore' in dialog && <StudioDialog role="alertdialog" title={t("恢复未保存的修改")} className="studio-confirm ccd-confirm" dismissOutside={false} onClose={() => setDialog(null)}>
      <h2>{t("发现未保存的修改")}</h2><p>{time(dialog.restore.updatedAt)} {t("编辑「")}{dialog.restore.definition.name || t("未命名组件")}{t("」时留下的修改还没有保存。")}</p>
      <div><StudioButton className="secondary-button" onClick={() => { clearDesignerDraft(request.target, undefined, cloudOwner.current); library.refreshDrafts(); setDialog(null); }}>{t("放弃这些修改")}</StudioButton><StudioButton className="primary-button" onClick={() => { const restored = dialog.restore; setDialog(null); applyDraft(restored); }}>{t("恢复修改")}</StudioButton></div>
    </StudioDialog>}
  </StudioDialog>;
}
