import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { WorkspaceCompiledBundle, WorkspaceSpec } from '../../../shared/workspace.mjs';
import {
  buildWorkspaceDocumentHtml,
  compileWorkspaceClient,
  type WorkspaceCompileDiagnostic,
} from '../../lib/workspace/compiler-client';

export type WorkspaceRuntimeMetrics = {
  height: number;
  clientWidth: number;
  scrollWidth: number;
  overflowX: boolean;
  interactiveCount: number;
};

type Props = {
  workspace: WorkspaceSpec;
  title?: string;
  interactive?: boolean;
  minHeight?: number;
  onCompiled?: (compiled: WorkspaceCompiledBundle) => void;
  onDiagnostics?: (errors: WorkspaceCompileDiagnostic[], runtimeError: string) => void;
  onMetrics?: (metrics: WorkspaceRuntimeMetrics) => void;
};

export function WorkspacePreview({
  workspace,
  title = 'Workspace App',
  interactive = true,
  minHeight = 680,
  onCompiled,
  onDiagnostics,
  onMetrics,
}: Props) {
  const channel = useId();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [compiled, setCompiled] = useState<WorkspaceCompiledBundle | undefined>(workspace.compiled);
  const [compileErrors, setCompileErrors] = useState<WorkspaceCompileDiagnostic[]>([]);
  const [runtimeError, setRuntimeError] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [ready, setReady] = useState(Boolean(workspace.compiled?.js || workspace.compiled?.html));
  const [metrics, setMetrics] = useState<WorkspaceRuntimeMetrics>({
    height: minHeight,
    clientWidth: 0,
    scrollWidth: 0,
    overflowX: false,
    interactiveCount: 0,
  });

  const filesSignature = useMemo(
    () => JSON.stringify({ framework: workspace.framework, entry: workspace.entry, files: workspace.files }),
    [workspace.framework, workspace.entry, workspace.files],
  );

  useEffect(() => {
    if (workspace.compiled && (workspace.compiled.js || workspace.compiled.html)) {
      setCompiled(workspace.compiled);
    }
  }, [workspace.compiled]);

  useEffect(() => {
    const controller = new AbortController();
    setCompiling(true);
    setRuntimeError('');
    void compileWorkspaceClient(workspace, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setCompiling(false);
        if (result.ok) {
          setCompileErrors([]);
          setCompiled(result.compiled);
          onCompiled?.(result.compiled);
          onDiagnostics?.([], '');
        } else {
          setCompileErrors(result.errors);
          onDiagnostics?.(result.errors, '');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCompiling(false);
      });
    return () => controller.abort();
  }, [filesSignature]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.source !== 'animate-studio-workspace' || data.channel !== channel) return;
      if (data.type === 'ready') {
        setReady(true);
      } else if (data.type === 'runtime-error' && typeof data.message === 'string') {
        setRuntimeError(data.message);
        onDiagnostics?.(compileErrors, data.message);
      } else if (data.type === 'metrics') {
        const nextMetrics: WorkspaceRuntimeMetrics = {
          height: typeof data.height === 'number' && Number.isFinite(data.height) ? Math.max(minHeight, Math.min(12000, data.height)) : minHeight,
          clientWidth: typeof data.clientWidth === 'number' ? data.clientWidth : 0,
          scrollWidth: typeof data.scrollWidth === 'number' ? data.scrollWidth : 0,
          overflowX: Boolean(data.overflowX),
          interactiveCount: typeof data.interactiveCount === 'number' ? data.interactiveCount : 0,
        };
        setMetrics(nextMetrics);
        onMetrics?.(nextMetrics);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [channel, compileErrors, minHeight, onDiagnostics, onMetrics]);

  const effectiveWorkspace = useMemo<WorkspaceSpec>(
    () => (compiled ? { ...workspace, compiled } : workspace),
    [workspace, compiled],
  );

  const srcDoc = useMemo(
    () => buildWorkspaceDocumentHtml(effectiveWorkspace, { channel, title }),
    [effectiveWorkspace, channel, title],
  );

  return (
    <div
      className="workspace-preview-surface"
      data-workspace-preview
      data-workspace-framework={workspace.framework}
      data-workspace-entry={workspace.entry}
      data-workspace-ready={ready ? 'true' : 'false'}
      data-workspace-compiling={compiling ? 'true' : 'false'}
      data-workspace-overflow-x={metrics.overflowX ? 'true' : 'false'}
      data-workspace-interactive-count={metrics.interactiveCount}
      style={{ width: '100%', minHeight: `${Math.max(minHeight, metrics.height)}px`, position: 'relative' }}
    >
      {compileErrors.length > 0 && (
        <div
          role="alert"
          data-workspace-compile-error
          style={{
            padding: '14px 18px',
            margin: '12px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          <strong>工作区编译诊断：</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
            {compileErrors.map((err, index) => (
              <li key={`${err.file}:${err.line ?? 0}:${index}`}>
                <code>{err.file}{err.line ? `:${err.line}` : ''}</code> — {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {runtimeError && !compileErrors.length && (
        <div
          role="alert"
          data-workspace-runtime-error
          style={{
            padding: '12px 16px',
            margin: '12px',
            borderRadius: '10px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: '13px',
          }}
        >
          <strong>运行期提示：</strong> {runtimeError}
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={title}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        style={{
          display: 'block',
          width: '100%',
          height: `${Math.max(minHeight, metrics.height)}px`,
          minHeight: '100dvh',
          border: 0,
          pointerEvents: interactive ? 'auto' : 'none',
          background: 'transparent',
        }}
      />
    </div>
  );
}
