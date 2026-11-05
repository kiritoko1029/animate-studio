import {
  commitWorkspaceGit,
  type WorkspaceFile,
  type WorkspaceGitCommit,
  type WorkspaceSpec,
} from '../../../shared/workspace.mjs';

export type DiffLine = {
  type: 'ctx' | 'add' | 'del';
  oldLine: number | null;
  newLine: number | null;
  text: string;
};

export type FileDiffResult = {
  lines: DiffLine[];
  additions: number;
  deletions: number;
};

export type HighlightToken = {
  kind: 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'type' | 'tag' | 'attr' | 'operator';
  text: string;
};

/**
 * Computes a line-by-line unified diff between `beforeText` and `afterText`.
 */
export function computeUnifiedDiff(beforeText = '', afterText = ''): FileDiffResult {
  const beforeLines = beforeText ? beforeText.split('\n') : [];
  const afterLines = afterText ? afterText.split('\n') : [];

  if (beforeText === afterText) {
    return {
      lines: beforeLines.map((text, idx) => ({
        type: 'ctx',
        oldLine: idx + 1,
        newLine: idx + 1,
        text,
      })),
      additions: 0,
      deletions: 0,
    };
  }

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

  const prefix: DiffLine[] = [];
  for (let i = 0; i < start; i++) {
    prefix.push({ type: 'ctx', oldLine: i + 1, newLine: i + 1, text: beforeLines[i] });
  }

  const midBefore = beforeLines.slice(start, endBefore + 1);
  const midAfter = afterLines.slice(start, endAfter + 1);

  const middle: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  if (midBefore.length * midAfter.length > 250000) {
    for (let i = 0; i < midBefore.length; i++) {
      deletions++;
      middle.push({ type: 'del', oldLine: start + i + 1, newLine: null, text: midBefore[i] });
    }
    for (let j = 0; j < midAfter.length; j++) {
      additions++;
      middle.push({ type: 'add', oldLine: null, newLine: start + j + 1, text: midAfter[j] });
    }
  } else {
    const m = midBefore.length;
    const n = midAfter.length;
    const cols = n + 1;
    const dp = new Uint16Array((m + 1) * cols);

    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (midBefore[i] === midAfter[j]) {
          dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)] + 1;
        } else {
          const down = dp[(i + 1) * cols + j];
          const right = dp[i * cols + (j + 1)];
          dp[i * cols + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midBefore[i] === midAfter[j]) {
        middle.push({
          type: 'ctx',
          oldLine: start + i + 1,
          newLine: start + j + 1,
          text: midBefore[i],
        });
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
        deletions++;
        middle.push({
          type: 'del',
          oldLine: start + i + 1,
          newLine: null,
          text: midBefore[i],
        });
        i++;
      } else {
        additions++;
        middle.push({
          type: 'add',
          oldLine: null,
          newLine: start + j + 1,
          text: midAfter[j],
        });
        j++;
      }
    }
    while (i < m) {
      deletions++;
      middle.push({ type: 'del', oldLine: start + i + 1, newLine: null, text: midBefore[i] });
      i++;
    }
    while (j < n) {
      additions++;
      middle.push({ type: 'add', oldLine: null, newLine: start + j + 1, text: midAfter[j] });
      j++;
    }
  }

  const suffix: DiffLine[] = [];
  const suffixLen = beforeLines.length - 1 - endBefore;
  for (let k = 0; k < suffixLen; k++) {
    suffix.push({
      type: 'ctx',
      oldLine: endBefore + 1 + k + 1,
      newLine: endAfter + 1 + k + 1,
      text: beforeLines[endBefore + 1 + k],
    });
  }

  return {
    lines: [...prefix, ...middle, ...suffix],
    additions,
    deletions,
  };
}

const JS_KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'function', 'return', 'const', 'let', 'var',
  'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'new', 'typeof',
  'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'async', 'await',
  'class', 'extends', 'interface', 'type', 'enum', 'implements', 'readonly', 'as',
  'true', 'false', 'null', 'undefined', 'void', 'this', 'super', 'setup', 'scoped',
]);

