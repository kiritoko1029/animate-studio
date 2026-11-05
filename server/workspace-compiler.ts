import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformSync, type Plugin } from 'esbuild';
import { parse, compileScript, compileTemplate, compileStyle } from 'vue/compiler-sfc';
import { validateWorkspace, type WorkspaceSpec, type WorkspaceCompiledBundle } from '../shared/workspace.mjs';
import { registerServerWorkspaceCompiler } from '../src/lib/workspace/compiler-client.ts';
import { ANIMATE_UI_BASE_CSS, ANIMATE_UI_REACT_SOURCE } from '../src/lib/workspace/animate-ui-kit.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type WorkspaceCompileDiagnostic = {
  file: string;
  line?: number;
  column?: number;
  message: string;
};

export type WorkspaceCompileResult =
  | { ok: true; compiled: WorkspaceCompiledBundle; warnings: WorkspaceCompileDiagnostic[] }
  | { ok: false; errors: WorkspaceCompileDiagnostic[]; warnings: WorkspaceCompileDiagnostic[] };

const lucideVirtualSource = `
import React from 'react';
const paths = {
  Search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  Plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  Check: '<path d="M20 6 9 17l-5-5"/>',
  X: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  Star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  Heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  ArrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  ArrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  Sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  Filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  Bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  Settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  ChevronRight: '<path d="m9 18 6-6-6-6"/>',
  ChevronDown: '<path d="m6 9 6 6 6-6"/>',
  Layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  BarChart3: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  Users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  Calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  Clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  Trash2: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  Edit3: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  ExternalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ShoppingBag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  TrendingUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  ShieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  Zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  Globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
};
function makeIcon(name) {
  const body = paths[name] || paths.Sparkles;
  return function LucideIcon({ size = 18, color = 'currentColor', strokeWidth = 2, className = '', style, ...rest }) {
    return React.createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: ('lucide lucide-' + String(name).toLowerCase() + ' ' + className).trim(),
      style,
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: body },
      ...rest,
    });
  };
}
export const Search = makeIcon('Search');
export const Plus = makeIcon('Plus');
export const Check = makeIcon('Check');
export const X = makeIcon('X');
export const Star = makeIcon('Star');
export const Heart = makeIcon('Heart');
export const ArrowRight = makeIcon('ArrowRight');
export const ArrowUpRight = makeIcon('ArrowUpRight');
export const Sparkles = makeIcon('Sparkles');
export const Filter = makeIcon('Filter');
export const Bell = makeIcon('Bell');
export const Settings = makeIcon('Settings');
export const ChevronRight = makeIcon('ChevronRight');
export const ChevronDown = makeIcon('ChevronDown');
export const Layers = makeIcon('Layers');
export const BarChart3 = makeIcon('BarChart3');
export const Users = makeIcon('Users');
export const Calendar = makeIcon('Calendar');
export const Clock = makeIcon('Clock');
export const Trash2 = makeIcon('Trash2');
export const Edit3 = makeIcon('Edit3');
export const ExternalLink = makeIcon('ExternalLink');
export const ShoppingBag = makeIcon('ShoppingBag');
export const TrendingUp = makeIcon('TrendingUp');
export const ShieldCheck = makeIcon('ShieldCheck');
export const Zap = makeIcon('Zap');
export const Globe = makeIcon('Globe');
export default new Proxy({}, { get: (_, prop) => makeIcon(String(prop)) });
`;

function resolveVirtualFile(files: WorkspaceSpec['files'], candidate: string): string | null {
  const normalized = posix.normalize(candidate).replace(/^\/+/, '');
  if (Object.hasOwn(files, normalized)) return normalized;
  for (const ext of ['.tsx', '.ts', '.jsx', '.js', '.vue', '.css', '.json']) {
    if (Object.hasOwn(files, `${normalized}${ext}`)) return `${normalized}${ext}`;
  }
  for (const indexFile of ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.vue']) {
    const joined = posix.join(normalized, indexFile);
    if (Object.hasOwn(files, joined)) return joined;
  }
  return null;
}

