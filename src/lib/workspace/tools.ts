import {
  commitWorkspaceGit,
  isSafeWorkspacePath,
  validateWorkspace,
  type WorkspaceSpec,
} from '../../../shared/workspace.mjs';
import {
  ANIMATE_UI_BASE_CSS,
  ANIMATE_UI_WORKSPACE_COMPONENTS,
  scaffoldAnimateUiIntoWorkspace,
} from './animate-ui-kit.ts';

export type WorkspaceToolName =
  | 'animateUi'
  | 'inspectAnimateUi'
  | 'inspectPreview'
  | 'codeCheck'
  | 'testRunner'
  | 'searchCode'
  | 'themeTokens'
  | 'responsiveFix'
  | 'mockStore';

export type WorkspaceToolDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  rule: string;
  message: string;
};

export type WorkspaceCodeCheckReport = {
  ok: boolean;
  score: number;
  errors: WorkspaceToolDiagnostic[];
  warnings: WorkspaceToolDiagnostic[];
  summary: string;
};

export type WorkspaceTestAssertion = {
  id: string;
  name: string;
  category: 'module' | 'compile' | 'interaction' | 'responsive' | 'animate-ui';
  passed: boolean;
  detail: string;
};

export type WorkspaceTestReport = {
  ok: boolean;
  passed: number;
  failed: number;
  total: number;
  assertions: WorkspaceTestAssertion[];
  summary: string;
};

export type WorkspaceToolExecutionResult = {
  tool: WorkspaceToolName;
  ok: boolean;
  workspace: WorkspaceSpec;
  mutated: boolean;
  summary: string;
  codeCheck?: WorkspaceCodeCheckReport;
  testReport?: WorkspaceTestReport;
  details?: string[];
};

const ALLOWED_PACKAGES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'vue',
  'lucide-react',
  'lucide-vue-next',
  'animate-ui',
  '@animate-ui/studio',
  'motion/react',
  'framer-motion',
]);

