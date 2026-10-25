import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, CircleHelp, LoaderCircle, MessageCircle, Pause, Play, Plus, Send, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { t, getLocale, translateMessage } from '../../i18n';
import type { PageDocument } from '../../model';
import { accountApi, type CloudPageSummary } from '../../lib/account-api';
import { defaultAiSettings, readAiSettings, saveAiSettings, aiSettingsKey, validateAiProfile } from '../../lib/ai/config';
import { AiRunner, type AiRunnerOptions } from '../../lib/ai/runner';
import { buildAiContext } from '../../lib/ai/protocol';
import { aiSessionsKey, newAiSession, readAiSessions, saveAiSessions } from '../../lib/ai/storage';
import { safeAiError } from '../../lib/ai/client';
import type { AiChange, AiProgress, AiSession, AiSettings, AiVersion } from '../../lib/ai/types';
import { StudioButton, StudioDialog, StudioTooltip } from '../StudioUI';
import { AiSelect } from './AiSelect';
import { AiSettingsDialog } from './AiSettingsDialog';
import { AiProgressPanel } from './AiProgressPanel';
import { AiQuestionCard, composeAiAnswer, toggleAiAnswer, type AiAnswers } from './AiQuestionCard';
import { AiVersionRow } from './AiVersionRow';
import { AiQualityReport } from './AiQualityReport';
import '../../ai-studio.css';

export type AiAssistantProps = {
  page: PageDocument; owner: string; signedIn: boolean; cloudPageId: string | null;
  selectedBlockIds: string[];
  getSurface: () => HTMLElement | null;
  onRevealBlock: (id: string) => void;
  getPage: () => PageDocument;
  onCommit: (page: PageDocument, change: AiChange, runId: string) => void;
  onRunningChange: (running: boolean) => void;
  onRestorePage: (page: PageDocument) => void;
  onOpenLocal: (page: PageDocument) => Promise<void>;
  onOpenCloud: (id: string) => Promise<void>;
  onCreatePage: () => Promise<boolean>;
  creationMode?: 'page' | 'component';
  onCreationModeChange?: (mode: 'page' | 'component') => void;
  initiallyOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  openRequest?: number;
  componentResult?: ReactNode;
  getComponents?: AiRunnerOptions['getComponents'];
  resolveComponent?: AiRunnerOptions['resolveComponent'];
  prepareCustom?: AiRunnerOptions['prepareCustom'];
};

