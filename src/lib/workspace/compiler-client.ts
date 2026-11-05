import { validateWorkspace, type WorkspaceCompiledBundle, type WorkspaceSpec } from '../../../shared/workspace.mjs';

export type WorkspaceCompileDiagnostic = {
  file: string;
  line?: number;
  column?: number;
  message: string;
};

export type WorkspaceCompileResult =
  | { ok: true; compiled: WorkspaceCompiledBundle; warnings: WorkspaceCompileDiagnostic[] }
  | { ok: false; errors: WorkspaceCompileDiagnostic[]; warnings: WorkspaceCompileDiagnostic[] };

let registeredCompiler: ((workspace: WorkspaceSpec) => Promise<WorkspaceCompileResult>) | null = null;

export function registerServerWorkspaceCompiler(
  compiler: ((workspace: WorkspaceSpec) => Promise<WorkspaceCompileResult>) | null,
): void {
  registeredCompiler = compiler;
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
  if (workspace.compiled && workspace.compiled.js !== undefined && workspace.compiled.css !== undefined) {
    return { ok: true, compiled: workspace.compiled, warnings: [] };
  }
  const css = Object.entries(workspace.files)
    .filter(([path]) => path.endsWith('.css'))
    .map(([path, file]) => `/* ${path} */\n${file.content}`)
    .join('\n\n');

  if (workspace.framework === 'html') {
    const html = workspace.files[workspace.entry]?.content ?? '<div id="workspace-root"></div>';
    const js = Object.entries(workspace.files)
      .filter(([path]) => /\.(?:js|ts)$/i.test(path))
      .map(([, file]) => file.content.replace(/^\s*export\s+/gm, ''))
      .join('\n;\n') + '\nif (typeof mountWorkspaceApp === "function") mountWorkspaceApp(document.getElementById("ws-app-root") || document.body);';
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

  if (registeredCompiler) {
    return registeredCompiler(workspace);
  }

  try {
    const response = await fetch('/api/workspace/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace }),
      signal: options.signal,
    });
    if (response.ok || response.status === 422 || response.status === 400) {
      const payload = (await response.json()) as WorkspaceCompileResult;
      if (payload && typeof payload.ok === 'boolean') {
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
  const bridgeScript = options.channel
    ? `<script>
(function() {
  var channel = ${JSON.stringify(options.channel)};
  function post(type, payload) {
    try {
      window.parent.postMessage(Object.assign({ source: 'animate-studio-workspace', channel: channel, type: type }, payload || {}), '*');
    } catch (e) {}
  }
  window.addEventListener('error', function(ev) {
    post('runtime-error', { message: ev.error && ev.error.message ? ev.error.message : String(ev.message || 'Runtime Error') });
  });
  window.addEventListener('unhandledrejection', function(ev) {
    post('runtime-error', { message: ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason || 'Unhandled Rejection') });
  });
  function measure() {
    var docEl = document.documentElement;
    var body = document.body;
    if (!docEl || !body) return;
    var height = Math.max(body.scrollHeight, docEl.scrollHeight, 480);
    var overflowX = docEl.scrollWidth > docEl.clientWidth + 2;
    var interactiveCount = document.querySelectorAll('button, input, select, textarea, [role="tab"], [role="button"], a[href]').length;
    post('metrics', {
      height: height,
      clientWidth: docEl.clientWidth,
      scrollWidth: docEl.scrollWidth,
      overflowX: overflowX,
      interactiveCount: interactiveCount
    });
  }
  window.addEventListener('load', function() {
    measure();
    post('ready', {});
    setTimeout(measure, 120);
    setTimeout(measure, 500);
  });
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function() { measure(); });
    ro.observe(document.documentElement);
  }
  window.addEventListener('click', function() { setTimeout(measure, 60); }, true);
})();
</script>`
    : '';

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

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