function compileVueSfc(source: string, filename: string, id: string): { code: string; css: string; errors: WorkspaceCompileDiagnostic[] } {
  const { descriptor, errors: parseErrors } = parse(source, { filename });
  if (parseErrors.length) {
    return {
      code: '',
      css: '',
      errors: parseErrors.map(err => ({
        file: filename,
        line: 'loc' in err ? err.loc?.start.line : undefined,
        column: 'loc' in err ? err.loc?.start.column : undefined,
        message: err.message,
      })),
    };
  }
  const errors: WorkspaceCompileDiagnostic[] = [];
  let css = '';
  const hasScoped = descriptor.styles.some(style => style.scoped);
  for (let i = 0; i < descriptor.styles.length; i++) {
    const styleBlock = descriptor.styles[i];
    const compiledStyle = compileStyle({
      source: styleBlock.content,
      filename,
      id: `data-v-${id}`,
      scoped: Boolean(styleBlock.scoped),
    });
    if (compiledStyle.errors.length) {
      for (const err of compiledStyle.errors) {
        errors.push({ file: filename, message: err.message });
      }
    } else {
      css += `${compiledStyle.code}\n`;
    }
  }
  try {
    if (descriptor.script || descriptor.scriptSetup) {
      const script = compileScript(descriptor, {
        id,
        inlineTemplate: true,
        templateOptions: {
          scoped: hasScoped,
          compilerOptions: { scopeId: hasScoped ? `data-v-${id}` : undefined },
        },
      });
      const transformed = transformSync(script.content, {
        loader: script.lang === 'ts' || script.lang === 'tsx' ? 'ts' : 'js',
        sourcefile: filename,
      });
      let code = transformed.code;
      if (hasScoped) {
        code += `\n;(function(){ try { if (typeof __sfc__ !== 'undefined') __sfc__.__scopeId = "data-v-${id}"; } catch {} })();`;
      }
      return { code, css, errors };
    }
    if (descriptor.template) {
      const template = compileTemplate({
        source: descriptor.template.content,
        filename,
        id,
        scoped: hasScoped,
        compilerOptions: { scopeId: hasScoped ? `data-v-${id}` : undefined },
      });
      if (template.errors.length) {
        for (const err of template.errors) {
          errors.push({ file: filename, message: typeof err === 'string' ? err : err.message });
        }
        return { code: '', css, errors };
      }
      return {
        code: `${template.code}\nexport default { render${hasScoped ? `, __scopeId: "data-v-${id}"` : ''} };`,
        css,
        errors,
      };
    }
    return { code: 'export default {};', css, errors };
  } catch (error) {
    errors.push({
      file: filename,
      message: error instanceof Error ? error.message : String(error),
    });
    return { code: '', css, errors };
  }
}

