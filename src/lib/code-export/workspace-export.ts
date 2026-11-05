import type { StudioDocument, WorkspaceSpec } from '../../model.ts';
import type { CodeExport, Format } from './generate.ts';
import { escapeHtml, js } from './nodes.ts';
import { renderSeoHead, resolveSeo } from '../../../shared/seo.mjs';
import { buildWorkspaceDocumentHtml, compileWorkspaceFallbackSync } from '../workspace/compiler-client.ts';

export function hasWorkspace(doc: StudioDocument): WorkspaceSpec | null {
  if ('settings' in doc) {
    return doc.workspace ?? null;
  }
  const home = doc.pages.find(entry => entry.id === doc.homePageId)?.page;
  if (home?.workspace) return home.workspace;
  const anyWorkspace = doc.pages.find(entry => entry.page.workspace)?.page.workspace;
  return anyWorkspace ?? null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100) || 'page';
}

/**
 * Strips TypeScript-only constructs from a module so that the resulting code
 * is valid standard JSX (.jsx) without requiring a TypeScript parser at import time.
 */
export function stripTypeScriptForJsx(source: string): string {
  let out = source;
  // Remove `import type ...` lines
  out = out.replace(/^\s*import\s+type\s+[^;\n]+;?\s*$/gm, '');
  // Remove inline `type X` inside import specifiers: `import { a, type B } from ...`
  out = out.replace(/\btype\s+[A-Za-z_$][\w$]*\s*,?/g, (match, offset, full) => {
    const lineStart = full.lastIndexOf('\n', offset) + 1;
    const linePrefix = full.slice(lineStart, offset);
    if (/^\s*import\b/.test(linePrefix)) return '';
    return match;
  });
  // Remove multiline `export type Foo = { ... };` and `type Foo = ...;`
  out = out.replace(/^\s*(?:export\s+)?type\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*=\s*(?:\{[\s\S]*?^\s*\};?|[^;\n]+;?)\s*$/gm, '');
  // Remove multiline `export interface Foo { ... }`
  out = out.replace(/^\s*(?:export\s+)?interface\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*\{[\s\S]*?^\s*\}\s*$/gm, '');
  // Remove generic arguments on common React hooks and functions: useState<T>( -> useState(
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/\b(useState|useRef|useMemo|useCallback|useReducer|createContext| Array)<[^<>()]+>\(/g, '$1(');
  }
  // Remove `as const` and simple `as Type` assertions
  out = out.replace(/\s+as\s+const\b/g, '');
  out = out.replace(/\s+as\s+[A-Za-z_$][\w$.<>[\]|&\s]*?(?=[,;)\]\n}])/g, '');
  // Remove variable type annotations: `const x: Type =`
  out = out.replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  // Remove function return type annotations before `{`: `function foo(a): Bar {`
  out = out.replace(/\)\s*:\s*[A-Za-z_$][\w$.<>[\]|&\s]*\s*\{/g, ') {');
  // Remove multiline destructured object parameter type annotations: `}: { ... })`
  out = out.replace(/\}\s*:\s*\{[\s\S]*?\}\s*\)/g, '})');
  // Remove simple parameter type annotations inside `(...)`
  out = out.replace(/\(([^()]*)\)/g, (full, inner: string) => {
    if (!inner.includes(':')) return full;
    // Avoid touching ternary expressions or object literals inside parens
    if (inner.includes('?') && inner.includes(':') && !/[A-Za-z_$][\w$]*\?\s*:/.test(inner)) return full;
    if (inner.trim().startsWith('{')) {
      // Destructured object parameter with type: `({ a, b }: Props)`
      return full.replace(/\}\s*:\s*[^)]+\)$/, '})');
    }
    const cleaned = inner
      .split(',')
      .map(param => param.replace(/^(\s*[A-Za-z_$][\w$]*)\??\s*:\s*.+$/, '$1'))
      .join(',');
    return `(${cleaned})`;
  });
  return out;
}

