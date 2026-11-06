import { validateWorkspace, type WorkspaceCompiledBundle, type WorkspaceSpec } from '../../../shared/workspace.mjs';
import { ANIMATE_UI_BASE_CSS } from './animate-ui-kit.ts';

export type WorkspaceCompileDiagnostic = {
  file: string;
  line?: number;
  column?: number;
  message: string;
};

export type WorkspaceCompileResult =
  | { ok: true; compiled: WorkspaceCompiledBundle; warnings: WorkspaceCompileDiagnostic[] }
  | { ok: false; errors: WorkspaceCompileDiagnostic[]; warnings: WorkspaceCompileDiagnostic[] };

export type WorkspacePreviewVerificationReport = {
  ok: boolean;
  rendered: boolean;
  rootChildCount: number;
  textLength: number;
  interactiveCount: number;
  overflowX: boolean;
  runtimeError: string;
  compileErrors: WorkspaceCompileDiagnostic[];
  summary: string;
};

let registeredCompiler: ((workspace: WorkspaceSpec) => Promise<WorkspaceCompileResult>) | null = null;
let registeredPreviewVerifier:
  | ((workspace: WorkspaceSpec, compiled: WorkspaceCompiledBundle) => Promise<WorkspacePreviewVerificationReport>)
  | null = null;

const compileCache = new Map<string, WorkspaceCompileResult>();

export function workspaceFilesSignature(workspace: Pick<WorkspaceSpec, 'framework' | 'entry' | 'files'>): string {
  return JSON.stringify({
    framework: workspace.framework,
    entry: workspace.entry,
    files: workspace.files,
  });
}

export function registerServerWorkspaceCompiler(
  compiler: ((workspace: WorkspaceSpec) => Promise<WorkspaceCompileResult>) | null,
): void {
  registeredCompiler = compiler;
}

export function registerServerWorkspacePreviewVerifier(
  verifier:
    | ((workspace: WorkspaceSpec, compiled: WorkspaceCompiledBundle) => Promise<WorkspacePreviewVerificationReport>)
    | null,
): void {
  registeredPreviewVerifier = verifier;
}

function normalizePosixPath(input: string): string {
  const parts = input.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function dirnamePosix(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx < 0 ? '' : filePath.slice(0, idx);
}

export function resolveWorkspaceImport(files: WorkspaceSpec['files'], importer: string, spec: string): string | null {
  let candidate = '';
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const dir = dirnamePosix(importer);
    candidate = normalizePosixPath(dir ? `${dir}/${spec}` : spec);
  } else if (spec.startsWith('@/')) {
    candidate = normalizePosixPath(`src/${spec.slice(2)}`);
  } else {
    return spec;
  }
  if (Object.hasOwn(files, candidate)) return candidate;
  for (const ext of ['.tsx', '.ts', '.jsx', '.js', '.vue', '.css', '.json']) {
    if (Object.hasOwn(files, `${candidate}${ext}`)) return `${candidate}${ext}`;
  }
  for (const idx of ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.vue']) {
    const joined = candidate ? `${candidate}/${idx}` : idx;
    if (Object.hasOwn(files, joined)) return joined;
  }
  if (
    candidate === 'src/components/animate-ui' ||
    candidate.startsWith('src/components/animate-ui/') ||
    candidate === 'src/components/AnimateUi.vue' ||
    candidate === 'src/components/AnimateUi'
  ) {
    return 'animate-ui';
  }
  return null;
}

/**
 * Static validation of imports, entry exports, and balanced syntax across workspace files.
 * Runs synchronously in both browser and Node before or alongside full bundling.
 */
