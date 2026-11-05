/**
 * Multi-file code workspace contract shared by the browser, Node server,
 * Cloudflare worker and tests.
 *
 * Plain JS so Node and the worker load it without a build step; keep
 * `workspace.d.mts` in sync with all exports.
 */

export const workspaceLimits = Object.freeze({
  maxFiles: 32,
  maxFileChars: 120000,
  maxTotalChars: 450000,
  maxCompiledChars: 800000,
  maxPathLength: 120,
  maxGitCommits: 15,
  maxGitSnapshotChars: 85000,
  frameworks: Object.freeze(['react', 'vue', 'html']),
  runtimeVersions: Object.freeze(['2026.1']),
});

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor', 'node_modules', '.git']);
const allowedExtensions = /\.(?:tsx|ts|jsx|js|vue|css|html|json|svg|md)$/i;
const safeSegment = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;

function plain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function fail(message, path) {
  const error = new Error(message);
  if (path !== undefined) error.path = path;
  throw error;
}

function record(value, allowed, path) {
  if (!plain(value)) fail(`${path} 必须是普通对象`, path);
  for (const key of Object.keys(value)) {
    if (forbiddenKeys.has(key) || !allowed.includes(key)) {
      fail(`${path} 包含不支持的属性 ${key}`, `${path}.${key}`);
    }
  }
}

export function isSafeWorkspacePath(filePath) {
  if (typeof filePath !== 'string' || !filePath || filePath.length > workspaceLimits.maxPathLength) return false;
  if (filePath.startsWith('/') || filePath.endsWith('/') || filePath.includes('\\') || filePath.includes('//')) return false;
  if (/[\s\u0000-\u001f\u007f]/u.test(filePath)) return false;
  if (!allowedExtensions.test(filePath)) return false;
  const parts = filePath.split('/');
  if (parts.length > 6) return false;
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || forbiddenKeys.has(part) || !safeSegment.test(part)) return false;
  }
  return true;
}