function collectOrderedCodeFiles(workspace: WorkspaceSpec): Array<[string, string]> {
  const entries = Object.entries(workspace.files).filter(([path]) => /\.(?:tsx|ts|jsx|js)$/i.test(path));
  const nonEntry = entries.filter(([path]) => path !== workspace.entry);
  // Put data/utils first, then components, then entry
  nonEntry.sort(([a], [b]) => {
    const score = (p: string) => (p.includes('/data/') || p.includes('/utils/') || p.includes('/types') ? 0 : p.includes('/components/') ? 1 : 2);
    return score(a) - score(b) || a.localeCompare(b);
  });
  const result = nonEntry.map(([path, file]) => [path, file.content] as [string, string]);
  if (workspace.files[workspace.entry] && /\.(?:tsx|ts|jsx|js)$/i.test(workspace.entry)) {
    result.push([workspace.entry, workspace.files[workspace.entry].content]);
  }
  return result;
}

function collectWorkspaceCss(workspace: WorkspaceSpec): string {
  return Object.entries(workspace.files)
    .filter(([path]) => path.endsWith('.css'))
    .map(([path, file]) => `/* ${path} */\n${file.content}`)
    .join('\n\n');
}

/**
 * Generates a full multi-file project dictionary (Vite + React / Vue / HTML)
 * with locked dependencies matching Animate Studio's runtime base.
 */
export function exportWorkspaceProjectFiles(doc: StudioDocument, format?: Format): Record<string, string> {
  const workspace = hasWorkspace(doc);
  if (!workspace) return {};
  const targetFramework = format === 'react' ? 'react' : format === 'vue' ? 'vue' : format === 'html' ? 'html' : workspace.framework;
  const files: Record<string, string> = {};
  for (const [path, file] of Object.entries(workspace.files)) {
    files[path] = file.content;
  }

  if (targetFramework === 'react') {
    files['package.json'] = JSON.stringify(
      {
        name: sanitizeFileName(doc.name).toLowerCase(),
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^19.2.4',
          'react-dom': '^19.2.4',
          'lucide-react': '^1.16.0',
        },
        devDependencies: {
          '@types/react': '^19.2.14',
          '@types/react-dom': '^19.2.3',
          '@vitejs/plugin-react': '^6.0.1',
          typescript: '^5.9.3',
          vite: '^8.0.0',
        },
      },
      null,
      2,
    );
    files['index.html'] = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(doc.name)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    if (!files['src/main.tsx']) {
      files['src/main.tsx'] = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
    }
  } else if (targetFramework === 'vue') {
    files['package.json'] = JSON.stringify(
      {
        name: sanitizeFileName(doc.name).toLowerCase(),
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          vue: '^3.5.32',
        },
        devDependencies: {
          '@vitejs/plugin-vue': '^5.2.1',
          typescript: '^5.9.3',
          vite: '^8.0.0',
        },
      },
      null,
      2,
    );
    files['index.html'] = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(doc.name)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`;
    if (!files['src/main.ts']) {
      files['src/main.ts'] = `import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