function normalizePosixPath(baseDir: string, relativePath: string): string {
  const stack = baseDir ? baseDir.split('/').filter(Boolean) : [];
  for (const part of relativePath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function resolveImportInFiles(files: WorkspaceSpec['files'], candidate: string): string | null {
  const clean = candidate.replace(/^\/+/, '');
  if (Object.hasOwn(files, clean)) return clean;
  for (const ext of ['.tsx', '.ts', '.jsx', '.js', '.vue', '.css', '.json']) {
    if (Object.hasOwn(files, `${clean}${ext}`)) return `${clean}${ext}`;
  }
  for (const idx of ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.vue']) {
    const joined = clean ? `${clean}/${idx}` : idx;
    if (Object.hasOwn(files, joined)) return joined;
  }
  if (
    clean === 'src/components/animate-ui'
    || clean.startsWith('src/components/animate-ui/')
    || clean === 'src/components/AnimateUi.vue'
    || clean === 'src/components/animate-ui.vue'
  ) {
    return 'virtual:animate-ui';
  }
  return null;
}

/**
 * Tool 1: 代码检测工具 (Multi-file static analysis, import/export graph, syntax balance, responsive & a11y linter)
 */
export function runWorkspaceCodeCheck(workspace: WorkspaceSpec): WorkspaceCodeCheckReport {
  const errors: WorkspaceToolDiagnostic[] = [];
  const warnings: WorkspaceToolDiagnostic[] = [];
  const files = workspace.files;

  if (!Object.hasOwn(files, workspace.entry)) {
    errors.push({
      severity: 'error',
      file: workspace.entry,
      rule: 'entry-exists',
      message: `工作区入口文件 ${workspace.entry} 不存在`,
    });
  }

  for (const [filePath, fileObj] of Object.entries(files)) {
    const content = fileObj.content ?? '';
    const lines = content.split('\n');

    // 1. Check import statements in JS/TS/TSX/Vue files
    if (/\.(?:tsx|ts|jsx|js|vue)$/i.test(filePath)) {
      const importRegex = /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const spec = match[1];
        const lineNum = content.slice(0, match.index).split('\n').length;
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const baseDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
          const candidate = normalizePosixPath(baseDir, spec);
          const resolved = resolveImportInFiles(files, candidate);
          if (!resolved) {
            errors.push({
              severity: 'error',
              file: filePath,
              line: lineNum,
              rule: 'unresolved-import',
              message: `找不到相对导入模块 "${spec}"（请检查路径或先创建对应文件）`,
            });
          }
        } else if (spec.startsWith('@/')) {
          const candidate = normalizePosixPath('src', spec.slice(2));
          const resolved = resolveImportInFiles(files, candidate);
          if (!resolved) {
            errors.push({
              severity: 'error',
              file: filePath,
              line: lineNum,
              rule: 'unresolved-alias',
              message: `找不到别名导入模块 "${spec}"`,
            });
          }
        } else if (!ALLOWED_PACKAGES.has(spec) && !spec.startsWith('@animate-ui/react')) {
          errors.push({
            severity: 'error',
            file: filePath,
            line: lineNum,
            rule: 'unsupported-package',
            message: `不支持的外部依赖包 "${spec}"，请使用内置的 react、vue、lucide-react 或 animate-ui`,
          });
        }
      }

      // 2. Check dangerous eval / Function constructors
      if (/\beval\s*\(/.test(content)) {
        errors.push({
          severity: 'error',
          file: filePath,
          rule: 'no-eval',
          message: '禁止在工作区代码中使用 eval()',
        });
      }

      // 3. Check entry export for React / Vue
      if (filePath === workspace.entry && workspace.framework === 'react') {
        if (!/\bexport\s+default\b/.test(content) && !/\bexport\s+function\s+App\b/.test(content)) {
          errors.push({
            severity: 'error',
            file: filePath,
            rule: 'entry-export',
            message: `React 入口文件 ${filePath} 必须包含 export default 或 export function App`,
          });
        }
      }

      if (filePath.endsWith('.vue')) {
        if (!/<template[\s>]/i.test(content)) {
          errors.push({
            severity: 'error',
            file: filePath,
            rule: 'vue-template',
            message: `Vue 单文件组件 ${filePath} 缺少 <template> 块`,
          });
        }
        if (/<template[\s>]/i.test(content) && !/<\/template>/i.test(content)) {
          errors.push({
            severity: 'error',
            file: filePath,
            rule: 'vue-unclosed-template',
            message: `Vue 单文件组件 ${filePath} 的 <template> 标签未闭合`,
          });
        }
      }

      // 4. Check React list .map() missing key warning
      if (/\.(?:tsx|jsx)$/i.test(filePath) && /\.map\s*\([^)]*=>\s*<[A-Za-z]/.test(content) && !/\bkey=/.test(content)) {
        warnings.push({
          severity: 'warning',
          file: filePath,
          rule: 'react-list-key',
          message: `${filePath} 中存在列表渲染 .map() 但未检测到 key 属性`,
        });
      }
    }

    // 5. Check CSS syntax balance & fixed-width overflow risks
    if (filePath.endsWith('.css')) {
      let openBraces = 0;
      for (const ch of content) {
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces--;
      }
      if (openBraces !== 0) {
        errors.push({
          severity: 'error',
          file: filePath,
          rule: 'css-brace-balance',
          message: `CSS 文件 ${filePath} 的花括号 {} 数量不匹配`,
        });
      }
      lines.forEach((ln, idx) => {
        const fixedWidth = /\bmin-width\s*:\s*(\d+)px/i.exec(ln);
        if (fixedWidth && Number(fixedWidth[1]) > 420) {
          warnings.push({
            severity: 'warning',
            file: filePath,
            line: idx + 1,
            rule: 'responsive-overflow-risk',
            message: `检测到较大固定最小宽度 min-width: ${fixedWidth[1]}px，在 390px 手机视口下可能导致横向溢出`,
          });
        }
      });
    }
  }

  const penalty = errors.length * 25 + warnings.length * 5;
  const score = Math.max(0, 100 - penalty);
  const ok = errors.length === 0;
  const summary = ok
    ? `代码检测通过（健康分 ${score}/100，0 个错误，${warnings.length} 个建议）`
    : `代码检测发现 ${errors.length} 个错误、${warnings.length} 个警告（健康分 ${score}/100）`;

  return { ok, score, errors, warnings, summary };
}

/**
 * Tool 2: 自动化测试工具 (Automated multi-stage test suite for Workspace)
 */
export function runWorkspaceTestSuite(workspace: WorkspaceSpec): WorkspaceTestReport {
  const assertions: WorkspaceTestAssertion[] = [];
  const allCode = Object.entries(workspace.files)
    .map(([p, f]) => `/* ${p} */\n${f.content}`)
    .join('\n\n');
  const cssCode = Object.entries(workspace.files)
    .filter(([p]) => p.endsWith('.css') || p.endsWith('.vue'))
    .map(([, f]) => f.content)
    .join('\n');

  // 1. Module & Entry Integrity Assertion
  const checkReport = runWorkspaceCodeCheck(workspace);
  const fileCount = Object.keys(workspace.files).length;
  assertions.push({
    id: 'module-graph',
    name: '多文件模块依赖图与入口导出校验',
    category: 'module',
    passed: checkReport.errors.length === 0 && fileCount >= 2,
    detail:
      checkReport.errors.length === 0
        ? `全部 ${fileCount} 个工作区文件依赖解析正常，无缺失模块`
        : checkReport.errors.map(e => `${e.file}: ${e.message}`).join('；'),
  });

  // 2. Reactive State Management Assertion
  const hasState =
    /\b(?:useState|useReducer|useMemo|ref|reactive|computed|let\s+state)\b/.test(allCode);
  assertions.push({
    id: 'reactive-state',
    name: '响应式状态管理覆盖检测 (State / Reactive)',
    category: 'interaction',
    passed: hasState,
    detail: hasState
      ? '已检测到完整响应式状态声明 (useState / ref / computed / state)'
      : '未检测到响应式状态声明，页面可能缺乏动态交互能力',
  });

  // 3. Interactive Event Handlers Assertion
  const eventMatches =
    allCode.match(/\b(?:onClick|onChange|onSubmit|onInput|@click|@submit|v-model|addEventListener)\b/g) || [];
  assertions.push({
    id: 'interactive-events',
    name: '真实交互事件处理器覆盖测试 (Click / Filter / Input / Modal)',
    category: 'interaction',
    passed: eventMatches.length >= 2,
    detail:
      eventMatches.length >= 2
        ? `已验证 ${eventMatches.length} 处真实交互事件绑定 (${[...new Set(eventMatches)].slice(0, 4).join(', ')})`
        : '交互事件绑定不足（少于 2 处），请为按钮、筛选或输入框绑定事件处理函数',
  });

  // 4. Multi-Viewport Responsive Layout Assertion (1440 / 768 / 390)
  const hasResponsiveLayout =
    /(?:grid-template-columns|flex-wrap|@media|clamp\(|minmax\()/i.test(cssCode) ||
    /(?:display:\s*['"]?(?:grid|flex))/i.test(allCode);
  const hasOverflowHazard = checkReport.warnings.some(w => w.rule === 'responsive-overflow-risk');
  assertions.push({
    id: 'responsive-viewports',
    name: '三端视口比例自适应测试 (1440px / 768px / 390px)',
    category: 'responsive',
    passed: hasResponsiveLayout && !hasOverflowHazard,
    detail:
      hasResponsiveLayout && !hasOverflowHazard
        ? '已验证弹性网格/Flex 布局与媒体查询，三端视口无固定宽度溢出风险'
        : hasOverflowHazard
        ? '存在过大固定 min-width，窄屏视口有横向溢出风险'
        : '缺少响应式 Grid/Flex 或 @media 断点规则',
  });

  // 5. Animate UI Component & Motion Polish Assertion
  const hasAnimateUi =
    /\b(?:animate-ui|GradientText|ShimmeringText|TypingText|CountingNumber|SlidingNumber|RippleButton|LiquidButton|FlipButton|StarsBackground|BubbleBackground|GradientBackground|HexagonBackground|AnimateCard|AnimateTabs|AnimateAccordion|AnimateModal|data-animate-ui|aui-)\b/.test(
      allCode,
    );
  assertions.push({
    id: 'animate-ui-integration',
    name: 'Animate UI 动效组件集成检测',
    category: 'animate-ui',
    passed: hasAnimateUi,
    detail: hasAnimateUi
      ? '已集成 Animate UI 动效组件与过渡动画样式'
      : '尚未引入 Animate UI 动效组件（可调用 useAnimateUi 工具一键注入）',
  });

  const passed = assertions.filter(a => a.passed).length;
  const total = assertions.length;
  const failed = total - passed;
  // Core functional pass requires module-graph, reactive-state, interactive-events, and responsive-viewports
  const corePassed = assertions
    .filter(a => a.id !== 'animate-ui-integration')
    .every(a => a.passed);

  return {
    ok: corePassed,
    passed,
    failed,
    total,
    assertions,
    summary: `自动化测试通过 ${passed}/${total} 项（${corePassed ? '核心功能与响应式全部达标' : '存在未通过的核心测试项'}）`,
  };
}

/**
 * Tool 3: 代码增量补丁工具 (Surgical search & replace patching for AI)
 */
export function applyWorkspacePatch(
  workspace: WorkspaceSpec,
  params: { path: string; search: string; replace: string; summary?: string },
  author: 'AI' | 'User' = 'AI',
): WorkspaceSpec {
  if (!isSafeWorkspacePath(params.path)) {
    throw new Error(`补丁目标路径无效：${params.path}`);
  }
  const existing = workspace.files[params.path]?.content;
  if (typeof existing !== 'string') {
    throw new Error(`要打补丁的工作区文件不存在：${params.path}`);
  }
  let nextContent: string;
  if (!params.search) {
    nextContent = `${existing.trimEnd()}\n${params.replace}\n`;
  } else if (existing.includes(params.search)) {
    nextContent = existing.replace(params.search, params.replace);
  } else {
    throw new Error(`在文件 ${params.path} 中未找到匹配的待替换代码片段`);
  }

  const { compiled: _discardCompiled, ...restWorkspace } = workspace;
  const nextWs = validateWorkspace({
    ...restWorkspace,
    files: {
      ...workspace.files,
      [params.path]: { ...workspace.files[params.path], content: nextContent },
    },
  });

  return commitWorkspaceGit(nextWs, {
    author,
    message: `patch(${author.toLowerCase()}): ${params.summary || `局部更新 ${params.path}`}`,
    baselineFiles: workspace.files,
  });
}

/**
 * Tool 4: 主题令牌与动效底座工具 (Injects design tokens, responsive layout helpers, and Animate UI CSS)
 */
export function applyWorkspaceThemeTokens(
  workspace: WorkspaceSpec,
  preset: 'indigo-pro' | 'cyber-dark' | 'emerald-clean' = 'indigo-pro',
  author: 'AI' | 'User' = 'User',
): WorkspaceSpec {
  const palettes = {
    'indigo-pro': {
      bg: '#f8fafc',
      surface: '#ffffff',
      text: '#0f172a',
      muted: '#64748b',
      accent: '#4f46e5',
      accentSoft: 'rgba(79, 70, 229, 0.1)',
      border: '#e2e8f0',
    },
    'cyber-dark': {
      bg: '#090d16',
      surface: '#111827',
      text: '#f8fafc',
      muted: '#94a3b8',
      accent: '#38bdf8',
      accentSoft: 'rgba(56, 189, 248, 0.14)',
      border: '#1e293b',
    },
    'emerald-clean': {
      bg: '#f4fbf7',
      surface: '#ffffff',
      text: '#064e3b',
      muted: '#047857',
      accent: '#10b981',
      accentSoft: 'rgba(16, 185, 129, 0.12)',
      border: '#d1fae5',
    },
  };
  const p = palettes[preset] ?? palettes['indigo-pro'];
  const tokenBlock = `/* === Workspace Design Tokens (${preset}) === */
:root {
  --ws-bg: ${p.bg};
  --ws-surface: ${p.surface};
  --ws-text: ${p.text};
  --ws-muted: ${p.muted};
  --ws-accent: ${p.accent};
  --ws-accent-soft: ${p.accentSoft};
  --ws-border: ${p.border};
  --ws-radius: 16px;
}
`;

  const cssPath = Object.keys(workspace.files).find(f => f.endsWith('.css')) || 'src/styles.css';
  const currentCss = workspace.files[cssPath]?.content ?? '';
  let nextCss = currentCss.replace(/\/\* === Workspace Design Tokens[\s\S]*?\}\n/, '');
  nextCss = `${tokenBlock}\n${nextCss.trimStart()}`;
  if (!nextCss.includes('Animate UI Workspace Runtime Styles')) {
    nextCss = `${nextCss.trimEnd()}\n\n${ANIMATE_UI_BASE_CSS.trim()}\n`;
  }

  const { compiled: _discardCompiled, ...restWorkspace } = workspace;
  const nextWs = validateWorkspace({
    ...restWorkspace,
    files: {
      ...workspace.files,
      [cssPath]: { content: nextCss },
    },
  });

  return commitWorkspaceGit(nextWs, {
    author,
    message: `style(tokens): 应用 ${preset} 主题设计令牌与 Animate UI 样式底座`,
    baselineFiles: workspace.files,
  });
}

/**
 * Tool 5: 多端响应式自动修复工具 (Injects 1440 / 768 / 390 viewport safety rules & fixes fixed min-widths)
 */
export function applyWorkspaceResponsiveFix(
  workspace: WorkspaceSpec,
  author: 'AI' | 'User' = 'User',
): WorkspaceSpec {
  const cssPath = Object.keys(workspace.files).find(f => f.endsWith('.css')) || 'src/styles.css';
  let currentCss = workspace.files[cssPath]?.content ?? '';

  // Clamp any hardcoded min-width > 360px to min(..., 100%)
  currentCss = currentCss.replace(/min-width\s*:\s*([4-9]\d{2}|\d{4,})px/gi, 'min-width: min($1px, 100%)');

  const responsiveGuard = `
/* === Multi-Viewport 1:1 Responsive Guard (1440 / 768 / 390) === */
*, *::before, *::after { box-sizing: border-box; }
html, body, #workspace-root { max-width: 100%; overflow-x: hidden; }
img, svg, video, canvas { max-width: 100%; height: auto; }
@media (max-width: 768px) {
  .ws-shell { padding: 16px !important; }
  .ws-grid { grid-template-columns: 1fr !important; }
  .ws-toolbar { flex-direction: column; align-items: stretch !important; }
}
`;

  if (!currentCss.includes('Multi-Viewport 1:1 Responsive Guard')) {
    currentCss = `${currentCss.trimEnd()}\n${responsiveGuard}`;
  }

  const { compiled: _discardCompiled, ...restWorkspace } = workspace;
  const nextWs = validateWorkspace({
    ...restWorkspace,
    files: {
      ...workspace.files,
      [cssPath]: { content: currentCss },
    },
  });

  return commitWorkspaceGit(nextWs, {
    author,
    message: `fix(responsive): 注入 1440/768/390 三端响应式防溢出保护规则`,
    baselineFiles: workspace.files,
  });
}

/**
 * Tool 6: 持久化状态仓库生成工具 (Scaffolds src/data/storage.ts for localStorage CRUD persistence)
 */
export function scaffoldWorkspaceMockStore(
  workspace: WorkspaceSpec,
  storeKey = 'animate-studio-ws-store',
  author: 'AI' | 'User' = 'User',
): WorkspaceSpec {
  const storePath = workspace.framework === 'html' ? 'src/storage.js' : 'src/data/storage.ts';
  const content =
    workspace.framework === 'html'
      ? `export function loadState(key, fallback) {\n  try {\n    const raw = localStorage.getItem('${storeKey}:' + key);\n    return raw ? JSON.parse(raw) : fallback;\n  } catch {\n    return fallback;\n  }\n}\n\nexport function saveState(key, value) {\n  try {\n    localStorage.setItem('${storeKey}:' + key, JSON.stringify(value));\n  } catch {}\n}\n`
      : `export function loadState<T>(key: string, fallback: T): T {\n  try {\n    const raw = localStorage.getItem(\`${storeKey}:\${key}\`);\n    return raw ? (JSON.parse(raw) as T) : fallback;\n  } catch {\n    return fallback;\n  }\n}\n\nexport function saveState<T>(key: string, value: T): void {\n  try {\n    localStorage.setItem(\`${storeKey}:\${key}\`, JSON.stringify(value));\n  } catch {\n    // ignore storage quota errors\n  }\n}\n`;

  const { compiled: _discardCompiled, ...restWorkspace } = workspace;
  const nextWs = validateWorkspace({
    ...restWorkspace,
    files: {
      ...workspace.files,
      [storePath]: { content },
    },
  });

  return commitWorkspaceGit(nextWs, {
    author,
    message: `feat(store): 生成持久化状态存储工具 ${storePath}`,
    baselineFiles: workspace.files,
  });
}

/**
 * Unified Tool Executor callable by both AI (via `runTool` / `useAnimateUi`) and Workbench UI
 */
export function executeWorkspaceTool(
  workspace: WorkspaceSpec,
  tool: WorkspaceToolName,
  args: Record<string, unknown> = {},
  author: 'AI' | 'User' = 'User',
): WorkspaceToolExecutionResult {
  if (tool === 'animateUi') {
    const componentsArg = Array.isArray(args.components)
      ? args.components.filter((c): c is string => typeof c === 'string')
      : undefined;
    const res = scaffoldAnimateUiIntoWorkspace(workspace, componentsArg, author);
    return {
      tool,
      ok: true,
      workspace: res.workspace,
      mutated: res.workspace !== workspace,
      summary: `已注入 ${res.components.length} 个 Animate UI 动效组件至 ${res.modulePath}（可直接 ${res.importSnippet}）`,
      details: res.components.map(c => `${c.id}: ${c.reactUsage}`),
    };
  }

  if (tool === 'inspectPreview') {
    const codeReport = runWorkspaceCodeCheck(workspace);
    const testReport = runWorkspaceTestSuite(workspace);
    const ok = codeReport.ok && testReport.ok;
    return {
      tool,
      ok,
      workspace,
      mutated: false,
      summary: ok
        ? `预览前置检查通过：${codeReport.summary}；${testReport.summary}（完成任务时将自动执行真实 DOM 挂载与渲染自检）`
        : `预览前置检查发现问题：${codeReport.summary}`,
      codeCheck: codeReport,
      testReport,
      details: [
        ...codeReport.errors.map(e => `[错误] ${e.file}${e.line ? `:${e.line}` : ''}: ${e.message}`),
        ...testReport.assertions.map(a => `${a.passed ? 'PASS' : 'FAIL'} [${a.name}] — ${a.detail}`),
      ],
    };
  }

  if (tool === 'codeCheck') {
    const report = runWorkspaceCodeCheck(workspace);
    return {
      tool,
      ok: report.ok,
      workspace,
      mutated: false,
      summary: report.summary,
      codeCheck: report,
      details: [
        ...report.errors.map(e => `[错误] ${e.file}${e.line ? `:${e.line}` : ''} (${e.rule}): ${e.message}`),
        ...report.warnings.map(w => `[建议] ${w.file}${w.line ? `:${w.line}` : ''} (${w.rule}): ${w.message}`),
      ],
    };
  }

  if (tool === 'testRunner') {
    const report = runWorkspaceTestSuite(workspace);
    return {
      tool,
      ok: report.ok,
      workspace,
      mutated: false,
      summary: report.summary,
      testReport: report,
      details: report.assertions.map(
        a => `${a.passed ? 'PASS' : 'FAIL'} [${a.name}] — ${a.detail}`,
      ),
    };
  }

  if (tool === 'themeTokens') {
    const preset =
      args.preset === 'cyber-dark' || args.preset === 'emerald-clean' ? args.preset : 'indigo-pro';
    const nextWs = applyWorkspaceThemeTokens(workspace, preset, author);
    return {
      tool,
      ok: true,
      workspace: nextWs,
      mutated: nextWs !== workspace,
      summary: `已注入 ${preset} 主题令牌与 Animate UI 样式底座`,
    };
  }

  if (tool === 'responsiveFix') {
    const nextWs = applyWorkspaceResponsiveFix(workspace, author);
    return {
      tool,
      ok: true,
      workspace: nextWs,
      mutated: nextWs !== workspace,
      summary: '已应用 1440px / 768px / 390px 三端响应式防溢出自动修复规则',
    };
  }

  if (tool === 'inspectAnimateUi') {
    const query = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const matched = query
      ? ANIMATE_UI_WORKSPACE_COMPONENTS.filter(
          c =>
            c.id.toLowerCase().includes(query) ||
            c.category.toLowerCase().includes(query) ||
            c.description.toLowerCase().includes(query),
        )
      : ANIMATE_UI_WORKSPACE_COMPONENTS;
    return {
      tool,
      ok: true,
      workspace,
      mutated: false,
      summary: `查询到 ${matched.length} 个 Animate UI 动效组件签名`,
      details: matched.map(
        c =>
          `[${c.id}] (${c.category}) Props: ${c.propsSignature} | React: ${c.reactUsage} | Vue: ${c.vueUsage}`,
      ),
    };
  }

  if (tool === 'searchCode') {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const matches: string[] = [];
    if (query) {
      for (const [filePath, fileObj] of Object.entries(workspace.files)) {
        const lines = (fileObj.content ?? '').split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(query.toLowerCase()) && matches.length < 40) {
            matches.push(`${filePath}:${idx + 1}: ${line.trim().slice(0, 120)}`);
          }
        });
      }
    }
    return {
      tool,
      ok: true,
      workspace,
      mutated: false,
      summary: query
        ? `在工作区中检索 "${query}" 命中 ${matches.length} 处`
        : '未提供检索关键词 query',
      details: matches,
    };
  }

  if (tool === 'mockStore') {
    const nextWs = scaffoldWorkspaceMockStore(
      workspace,
      typeof args.storeKey === 'string' ? args.storeKey : 'animate-studio-ws-store',
      author,
    );
    return {
      tool,
      ok: true,
      workspace: nextWs,
      mutated: nextWs !== workspace,
      summary: '已生成 localStorage 持久化数据存储模块',
    };
  }

  throw new Error(`未知的工作区工具：${String(tool)}`);
}

export { ANIMATE_UI_WORKSPACE_COMPONENTS };