export function validateWorkspace(workspace, path = 'page.workspace') {
  record(workspace, ['version', 'runtimeVersion', 'framework', 'entry', 'files', 'compiled', 'git'], path);
  if (workspace.runtimeVersion === undefined) {
    workspace = { ...workspace, runtimeVersion: '2026.1' };
  }
  for (const key of ['version', 'runtimeVersion', 'framework', 'entry', 'files']) {
    if (!Object.hasOwn(workspace, key)) fail(`${path}.${key} 不能为空`, `${path}.${key}`);
  }
  if (workspace.version !== 1) fail(`${path}.version 仅支持版本 1`, `${path}.version`);
  if (!workspaceLimits.runtimeVersions.includes(workspace.runtimeVersion)) {
    fail(`${path}.runtimeVersion 不受支持`, `${path}.runtimeVersion`);
  }
  if (!workspaceLimits.frameworks.includes(workspace.framework)) {
    fail(`${path}.framework 必须是 react、vue 或 html`, `${path}.framework`);
  }
  if (!isSafeWorkspacePath(workspace.entry)) {
    fail(`${path}.entry 入口文件路径无效`, `${path}.entry`);
  }
  if (!plain(workspace.files)) fail(`${path}.files 必须是普通对象`, `${path}.files`);
  const entries = Object.entries(workspace.files);
  if (entries.length < 1 || entries.length > workspaceLimits.maxFiles) {
    fail(`工作区必须包含 1–${workspaceLimits.maxFiles} 个文件`, `${path}.files`);
  }
  let totalChars = 0;
  for (const [filePath, fileObj] of entries) {
    if (forbiddenKeys.has(filePath) || !isSafeWorkspacePath(filePath)) {
      fail(`工作区文件路径无效：${filePath}`, `${path}.files.${filePath}`);
    }
    record(fileObj, ['content', 'language'], `${path}.files.${filePath}`);
    if (typeof fileObj.content !== 'string' || fileObj.content.length > workspaceLimits.maxFileChars) {
      fail(`文件 ${filePath} 内容必须是长度不超过 ${workspaceLimits.maxFileChars} 的文本`, `${path}.files.${filePath}.content`);
    }
    if (fileObj.language !== undefined && (typeof fileObj.language !== 'string' || fileObj.language.length > 32)) {
      fail(`文件 ${filePath} 语言标识无效`, `${path}.files.${filePath}.language`);
    }
    totalChars += fileObj.content.length;
  }
  if (totalChars > workspaceLimits.maxTotalChars) {
    fail(`工作区源码总大小不能超过 ${workspaceLimits.maxTotalChars} 字符`, `${path}.files`);
  }
  if (!Object.hasOwn(workspace.files, workspace.entry)) {
    fail(`工作区入口文件 ${workspace.entry} 不存在`, `${path}.entry`);
  }
  if (workspace.compiled !== undefined) {
    record(workspace.compiled, ['html', 'js', 'css', 'compiledAt'], `${path}.compiled`);
    for (const field of ['html', 'js', 'css']) {
      if (typeof workspace.compiled[field] !== 'string' || workspace.compiled[field].length > workspaceLimits.maxCompiledChars) {
        fail(`${path}.compiled.${field} 无效或超出大小上限`, `${path}.compiled.${field}`);
      }
    }
    if (workspace.compiled.compiledAt !== undefined && (typeof workspace.compiled.compiledAt !== 'string' || workspace.compiled.compiledAt.length > 64)) {
      fail(`${path}.compiled.compiledAt 格式无效`, `${path}.compiled.compiledAt`);
    }
  }
  if (workspace.git !== undefined) {
    record(workspace.git, ['branch', 'head', 'commits'], `${path}.git`);
    if (typeof workspace.git.branch !== 'string' || !workspace.git.branch || workspace.git.branch.length > 40) {
      fail(`${path}.git.branch 无效`, `${path}.git.branch`);
    }
    if (typeof workspace.git.head !== 'string' || workspace.git.head.length > 40) {
      fail(`${path}.git.head 无效`, `${path}.git.head`);
    }
    if (!Array.isArray(workspace.git.commits) || workspace.git.commits.length > workspaceLimits.maxGitCommits) {
      fail(`${path}.git.commits 超出上限`, `${path}.git.commits`);
    }
    for (let i = 0; i < workspace.git.commits.length; i++) {
      const c = workspace.git.commits[i];
      const cp = `${path}.git.commits[${i}]`;
      record(c, ['hash', 'parentHash', 'branch', 'message', 'author', 'timestamp', 'changes', 'files'], cp);
      if (typeof c.hash !== 'string' || !c.hash || c.hash.length > 40) fail(`${cp}.hash 无效`, `${cp}.hash`);
      if (c.parentHash !== null && c.parentHash !== undefined && (typeof c.parentHash !== 'string' || c.parentHash.length > 40)) {
        fail(`${cp}.parentHash 无效`, `${cp}.parentHash`);
      }
      if (typeof c.branch !== 'string' || !c.branch || c.branch.length > 40) fail(`${cp}.branch 无效`, `${cp}.branch`);
      if (typeof c.message !== 'string' || !c.message || c.message.length > 300) fail(`${cp}.message 无效`, `${cp}.message`);
      if (!['AI', 'User', 'System'].includes(c.author)) fail(`${cp}.author 无效`, `${cp}.author`);
      if (typeof c.timestamp !== 'number' || !Number.isFinite(c.timestamp)) fail(`${cp}.timestamp 无效`, `${cp}.timestamp`);
      if (!Array.isArray(c.changes) || c.changes.length > workspaceLimits.maxFiles * 2) fail(`${cp}.changes 无效`, `${cp}.changes`);
      for (const ch of c.changes) {
        record(ch, ['path', 'status', 'additions', 'deletions'], `${cp}.changes`);
        if (typeof ch.path !== 'string' || !isSafeWorkspacePath(ch.path)) fail(`${cp}.changes.path 无效`, `${cp}.changes`);
        if (!['A', 'M', 'D'].includes(ch.status)) fail(`${cp}.changes.status 无效`, `${cp}.changes`);
        if (typeof ch.additions !== 'number' || typeof ch.deletions !== 'number') fail(`${cp}.changes 行数无效`, `${cp}.changes`);
      }
      if (c.files !== undefined) {
        if (!plain(c.files)) fail(`${cp}.files 必须是普通对象`, `${cp}.files`);
        for (const [fp, content] of Object.entries(c.files)) {
          if (!isSafeWorkspacePath(fp) || typeof content !== 'string' || content.length > workspaceLimits.maxFileChars) {
            fail(`${cp}.files.${fp} 无效`, `${cp}.files.${fp}`);
          }
        }
      }
    }
  }
  return workspace;
}

function shortGitHash(seed) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 7);
  return hex;
}

function extractFileContentMap(files) {
  const out = {};
  if (!files || typeof files !== 'object') return out;
  for (const [filePath, value] of Object.entries(files)) {
    if (typeof value === 'string') out[filePath] = value;
    else if (value && typeof value.content === 'string') out[filePath] = value.content;
  }
  return out;
}

export function computeLineDiffStats(beforeText = '', afterText = '') {
  if (beforeText === afterText) return { additions: 0, deletions: 0 };
  const beforeLines = beforeText ? beforeText.split('\n') : [];
  const afterLines = afterText ? afterText.split('\n') : [];
  if (beforeLines.length === 0) return { additions: afterLines.length, deletions: 0 };
  if (afterLines.length === 0) return { additions: 0, deletions: beforeLines.length };
  let start = 0;
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) {
    start++;
  }
  let endBefore = beforeLines.length - 1;
  let endAfter = afterLines.length - 1;
  while (endBefore >= start && endAfter >= start && beforeLines[endBefore] === afterLines[endAfter]) {
    endBefore--;
    endAfter--;
  }
  const midBefore = beforeLines.slice(start, endBefore + 1);
  const midAfter = afterLines.slice(start, endAfter + 1);
  if (midBefore.length * midAfter.length > 250000) {
    return { additions: midAfter.length, deletions: midBefore.length };
  }
  const dp = new Uint16Array((midBefore.length + 1) * (midAfter.length + 1));
  const cols = midAfter.length + 1;
  for (let i = 1; i <= midBefore.length; i++) {
    for (let j = 1; j <= midAfter.length; j++) {
      if (midBefore[i - 1] === midAfter[j - 1]) {
        dp[i * cols + j] = dp[(i - 1) * cols + (j - 1)] + 1;
      } else {
        const up = dp[(i - 1) * cols + j];
        const left = dp[i * cols + (j - 1)];
        dp[i * cols + j] = up >= left ? up : left;
      }
    }
  }
  const lcs = dp[midBefore.length * cols + midAfter.length];
  return {
    additions: midAfter.length - lcs,
    deletions: midBefore.length - lcs,
  };
}

