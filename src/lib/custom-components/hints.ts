import type { CustomComponentDefinition } from '../../../shared/custom-components.mjs';

export type CodePanel = 'html' | 'css' | 'js';
export type CodeHint = { panel: CodePanel; line: number; message: string };

const rules: { panel: CodePanel; pattern: RegExp; message: string }[] = [
  { panel: 'html', pattern: /<script\b/i, message: 'HTML 中的 <script> 不会执行。请把代码写在 JavaScript 面板。' },
  { panel: 'html', pattern: /<[a-z][^>]*\son[a-z]+\s*=/i, message: 'onclick 等内联事件属性不会执行。请在 JavaScript 面板中使用 addEventListener。' },
  { panel: 'html', pattern: /<link\b[^>]*rel\s*=\s*["']?stylesheet/i, message: '不能引用外部样式表，请把样式写在 CSS 面板。' },
  { panel: 'html', pattern: /<(?:iframe|object|embed)\b/i, message: '组件中不能再嵌入 iframe、object 或 embed。' },
  { panel: 'css', pattern: /@import\b/i, message: '不支持 @import 外部样式，请把样式直接写在 CSS 面板。' },
  { panel: 'js', pattern: /^\s*import\s*(?:[\w*{\s]|["'])|\bimport\s*\(|\brequire\s*\(/m, message: '不支持 import、require 或外部模块，组件只能使用浏览器内置能力。' },
  { panel: 'js', pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|navigator\.sendBeacon/, message: '组件不能联网，fetch、XMLHttpRequest、WebSocket 等请求会被阻止。' },
  { panel: 'js', pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/, message: '组件运行在隔离环境中，不能使用 Cookie、localStorage 或 indexedDB。' },
  { panel: 'js', pattern: /\b(?:alert|confirm|prompt)\s*\(/, message: 'alert、confirm、prompt 弹窗在组件中不可用，请在组件内显示提示。' },
  { panel: 'js', pattern: /\b(?:eval|new\s+Function)\s*\(/, message: '组件不能使用 eval 或 new Function。' },
  { panel: 'js', pattern: /\b(?:let|const|class|function)\s+component\b/, message: 'component 是平台保留名称，请换一个变量名。' },
];

/**
 * Advisory static hints shown before running. They explain the sandbox
 * contract early; the sandbox itself enforces it either way.
 */
export function codeHints(definition: Pick<CustomComponentDefinition, 'html' | 'css' | 'js'>): CodeHint[] {
  const hints: CodeHint[] = [];
  for (const rule of rules) {
    const source = definition[rule.panel];
    const match = rule.pattern.exec(source);
    if (!match) continue;
    hints.push({ panel: rule.panel, line: source.slice(0, match.index + (match[0].length - match[0].trimStart().length)).split('\n').length, message: rule.message });
  }
  return hints;
}
