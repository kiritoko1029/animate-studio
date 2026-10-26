import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Pause, RotateCcw, Settings2, Sparkles, X } from 'lucide-react';
import type { SiteDocument } from '../../../shared/site-document.mjs';
import { explainSite, readSiteAiSession, runSiteAi, siteAiError, siteFromPlan, writeSiteAiSession, type SiteAiSession, type SitePlan } from '../../lib/ai/site-ai';
import { defaultAiSettings, readAiSettings, saveAiSettings, validateAiProfile } from '../../lib/ai/config';
import type { AiSettings } from '../../lib/ai/types';
import { StudioButton, StudioDialog } from '../StudioUI';
import { AiSettingsDialog } from './AiSettingsDialog';
import { t } from '../../i18n';
import './ai-site-studio.css';

type Props = { site: SiteDocument; owner: string; openRequest: number; getSite: () => SiteDocument; onCommit: (site: SiteDocument) => void; onRunningChange: (running: boolean) => void };
export function AiSiteStudio(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [open, setOpen] = useState(false), [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AiSettings>(defaultAiSettings);
  const [task, setTask] = useState(''), [status, setStatus] = useState<SiteAiSession['status'] | 'idle'>('idle');
  const [plan, setPlan] = useState<SitePlan | null>(null), [draft, setDraft] = useState<SiteDocument | null>(null);
  const [messages, setMessages] = useState<string[]>([]), [error, setError] = useState(''), [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null), session = useRef<SiteAiSession | null>(null), draftRef = useRef<SiteDocument | null>(null);
  const running = useRef(false);
  useEffect(() => { try { setSettings(readAiSettings()); } catch { setError(t('AI 配置无法读取，请重新配置。')); } return () => { controller.current?.abort(); latest.current.onRunningChange(false); }; }, []);
  const recover = () => {
    try {
      const record = readSiteAiSession(latest.current.owner, latest.current.site.id);
      session.current = record; setPlan(record?.plan ?? null); setMessages(record?.messages ?? []);
      draftRef.current = record?.draft ?? null; setDraft(record?.draft ?? null); setStatus(record?.status ?? 'idle');
      setRecovery(!!record && JSON.stringify(record.draft) !== JSON.stringify(latest.current.getSite()));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('AI 站点检查点无法读取。')); }
  };
  useEffect(() => { if (props.openRequest) { setOpen(true); recover(); } }, [props.openRequest, props.site.id]);
  const save = (record: SiteAiSession) => { const stored = writeSiteAiSession(record); session.current = stored; return stored; };
  const updateDraft = (site: SiteDocument) => {
    if (!session.current) return;
    draftRef.current = site; setDraft(site);
    save({ ...session.current, draft: site, status: 'generating', updatedAt: Date.now() });
  };
  const message = (text: string) => { setMessages(values => [...values, text].slice(-60)); };
  const start = async () => {
    if (running.current || !task.trim()) return;
    setError(''); const profile = settings.profiles[settings.provider];
    try {
      validateAiProfile(profile, settings.provider);
      const before = structuredClone(latest.current.getSite()), now = Date.now();
      const record = save({ version: 1, owner: latest.current.owner, siteId: before.id, task: task.trim(), status: 'confirm', plan: null, before, draft: before, messages: [...messages, `${t('你')}: ${task.trim()}`].slice(-60), updatedAt: now });
      session.current = record; draftRef.current = before; setDraft(before); setPlan(null); setRecovery(false);
      controller.current = new AbortController(); running.current = true; setBusy(true); setStatus('generating'); latest.current.onRunningChange(true);
      const result = await runSiteAi({ site: before, task: record.task, provider: settings.provider, profile, phase: 'plan', signal: controller.current.signal, onMessage: message });
      const skeleton = siteFromPlan(before, result.plan);
      draftRef.current = skeleton; setDraft(skeleton); setPlan(result.plan); setStatus('confirm');
      save({ ...session.current!, plan: result.plan, draft: skeleton, status: 'confirm', messages: [...messages, result.plan.summary, ...result.messages].slice(-60), updatedAt: Date.now() });
    } catch (failure) { fail(failure, profile); }
    finally { finish(); }
  };
  const generate = async () => {
    const record = session.current;
    if (running.current || !record?.plan) return;
    const profile = settings.profiles[settings.provider];
    setError('');
    try {
      if (JSON.stringify(latest.current.getSite()) !== JSON.stringify(record.before)) throw new Error(t('站点在规划后发生了变化。请重新规划，不会覆盖新修改。'));
      validateAiProfile(profile, settings.provider);
      controller.current = new AbortController(); running.current = true; setBusy(true); setStatus('generating'); latest.current.onRunningChange(true);
      const result = await runSiteAi({ site: record.before, draft: draftRef.current ?? record.draft, task: record.task, plan: record.plan, provider: settings.provider, profile, phase: 'generate', signal: controller.current.signal, getSite: latest.current.getSite, onDraft: updateDraft, onMessage: message });
      if (!result.site) throw new Error(t('整站结果不完整，请继续生成。'));
      if (JSON.stringify(latest.current.getSite()) !== JSON.stringify(record.before)) throw new Error(t('站点已在其他位置修改，AI 结果仍保留在检查点中。'));
      latest.current.onRunningChange(false); props.onCommit(result.site);
      save({ ...session.current!, draft: result.site, status: 'complete', messages: [...session.current!.messages, t('整站已应用，可在页面面板继续编辑；撤销可恢复生成前的站点。')], updatedAt: Date.now() });
      setStatus('complete'); setRecovery(false);
    } catch (failure) { fail(failure, profile); }
    finally { finish(); }
  };
  const fail = (failure: unknown, profile: AiSettings['profiles'][keyof AiSettings['profiles']]) => {
    if (session.current && draftRef.current) {
      try { save({ ...session.current, draft: draftRef.current, status: 'paused', updatedAt: Date.now() }); } catch (storageError) { setError(storageError instanceof Error ? storageError.message : t('检查点保存失败，请先导出站点备份。')); }
    }
    setStatus(session.current?.plan ? 'paused' : 'idle');
    if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(siteAiError(failure, profile));
  };
  const finish = () => { running.current = false; setBusy(false); latest.current.onRunningChange(false); };
  const pause = () => { controller.current?.abort(); if (session.current) setStatus('paused'); };
  if (!open) return null;
  return <StudioDialog title={t('AI 整站创作')} className="ai-site-dialog" onClose={() => { if (busy) pause(); setOpen(false); }}>
    <header className="ai-site-heading"><div><Sparkles size={19}/><span><h2>{t('AI 整站创作')}</h2><small>{latest.current.site.name} · {latest.current.site.pages.length} {t('个页面')}</small></span></div><div><StudioButton className="icon-button" aria-label={t('AI 模型配置')} disabled={busy} onClick={() => setSettingsOpen(true)}><Settings2 size={16}/></StudioButton><StudioButton className="icon-button" aria-label={t('关闭整站创作')} onClick={() => { if (busy) pause(); setOpen(false); }}><X size={17}/></StudioButton></div></header>
    <div className="ai-site-content">
      <p className="ai-site-intro">{t('先确认页面、导航和共享布局，再生成完整站点。所有修改先进入草稿，不会自动发布。')}</p>
      <textarea aria-label={t('描述你想创建的站点')} rows={4} value={task} disabled={busy} onChange={event => setTask(event.target.value)} placeholder={t('例如：做一个产品官网，包含首页、产品列表和产品详情，使用简洁的设计和统一导航。')}/>
      <div className="ai-site-actions"><StudioButton className="primary-button" disabled={busy || !task.trim()} onClick={() => void start()}><Sparkles size={14}/>{t('规划站点')}</StudioButton><StudioButton disabled={busy} onClick={() => { setError(''); message(explainSite(latest.current.getSite())); }}>{t('解释当前结构')}</StudioButton>{busy && <StudioButton onClick={pause}><Pause size={14}/>{t('暂停并保留草稿')}</StudioButton>}</div>
      {recovery && <div className="ai-site-recovery" role="status"><p>{t('发现未应用的站点生成草稿，当前画布尚未改变。')}</p><StudioButton disabled={busy} onClick={() => { if (session.current) { setPlan(session.current.plan); setStatus(session.current.status === 'complete' ? 'complete' : 'paused'); setRecovery(false); } }}>{t('查看并继续草稿')}</StudioButton><StudioButton disabled={busy} onClick={() => { setRecovery(false); setPlan(null); setStatus('idle'); }}>{t('保留当前画布')}</StudioButton></div>}
      {busy && <p className="ai-site-progress" role="status"><LoaderCircle size={15} className="spin"/>{t('正在生成，已完成的页面会保存在检查点中，当前画布不变。')}</p>}
      {plan && <section className="ai-site-plan"><h3>{t('站点结构计划')}</h3><p>{plan.summary}</p><ul>{plan.pages.map(entry => <li key={entry.id}><strong>{entry.name}</strong><code>{entry.path}</code><span>{entry.kind === 'detail' ? t('详情页') : entry.kind === 'notFound' ? '404' : t('页面')}{entry.layout.length ? ` · ${entry.layout.map(region => region === 'header' ? t('页头') : t('页脚')).join(' + ')}` : ''}</span></li>)}</ul>{!!plan.deletes.length && <p role="alert">{t('确认删除：{0}', { 0: plan.deletes.map(id => session.current?.before.pages.find(entry => entry.id === id)?.name ?? id).join('、') })}</p>}{status !== 'complete' && <div className="ai-site-actions"><StudioButton className="primary-button" disabled={busy} onClick={() => void generate()}><Check size={14}/>{t(status === 'paused' ? '继续生成并应用' : '确认计划，生成整站')}</StudioButton><StudioButton disabled={busy} onClick={() => { setPlan(null); setStatus('idle'); }}>{t('重新规划')}</StudioButton></div>}</section>}
      {draft && status === 'generating' && <p className="ai-site-progress">{t('检查点包含 {0} 个页面，完成后才一次应用。', { 0: draft.pages.length })}</p>}
      {messages.map((text, index) => <p className="ai-site-message" key={`${index}:${text.slice(0, 40)}`}>{text}</p>)}
      {error && <p className="ai-error" role="alert">{error}</p>}
      {status === 'complete' && <div className="ai-site-complete"><Check size={16}/><span>{t('站点已生成。打开左侧“页面”面板，可以切换页面或修改共享布局。')}</span><StudioButton disabled={busy || !session.current} onClick={() => { if (session.current) { latest.current.onRunningChange(false); props.onCommit(session.current.before); setStatus('paused'); setRecovery(false); } }}><RotateCcw size={14}/>{t('恢复生成前版本')}</StudioButton></div>}
    </div>
    {settingsOpen && <AiSettingsDialog settings={settings} onSave={value => { saveAiSettings(value); setSettings(value); }} onClose={() => setSettingsOpen(false)}/>}
  </StudioDialog>;
}