export function validateWorkspaceModules(workspace: WorkspaceSpec): WorkspaceCompileDiagnostic[] {
  const errors: WorkspaceCompileDiagnostic[] = [];
  const files = workspace.files;
  const importRegex = /(?:import\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?|export\s+[^'"`]*?\s+from\s+)['"]([^'"]+)['"]/g;

  for (const [filePath, fileObj] of Object.entries(files)) {
    if (!/\.(?:tsx|ts|jsx|js|vue)$/i.test(filePath)) continue;
    const content = fileObj.content;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      importRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(line)) !== null) {
        const spec = match[1];
        if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('@/')) {
          const resolved = resolveWorkspaceImport(files, filePath, spec);
          if (!resolved) {
            errors.push({
              file: filePath,
              line: i + 1,
              column: match.index + 1,
              message: `找不到工作区模块 "${spec}"，请先创建对应文件或修正导入路径。`,
            });
          }
        }
      }
    }

    if (filePath.endsWith('.vue')) {
      if (!/<template[\s>]/i.test(content) && !/<script[\s>]/i.test(content)) {
        errors.push({
          file: filePath,
          line: 1,
          message: `Vue 组件 ${filePath} 必须包含 <template> 或 <script> 标签。`,
        });
      }
    }
  }

  const entryFile = files[workspace.entry];
  if (entryFile) {
    if (workspace.framework === 'react' && !/export\s+default\b|export\s+function\s+App\b|export\s+const\s+App\b/.test(entryFile.content)) {
      errors.push({
        file: workspace.entry,
        line: 1,
        message: `React 入口文件 ${workspace.entry} 必须包含 export default 或导出 App 组件。`,
      });
    }
  }

  return errors;
}

export function compileWorkspaceFallbackSync(rawWorkspace: WorkspaceSpec): WorkspaceCompileResult {
  const workspace = validateWorkspace(rawWorkspace);
  const diagnostics = validateWorkspaceModules(workspace);
  if (diagnostics.length > 0) {
    return { ok: false, errors: diagnostics, warnings: [] };
  }
  const sig = workspaceFilesSignature(workspace);
  const cached = compileCache.get(sig);
  if (cached && cached.ok) {
    return cached;
  }
  if (workspace.compiled && workspace.compiled.js && workspace.compiled.js.trim().length > 0) {
    return { ok: true, compiled: workspace.compiled, warnings: [] };
  }
  const cssParts = Object.entries(workspace.files)
    .filter(([path]) => path.endsWith('.css'))
    .map(([path, file]) => `/* ${path} */\n${file.content}`);
  if (!cssParts.some(c => c.includes('Animate UI Workspace Runtime Styles'))) {
    cssParts.push(ANIMATE_UI_BASE_CSS);
  }
  const css = cssParts.join('\n\n');

  if (workspace.framework === 'html') {
    const html = workspace.files[workspace.entry]?.content ?? '<div id="workspace-root"></div>';
    const js =
      Object.entries(workspace.files)
        .filter(([path]) => /\.(?:js|ts)$/i.test(path))
        .map(([, file]) => file.content.replace(/^\s*export\s+/gm, ''))
        .join('\n;\n') +
      '\nif (typeof mountWorkspaceApp === "function") mountWorkspaceApp(document.getElementById("ws-app-root") || document.getElementById("workspace-root") || document.body);';
    return {
      ok: true,
      compiled: { html, js, css, compiledAt: new Date().toISOString() },
      warnings: [],
    };
  }

  return {
    ok: true,
    compiled: workspace.compiled ?? {
      html: '<div id="workspace-root"></div>',
      js: '',
      css,
      compiledAt: new Date().toISOString(),
    },
    warnings: [],
  };
}

