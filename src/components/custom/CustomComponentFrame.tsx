import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { customComponentSandbox, type CustomComponentDefinition } from '../../../shared/custom-components.mjs';
import { buildComponentDocument, randomToken, sanitizeComponentTheme, type ComponentProps, type ComponentTheme } from '../../lib/custom-components/document';
import { createRateLimiter, readFrameMessage, updateMessage, type FrameMessage } from '../../lib/custom-components/protocol';
import { openComponentLink } from '../../lib/custom-components/links';
import { customComponentTheme, instanceProps } from '../../lib/custom-components/instances';
import { NativeRuntimeContext } from '../NativeInteractions';
import type { Block, PageDocument } from '../../model';
import '../../custom-components.css';

export type FrameStatus = 'loading' | 'ready' | 'timeout';
type FrameProps = {
  code: Pick<CustomComponentDefinition, 'name' | 'html' | 'css' | 'js'>;
  props: ComponentProps;
  theme: ComponentTheme;
  title: string;
  /** Pointer input, links and click events are honored only for interactive frames. */
  interactive?: boolean;
  /** Changing it starts a new run of the same code. */
  runKey?: number;
  transformScript?: (code: string) => string;
  readyTimeoutMs?: number;
  suppressLinks?: boolean;
  onMessage?: (message: FrameMessage) => void;
  onClick?: () => void;
  onStatus?: (status: FrameStatus) => void;
  className?: string;
};

/**
 * One sandboxed run of a component. Author code executes only inside an
 * opaque-origin iframe (`sandbox="allow-scripts"`, never `allow-same-origin`),
 * so it cannot read the editor's cookies, storage or DOM. Every run gets its
 * own channel; messages from older runs or other windows are ignored.
 */
export function CustomComponentFrame({ code, props, theme, title, interactive = false, runKey = 0, transformScript, readyTimeoutMs = 8000, suppressLinks = false, onMessage, onClick, onStatus, className = '' }: FrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [restart, setRestart] = useState(0);
  const [status, setStatus] = useState<FrameStatus>('loading');
  const safeTheme = sanitizeComponentTheme(theme);
  const latest = useRef({ props, theme: safeTheme });
  latest.current = { props, theme: safeTheme };
  const callbacks = useRef({ onMessage, onClick, onStatus, interactive, suppressLinks });
  callbacks.current = { onMessage, onClick, onStatus, interactive, suppressLinks };
  const session = useMemo(() => ({ channel: crypto.randomUUID(), nonce: randomToken() }), [code.html, code.css, code.js, runKey, restart, transformScript]);
  // The document is fixed per run; later field and theme changes are posted to it.
  const srcDoc = useMemo(() => buildComponentDocument(code, { ...session, props: latest.current.props, theme: latest.current.theme, transformScript }).html, [session]);
  const ready = useRef(false);
  const post = () => {
    const target = frame.current?.contentWindow;
    if (target && ready.current) target.postMessage(updateMessage(session.channel, latest.current.props as Record<string, string>, latest.current.theme as unknown as Record<string, string>), '*');
  };

  useEffect(() => {
    ready.current = false;
    setStatus('loading'); callbacks.current.onStatus?.('loading');
    const allowClick = createRateLimiter(10, 1000);
    const allowLink = createRateLimiter(3, 2000);
    const timer = window.setTimeout(() => {
      if (ready.current) return;
      setStatus('timeout'); callbacks.current.onStatus?.('timeout');
    }, readyTimeoutMs);
    const receive = (event: MessageEvent) => {
      const message = readFrameMessage(event, { source: frame.current?.contentWindow, channel: session.channel });
      if (!message) return;
      if (message.type === 'ready') {
        ready.current = true; window.clearTimeout(timer);
        setStatus('ready'); callbacks.current.onStatus?.('ready');
        post();
      } else if (message.type === 'click') {
        if (!callbacks.current.interactive || !allowClick()) return;
        callbacks.current.onClick?.();
      } else if (message.type === 'open-link') {
        if (!callbacks.current.interactive || callbacks.current.suppressLinks || !allowLink()) return;
        openComponentLink(message.href, frame.current);
      }
      callbacks.current.onMessage?.(message);
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); window.clearTimeout(timer); ready.current = false; };
  }, [session, readyTimeoutMs]);

  const updateKey = JSON.stringify([props, safeTheme]);
  useEffect(() => { if (status === 'ready') post(); }, [updateKey, status]);

  return <div className={`custom-component-frame ${className}`} data-status={status}>
    {status === 'timeout'
      ? <div className="custom-component-fallback" role="alert"><strong>组件没有响应</strong><span>脚本 {Math.round(readyTimeoutMs / 1000)} 秒内未完成启动，已停止运行。</span>{interactive && <button type="button" onClick={() => setRestart(value => value + 1)}>重新运行</button>}</div>
      : <iframe ref={frame} title={title || '自定义组件'} sandbox={customComponentSandbox} srcDoc={srcDoc} referrerPolicy="no-referrer" tabIndex={interactive ? undefined : -1} />}
  </div>;
}

/** Page rendering path shared by the canvas, previews, shared pages and exports. */
export function CustomBlockContent({ block, settings, interactive }: { block: Block; settings: PageDocument['settings']; interactive: boolean }) {
  const runtime = useContext(NativeRuntimeContext)?.runtime;
  const snapshot = block.props.custom;
  if (!snapshot) return <div className="custom-component-fallback" role="alert"><strong>组件定义缺失</strong><span>请删除此组件后重新从“我的组件”添加。</span></div>;
  const clickActions = Boolean(block.events?.click?.length);
  return <CustomComponentFrame code={snapshot} props={instanceProps(block)} theme={customComponentTheme(block, settings)} title={snapshot.name} interactive={interactive}
    suppressLinks={clickActions} onClick={runtime && clickActions ? () => { void runtime.dispatch(block.id, 'click'); } : undefined}/>;
}