export async function compileWorkspace(rawWorkspace: unknown): Promise<WorkspaceCompileResult> {
  const workspace = validateWorkspace(rawWorkspace);
  const files = workspace.files;
  const collectedCss: string[] = [];
  const sfcErrors: WorkspaceCompileDiagnostic[] = [];

  for (const [filePath, fileObj] of Object.entries(files)) {
    if (filePath.endsWith('.css')) {
      collectedCss.push(`/* ${filePath} */\n${fileObj.content}`);
    }
  }

  let entryBootstrap = '';
  let rootMarkup = '<div id="workspace-root"></div>';

  if (workspace.framework === 'react') {
    entryBootstrap = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as EntryModule from './${workspace.entry}';

const RootComponent = EntryModule.default || EntryModule.App || Object.values(EntryModule).find(v => typeof v === 'function');
if (!RootComponent) {
  throw new Error('入口文件 ${workspace.entry} 必须默认导出 (export default) 或导出一个 React 组件函数。');
}
const container = document.getElementById('workspace-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'workspace-root' }));
const root = createRoot(container);
root.render(React.createElement(RootComponent));
`;
  } else if (workspace.framework === 'vue') {
    entryBootstrap = `
import { createApp } from 'vue';
import EntryComponent from './${workspace.entry}';

const container = document.getElementById('workspace-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'workspace-root' }));
const app = createApp(EntryComponent);
app.mount(container);
`;
  } else {
    const htmlContent = files[workspace.entry]?.content ?? '';
    rootMarkup = htmlContent || '<div id="workspace-root"></div>';
    const jsFiles = Object.keys(files).filter(p => /\.(?:ts|js|tsx|jsx)$/i.test(p));
    if (jsFiles.length > 0) {
      const mainJs = jsFiles.find(p => /(?:main|app|index)\.(?:ts|js)$/i.test(p)) ?? jsFiles[0];
      entryBootstrap = `
import * as AppModule from './${mainJs}';
const boot = AppModule.default || AppModule.mountWorkspaceApp || AppModule.init;
if (typeof boot === 'function') {
  boot(document.getElementById('ws-app-root') || document.getElementById('workspace-root') || document.body);
}
`;
    } else {
      entryBootstrap = '// Static HTML workspace';
    }
  }

  const virtualPlugin: Plugin = {
    name: 'workspace-virtual-fs',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^virtual:workspace-entry$/ }, () => ({
        path: 'virtual:workspace-entry',
        namespace: 'ws-entry',
      }));

      buildApi.onLoad({ filter: /^virtual:workspace-entry$/, namespace: 'ws-entry' }, () => ({
        contents: entryBootstrap,
        loader: 'tsx',
        resolveDir: projectRoot,
      }));

      buildApi.onResolve({ filter: /^lucide-react$/ }, () => ({
        path: 'lucide-react',
        namespace: 'ws-lucide',
      }));

      buildApi.onLoad({ filter: /^lucide-react$/, namespace: 'ws-lucide' }, () => ({
        contents: lucideVirtualSource,
        loader: 'jsx',
        resolveDir: projectRoot,
      }));

      buildApi.onResolve({ filter: /^(?:animate-ui|@animate-ui\/studio)$/ }, () => ({
        path: 'animate-ui',
        namespace: 'ws-animate-ui',
      }));

      buildApi.onLoad({ filter: /^animate-ui$/, namespace: 'ws-animate-ui' }, () => {
        if (!collectedCss.some(c => c.includes('Animate UI Workspace Runtime Styles'))) {
          collectedCss.push(ANIMATE_UI_BASE_CSS);
        }
        return {
          contents: ANIMATE_UI_REACT_SOURCE,
          loader: 'tsx',
          resolveDir: projectRoot,
        };
      });

      buildApi.onResolve({ filter: /^\.\.?\// }, args => {
        if (args.namespace !== 'ws-file' && args.namespace !== 'ws-entry') return null;
        const baseDir = args.namespace === 'ws-entry' ? '' : posix.dirname(args.importer || '');
        const candidate = posix.join(baseDir, args.path);
        const resolved = resolveVirtualFile(files, candidate);
        if (!resolved) {
          if (candidate === 'src/components/animate-ui' || candidate.startsWith('src/components/animate-ui/')) {
            return { path: 'animate-ui', namespace: 'ws-animate-ui' };
          }
          return {
            errors: [{ text: `找不到工作区模块 "${args.path}"（请检查文件路径或先通过 writeFile 创建该文件）` }],
          };
        }
        return { path: resolved, namespace: 'ws-file' };
      });

      buildApi.onResolve({ filter: /^@\// }, args => {
        if (args.namespace !== 'ws-file' && args.namespace !== 'ws-entry') return null;
        const candidate = posix.join('src', args.path.slice(2));
        const resolved = resolveVirtualFile(files, candidate);
        if (!resolved) {
          if (candidate === 'src/components/animate-ui' || candidate.startsWith('src/components/animate-ui/')) {
            return { path: 'animate-ui', namespace: 'ws-animate-ui' };
          }
          return {
            errors: [{ text: `找不到工作区模块 "${args.path}"` }],
          };
        }
        return { path: resolved, namespace: 'ws-file' };
      });

      buildApi.onLoad({ filter: /.*/, namespace: 'ws-file' }, args => {
        const fileObj = files[args.path];
        if (!fileObj) {
          return { errors: [{ text: `工作区文件不存在：${args.path}` }] };
        }
        if (args.path.endsWith('.css')) {
          return { contents: '', loader: 'js' };
        }
        if (args.path.endsWith('.json')) {
          return { contents: fileObj.content, loader: 'json' };
        }
        if (args.path.endsWith('.vue')) {
          const id = args.path.replace(/[^A-Za-z0-9]/g, '').slice(-12) || 'sfc';
          const compiledSfc = compileVueSfc(fileObj.content, args.path, id);
          if (compiledSfc.errors.length) {
            sfcErrors.push(...compiledSfc.errors);
            return {
              errors: compiledSfc.errors.map(e => ({ text: e.message })),
            };
          }
          if (compiledSfc.css.trim()) {
            collectedCss.push(`/* ${args.path} */\n${compiledSfc.css}`);
          }
          return {
            contents: compiledSfc.code,
            loader: 'js',
            resolveDir: projectRoot,
          };
        }
        const ext = posix.extname(args.path).toLowerCase();
        const loader = ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : ext === '.jsx' ? 'jsx' : 'js';
        return {
          contents: fileObj.content,
          loader,
          resolveDir: projectRoot,
        };
      });
    },
  };

  try {
    const result = await build({
      entryPoints: ['virtual:workspace-entry'],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: ['es2022'],
      jsx: 'automatic',
      minify: true,
      logLevel: 'silent',
      absWorkingDir: projectRoot,
      define: {
        'process.env.NODE_ENV': '"production"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      },
      plugins: [virtualPlugin],
    });

    if (sfcErrors.length) {
      return { ok: false, errors: sfcErrors, warnings: [] };
    }

    const js = result.outputFiles?.[0]?.text ?? '';
    const css = collectedCss.join('\n\n');
    const warnings: WorkspaceCompileDiagnostic[] = result.warnings.map(w => ({
      file: w.location?.file?.replace(/^ws-file:/, '') ?? workspace.entry,
      line: w.location?.line,
      column: w.location?.column,
      message: w.text,
    }));

    return {
      ok: true,
      compiled: {
        html: rootMarkup,
        js,
        css,
        compiledAt: new Date().toISOString(),
      },
      warnings,
    };
  } catch (error: unknown) {
    if (sfcErrors.length) {
      return { ok: false, errors: sfcErrors, warnings: [] };
    }
    const buildErrors = (error as { errors?: Array<{ text: string; location?: { file?: string; line?: number; column?: number } }> })?.errors;
    if (Array.isArray(buildErrors) && buildErrors.length) {
      return {
        ok: false,
        errors: buildErrors.map(err => ({
          file: err.location?.file?.replace(/^ws-file:/, '') ?? workspace.entry,
          line: err.location?.line,
          column: err.location?.column,
          message: err.text,
        })),
        warnings: [],
      };
    }
    return {
      ok: false,
      errors: [
        {
          file: workspace.entry,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
    };
  }
}

registerServerWorkspaceCompiler(compileWorkspace);