createApp(App).mount('#app');
`;
    }
  }
  return files;
}

function buildNativeReactExport(doc: StudioDocument, workspace: WorkspaceSpec): CodeExport {
  const css = collectWorkspaceCss(workspace);
  const projectFiles = exportWorkspaceProjectFiles(doc, 'react');

  if (workspace.framework === 'react') {
    const orderedFiles = collectOrderedCodeFiles(workspace);
    const transformedModules: string[] = [];

    for (const [filePath, rawContent] of orderedFiles) {
      let cleaned = stripTypeScriptForJsx(rawContent);
      // Remove external/relative imports because React hooks, icons, and sibling modules are inlined in order
      cleaned = cleaned.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
      cleaned = cleaned.replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

      if (filePath === workspace.entry) {
        if (/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/.test(cleaned)) {
          cleaned = cleaned.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/, 'function WorkspaceRootComponent');
        } else if (/export\s+default\s+/.test(cleaned)) {
          cleaned = cleaned.replace(/export\s+default\s+/, 'const WorkspaceRootComponent = ');
        } else if (/export\s+function\s+App\b/.test(cleaned)) {
          cleaned = cleaned.replace(/export\s+function\s+App\b/, 'function WorkspaceRootComponent');
        }
      }
      cleaned = cleaned.replace(/^\s*export\s+(const|let|var|function|class)\b/gm, '$1');
      cleaned = cleaned.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
      transformedModules.push(`// --- File: ${filePath} ---\n${cleaned.trim()}`);
    }

    const jsxContent = `'use client';
/*
 * Generated by Animate Studio Multi-File Workspace (React Native Export).
 * Contains the real React component tree, hooks, and responsive styles with zero iframe wrappers.
 * Multi-file Vite + React source files are also exported in WORKSPACE_PROJECT_FILES.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

const __LUCIDE_PATHS = {
  Search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  Plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  Check: '<path d="M20 6 9 17l-5-5"/>',
  X: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  Star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  Heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  ArrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  ArrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  Sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  Filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  SlidersHorizontal: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
};
function __createIcon(name) {
  const body = __LUCIDE_PATHS[name] || '<circle cx="12" cy="12" r="9"/>';
  return function LucideIcon({ size = 18, color = 'currentColor', strokeWidth = 2, className = '', style }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  };
}
const Search = __createIcon('Search');
const Plus = __createIcon('Plus');
const Check = __createIcon('Check');
const X = __createIcon('X');
const Star = __createIcon('Star');
const Heart = __createIcon('Heart');
const ArrowRight = __createIcon('ArrowRight');
const ArrowUpRight = __createIcon('ArrowUpRight');
const Sparkles = __createIcon('Sparkles');
const Filter = __createIcon('Filter');
const SlidersHorizontal = __createIcon('SlidersHorizontal');

const WORKSPACE_CSS = ${js(css)};
export const WORKSPACE_PROJECT_FILES = ${js(projectFiles)};

${transformedModules.join('\n\n')}

export default function GeneratedPage({ className = '', style, ...props }) {
  return (
    <div className={['as-workspace-native-react', className].filter(Boolean).join(' ')} style={{ width: '100%', minHeight: '100%', ...style }} {...props}>
      <style>{WORKSPACE_CSS}</style>
      <WorkspaceRootComponent />
    </div>
  );
}
`;
    return { filename: 'GeneratedPage.jsx', mime: 'text/plain;charset=utf-8', content: jsxContent };
  }

  // Fallback for non-React workspace exported to React: mount directly into a DOM container without any iframe
  const compiled = workspace.compiled ?? (compileWorkspaceFallbackSync(workspace).ok ? (compileWorkspaceFallbackSync(workspace) as { ok: true; compiled: NonNullable<WorkspaceSpec['compiled']> }).compiled : { html: '<div id="workspace-root"></div>', js: '', css });
  const content = `'use client';
/*
 * Generated by Animate Studio Multi-File Workspace (${workspace.framework} -> React Native Container).
 * Mounts directly into a React ref container without an iframe wrapper.
 */
import React, { useEffect, useRef } from 'react';

const WORKSPACE_CSS = ${js(compiled.css || css)};
const WORKSPACE_HTML = ${js(compiled.html || '<div id="workspace-root"></div>')};
const WORKSPACE_JS = ${js(compiled.js || '')};
export const WORKSPACE_PROJECT_FILES = ${js(projectFiles)};

export default function GeneratedPage({ className = '', style, ...props }) {
  const hostRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = WORKSPACE_HTML;
    if (WORKSPACE_JS) {
      const fn = new Function('root', WORKSPACE_JS);
      fn(host);
    }
  }, []);
  return (
    <div className={['as-workspace-native-react', className].filter(Boolean).join(' ')} style={{ width: '100%', minHeight: '100%', ...style }} {...props}>
      <style>{WORKSPACE_CSS}</style>
      <div ref={hostRef} />
    </div>
  );
}
`;
  return { filename: 'GeneratedPage.jsx', mime: 'text/plain;charset=utf-8', content };
}