export function AiAssistant(props: AiAssistantProps) {
  const latest = useRef(props); latest.current = props;
  const [open, setOpen] = useState(props.initiallyOpen ?? false), [configOpen, setConfigOpen] = useState(false), [removeId, setRemoveId] = useState<string | null>(null);
  const componentMode = props.creationMode === 'component';
  useEffect(() => { if (props.openRequest) setOpen(true); }, [props.openRequest]);
  useEffect(() => { latest.current.onOpenChange?.(open); }, [open]);
  const [settings, setSettings] = useState<AiSettings>(defaultAiSettings);
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [recovery, setRecovery] = useState<AiSession | null>(null);
  const observedPage = useRef(props.page), recoveryRef = useRef<AiSession | null>(null);
  const records = useRef<AiSession[]>([]), loadedOwner = useRef(''), damaged = useRef(false);
  const [input, setInput] = useState(''), [error, setError] = useState(''), [running, setRunning] = useState(false), [switching, setSwitching] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const [answers, setAnswers] = useState<AiAnswers>({});
  const [progress, setProgress] = useState<AiProgress | null>(null), [cloudPages, setCloudPages] = useState<CloudPageSummary[]>([]), [cloudLoading, setCloudLoading] = useState(false);
  const runner = useRef<AiRunner | null>(null), launcher = useRef<HTMLButtonElement>(null), prompt = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null);
  const reconcileRecovery = (page: PageDocument) => {
    const saved = records.current.find(record => record.id === page.id);
    const candidate = saved && JSON.stringify(saved.page) !== JSON.stringify(page) ? saved : null;
    recoveryRef.current = candidate; setRecovery(candidate); observedPage.current = page;
  };
  const saveRecord = (session: AiSession, owner: string) => {
    if (owner !== latest.current.owner || owner !== loadedOwner.current) throw new Error('账号已切换，AI 已暂停。');
    if (damaged.current) throw new Error('AI 对话记录无法读取，原记录未被覆盖。');
    records.current = saveAiSessions(owner, [session, ...records.current.filter(value => value.id !== session.id)]);
    return records.current[0];
  };
  const showRecord = (session: AiSession, owner: string) => {
    if (owner !== latest.current.owner || owner !== loadedOwner.current) return;
    records.current = [session, ...records.current.filter(value => value.id !== session.id)]; setSessions([...records.current]);
  };
  const loadRecords = (owner: string) => readAiSessions(owner, localStorage, count => setStorageNotice(count ? t('部分 AI 对话记录无法读取，原始内容已保留，其余记录仍可使用。') : ''));
  if (!runner.current) runner.current = new AiRunner({
    getPage: () => latest.current.getPage(), getOwner: () => latest.current.owner, getTarget: () => latest.current.cloudPageId ?? latest.current.page.id!,
    getSelection: () => latest.current.selectedBlockIds,
    getMode: () => latest.current.creationMode ?? 'page',
    getComponents: () => latest.current.getComponents?.() ?? [],
    resolveComponent: ref => { if (!latest.current.resolveComponent) throw new Error(t('暂时无法读取组件库。')); return latest.current.resolveComponent(ref); },
    prepareCustom: (page, before, op) => latest.current.prepareCustom?.(page, before, op) ?? page,
    commit: (page, change, runId) => latest.current.onCommit(page, change, runId),
    checkpoint: saveRecord, onSession: showRecord,
    onRunning: value => {
      if (value) { setInput(''); setAnswers({}); setProgress(null); } else setProgress(current => current ? { ...current, endedAt: Date.now() } : null);
      // A question needs an answer before work continues, so surface it even if the chat was collapsed.
      if (!value && records.current[0]?.id === latest.current.page.id && records.current[0].status === 'waiting') setOpen(true);
      if (!value) reconcileRecovery(latest.current.getPage());
      setRunning(value); latest.current.onRunningChange(value);
    },
    onProgress: setProgress,
    // requestAnimationFrame never fires in a hidden tab, which would stall generation until the tab is shown again.
    yieldFrame: () => new Promise<void>(resolve => {
      if (document.hidden) { resolve(); return; }
      const timer = setTimeout(resolve, 120);
      requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
    }),
  });
  useEffect(() => {
    try { setSettings(readAiSettings()); } catch { setError(t('AI 配置无法读取，请重新配置。')); }
    return () => runner.current?.pause();
  }, []);
  useEffect(() => {
    runner.current?.pause(t('账号已切换，AI 已暂停。'));
    setProgress(null);
    loadedOwner.current = props.owner; damaged.current = false; records.current = []; setSessions([]); setInput(''); setSwitching(false); setCloudPages([]); recoveryRef.current = null; setRecovery(null); observedPage.current = latest.current.page;
    setStorageNotice('');
    try { records.current = loadRecords(props.owner); setSessions(records.current); reconcileRecovery(latest.current.page); }
    catch (failure) { damaged.current = true; setError(failure instanceof Error ? failure.message : t('AI 对话记录无法读取，原记录未被覆盖。')); }
  }, [props.owner]);
  useEffect(() => {
    if (runner.current?.running) runner.current.pause(t('页面已切换，AI 已暂停。'));
    setProgress(null);
    setInput('');
    reconcileRecovery(props.page);
  }, [props.page.id, props.cloudPageId]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === aiSettingsKey) {
        runner.current?.pause(t('另一标签页修改了 AI 配置，生成已暂停。'));
        try { setSettings(readAiSettings()); } catch { setError(t('AI 配置无法读取，请重新配置。')); }
      }
      if (event.key === aiSessionsKey(latest.current.owner)) {
        runner.current?.pause(t('另一标签页更新了 AI 页面，生成已暂停。'), false);
        try { records.current = loadRecords(latest.current.owner); damaged.current = false; setSessions(records.current); reconcileRecovery(latest.current.getPage()); }
        catch { damaged.current = true; setError(t('AI 对话记录无法读取，原记录未被覆盖。')); }
      }
    };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  const session = sessions.find(value => value.id === props.page.id);
  const lastMessage = session?.messages.at(-1);
  const question = !running && session?.status === 'waiting' && lastMessage?.role === 'assistant' && lastMessage.questions?.length ? lastMessage : null;
  useEffect(() => setAnswers({}), [question?.id]);
  useEffect(() => {
    const previous = observedPage.current; observedPage.current = props.page;
    if (previous === props.page || previous.id !== props.page.id || !session || running || damaged.current || recoveryRef.current || JSON.stringify(session.page) === JSON.stringify(props.page)) return;
    const owner = props.owner, page = props.page;
    const expectedRecord = records.current.find(value => value.id === page.id);
    const timer = setTimeout(() => {
      if (owner !== latest.current.owner || runner.current?.running) return;
      const existing = records.current.find(value => value.id === page.id);
      if (!existing || existing !== expectedRecord || recoveryRef.current) return;
      try { const next = saveRecord({ ...existing, page, updatedAt: Date.now() }, owner); showRecord(next, owner); setError(''); }
      catch (failure) { setError(failure instanceof Error ? failure.message : t('AI 进度保存失败。')); }
    }, 650);
    return () => clearTimeout(timer);
  }, [props.page, props.owner, running]);
  useEffect(() => {
    if (!open || !props.signedIn || componentMode) return;
    const controller = new AbortController(); setCloudLoading(true);
    void accountApi<{ pages: CloudPageSummary[] }>('/api/account/pages', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setCloudPages(value.pages); })
      .catch(() => { if (!controller.signal.aborted) setError(t('云端页面列表暂不可用，仍可使用当前页面和本机页面。')); })
      .finally(() => { if (!controller.signal.aborted) setCloudLoading(false); });
    return () => controller.abort();
  }, [open, props.owner, props.signedIn, props.cloudPageId, componentMode]);
  useEffect(() => { if (open) log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [open, session?.updatedAt, running, progress?.startedAt]);
  const snapshot = (adoptCurrent = false) => {
    if (!adoptCurrent && recoveryRef.current) throw new Error(t('请先恢复检查点或选择使用当前画布。'));
    const page = latest.current.getPage(), saved = records.current.find(value => value.id === page.id) ?? newAiSession(page);
    const next = { ...saved, page, mode: latest.current.creationMode ?? 'page', updatedAt: Date.now() };
    const savedNext = saveRecord(next, latest.current.owner); showRecord(savedNext, latest.current.owner); return savedNext;
  };
  async function selectPage(value: string) {
    if (running || switching || value === 'current') return;
    const owner = props.owner; setSwitching(true); setError('');
    try {
      snapshot();
      if (value.startsWith('cloud:')) await props.onOpenCloud(value.slice(6));
      else { const saved = records.current.find(record => record.id === value.slice(6)); if (saved) await props.onOpenLocal(saved.page); }
    } catch (failure) { if (owner === latest.current.owner) setError(failure instanceof Error ? failure.message : t('页面切换失败。')); }
    finally { if (owner === latest.current.owner) setSwitching(false); }
  }
  async function createPage() {
    if (running || switching) return;
    setSwitching(true); setError('');
    try {
      const requiredSlots = records.current.some(record => record.id === latest.current.getPage().id) ? 1 : 2;
      if (records.current.length + requiredSlots > 12) throw new Error(t('最多保留 12 个 AI 页面，请先移除不需要的对话记录。'));
      const owner = latest.current.owner; snapshot();
      if (await props.onCreatePage() && latest.current.owner === owner) snapshot();
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : t('页面创建失败。')); }
    finally { setSwitching(false); }
  }
  async function send(resume = false, recommended = false) {
    if (recovery) { setError(t('请先恢复检查点或选择使用当前画布。')); return; }
    const ask = resume ? null : question;
    const display = ask ? composeAiAnswer(ask.questions!, answers, input, recommended) : input.trim();
    if (runner.current?.running || switching || (!resume && !display)) return;
    const profile = settings.profiles[settings.provider];
    try {
      validateAiProfile(profile, settings.provider);
      const current = snapshot();
      if (resume && !current.task) return;
      // An answer continues the task that asked the question.
      const task = ask ? [current.task, display].filter(Boolean).join('\n\n') : display;
      setError('');
      const pending = runner.current!.start(current, settings.provider, profile, task, getLocale(), resume, display);
      await pending;
    } catch (failure) {
      setError(safeAiError(failure, profile.apiKey));
      if (!profile.apiKey.trim() || !profile.model.trim()) setConfigOpen(true);
    }
  }
  const pageOptions = [{ value: 'current', label: `${props.page.name} · ${t('当前画布')}` },
    ...sessions.filter(value => value.id !== props.page.id && (value.mode ?? 'page') === (props.creationMode ?? 'page')).map(value => ({ value: `local:${value.id}`, label: `${value.page.name} · ${t('本机')}` })),
    ...cloudPages.filter(value => value.id !== props.cloudPageId).map(value => ({ value: `cloud:${value.id}`, label: `${value.name} · ${t('云端')}` })),
  ];
  const requiredNewSlots = session ? 1 : 2;
  const estimate = useMemo(() => { if (!open) return null; try { return buildAiContext(props.page, session ?? newAiSession(props.page), getLocale(), false, props.selectedBlockIds, { mode: props.creationMode, components: props.getComponents?.() }).estimatedTokens; } catch { return null; } }, [open, props.page, session, props.selectedBlockIds, props.creationMode, props.getComponents]);
  const activeError = error || session?.error;
  const answer = question ? composeAiAnswer(question.questions!, answers, input) : '';
  const pageKey = useMemo(() => open ? JSON.stringify(props.page) : '', [open, props.page]);
  const timeline = useMemo(() => !session ? [] : [
    ...session.messages.map(message => ({ key: `m:${message.id}`, time: message.time, rank: 1, message, version: null })),
    ...session.versions.map(version => ({ key: `v:${version.id}`, time: version.time, rank: version.kind === 'before' ? 0 : 2, message: null, version, current: JSON.stringify(version.page) === pageKey })),
  ].sort((a, b) => a.time - b.time || a.rank - b.rank), [session, pageKey]);
  const restore = (version: AiVersion) => { if (!running && !switching && !recovery) { props.onRestorePage(version.page); setError(''); } };
  return <div className="ai-assistant" data-ai-assistant onKeyDown={event => event.stopPropagation()}>
    <AnimatePresence initial={false}>{open && <motion.section key="chat" className="ai-chat" role="dialog" aria-modal="false" aria-label={t('AI 页面助手')} initial={{ opacity: 0, y: 18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .97 }} transition={{ type: 'spring', stiffness: 360, damping: 32 }}>
      <header className="ai-chat-header"><div><span className="ai-chat-mark"><Sparkles size={17}/></span><span><strong>{t(componentMode ? 'AI 组件助手' : 'AI 页面助手')}</strong><small>{running ? progress?.phase === 'thinking' ? t('正在思考…') : progress && ['connecting', 'waiting', 'continuing'].includes(progress.phase) ? t('正在等待模型…') : t(componentMode ? '正在开发组件…' : '正在构建页面…') : question ? t('等待你的选择') : t(componentMode ? '创建可复用的组件' : '把想法变成可编辑的页面')}</small></span></div><div>
        <StudioTooltip label={t('AI 模型配置')}><StudioButton className="icon-button" aria-label={t('AI 模型配置')} disabled={running} onClick={() => setConfigOpen(true)}><Settings2 size={16}/></StudioButton></StudioTooltip>
        <StudioButton className="icon-button" aria-label={t('收起 AI 对话')} onClick={() => { setOpen(false); launcher.current?.focus(); }}><ChevronDown size={18}/></StudioButton>
      </div></header>
      {props.onCreationModeChange && <div className="ai-creation-mode" role="group" aria-label={t('AI 创作类型')}>
        <StudioButton className={componentMode ? 'secondary-button' : 'primary-button'} aria-pressed={!componentMode} disabled={running || switching} onClick={() => props.onCreationModeChange?.('page')}>{t('生成页面')}</StudioButton>
        <StudioButton className={componentMode ? 'primary-button' : 'secondary-button'} aria-pressed={componentMode} disabled={running || switching} onClick={() => props.onCreationModeChange?.('component')}>{t('创建组件')}</StudioButton>
      </div>}
      <div className="ai-page-picker"><AiSelect label={t(componentMode ? 'AI 组件草稿' : 'AI 目标页面')} value="current" options={pageOptions} onChange={value => void selectPage(value)} disabled={running || switching}/><StudioTooltip label={t(componentMode ? '新建 AI 组件' : '新建 AI 页面')}><StudioButton className="secondary-button ai-new-page" aria-label={t(componentMode ? '新建 AI 组件' : '新建 AI 页面')} disabled={running || switching || sessions.length + requiredNewSlots > 12 || !!recovery} onClick={() => void createPage()}>{switching ? <LoaderCircle size={15} className="spin"/> : <Plus size={16}/>}</StudioButton></StudioTooltip></div>
      {cloudLoading && <p className="ai-mini-status">{t('正在读取云端页面…')}</p>}
      <div className="ai-chat-log" ref={log} role="log" aria-live="polite">
        {storageNotice && <p className="ai-error" role="status" data-ai-storage-warning>{storageNotice}</p>}
        {!session?.messages.length && <div className="ai-welcome"><Sparkles size={28}/><h3>{t(componentMode ? '想创建一个什么组件？' : '想做一个什么页面？')}</h3><p>{t(componentMode ? '描述外观和交互。生成的组件会保存到“我的组件”，可以复用或上传云端。' : '描述内容、风格和用途。AI 会逐个添加组件，你也可以随时暂停接手。')}</p><StudioButton className="ai-example" onClick={() => { setInput(t(componentMode ? '创建一个可切换月付和年付价格的卡片组件，使用清晰的排版和轻柔过渡。' : '创建一个极简产品介绍页，包含导航、主视觉、三个功能卡片和行动按钮。')); prompt.current?.focus(); }}>{t(componentMode ? '试试：交互价格卡片' : '试试：极简产品介绍页')}<Send size={12}/></StudioButton></div>}
        {timeline.map(entry => entry.version ? <AiVersionRow key={entry.key} version={entry.version} current={entry.current} disabled={running || switching || !!recovery} onRestore={() => restore(entry.version)}/>
          : <div className={`ai-message ai-message--${entry.message.role}`} key={entry.key}><span className="ai-message-author">{entry.message.role === 'user' ? t('你') : 'AI'}</span>{(entry.message.text || !entry.message.questions) && <p>{entry.message.id.endsWith(':warnings') ? entry.message.text.split('\n').map(translateMessage).join('\n') : entry.message.text}</p>}
            {entry.message === question && <AiQuestionCard questions={question.questions!} answers={answers} ready={!!answer} disabled={switching || !!recovery} onToggle={(item, option) => setAnswers(value => toggleAiAnswer(value, item, option))} onSubmit={() => void send()} onRecommended={() => void send(false, true)}/>}
            {entry.message.questions && entry.message !== question && <ul className="ai-question-summary">{entry.message.questions.map(item => <li key={item.id}>{item.title}</li>)}</ul>}
          </div>)}
        {!!session?.receipts.length && <details className="ai-change-log" open={running}><summary><Check size={13}/>{t('已完成 {0} 次修改', { 0: session.receipts.length })}</summary><ul>{session.receipts.slice(-12).map(receipt => <li key={`${receipt.runId}:${receipt.seq}`}><Check size={11}/><span>{receipt.summary}</span></li>)}</ul></details>}
        {progress && !question && <AiProgressPanel progress={progress} running={running} status={session?.status ?? 'idle'}/>}
        {!running && !switching && !recovery && !componentMode && session?.status === 'complete' && <AiQualityReport page={props.page} getSurface={props.getSurface} onReveal={props.onRevealBlock}/>}
        {componentMode && !running && !recovery && props.componentResult}
        {recovery && <div className="ai-resume"><p>{t('找到中断前保存的页面检查点，与当前画布不同。')}</p><div className="ai-recovery-actions"><StudioButton className="primary-button" onClick={() => { props.onRestorePage(recovery.page); recoveryRef.current = null; setRecovery(null); setError(''); }}>{t('恢复检查点')}</StudioButton><StudioButton className="secondary-button" onClick={() => { try { snapshot(true); recoveryRef.current = null; setRecovery(null); setError(''); } catch (failure) { setError(failure instanceof Error ? failure.message : t('AI 进度保存失败。')); } }}>{t('使用当前画布')}</StudioButton></div></div>}
        {activeError && <p className="ai-error" role="alert">{activeError.split('\n').map(translateMessage).join('\n')}</p>}
        {!running && session?.status === 'paused' && <div className="ai-resume"><p>{t('已完成的修改已保留。继续会基于当前画布接着生成。')}</p><StudioButton className="secondary-button" onClick={() => void send(true)}><Play size={13}/>{t('继续生成')}</StudioButton></div>}
      </div>
      <form className="ai-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        {!running && props.selectedBlockIds.length > 0 && <p className="ai-mini-status">{t('已选中 {0} 个组件，可描述要对它们做的修改。', { 0: props.selectedBlockIds.length })}</p>}
        <textarea ref={prompt} aria-label={t(componentMode ? '向 AI 描述组件' : '向 AI 描述页面')} placeholder={question ? t('选择上面的选项，或直接输入你的回答…') : t(componentMode ? '描述组件外观、字段和交互…' : '描述页面，或告诉 AI 要修改什么…')} value={input} onChange={event => setInput(event.target.value)} maxLength={4000} rows={3} disabled={running || switching} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>
        <div className="ai-compose-actions"><StudioButton className="ai-model-shortcut" disabled={running} onClick={() => setConfigOpen(true)} title={t('AI 模型配置')}><Settings2 size={12}/><span>{settings.profiles[settings.provider].model || t('配置模型')}</span></StudioButton>
          {running ? <StudioButton className="primary-button ai-send" aria-label={t('暂停 AI 输出')} onClick={() => runner.current?.pause()}><Pause size={14}/>{t('暂停')}</StudioButton> : <StudioButton type="submit" className="primary-button ai-send" aria-label={t('发送 AI 消息')} disabled={!(question ? answer : input.trim()) || switching || !!recovery}><Send size={14}/>{t('发送')}</StudioButton>}
        </div>
        <div className="ai-footnote"><span title={t('仅为估算，实际用量以供应商返回为准。')}>{estimate === null ? t('上下文过大') : t('上下文约 {0} tokens', { 0: estimate.toLocaleString(getLocale()) })}{session?.usage.output ? ` · ${t('输出')} ${session.usage.output}` : ''}</span><StudioButton className="icon-button" aria-label={t('管理 AI 对话记录')} title={t('管理 AI 对话记录')} disabled={running || !sessions.length} onClick={() => setRemoveId(session?.id ?? sessions[0].id)}><Trash2 size={12}/></StudioButton></div>
      </form>
    </motion.section>}</AnimatePresence>
    {running && !open && <StudioButton className="secondary-button ai-quick-pause" aria-label={t('暂停 AI 输出')} onClick={() => runner.current?.pause()}><Pause size={14}/>{t('暂停')}</StudioButton>}
    <StudioButton ref={launcher} className={`ai-launcher ${running ? 'ai-launcher--running' : ''}`} aria-label={open ? t('收起 AI 对话') : question ? t('打开 AI 页面助手，AI 正在等待你的回答') : t('打开 AI 页面助手')} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X size={20}/> : running ? <LoaderCircle size={22} className="spin"/> : <MessageCircle size={23}/>}<span>{running ? 'AI' : t('AI 创作')}</span>{question && !open && <i className="ai-launcher-badge" aria-hidden="true"/>}</StudioButton>
    {configOpen && <AiSettingsDialog settings={settings} onClose={() => setConfigOpen(false)} onSave={next => { saveAiSettings(next); setSettings(next); setError(''); }}/>}
    {removeId && <StudioDialog title={t('管理 AI 对话记录')} className="ai-remove-dialog" onClose={() => setRemoveId(null)}>
      <h2>{t('移除 AI 对话记录？')}</h2><p>{t('仅移除此浏览器中的对话和恢复副本，当前画布与云端页面不变。')}</p>
      <AiSelect label={t('要移除的对话')} value={removeId} options={sessions.map(record => ({ value: record.id, label: record.page.name }))} onChange={setRemoveId}/>
      <div><StudioButton className="secondary-button" onClick={() => setRemoveId(null)}>{t('取消')}</StudioButton><StudioButton className="primary-button" onClick={() => {
        try { records.current = saveAiSessions(props.owner, records.current.filter(value => value.id !== removeId)); setSessions(records.current); if (recoveryRef.current?.id === removeId) { recoveryRef.current = null; setRecovery(null); } setRemoveId(null); setError(''); }
        catch (failure) { setError(failure instanceof Error ? failure.message : t('AI 进度保存失败。')); }
      }}>{t('移除')}</StudioButton></div>
    </StudioDialog>}

  </div>;
}
