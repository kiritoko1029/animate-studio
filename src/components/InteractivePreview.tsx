import { StudioButton, StudioDialog } from './StudioUI';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Bug, RotateCcw, Terminal, ChevronDown } from 'lucide-react';
import type { PageDocument } from '../model';
import type { JsonValue, RuntimeLog } from '../lib/interactions/types';
import { generateCode } from '../lib/code-export/generate';
import { exportResources } from '../lib/code-export/download';
import '../interactions.css';
import '../lib/code-export/portable.css';

function PreviewNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return <StudioDialog role="alertdialog" title="提示" className="studio-notice" onClose={onClose}>
    <h2>提示</h2><p>{message}</p><div><StudioButton className="primary-button" onClick={onClose}>确定</StudioButton></div>
  </StudioDialog>;
}

export type PreviewHandle = { runScript: (id: string) => void; reset: () => void };
export const InteractivePreview = forwardRef<PreviewHandle, { document: PageDocument; debug?: boolean }>(function InteractivePreview({ document, debug = false }, ref) {
  const frame = useRef<HTMLIFrameElement>(null), container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(document.settings.maxWidth);
  const [state, setState] = useState<Record<string, JsonValue>>({});
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const [expanded, setExpanded] = useState(debug);
  const [notice, setNotice] = useState<string | null>(null);
  const readyRef = useRef(false), pendingScript = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [source, token] = useMemo(() => {
    const token = crypto.randomUUID();
    return [generateCode(document, 'html', { ...exportResources, previewToken: token }).content, token];
  }, [document]);
  const post = (type: string, id?: string) => frame.current?.contentWindow?.postMessage({ type, token, id }, '*');
  useImperativeHandle(ref, () => ({ runScript(id) { setExpanded(true); if (readyRef.current) post('as-run', id); else pendingScript.current = id; requestAnimationFrame(() => container.current?.querySelector('.runtime-debug')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }, reset() { post('as-reset'); } }), [token]);
  useEffect(() => {
    readyRef.current = false; setReady(false); setLogs([]); setNotice(null);
    const viewport = () => {
      const iframe = frame.current;
      if (!iframe) return;
      const rect = iframe.getBoundingClientRect();
      let top = Math.max(0, rect.top), bottom = Math.min(window.innerHeight, rect.bottom);
      for (let parent = iframe.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect();
        top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
      }
      const offset = Math.max(0, top - rect.top), height = Math.max(80, bottom - top);
      iframe.contentWindow?.postMessage({ type: 'as-viewport', token, top: offset, height, progress: offset / Math.max(1, rect.height - height) * 100 }, '*');
    };
    window.addEventListener('scroll', viewport, true);
    window.addEventListener('resize', viewport);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.token !== token) return;
      if (event.data.type === 'as-ready') { viewport(); readyRef.current = true; setReady(true); setState(event.data.state); if (pendingScript.current) { post('as-run', pendingScript.current); pendingScript.current = null; } }
      if (event.data.type === 'as-state') setState(event.data.state);
      if (event.data.type === 'as-log') setLogs(items => [...items.slice(-99), event.data.entry]);
      // The iframe spans the whole design canvas; present notices in the visible editor viewport.
      if (event.data.type === 'as-notify' && typeof event.data.message === 'string') setNotice(event.data.message);
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('scroll', viewport, true); window.removeEventListener('resize', viewport); };
  }, [token]);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    // clientWidth rounds to the nearest pixel, but a nested viewport can round up.
    // Use the fractional content width and reserve room for that larger viewport.
    const measure = (availableWidth: number) => setWidth(Math.ceil(availableWidth));
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(entries => {
      if (entries[0]) measure(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Round up so the scaled canvas cannot trigger an inner scrollbar/resize loop.
  const height = Math.ceil((document.settings.canvasHeight ?? 1400) * Math.min(1, width / document.settings.maxWidth));
  return <div className="interactive-preview" ref={container}>
    <iframe ref={frame} title="联动页面预览" srcDoc={source} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" style={{ height }} />
    {notice !== null && <PreviewNotice message={notice} onClose={() => setNotice(null)} />}
    <div className="runtime-debug">
      <div className="runtime-debug-heading"><StudioButton onClick={() => setExpanded(!expanded)}><Bug size={14} />运行调试<span className={ready ? 'logic-status ready' : 'logic-status'}>{ready ? '运行中' : '加载中'}</span><ChevronDown size={13} /></StudioButton><StudioButton disabled={!ready} onClick={() => post('as-reset')} title="重置运行数据"><RotateCcw size={13} />重置</StudioButton></div>
      {expanded && <div className="runtime-debug-content"><div><h4>当前变量</h4>{Object.keys(state).length ? Object.entries(state).map(([name, value]) => <div className="runtime-variable" key={name}><code>{name}</code><span>{JSON.stringify(value)}</span></div>) : <p>还没有页面变量</p>}</div><div><h4><Terminal size={12} />事件与脚本日志<StudioButton onClick={() => setLogs([])}>清空</StudioButton></h4><div className="runtime-logs" role="log">{logs.length ? logs.map((entry, i) => <div key={i} className={`runtime-log ${entry.level}`}><time>{new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })}</time><span>{entry.message}</span></div>) : <p>操作预览中的组件，查看状态变化。</p>}</div></div></div>}
    </div>
  </div>;
});
