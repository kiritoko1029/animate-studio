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
import '../interactions.css';

function PreviewNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return <StudioDialog role="alertdialog" title="提示" className="studio-notice" onClose={onClose}>
    <h2>提示</h2><p>{message}</p><div><StudioButton className="primary-button" onClick={onClose}>确定</StudioButton></div>
  </StudioDialog>;
}

export type PreviewHandle = { runScript: (id: string) => void; reset: () => void };
export const InteractivePreview = forwardRef<PreviewHandle, { document: PageDocument; debug?: boolean; persistenceScope?: string }>(function InteractivePreview({ document, debug = false, persistenceScope = 'preview' }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Record<string, JsonValue>>({});
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const [expanded, setExpanded] = useState(debug);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const activeRuntime = useRef<NativeRuntime | null>(null);
  const runtime = useMemo(() => {
    const next = createInteractionRuntime(document, {
    storageKey: variableStorageKey(document, persistenceScope),
    onState: setState,
    onLog: entry => queueMicrotask(() => { if (activeRuntime.current === next) setLogs(items => [...items.slice(-99), entry]); }),
    onNotify: setNotice,
    onNavigate: raw => {
      const url = safeUrl(raw);
      if (url.startsWith('#')) {
        const surface = container.current?.querySelector('.page-surface');
        const target = url === '#' ? surface : [...surface?.querySelectorAll('[data-anchor]') ?? []].find(element => '#' + element.getAttribute('data-anchor') === url);
        target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      } else if (/^(mailto:|tel:)/i.test(url)) window.location.assign(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    },
    });
    return next;
  }, [document, persistenceScope]);
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
    <NativeRuntimeContext.Provider value={{ runtime, state }}><FreePage key={revision} document={document} /></NativeRuntimeContext.Provider>
    {notice !== null && <PreviewNotice message={notice} onClose={() => setNotice(null)} />}
    <div className="runtime-debug">
      <div className="runtime-debug-heading"><StudioButton onClick={() => setExpanded(!expanded)}><Bug size={14} />运行调试<span className="logic-status ready">运行中</span><ChevronDown size={13} /></StudioButton><StudioButton onClick={reset} title="重置运行数据"><RotateCcw size={13} />重置</StudioButton></div>
      {expanded && <div className="runtime-debug-content"><div><h4>当前变量</h4>{Object.keys(state).length ? Object.entries(state).map(([name, value]) => <div className="runtime-variable" key={name}><code>{name}</code><span>{JSON.stringify(value)}</span></div>) : <p>还没有页面变量</p>}</div><div><h4><Terminal size={12} />事件与脚本日志<StudioButton onClick={() => setLogs([])}>清空</StudioButton></h4><div className="runtime-logs" role="log">{logs.length ? logs.map((entry, i) => <div key={i} className={`runtime-log ${entry.level}`}><time>{new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{entry.message}</span></div>) : <p>操作预览中的组件，查看状态变化。</p>}</div></div></div>}
    </div>
  </div>;
});