export function computeWorkspaceChanges(beforeFiles, afterFiles) {
  const beforeMap = extractFileContentMap(beforeFiles);
  const afterMap = extractFileContentMap(afterFiles);
  const allPaths = [...new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])].sort();
  const changes = [];
  for (const filePath of allPaths) {
    const hasBefore = Object.hasOwn(beforeMap, filePath);
    const hasAfter = Object.hasOwn(afterMap, filePath);
    if (!hasBefore && hasAfter) {
      const stats = computeLineDiffStats('', afterMap[filePath]);
      changes.push({ path: filePath, status: 'A', additions: stats.additions, deletions: 0 });
    } else if (hasBefore && !hasAfter) {
      const stats = computeLineDiffStats(beforeMap[filePath], '');
      changes.push({ path: filePath, status: 'D', additions: 0, deletions: stats.deletions });
    } else if (beforeMap[filePath] !== afterMap[filePath]) {
      const stats = computeLineDiffStats(beforeMap[filePath], afterMap[filePath]);
      changes.push({ path: filePath, status: 'M', additions: stats.additions, deletions: stats.deletions });
    }
  }
  return changes;
}

export function commitWorkspaceGit(workspace, options = {}) {
  const currentFiles = extractFileContentMap(workspace.files);
  const prevGit = workspace.git;
  const headCommit = prevGit?.commits?.[0];
  const baselineMap = options.baselineFiles
    ? extractFileContentMap(options.baselineFiles)
    : headCommit?.files
      ? extractFileContentMap(headCommit.files)
      : {};
  const changes = computeWorkspaceChanges(baselineMap, currentFiles);
  if (changes.length === 0 && headCommit) {
    return workspace;
  }
  const timestamp = typeof options.timestamp === 'number' ? options.timestamp : Date.now();
  const author = ['AI', 'User', 'System'].includes(options.author) ? options.author : 'User';
  const branch = prevGit?.branch || 'main';
  const parentHash = headCommit?.hash ?? null;
  const message = String(options.message || (changes.length === 1 ? `更新 ${changes[0].path}` : `更新 ${changes.length} 个工作区文件`)).slice(0, 280);
  const seed = `${parentHash || 'root'}:${timestamp}:${author}:${message}:${Object.entries(currentFiles).map(([k, v]) => `${k}=${v.length}`).join(',')}`;
  const hash = shortGitHash(seed);

  const newCommit = {
    hash,
    parentHash,
    branch,
    message,
    author,
    timestamp,
    changes,
    files: currentFiles,
  };

  const rawCommits = [newCommit, ...(prevGit?.commits ?? [])].slice(0, workspaceLimits.maxGitCommits);
  let snapshotBudget = workspaceLimits.maxGitSnapshotChars;
  const trimmedCommits = rawCommits.map((commit, index) => {
    if (!commit.files) return commit;
    const size = Object.values(commit.files).reduce((sum, text) => sum + text.length, 0);
    if (index === 0 || (index < 6 && size <= snapshotBudget)) {
      snapshotBudget = Math.max(0, snapshotBudget - size);
      return commit;
    }
    const { files: _dropped, ...rest } = commit;
    return rest;
  });

  return {
    ...workspace,
    git: {
      branch,
      head: hash,
      commits: trimmedCommits,
    },
  };
}

