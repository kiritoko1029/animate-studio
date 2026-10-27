import { StudioButton, StudioDialog } from './StudioUI';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Bug, RotateCcw, Terminal, ChevronDown } from 'lucide-react';
import type { PageDocument } from '../model';
import type { JsonValue, RuntimeLog } from '../lib/interactions/types';
import { createInteractionRuntime } from '../../shared/interactions.mjs';
import { variableStorageKey } from '../lib/interactions/persistence';
import { FreePage } from './PageRenderer';
import { NativeRuntimeContext, type NativeRuntime } from './NativeInteractions';
import { safeUrl } from '../model';
import { findPageAnchor } from '../lib/page-anchors';
import { useSiteNavigation } from '../lib/site-navigation';
import { RuntimeDataBridge } from './data/DataRuntime';
import '../interactions.css';

function PreviewNotice({ message, onClose, translate }: { message: string; onClose: () => void; translate: (message: string) => string }) {
  return <StudioDialog role="alertdialog" title={translate('提示')} className="studio-notice" onClose={onClose}>
    <h2>{translate('提示')}</h2><p>{message}</p><div><StudioButton className="primary-button" onClick={onClose}>{translate('确定')}</StudioButton></div>
  </StudioDialog>;
}

const keepText = (message: string) => message;

export type PreviewHandle = { runScript: (id: string) => void; reset: () => void };
export const InteractivePreview = forwardRef<PreviewHandle, { document: PageDocument; debug?: boolean; persistenceScope?: string; translate?: (message: string) => string; locale?: string; route?: Record<string, string>; breakpoint?: import('../lib/responsive').ResponsiveDevice }>(function InteractivePreview({ document, debug = false, persistenceScope = 'preview', translate = keepText, locale = 'zh-CN', route, breakpoint }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const siteNavigation = useSiteNavigation();
  const [state, setState] = useState<Record<string, JsonValue>>({});
  const [, setDataRevision] = useState(0);
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const [expanded, setExpanded] = useState(debug);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const activeRuntime = useRef<NativeRuntime | null>(null);
  const runtime = useMemo(() => {
    const next = createInteractionRuntime(document, {
    storageKey: variableStorageKey(document, persistenceScope), route: route ?? siteNavigation?.params ?? {},
    onData: () => setDataRevision(value => value + 1),
    onState: setState,
    onLog: entry => queueMicrotask(() => { if (activeRuntime.current === next) setLogs(items => [...items.slice(-99), entry]); }),
    onNotify: setNotice, onBack: () => siteNavigation?.back(),
    onNavigate: raw => {
      const url = safeUrl(raw);
      if (siteNavigation?.navigate(url)) return;
      if (url.startsWith('#')) {
        const surface = container.current?.querySelector('.page-surface');
        const target = findPageAnchor(surface, url);
        target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      } else if (/^(mailto:|tel:)/i.test(url)) window.location.assign(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    },
    });
    return next;
  }, [document, persistenceScope, route, siteNavigation]);
  const reset = () => { runtime.reset(); setRevision(value => value + 1); setNotice(null); };
  useImperativeHandle(ref, () => ({ runScript(id) {
    setExpanded(true);
    void runtime.runScript(id).catch(error => { if (activeRuntime.current === runtime) setLogs(items => [...items.slice(-99), { level: 'error', message: String(error.message || error), time: Date.now() }]); });
    requestAnimationFrame(() => container.current?.querySelector('.runtime-debug')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, reset }), [runtime]);
  useEffect(() => {
    activeRuntime.current = runtime;
    runtime.activate(); setState(runtime.getState()); setLogs([]); setNotice(null);
    return () => { activeRuntime.current = null; runtime.dispose(); };
  }, [runtime]);
  return <div className="interactive-preview" ref={container}>
    <NativeRuntimeContext.Provider value={{ runtime, state }}><RuntimeDataBridge route={route ?? siteNavigation?.params ?? {}} state={state} blocks={document.blocks}/><FreePage key={revision} document={document} breakpoint={breakpoint} /></NativeRuntimeContext.Provider>
    {notice !== null && <PreviewNotice translate={translate} message={notice} onClose={() => setNotice(null)} />}
    <div className="runtime-debug">
      <div className="runtime-debug-heading"><StudioButton onClick={() => setExpanded(!expanded)}><Bug size={14} />{translate('运行调试')}<span className="logic-status ready">{translate('运行中')}</span><ChevronDown size={13} /></StudioButton><StudioButton onClick={reset} title={translate('重置运行数据')}><RotateCcw size={13} />{translate('重置')}</StudioButton></div>
      {expanded && <div className="runtime-debug-content"><div><h4>{translate('当前变量')}</h4>{Object.keys(state).length ? Object.entries(state).map(([name, value]) => <div className="runtime-variable" key={name}><code>{name}</code><span>{JSON.stringify(value)}</span></div>) : <p>{translate('还没有页面变量')}</p>}</div><div><h4><Terminal size={12} />{translate('事件与脚本日志')}<StudioButton onClick={() => setLogs([])}>{translate('清空')}</StudioButton></h4><div className="runtime-logs" role="log">{logs.length ? logs.map((entry, i) => <div key={i} className={`runtime-log ${entry.level}`}><time>{new Date(entry.time).toLocaleTimeString(locale, { hour12: false })}</time><span>{entry.message}</span></div>) : <p>{translate('操作预览中的组件，查看状态变化。')}</p>}</div></div></div>}
    </div>
  </div>;
});