const TOKEN_REGEX = new RegExp(
  [
    '(\\/\\/.*$|\\/\\*[\\s\\S]*?\\*\\/|<!--[\\s\\S]*?-->)', // 1: comment
    '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)', // 2: string
    '(<\\/?[A-Za-z][\\w.-]*|\\/?\\s*>)', // 3: JSX/HTML/Vue tag
    '(#[0-9a-fA-F]{3,8}\\b|\\b(?:0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:px|rem|em|vh|vw|dvh|%|ms|s|fr|deg)?)\\b)', // 4: hex color or number/unit
    '(@media\\b|@keyframes\\b|@import\\b)', // 5: CSS at-rule keyword
    '((?:v-[\\w.-]+|@[\\w.-]+|:[\\w.-]+|\\b[a-zA-Z_$][\\w$-]*)(?=\\s*=)|--[\\w-]+|\\b[a-z][\\w-]*(?=\\s*:))', // 6: Vue/JSX attr, CSS var, or CSS/object property
    '(\\b[A-Za-z_$][\\w$]*(?=\\s*(?:<[^>]*>)?\\s*\\())', // 7: function/hook call (including generic calls like useState<T>())
    '(\\b[A-Z][\\w$]*\\b)', // 8: PascalCase type / component
    '(\\b[A-Za-z_$][\\w$]*\\b)', // 9: identifier / keyword
    '(=>|===|!==|==|!=|<=|>=|&&|\\|\\||\\?\\?|\\{\\{|\\}\\}|[+\\-*/%=<>!&|^~?:]+)', // 10: operator
  ].join('|'),
  'gm',
);

/**
 * Tokenizes a single line of code into colored syntax tokens for the Diff viewer
 * and CodeMirror live decorator.
 */
export function highlightCodeLine(line: string): HighlightToken[] {
  if (!line) return [{ kind: 'plain', text: '' }];
  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'plain', text: line.slice(lastIndex, match.index) });
    }
    const full = match[0];
    if (match[1] !== undefined) {
      tokens.push({ kind: 'comment', text: full });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: 'string', text: full });
    } else if (match[3] !== undefined) {
      tokens.push({ kind: 'tag', text: full });
    } else if (match[4] !== undefined) {
      tokens.push({ kind: 'number', text: full });
    } else if (match[5] !== undefined) {
      tokens.push({ kind: 'keyword', text: full });
    } else if (match[6] !== undefined) {
      tokens.push({ kind: JS_KEYWORDS.has(full) ? 'keyword' : 'attr', text: full });
    } else if (match[7] !== undefined) {
      tokens.push({ kind: JS_KEYWORDS.has(full) ? 'keyword' : 'function', text: full });
    } else if (match[8] !== undefined) {
      tokens.push({ kind: JS_KEYWORDS.has(full) ? 'keyword' : 'type', text: full });
    } else if (match[9] !== undefined) {
      tokens.push({ kind: JS_KEYWORDS.has(full) ? 'keyword' : 'plain', text: full });
    } else if (match[10] !== undefined) {
      tokens.push({ kind: 'operator', text: full });
    } else {
      tokens.push({ kind: 'plain', text: full });
    }
    lastIndex = TOKEN_REGEX.lastIndex;
  }
  if (lastIndex < line.length) {
    tokens.push({ kind: 'plain', text: line.slice(lastIndex) });
  }
  return tokens;
}

/**
 * Restores a workspace to the file snapshot of `commit` and records a revert/checkout Git commit.
 */
export function checkoutWorkspaceCommit(workspace: WorkspaceSpec, commit: WorkspaceGitCommit): WorkspaceSpec | null {
  if (!commit.files || Object.keys(commit.files).length === 0) return null;
  const restoredFiles: Record<string, WorkspaceFile> = {};
  for (const [filePath, content] of Object.entries(commit.files)) {
    restoredFiles[filePath] = { content };
  }
  const entry = Object.hasOwn(restoredFiles, workspace.entry)
    ? workspace.entry
    : Object.keys(restoredFiles)[0];
  const nextWorkspace: WorkspaceSpec = {
    ...workspace,
    entry,
    files: restoredFiles,
    compiled: undefined,
  };
  return commitWorkspaceGit(nextWorkspace, {
    author: 'User',
    message: `revert: 回滚至提交 ${commit.hash} (${commit.message.slice(0, 40)})`,
  });
}