const defaultStyles = `:root {
  --ws-bg: #f8fafc;
  --ws-surface: #ffffff;
  --ws-surface-muted: #f1f5f9;
  --ws-text: #0f172a;
  --ws-muted: #475569;
  --ws-border: #e2e8f0;
  --ws-accent: #0f766e;
  --ws-accent-hover: #115e59;
  --ws-accent-soft: #ccfbf1;
  --ws-radius: 14px;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
  background: var(--ws-bg);
  color: var(--ws-text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.ws-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.ws-container {
  width: min(1240px, 100% - 32px);
  margin: 0 auto;
}

.ws-navbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--ws-border);
}

.ws-navbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 68px;
  flex-wrap: wrap;
  padding: 10px 0;
}

.ws-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 1.125rem;
  color: var(--ws-text);
  text-decoration: none;
}

.ws-brand-badge {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--ws-accent);
  color: #fff;
  display: inline-grid;
  place-items: center;
  font-weight: 700;
}

.ws-nav-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ws-hero {
  padding: clamp(32px, 5vw, 64px) 0 28px;
}

.ws-hero-card {
  background: linear-gradient(135deg, #ffffff 0%, #f0fdfa 100%);
  border: 1px solid var(--ws-border);
  border-radius: calc(var(--ws-radius) + 4px);
  padding: clamp(24px, 4vw, 44px);
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 28px;
  align-items: center;
}

.ws-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--ws-accent-soft);
  color: var(--ws-accent);
  font-size: 0.8125rem;
  font-weight: 600;
}

.ws-hero h1 {
  margin: 14px 0 12px;
  font-size: clamp(1.75rem, 3.4vw, 2.75rem);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.ws-hero p {
  margin: 0 0 20px;
  color: var(--ws-muted);
  font-size: clamp(0.95rem, 1.4vw, 1.08rem);
}

.ws-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ws-stat-box {
  background: var(--ws-surface);
  border: 1px solid var(--ws-border);
  border-radius: var(--ws-radius);
  padding: 16px;
}

.ws-stat-box strong {
  display: block;
  font-size: 1.5rem;
  color: var(--ws-accent);
}

.ws-stat-box span {
  font-size: 0.825rem;
  color: var(--ws-muted);
}

.ws-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin: 16px 0 22px;
}

.ws-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ws-tab, .ws-btn {
  border: 1px solid var(--ws-border);
  background: var(--ws-surface);
  color: var(--ws-text);
  padding: 8px 15px;
  border-radius: 10px;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
}

.ws-tab.active, .ws-btn-primary {
  background: var(--ws-accent);
  border-color: var(--ws-accent);
  color: #ffffff;
}

.ws-btn-primary:hover {
  background: var(--ws-accent-hover);
}

.ws-search {
  flex: 1 1 240px;
  max-width: 340px;
  padding: 9px 14px;
  border: 1px solid var(--ws-border);
  border-radius: 10px;
  font: inherit;
  font-size: 0.875rem;
  background: var(--ws-surface);
}

.ws-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 18px;
  padding-bottom: 48px;
}

.ws-card {
  background: var(--ws-surface);
  border: 1px solid var(--ws-border);
  border-radius: var(--ws-radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.ws-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.ws-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ws-tag {
  font-size: 0.75rem;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--ws-surface-muted);
  color: var(--ws-muted);
  font-weight: 500;
}

.ws-card h3 {
  margin: 8px 0 6px;
  font-size: 1.1rem;
}

.ws-card p {
  margin: 0;
  color: var(--ws-muted);
  font-size: 0.88rem;
}

.ws-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--ws-border);
}

.ws-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.48);
  display: grid;
  place-items: center;
  padding: 16px;
  z-index: 50;
}

.ws-modal {
  background: var(--ws-surface);
  border-radius: calc(var(--ws-radius) + 4px);
  width: min(520px, 100%);
  padding: 24px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
}

.ws-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  background: #0f172a;
  color: #fff;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 0.875rem;
  z-index: 60;
}

.ws-footer {
  margin-top: auto;
  border-top: 1px solid var(--ws-border);
  padding: 24px 0;
  color: var(--ws-muted);
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .ws-hero-card {
    grid-template-columns: 1fr;
  }
  .ws-search {
    max-width: 100%;
  }
}
`;