export async function compileWorkspaceClient(
  rawWorkspace: WorkspaceSpec,
  options: { signal?: AbortSignal } = {},
): Promise<WorkspaceCompileResult> {
  const workspace = validateWorkspace(rawWorkspace);
  const moduleErrors = validateWorkspaceModules(workspace);
  if (moduleErrors.length > 0) {
    return { ok: false, errors: moduleErrors, warnings: [] };
  }

  const sig = workspaceFilesSignature(workspace);
  const cached = compileCache.get(sig);
  if (cached) {
    return cached;
  }

  if (registeredCompiler) {
    const res = await registeredCompiler(workspace);
    if (res.ok) {
      if (compileCache.size >= 16) {
        const firstKey = compileCache.keys().next().value;
        if (firstKey) compileCache.delete(firstKey);
      }
      compileCache.set(sig, res);
    }
    return res;
  }

  try {
    // Strip heavy compiled bundle & git history so POST payload stays well below 512KB limit
    const payloadWorkspace: WorkspaceSpec = {
      version: workspace.version,
      runtimeVersion: workspace.runtimeVersion,
      framework: workspace.framework,
      entry: workspace.entry,
      files: workspace.files,
    };
    const response = await fetch('/api/workspace/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: payloadWorkspace }),
      signal: options.signal,
    });
    if (response.ok || response.status === 422 || response.status === 400) {
      const payload = (await response.json()) as WorkspaceCompileResult;
      if (payload && typeof payload.ok === 'boolean') {
        if (payload.ok) {
          if (compileCache.size >= 16) {
            const firstKey = compileCache.keys().next().value;
            if (firstKey) compileCache.delete(firstKey);
          }
          compileCache.set(sig, payload);
        }
        return payload;
      }
    }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error;
  }

  return compileWorkspaceFallbackSync(workspace);
}

/**
 * Generates the complete, responsive HTML document to mount inside WorkspacePreview
 * or standalone HTML export.
 */
export function buildWorkspaceDocumentHtml(
  workspace: WorkspaceSpec,
  options: { channel?: string; title?: string; seoHead?: string } = {},
): string {
  const compiled = workspace.compiled ?? compileWorkspaceFallbackSync(workspace);
  const bundle = 'ok' in compiled ? (compiled.ok ? compiled.compiled : { html: '<div id="workspace-root"></div>', js: '', css: '' }) : compiled;
  const safeCss = (bundle.css || '').replace(/<\/style/gi, '<\\/style');
  const safeJs = (bundle.js || '').replace(/<\/script/gi, '<\\/script');
  const htmlBody = bundle.html || '<div id="workspace-root"></div>';
  const titleTag = options.seoHead || `<title>${escapeHtmlText(options.title || 'Workspace App')}</title>`;
  const bridgeScript = `<script>
(function() {
  var channel = ${JSON.stringify(options.channel || '')};
  var lastRuntimeError = '';
  function post(type, payload) {
    if (!channel) return;
    try {
      window.parent.postMessage(Object.assign({ source: 'animate-studio-workspace', channel: channel, type: type }, payload || {}), '*');
    } catch (e) {}
  }
  function reportRuntimeError(rawMsg) {
    var msg = String(rawMsg || 'Runtime Error');
    lastRuntimeError = msg;
    window.__workspaceLastRuntimeError = msg;
    post('runtime-error', { message: msg });
  }
  window.__reportWorkspaceRuntimeError = reportRuntimeError;
  window.addEventListener('error', function(ev) {
    reportRuntimeError(ev.error && ev.error.message ? ev.error.message : String(ev.message || 'Runtime Error'));
  });
  window.addEventListener('unhandledrejection', function(ev) {
    reportRuntimeError(ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason || 'Unhandled Rejection'));
  });
  function inspectDom() {
    var docEl = document.documentElement;
    var body = document.body;
    if (!docEl || !body) return null;
    var root = document.getElementById('workspace-root') || document.getElementById('ws-app-root') || body;
    var rootChildCount = root ? root.children.length : 0;
    var textLength = ((root ? root.textContent : body.textContent) || '').trim().length;
    var interactiveCount = document.querySelectorAll('button, input, select, textarea, [role="tab"], [role="button"], a[href]').length;
    var mediaCount = document.querySelectorAll('svg, canvas, img, video, article, section, table').length;
    var rendered = !lastRuntimeError && rootChildCount > 0 && (textLength > 0 || interactiveCount > 0 || mediaCount > 0);
    var height = Math.max(body.scrollHeight || 0, docEl.scrollHeight || 0, 480);
    var overflowX = (docEl.scrollWidth || 0) > (docEl.clientWidth || 0) + 2;
    var snap = {
      height: height,
      clientWidth: docEl.clientWidth || 0,
      scrollWidth: docEl.scrollWidth || 0,
      overflowX: overflowX,
      interactiveCount: interactiveCount,
      rootChildCount: rootChildCount,
      textLength: textLength,
      rendered: rendered,
      runtimeError: lastRuntimeError
    };
    window.__workspaceLastMetrics = snap;
    return snap;
  }
  function measure() {
    var snap = inspectDom();
    if (snap) post('metrics', snap);
  }
  window.addEventListener('load', function() {
    var snap = inspectDom();
    post('metrics', snap || {});
    post('ready', snap || {});
    setTimeout(measure, 80);
    setTimeout(function() {
      var s = inspectDom();
      if (s && !lastRuntimeError && s.rootChildCount === 0) {
        reportRuntimeError('预览根节点 #workspace-root 为空（0 个子节点），组件未渲染出任何可见 DOM 内容。');
      }
      if (s) post('metrics', s);
    }, 320);
  });
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function() { measure(); });
    ro.observe(document.documentElement);
  }
  window.addEventListener('click', function() { setTimeout(measure, 60); }, true);
})();
</script>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${titleTag}
<style>
html, body { margin: 0; padding: 0; width: 100%; min-height: 100%; overflow-x: hidden; }
${safeCss}
</style>
</head>
<body>
${htmlBody}
${bridgeScript}
<script>
${safeJs}
</script>
</body>
</html>`;
}