function buildNativeVueExport(doc: StudioDocument, workspace: WorkspaceSpec): CodeExport {
  const css = collectWorkspaceCss(workspace);
  const projectFiles = exportWorkspaceProjectFiles(doc, 'vue');

  if (workspace.framework === 'vue') {
    const entrySfc = workspace.files[workspace.entry]?.content ?? '';
    const scriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(entrySfc);
    const templateMatch = /<template[^>]*>([\s\S]*?)<\/template>/i.exec(entrySfc);
    const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(entrySfc);

    // Inline any non-entry TS/JS helper modules
    const helperModules = Object.entries(workspace.files)
      .filter(([path]) => path !== workspace.entry && /\.(?:ts|js)$/i.test(path))
      .map(([path, file]) => {
        const cleaned = stripTypeScriptForJsx(file.content)
          .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
          .replace(/^\s*export\s+(const|let|var|function)\b/gm, '$1');
        return `// --- ${path} ---\n${cleaned.trim()}`;
      })
      .join('\n\n');

    const entryScript = stripTypeScriptForJsx(scriptMatch?.[1] ?? "import { ref } from 'vue';")
      .replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/^\s*import\s+['"][^'"]+\.css['"]\s*;?\s*$/gm, '');

    const templateBody = templateMatch?.[1]?.trim() ?? '<div class="ws-page">Workspace Ready</div>';
    const combinedCss = [css, styleMatch?.[1]?.trim() ?? ''].filter(Boolean).join('\n\n');

    const sfcContent = `<!--
  Generated by Animate Studio Multi-File Workspace (Vue 3 Native SFC Export).
  Real <script setup>, <template>, and <style> without iframe wrappers.
-->
<script setup>
${helperModules ? `${helperModules}\n\n` : ''}${entryScript.trim()}
const WORKSPACE_PROJECT_FILES = ${js(projectFiles)};
defineExpose({ WORKSPACE_PROJECT_FILES });
</script>

<template>
${templateBody}
</template>

<style>
${combinedCss}
</style>
`;
    return { filename: 'GeneratedPage.vue', mime: 'text/plain;charset=utf-8', content: sfcContent };
  }

  // When exporting a React or HTML workspace to Vue 3 SFC: generate a real interactive Vue 3 <script setup> SFC
  // that mounts the compiled workspace bundle directly into a Vue template ref container (no iframe!)
  const compiled = workspace.compiled ?? (compileWorkspaceFallbackSync(workspace).ok ? (compileWorkspaceFallbackSync(workspace) as { ok: true; compiled: NonNullable<WorkspaceSpec['compiled']> }).compiled : { html: '<div id="workspace-root"></div>', js: '', css });
  const sfcContent = `<!--
  Generated by Animate Studio Multi-File Workspace (${workspace.framework} -> Vue 3 Native SFC).
  Mounts directly into a Vue template ref container with zero iframe wrappers.
-->
<script setup>
import { onMounted, ref } from 'vue';

const hostRef = ref(null);
const WORKSPACE_HTML = ${js(compiled.html || '<div id="workspace-root"></div>')};
const WORKSPACE_JS = ${js(compiled.js || '')};
const WORKSPACE_PROJECT_FILES = ${js(projectFiles)};

onMounted(() => {
  const host = hostRef.value;
  if (!host) return;
  host.innerHTML = WORKSPACE_HTML;
  if (WORKSPACE_JS) {
    const mountFn = new Function('document', 'window', WORKSPACE_JS);
    mountFn(document, window);
  }
});

defineExpose({ WORKSPACE_PROJECT_FILES });
</script>

<template>
  <div class="as-workspace-native-vue">
    <div ref="hostRef" class="as-workspace-host"></div>
  </div>
</template>

<style>
${compiled.css || css}
</style>
`;
  return { filename: 'GeneratedPage.vue', mime: 'text/plain;charset=utf-8', content: sfcContent };
}

export function exportWorkspaceCode(doc: StudioDocument, format: Format): CodeExport {
  const workspace = hasWorkspace(doc);
  if (!workspace) {
    throw new Error('当前文档不包含代码工作区。');
  }
  const name = sanitizeFileName(doc.name);
  if (format === 'html') {
    const seo = { ...resolveSeo(doc, '/', { canonical: false }), canonical: undefined, robots: 'noindex,nofollow', noIndex: true };
    const html = buildWorkspaceDocumentHtml(workspace, {
      title: doc.name,
      seoHead: renderSeoHead(seo),
    });
    return {
      filename: `${name}.html`,
      mime: 'text/html;charset=utf-8',
      content: html,
    };
  }
  if (format === 'react') {
    return buildNativeReactExport(doc, workspace);
  }
  return buildNativeVueExport(doc, workspace);
}