export function createDefaultWorkspace(framework = 'react', title = '智绘产品工作台') {
  const safeTitle = String(title || '智绘产品工作台').slice(0, 60);
  if (framework === 'vue') {
    return commitWorkspaceGit({
      version: 1,
      runtimeVersion: '2026.1',
      framework: 'vue',
      entry: 'src/App.vue',
      files: {
        'src/data/mockData.ts': {
          content: `export interface ProductItem {
  id: string;
  title: string;
  category: string;
  metrics: string;
  summary: string;
  detail: string;
}

export const categories = ['全部', '智能工作流', '数据看板', '协同套件'];

export const initialItems: ProductItem[] = [
  {
    id: 'flow-engine',
    title: '自动化编排引擎',
    category: '智能工作流',
    metrics: '提效 3.2x',
    summary: '支持多分支条件触发与实时节点监控，零配置打通业务上下游。',
    detail: '提供可视化沙箱调试、错误自动重试与秒级回滚机制，已在生产环境稳定承载日均百万级任务调度。'
  },
  {
    id: 'realtime-bi',
    title: '全景实时经营看板',
    category: '数据看板',
    metrics: '延迟 < 80ms',
    summary: '多维指标下钻与异常波动预警，桌面与移动端自适应呈现。',
    detail: '内置同比环比分析、转化漏斗追踪与一键导出简报，帮助业务团队随时掌握核心增长指标。'
  },
  {
    id: 'team-hub',
    title: '跨部门评审工作空间',
    category: '协同套件',
    metrics: '99.9% 在线',
    summary: '集需求文档、交互原型、版本比对与上线检查单于一体。',
    detail: '支持多角色权限细粒度控制、评论锚点追踪与变更订阅通知，消除跨团队沟通信息差。'
  }
];
`,
        },
        'src/styles.css': { content: defaultStyles },
        'src/App.vue': {
          content: `<script setup>
import { ref, computed } from 'vue';
import { categories, initialItems } from './data/mockData';
import './styles.css';

const pageTitle = ref(${JSON.stringify(safeTitle)});
const activeCategory = ref('全部');
const query = ref('');
const items = ref([...initialItems]);
const starredIds = ref(['flow-engine']);
const activeItem = ref(null);
const newTitle = ref('');
const newSummary = ref('');
const toast = ref('');

const filteredItems = computed(() => {
  return items.value.filter(item => {
    const matchCategory = activeCategory.value === '全部' || item.category === activeCategory.value;
    const q = query.value.trim().toLowerCase();
    const matchQuery = !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q);
    return matchCategory && matchQuery;
  });
});

function toggleStar(id) {
  if (starredIds.value.includes(id)) {
    starredIds.value = starredIds.value.filter(item => item !== id);
    showToast('已取消收藏');
  } else {
    starredIds.value = [...starredIds.value, id];
    showToast('已加入重点关注');
  }
}

function addItem() {
  if (!newTitle.value.trim()) return;
  const created = {
    id: 'item-' + Date.now(),
    title: newTitle.value.trim(),
    category: activeCategory.value === '全部' ? '智能工作流' : activeCategory.value,
    metrics: '新上线',
    summary: newSummary.value.trim() || '新创建的业务模块，支持实时交互与详情查看。',
    detail: newSummary.value.trim() || '通过工作台快速创建的模块条目。'
  };
  items.value = [created, ...items.value];
  newTitle.value = '';
  newSummary.value = '';
  showToast('已新增模块：' + created.title);
}

function showToast(msg) {
  toast.value = msg;
  setTimeout(() => {
    if (toast.value === msg) toast.value = '';
  }, 2400);
}
</script>

<template>
  <div class="ws-shell">
    <header class="ws-navbar">
      <div class="ws-container ws-navbar-inner">
        <a class="ws-brand" href="#top" @click.prevent>
          <span class="ws-brand-badge">A</span>
          <span>{{ pageTitle }}</span>
        </a>
        <div class="ws-nav-actions">
          <span class="ws-tag">已收藏 {{ starredIds.length }} 项</span>
          <button type="button" class="ws-btn ws-btn-primary" @click="activeItem = items[0]">快速体验</button>
        </div>
      </div>
    </header>

    <main class="ws-container">
      <section class="ws-hero">
        <div class="ws-hero-card">
          <div>
            <span class="ws-kicker">多文件响应式工作区</span>
            <h1>{{ pageTitle }}</h1>
            <p>支持按分类筛选、关键词实时检索、收藏状态切换、详情弹窗与快速新建条目，在桌面与手机浏览器均保持原生 1:1 比例。</p>
            <div class="ws-nav-actions">
              <input v-model="newTitle" class="ws-search" placeholder="输入新模块名称…" aria-label="新模块名称" />
              <button type="button" class="ws-btn ws-btn-primary" @click="addItem">新建模块</button>
            </div>
          </div>
          <div class="ws-stats-grid">
            <div class="ws-stat-box">
              <strong>{{ items.length }}</strong>
              <span>在线业务模块</span>
            </div>
            <div class="ws-stat-box">
              <strong>{{ starredIds.length }}</strong>
              <span>星标重点模块</span>
            </div>
          </div>
        </div>
      </section>

      <section class="ws-toolbar" aria-label="筛选工具栏">
        <div class="ws-tabs" role="tablist">
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            class="ws-tab"
            :class="{ active: activeCategory === cat }"
            @click="activeCategory = cat"
          >
            {{ cat }}
          </button>
        </div>
        <input v-model="query" type="search" class="ws-search" placeholder="搜索模块名称或描述…" aria-label="搜索模块" />
      </section>

      <section class="ws-grid" aria-label="模块列表">
        <article v-for="item in filteredItems" :key="item.id" class="ws-card" data-testid="workspace-card">
          <div>
            <div class="ws-card-header">
              <span class="ws-tag">{{ item.category }}</span>
              <span class="ws-tag">{{ item.metrics }}</span>
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.summary }}</p>
          </div>
          <div class="ws-card-footer">
            <button type="button" class="ws-btn" @click="toggleStar(item.id)">
              {{ starredIds.includes(item.id) ? '★ 已收藏' : '☆ 收藏' }}
            </button>
            <button type="button" class="ws-btn ws-btn-primary" @click="activeItem = item">查看详情</button>
          </div>
        </article>
      </section>
    </main>

    <div v-if="activeItem" class="ws-modal-backdrop" role="dialog" aria-modal="true" @click.self="activeItem = null">
      <div class="ws-modal">
        <div class="ws-card-header">
          <span class="ws-kicker">{{ activeItem.category }}</span>
          <button type="button" class="ws-btn" @click="activeItem = null">关闭</button>
        </div>
        <h2>{{ activeItem.title }}</h2>
        <p>{{ activeItem.detail }}</p>
        <div class="ws-card-footer" style="margin-top: 20px">
          <span>核心指标：<strong>{{ activeItem.metrics }}</strong></span>
          <button type="button" class="ws-btn ws-btn-primary" @click="toggleStar(activeItem.id); activeItem = null">
            {{ starredIds.includes(activeItem.id) ? '移除收藏' : '立即收藏' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="toast" class="ws-toast" role="status">{{ toast }}</div>

    <footer class="ws-footer">
      <div class="ws-container">© 2026 {{ pageTitle }} · 原生响应式多文件工作区</div>
    </footer>
  </div>
</template>

<style scoped>
.ws-shell {
  position: relative;
}
</style>
`,
        },
      },
    }, { message: 'init: 初始化 Vue 3 多文件代码工作区', author: 'System' });
  }

  if (framework === 'html') {
    return commitWorkspaceGit({
      version: 1,
      runtimeVersion: '2026.1',
      framework: 'html',
      entry: 'index.html',
      files: {
        'src/styles.css': { content: defaultStyles },
        'src/app.js': {
          content: `const state = {
  category: '全部',
  query: '',
  starred: new Set(['flow-engine']),
  items: [
    { id: 'flow-engine', title: '自动化编排引擎', category: '智能工作流', metrics: '提效 3.2x', summary: '支持多分支条件触发与实时节点监控，零配置打通业务上下游。', detail: '提供可视化沙箱调试、错误自动重试与秒级回滚机制。' },
    { id: 'realtime-bi', title: '全景实时经营看板', category: '数据看板', metrics: '延迟 < 80ms', summary: '多维指标下钻与异常波动预警，桌面与移动端自适应呈现。', detail: '内置同比环比分析、转化漏斗追踪与一键导出简报。' },
    { id: 'team-hub', title: '跨部门评审工作空间', category: '协同套件', metrics: '99.9% 在线', summary: '集需求文档、交互原型、版本比对与上线检查单于一体。', detail: '支持多角色权限细粒度控制、评论锚点追踪与变更订阅通知。' }
  ]
};

export function mountWorkspaceApp(root) {
  function render() {
    const filtered = state.items.filter(item => {
      const catOk = state.category === '全部' || item.category === state.category;
      const q = state.query.trim().toLowerCase();
      const qOk = !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q);
      return catOk && qOk;
    });
    root.querySelector('[data-role="count-total"]').textContent = String(state.items.length);
    root.querySelector('[data-role="count-starred"]').textContent = String(state.starred.size);
    root.querySelectorAll('[data-category]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === state.category);
    });
    const grid = root.querySelector('[data-role="grid"]');
    grid.innerHTML = filtered.map(item => \`
      <article class="ws-card" data-testid="workspace-card">
        <div>
          <div class="ws-card-header">
            <span class="ws-tag">\${item.category}</span>
            <span class="ws-tag">\${item.metrics}</span>
          </div>
          <h3>\${item.title}</h3>
          <p>\${item.summary}</p>
        </div>
        <div class="ws-card-footer">
          <button type="button" class="ws-btn" data-star="\${item.id}">\${state.starred.has(item.id) ? '★ 已收藏' : '☆ 收藏'}</button>
          <button type="button" class="ws-btn ws-btn-primary" data-detail="\${item.id}">查看详情</button>
        </div>
      </article>
    \`).join('');
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.category) {
      state.category = target.dataset.category;
      render();
    } else if (target.dataset.star) {
      const id = target.dataset.star;
      if (state.starred.has(id)) state.starred.delete(id);
      else state.starred.add(id);
      render();
    } else if (target.dataset.detail) {
      const item = state.items.find(entry => entry.id === target.dataset.detail);
      const modal = root.querySelector('[data-role="modal"]');
      if (item && modal) {
        modal.hidden = false;
        modal.querySelector('[data-role="modal-title"]').textContent = item.title;
        modal.querySelector('[data-role="modal-detail"]').textContent = item.detail;
      }
    } else if (target.dataset.closeModal !== undefined) {
      root.querySelector('[data-role="modal"]').hidden = true;
    }
  });

  const search = root.querySelector('[data-role="search"]');
  search?.addEventListener('input', event => {
    state.query = event.target.value;
    render();
  });

  render();
}
`,
        },
        'index.html': {
          content: `<div class="ws-shell" id="ws-app-root">
  <header class="ws-navbar">
    <div class="ws-container ws-navbar-inner">
      <a class="ws-brand" href="#top"><span class="ws-brand-badge">A</span><span>${safeTitle}</span></a>
      <div class="ws-nav-actions"><span class="ws-tag">响应式多文件工程</span></div>
    </div>
  </header>
  <main class="ws-container">
    <section class="ws-hero">
      <div class="ws-hero-card">
        <div>
          <span class="ws-kicker">多文件响应式工作区</span>
          <h1>${safeTitle}</h1>
          <p>支持按分类筛选、关键词实时检索、收藏状态切换与详情弹窗。</p>
        </div>
        <div class="ws-stats-grid">
          <div class="ws-stat-box"><strong data-role="count-total">3</strong><span>在线业务模块</span></div>
          <div class="ws-stat-box"><strong data-role="count-starred">1</strong><span>星标重点模块</span></div>
        </div>
      </div>
    </section>
    <section class="ws-toolbar">
      <div class="ws-tabs">
        <button type="button" class="ws-tab active" data-category="全部">全部</button>
        <button type="button" class="ws-tab" data-category="智能工作流">智能工作流</button>
        <button type="button" class="ws-tab" data-category="数据看板">数据看板</button>
        <button type="button" class="ws-tab" data-category="协同套件">协同套件</button>
      </div>
      <input type="search" class="ws-search" data-role="search" placeholder="搜索模块名称或描述…" aria-label="搜索模块" />
    </section>
    <section class="ws-grid" data-role="grid"></section>
  </main>
  <div class="ws-modal-backdrop" data-role="modal" hidden>
    <div class="ws-modal">
      <div class="ws-card-header"><span class="ws-kicker">模块详情</span><button type="button" class="ws-btn" data-close-modal>关闭</button></div>
      <h2 data-role="modal-title"></h2>
      <p data-role="modal-detail"></p>
    </div>
  </div>
  <footer class="ws-footer"><div class="ws-container">© 2026 ${safeTitle}</div></footer>
</div>
`,
        },
      },
    }, { message: 'init: 初始化 HTML 多文件代码工作区', author: 'System' });
  }

  return commitWorkspaceGit({
    version: 1,
    runtimeVersion: '2026.1',
    framework: 'react',
    entry: 'src/App.tsx',
    files: {
      'src/data/mockData.ts': {
        content: `export interface ProductItem {
  id: string;
  title: string;
  category: string;
  metrics: string;
  summary: string;
  detail: string;
}

export const categories = ['全部', '智能工作流', '数据看板', '协同套件'] as const;

export const initialItems: ProductItem[] = [
  {
    id: 'flow-engine',
    title: '自动化编排引擎',
    category: '智能工作流',
    metrics: '提效 3.2x',
    summary: '支持多分支条件触发与实时节点监控，零配置打通业务上下游。',
    detail: '提供可视化沙箱调试、错误自动重试与秒级回滚机制，已在生产环境稳定承载日均百万级任务调度。'
  },
  {
    id: 'realtime-bi',
    title: '全景实时经营看板',
    category: '数据看板',
    metrics: '延迟 < 80ms',
    summary: '多维指标下钻与异常波动预警，桌面与移动端自适应呈现。',
    detail: '内置同比环比分析、转化漏斗追踪与一键导出简报，帮助业务团队随时掌握核心增长指标。'
  },
  {
    id: 'team-hub',
    title: '跨部门评审工作空间',
    category: '协同套件',
    metrics: '99.9% 在线',
    summary: '集需求文档、交互原型、版本比对与上线检查单于一体。',
    detail: '支持多角色权限细粒度控制、评论锚点追踪与变更订阅通知，消除跨团队沟通信息差。'
  }
];
`,
      },
      'src/components/Navbar.tsx': {
        content: `import React from 'react';

export function Navbar({
  title,
  starredCount,
  onQuickStart,
}: {
  title: string;
  starredCount: number;
  onQuickStart: () => void;
}) {
  return (
    <header className="ws-navbar">
      <div className="ws-container ws-navbar-inner">
        <a className="ws-brand" href="#top" onClick={e => e.preventDefault()}>
          <span className="ws-brand-badge">A</span>
          <span>{title}</span>
        </a>
        <div className="ws-nav-actions">
          <span className="ws-tag" data-testid="starred-badge">已收藏 {starredCount} 项</span>
          <button type="button" className="ws-btn ws-btn-primary" onClick={onQuickStart}>
            快速体验
          </button>
        </div>
      </div>
    </header>
  );
}
`,
      },
      'src/components/DetailModal.tsx': {
        content: `import React from 'react';
import type { ProductItem } from '../data/mockData';

export function DetailModal({
  item,
  starred,
  onToggleStar,
  onClose,
}: {
  item: ProductItem | null;
  starred: boolean;
  onToggleStar: (id: string) => void;
  onClose: () => void;
}) {
  if (!item) return null;
  return (
    <div className="ws-modal-backdrop" role="dialog" aria-modal="true" data-ws-modal onClick={onClose}>
      <div className="ws-modal" onClick={e => e.stopPropagation()}>
        <div className="ws-card-header">
          <span className="ws-kicker">{item.category}</span>
          <button type="button" className="ws-btn" data-ws-modal-close onClick={onClose}>关闭</button>
        </div>
        <h2>{item.title}</h2>
        <p>{item.detail}</p>
        <div className="ws-card-footer" style={{ marginTop: 20 }}>
          <span>核心指标：<strong>{item.metrics}</strong></span>
          <button
            type="button"
            className="ws-btn ws-btn-primary"
            onClick={() => {
              onToggleStar(item.id);
              onClose();
            }}
          >
            {starred ? '移除收藏' : '立即收藏'}
          </button>
        </div>
      </div>
    </div>
  );
}
`,
      },
      'src/styles.css': { content: defaultStyles },
      'src/App.tsx': {
        content: `import React, { useMemo, useState } from 'react';
import { categories, initialItems, type ProductItem } from './data/mockData';
import { Navbar } from './components/Navbar';
import { DetailModal } from './components/DetailModal';
import './styles.css';

export default function App() {
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ProductItem[]>(initialItems);
  const [starredIds, setStarredIds] = useState<string[]>(['flow-engine']);
  const [activeItem, setActiveItem] = useState<ProductItem | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [toast, setToast] = useState('');

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCategory = activeCategory === '全部' || item.category === activeCategory;
      const q = query.trim().toLowerCase();
      const matchQuery = !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q);
      return matchCategory && matchQuery;
    });
  }, [items, activeCategory, query]);

  function showNotice(message: string) {
    setToast(message);
    window.setTimeout(() => {
      setToast(current => (current === message ? '' : current));
    }, 2400);
  }

  function toggleStar(id: string) {
    setStarredIds(current => {
      if (current.includes(id)) {
        showNotice('已取消收藏');
        return current.filter(item => item !== id);
      }
      showNotice('已加入重点关注');
      return [...current, id];
    });
  }

  function handleCreate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!newTitle.trim()) return;
    const created: ProductItem = {
      id: 'item-' + Date.now(),
      title: newTitle.trim(),
      category: activeCategory === '全部' ? '智能工作流' : activeCategory,
      metrics: '新上线',
      summary: '新创建的业务模块，支持实时交互与详情查看。',
      detail: '通过工作台快速创建的模块条目，已在当前会话中实时生效。',
    };
    setItems(current => [created, ...current]);
    setNewTitle('');
    showNotice('已新增模块：' + created.title);
  }

  return (
    <div className="ws-shell">
      <Navbar
        title={${JSON.stringify(safeTitle)}}
        starredCount={starredIds.length}
        onQuickStart={() => setActiveItem(items[0] ?? null)}
      />

      <main className="ws-container">
        <section className="ws-hero">
          <div className="ws-hero-card">
            <div>
              <span className="ws-kicker">多文件响应式工作区</span>
              <h1>{${JSON.stringify(safeTitle)}}</h1>
              <p>
                支持按分类筛选、关键词实时检索、收藏状态切换、详情弹窗与快速新建条目，在桌面与手机浏览器均保持原生 1:1 比例。
              </p>
              <div className="ws-nav-actions">
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  className="ws-search"
                  data-ws-new-input
                  placeholder="输入新模块名称…"
                  aria-label="新模块名称"
                />
                <button type="button" className="ws-btn ws-btn-primary" data-ws-create onClick={() => handleCreate()}>
                  新建模块
                </button>
              </div>
            </div>
            <div className="ws-stats-grid">
              <div className="ws-stat-box">
                <strong data-testid="total-count">{items.length}</strong>
                <span>在线业务模块</span>
              </div>
              <div className="ws-stat-box">
                <strong data-testid="starred-count">{starredIds.length}</strong>
                <span>星标重点模块</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ws-toolbar" aria-label="筛选工具栏">
          <div className="ws-tabs" role="tablist">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                role="tab"
                data-ws-category={cat}
                aria-selected={activeCategory === cat}
                className={\`ws-tab \${activeCategory === cat ? 'active' : ''}\`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            type="search"
            className="ws-search"
            data-ws-search
            placeholder="搜索模块名称或描述…"
            aria-label="搜索模块"
          />
        </section>

        <section className="ws-grid" aria-label="模块列表">
          {filteredItems.map(item => (
            <article key={item.id} className="ws-card" data-testid="workspace-card" data-ws-card={item.id}>
              <div>
                <div className="ws-card-header">
                  <span className="ws-tag">{item.category}</span>
                  <span className="ws-tag">{item.metrics}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </div>
              <div className="ws-card-footer">
                <button type="button" className="ws-btn" data-ws-star={item.id} onClick={() => toggleStar(item.id)}>
                  {starredIds.includes(item.id) ? '★ 已收藏' : '☆ 收藏'}
                </button>
                <button type="button" className="ws-btn ws-btn-primary" data-ws-detail={item.id} onClick={() => setActiveItem(item)}>
                  查看详情
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>

      <DetailModal
        item={activeItem}
        starred={activeItem ? starredIds.includes(activeItem.id) : false}
        onToggleStar={toggleStar}
        onClose={() => setActiveItem(null)}
      />

      {toast && <div className="ws-toast" role="status">{toast}</div>}

      <footer className="ws-footer">
        <div className="ws-container">© 2026 {${JSON.stringify(safeTitle)}} · 原生响应式多文件工作区</div>
      </footer>
    </div>
  );
}
`,
      },
    },
  }, { message: 'init: 初始化 React 19 多文件代码工作区', author: 'System' });
}