/**
 * Mounts and executes the compiled workspace bundle in a preview DOM environment
 * (using the registered server verifier in Node, or an offscreen sandboxed iframe in the browser)
 * and verifies that the preview actually renders visible DOM content with zero runtime errors.
 */
export async function verifyWorkspacePreview(
  rawWorkspace: WorkspaceSpec,
  options: { compiled?: WorkspaceCompiledBundle; signal?: AbortSignal } = {},
): Promise<WorkspacePreviewVerificationReport> {
  const workspace = validateWorkspace(rawWorkspace);
  let compiled = options.compiled ?? workspace.compiled;

  if (!compiled || (!compiled.js && workspace.framework !== 'html')) {
    const compileResult = await compileWorkspaceClient(workspace, { signal: options.signal });
    if (!compileResult.ok) {
      return {
        ok: false,
        rendered: false,
        rootChildCount: 0,
        textLength: 0,
        interactiveCount: 0,
        overflowX: false,
        runtimeError: '',
        compileErrors: compileResult.errors,
        summary: `预览编译失败：${compileResult.errors.map(e => `${e.file}${e.line ? `:${e.line}` : ''} ${e.message}`).join('；')}`,
      };
    }
    compiled = compileResult.compiled;
  }

  if (registeredPreviewVerifier) {
    return registeredPreviewVerifier(workspace, compiled);
  }

  const g = globalThis as unknown as {
    window?: {
      addEventListener: (type: string, listener: (ev: { source?: unknown; data?: unknown }) => void) => void;
      removeEventListener: (type: string, listener: (ev: { source?: unknown; data?: unknown }) => void) => void;
      setTimeout: (fn: () => void, ms: number) => number;
      clearTimeout: (id: number) => void;
    };
    document?: {
      body?: { appendChild: (el: unknown) => void };
      createElement: (tag: string) => {
        setAttribute: (k: string, v: string) => void;
        style: { cssText: string };
        srcdoc: string;
        contentWindow?: unknown;
        remove: () => void;
      };
    };
  };

  if (g.window && g.document?.body) {
    const win = g.window;
    const doc = g.document;
    return new Promise<WorkspacePreviewVerificationReport>(resolve => {
      const channel = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const iframe = doc.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px;height:800px;opacity:0;pointer-events:none;border:0;';

      let settled = false;
      const latestMetrics = {
        rootChildCount: 0,
        textLength: 0,
        interactiveCount: 0,
        overflowX: false,
        rendered: false,
      };
      let runtimeError = '';

      const finish = () => {
        if (settled) return;
        settled = true;
        win.removeEventListener('message', onMessage);
        win.clearTimeout(timeoutId);
        try {
          iframe.remove();
        } catch {}

        const rendered =
          !runtimeError &&
          latestMetrics.rootChildCount > 0 &&
          (latestMetrics.textLength > 0 || latestMetrics.interactiveCount > 0);
        const ok = !runtimeError && rendered;
        const summary = runtimeError
          ? `预览页面运行期报错：${runtimeError}`
          : !rendered
          ? `预览页面渲染为空白画面（#workspace-root 子节点数为 ${latestMetrics.rootChildCount}，可见文本长度为 ${latestMetrics.textLength}），请检查入口组件返回值与挂载逻辑`
          : `预览页面自检通过（渲染 ${latestMetrics.rootChildCount} 个根节点、${latestMetrics.interactiveCount} 个交互控件、${latestMetrics.textLength} 字符内容，0 个运行期错误）`;

        resolve({
          ok,
          rendered,
          rootChildCount: latestMetrics.rootChildCount,
          textLength: latestMetrics.textLength,
          interactiveCount: latestMetrics.interactiveCount,
          overflowX: latestMetrics.overflowX,
          runtimeError,
          compileErrors: [],
          summary,
        });
      };

      const onMessage = (event: { source?: unknown; data?: unknown }) => {
        if (event.source !== iframe.contentWindow) return;
        const data = event.data as Record<string, unknown> | null;
        if (!data || data.source !== 'animate-studio-workspace' || data.channel !== channel) return;
        if (data.type === 'runtime-error' && typeof data.message === 'string') {
          runtimeError = data.message;
          finish();
          return;
        }
        if (data.type === 'metrics' || data.type === 'ready') {
          if (typeof data.rootChildCount === 'number') latestMetrics.rootChildCount = data.rootChildCount;
          if (typeof data.textLength === 'number') latestMetrics.textLength = data.textLength;
          if (typeof data.interactiveCount === 'number') latestMetrics.interactiveCount = data.interactiveCount;
          if (typeof data.overflowX === 'boolean') latestMetrics.overflowX = data.overflowX;
          if (typeof data.rendered === 'boolean') latestMetrics.rendered = data.rendered;
          if (typeof data.runtimeError === 'string' && data.runtimeError) {
            runtimeError = data.runtimeError;
            finish();
            return;
          }
          if (latestMetrics.rootChildCount > 0 && (latestMetrics.textLength > 0 || latestMetrics.interactiveCount > 0)) {
            win.setTimeout(finish, 90);
          }
        }
      };

      const timeoutId = win.setTimeout(finish, 1200);
      win.addEventListener('message', onMessage);
      iframe.srcdoc = buildWorkspaceDocumentHtml({ ...workspace, compiled }, { channel, title: 'Workspace Verify' });
      doc.body!.appendChild(iframe);
    });
  }

  const hasBundleContent = Boolean(
    (workspace.framework === 'html' && (compiled.html || '').trim().length > 0) ||
      (compiled.js || '').trim().length > 0,
  );
  return {
    ok: hasBundleContent,
    rendered: hasBundleContent,
    rootChildCount: hasBundleContent ? 1 : 0,
    textLength: hasBundleContent ? 1 : 0,
    interactiveCount: 0,
    overflowX: false,
    runtimeError: hasBundleContent ? '' : '预览构建产物为空',
    compileErrors: [],
    summary: hasBundleContent ? '预览构建产物校验通过' : '预览构建产物为空，无法渲染画面',
  };
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
