import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Eye,
  FileCode2,
  FileDiff,
  FilePlus2,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  PanelLeft,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  commitWorkspaceGit,
  computeLineDiffStats,
  computeWorkspaceChanges,
  createDefaultWorkspace,
  isSafeWorkspacePath,
  type WorkspaceCompiledBundle,
  type WorkspaceFramework,
  type WorkspaceGitCommit,
  type WorkspaceSpec,
} from '../../../shared/workspace.mjs';
import type { AiStreamingFile } from '../../lib/ai/types';
import type { ResponsiveDevice } from '../../lib/responsive';
import type { WorkspaceCompileDiagnostic } from '../../lib/workspace/compiler-client';
import {
  checkoutWorkspaceCommit,
  computeUnifiedDiff,
  highlightCodeLine,
} from '../../lib/workspace/git-diff';
import { CodeBlock } from '../animate-ui/registry/code-block';
import { StudioButton, StudioTooltip } from '../StudioUI';
import { WorkspacePreview, type WorkspaceRuntimeMetrics } from './WorkspacePreview';
import './workspace-editor.css';

type Props = {
  workspace: WorkspaceSpec;
  title: string;
  view: 'edit' | 'split' | 'preview';
  device: ResponsiveDevice;
  studioTheme?: 'light' | 'dark';
  aiBusy?: boolean;
  aiStreamingFile?: AiStreamingFile | null;
  aiBaselineFiles?: Record<string, { content: string }> | null;
  replayKey?: number;
  onChange: (next: WorkspaceSpec) => void;
  onChangeView?: (view: 'edit' | 'split' | 'preview') => void;
  notify: (message: string) => void;
};

const WORKSPACE_CODE_THEMES = {
  light: 'one-light',
  dark: 'one-dark-pro',
} as const;

function langForWorkspacePath(filePath: string): string {
  if (filePath.endsWith('.vue')) return 'vue';
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.ts')) return 'ts';
  if (filePath.endsWith('.jsx')) return 'jsx';
  if (filePath.endsWith('.css')) return 'css';
  if (filePath.endsWith('.html')) return 'html';
  if (filePath.endsWith('.json')) return 'json';
  return 'js';
}

async function highlightLinesWithShiki(
  code: string,
  lang: string,
  theme: 'light' | 'dark',
): Promise<string[]> {
  if (!code) return [];
  const { codeToHtml } = await import('shiki');
  const html = await codeToHtml(code, {
    lang,
    themes: WORKSPACE_CODE_THEMES,
    defaultColor: theme,
  });
  const codeMatch = /<code[^>]*>([\s\S]*?)<\/code>/.exec(html);
  if (!codeMatch) return [];
  return codeMatch[1].split('\n').map(lineHtml => {
    const match = /^<span class="line">(.*)<\/span>$/.exec(lineHtml);
    return match ? match[1] : lineHtml;
  });
}

function formatCommitTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

export function WorkspaceEditor({
  workspace,
  title,
  view,
  device,
  studioTheme = 'light',
  aiBusy = false,
  aiStreamingFile = null,
  aiBaselineFiles = null,
  replayKey = 0,
  onChange,
  onChangeView,
  notify,
}: Props) {
  const [activeFile, setActiveFile] = useState<string>(workspace.entry);
  const [codeMode, setCodeMode] = useState<'code' | 'diff'>('code');
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [addingFile, setAddingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('src/components/NewSection.tsx');
  const [diagnostics, setDiagnostics] = useState<WorkspaceCompileDiagnostic[]>([]);
  const [runtimeError, setRuntimeError] = useState('');
  const [metrics, setMetrics] = useState<WorkspaceRuntimeMetrics | null>(null);
  const [manualReplay, setManualReplay] = useState(0);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);
  const latestWorkspaceRef = useRef<WorkspaceSpec>(workspace);
  latestWorkspaceRef.current = workspace;

  // Ensure every workspace automatically forms a Git repository with an initial commit
  useEffect(() => {
    if (aiBusy) return;
    if (!workspace.git || !workspace.git.commits?.length) {
      const initialized = commitWorkspaceGit(workspace, {
        author: 'System',
        message: `init: 初始化 ${workspace.framework.toUpperCase()} 多文件工作区`,
      });
      if (initialized !== workspace) {
        onChange(initialized);
      }
    }
  }, [aiBusy, workspace, onChange]);

  const filePaths = useMemo(() => {
    const keys = new Set(Object.keys(workspace.files));
    if (aiStreamingFile?.path) keys.add(aiStreamingFile.path);
    return [...keys].sort((a, b) => {
      if (a === workspace.entry) return -1;
      if (b === workspace.entry) return 1;
      return a.localeCompare(b);
    });
  }, [workspace.files, workspace.entry, aiStreamingFile?.path]);

  useEffect(() => {
    if (!filePaths.includes(activeFile)) {
      setActiveFile(workspace.entry);
    }
  }, [filePaths, workspace.entry, activeFile]);

  // Follow AI streaming file in real time and switch to Diff view automatically
  useEffect(() => {
    if (aiStreamingFile?.path) {
      setActiveFile(aiStreamingFile.path);
      setSelectedCommitHash(null);
      setCodeMode('diff');
    }
  }, [aiStreamingFile?.path]);

  useEffect(() => {
    if (aiBusy) {
      setSelectedCommitHash(null);
      setCodeMode('diff');
    }
  }, [aiBusy]);

  const commits = workspace.git?.commits ?? [];
  const headCommit = commits[0] ?? null;
  const parentCommit = commits[1] ?? null;

  const selectedCommit = useMemo(
    () => (selectedCommitHash ? commits.find(c => c.hash === selectedCommitHash) ?? null : null),
    [commits, selectedCommitHash],
  );

  // Compute working-tree changes against HEAD
  const workingChanges = useMemo(
    () => computeWorkspaceChanges(headCommit?.files ?? {}, workspace.files),
    [headCommit?.files, workspace.files],
  );

  // Determine the per-file status badges for the left file tree
  const fileStatusMap = useMemo(() => {
    const map = new Map<string, { status: 'A' | 'M' | 'D' | 'AI'; additions: number; deletions: number }>();
    const baseFiles = aiBusy && aiBaselineFiles
      ? aiBaselineFiles
      : selectedCommit
      ? commits[commits.indexOf(selectedCommit) + 1]?.files ?? {}
      : workingChanges.length > 0
      ? headCommit?.files ?? {}
      : parentCommit?.files ?? {};

    const targetFiles = selectedCommit?.files
      ? Object.fromEntries(Object.entries(selectedCommit.files).map(([k, v]) => [k, { content: v }]))
      : workspace.files;

    for (const ch of computeWorkspaceChanges(baseFiles, targetFiles)) {
      map.set(ch.path, ch);
    }

    if (aiStreamingFile?.path) {
      const beforeContent =
        (aiBaselineFiles?.[aiStreamingFile.path]?.content ?? workspace.files[aiStreamingFile.path]?.content) || '';
      const stats = computeLineDiffStats(beforeContent, aiStreamingFile.content);
      map.set(aiStreamingFile.path, {
        status: 'AI',
        additions: stats.additions,
        deletions: stats.deletions,
      });
    }
    return map;
  }, [
    aiBusy,
    aiBaselineFiles,
    aiStreamingFile,
    commits,
    headCommit?.files,
    parentCommit?.files,
    selectedCommit,
    workingChanges.length,
    workspace.files,
  ]);

  const currentFile = workspace.files[activeFile] ?? workspace.files[workspace.entry];
  const codeLang = langForWorkspacePath(activeFile);
  const activeCodeContent =
    aiStreamingFile && aiStreamingFile.path === activeFile
      ? aiStreamingFile.content
      : currentFile?.content ?? '';

  // Compute the before/after texts for the Diff Viewer on activeFile
  const activeDiff = useMemo(() => {
    if (aiStreamingFile && aiStreamingFile.path === activeFile) {
      const beforeText =
        aiBaselineFiles?.[activeFile]?.content ??
        headCommit?.files?.[activeFile] ??
        workspace.files[activeFile]?.content ??
        '';
      return {
        label: `AI 实时流式输出 · ${aiStreamingFile.summary || activeFile}`,
        beforeText,
        afterText: aiStreamingFile.content,
        ...computeUnifiedDiff(beforeText, aiStreamingFile.content),
      };
    }

    if (selectedCommit) {
      const idx = commits.indexOf(selectedCommit);
      const prevCommit = idx >= 0 ? commits[idx + 1] : null;
      const beforeText = prevCommit?.files?.[activeFile] ?? '';
      const afterText = selectedCommit.files?.[activeFile] ?? workspace.files[activeFile]?.content ?? '';
      return {
        label: `提交 #${selectedCommit.hash} (${selectedCommit.author}) · ${selectedCommit.message}`,
        beforeText,
        afterText,
        ...computeUnifiedDiff(beforeText, afterText),
      };
    }

    if (aiBusy && aiBaselineFiles) {
      const beforeText = aiBaselineFiles[activeFile]?.content ?? '';
      const afterText = workspace.files[activeFile]?.content ?? '';
      return {
        label: `AI 变更对比 · 对比生成前基线`,
        beforeText,
        afterText,
        ...computeUnifiedDiff(beforeText, afterText),
      };
    }

    if (workingChanges.length > 0 && headCommit?.files) {
      const beforeText = headCommit.files[activeFile] ?? '';
      const afterText = workspace.files[activeFile]?.content ?? '';
      return {
        label: `未提交变更 (Working Tree vs HEAD #${headCommit.hash})`,
        beforeText,
        afterText,
        ...computeUnifiedDiff(beforeText, afterText),
      };
    }

    const beforeText = parentCommit?.files?.[activeFile] ?? headCommit?.files?.[activeFile] ?? '';
    const afterText = workspace.files[activeFile]?.content ?? '';
    return {
      label: headCommit
        ? `最新提交 #${headCommit.hash} (${headCommit.author}) · ${headCommit.message}`
        : '当前文件快照',
      beforeText,
      afterText,
      ...computeUnifiedDiff(beforeText, afterText),
    };
  }, [
    activeFile,
    aiBaselineFiles,
    aiBusy,
    aiStreamingFile,
    commits,
    headCommit,
    parentCommit,
    selectedCommit,
    workingChanges.length,
    workspace.files,
  ]);

  // Auto-scroll Diff view while AI is streaming
  useEffect(() => {
    if (codeMode === 'diff' && aiStreamingFile && diffScrollRef.current) {
      diffScrollRef.current.scrollTop = diffScrollRef.current.scrollHeight;
    }
  }, [codeMode, aiStreamingFile?.content]);

  const [shikiDiffLines, setShikiDiffLines] = useState<{
    before: string[];
    after: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      highlightLinesWithShiki(activeDiff.beforeText, codeLang, studioTheme),
      highlightLinesWithShiki(activeDiff.afterText, codeLang, studioTheme),
    ])
      .then(([before, after]) => {
        if (!cancelled) {
          setShikiDiffLines({ before, after });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [codeLang, studioTheme, activeDiff.beforeText, activeDiff.afterText]);

  const handleCodeChange = useCallback(
    (content: string) => {
      if (aiBusy) return;
      onChange({
        ...workspace,
        files: {
          ...workspace.files,
          [activeFile]: { ...workspace.files[activeFile], content },
        },
      });
    },
    [aiBusy, activeFile, onChange, workspace],
  );

  // Auto-commit manual changes after 3.5s of idle editing so Git history stays up to date automatically
  useEffect(() => {
    if (aiBusy || workingChanges.length === 0) return;
    const timer = window.setTimeout(() => {
      const committed = commitWorkspaceGit(workspace, {
        author: 'User',
        message:
          workingChanges.length === 1
            ? `edit: 修改 ${workingChanges[0].path}`
            : `edit: 修改 ${workingChanges.length} 个工作区文件`,
      });
      if (committed !== workspace) {
        onChange(committed);
      }
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [aiBusy, workingChanges, workspace, onChange]);

  const handleManualCommit = useCallback(
    (customMsg?: string) => {
      if (workingChanges.length === 0) {
        notify('当前工作区没有未提交的修改');
        return;
      }
      const defaultMsg =
        workingChanges.length === 1
          ? `feat: 更新 ${workingChanges[0].path}`
          : `feat: 更新 ${workingChanges.length} 个文件`;
      const msg = (customMsg ?? commitMessage).trim() || defaultMsg;
      const committed = commitWorkspaceGit(workspace, {
        author: 'User',
        message: msg,
      });
      setCommitMessage('');
      setSelectedCommitHash(null);
      onChange(committed);
      notify(`已生成 Git 提交 #${committed.git?.head ?? ''}`);
    },
    [commitMessage, notify, onChange, workingChanges, workspace],
  );

  const handleRunAndCommit = useCallback(() => {
    if (workingChanges.length > 0) {
      const committed = commitWorkspaceGit(workspace, {
        author: 'User',
        message:
          workingChanges.length === 1
            ? `feat: 更新 ${workingChanges[0].path}`
            : `feat: 更新 ${workingChanges.length} 个工作区文件`,
      });
      onChange(committed);
    }
    setManualReplay(n => n + 1);
  }, [onChange, workingChanges, workspace]);

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'Enter' || event.key.toLowerCase() === 's')) {
        event.preventDefault();
        handleRunAndCommit();
        return;
      }
      if (event.key === 'Tab' && !event.shiftKey && !aiBusy) {
        event.preventDefault();
        const el = event.currentTarget;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const value = el.value;
        const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
        handleCodeChange(nextValue);
        window.requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + 2;
            textareaRef.current.selectionEnd = start + 2;
          }
        });
      }
    },
    [aiBusy, handleCodeChange, handleRunAndCommit],
  );

  const handleCheckoutCommit = useCallback(
    (commit: WorkspaceGitCommit) => {
      if (aiBusy) return;
      const restored = checkoutWorkspaceCommit(workspace, commit);
      if (!restored) {
        notify('该历史提交未包含完整文件快照，无法回滚');
        return;
      }
      setSelectedCommitHash(null);
      onChange(restored);
      setManualReplay(n => n + 1);
      notify(`已回滚至提交 #${commit.hash}`);
    },
    [aiBusy, notify, onChange, workspace],
  );

  const handleCompiled = useCallback(
    (compiled: WorkspaceCompiledBundle) => {
      if (aiBusy) return;
      const current = latestWorkspaceRef.current;
      if (
        current.compiled?.js === compiled.js &&
        current.compiled?.css === compiled.css &&
        current.compiled?.html === compiled.html
      ) {
        return;
      }
      onChange({
        ...current,
        compiled,
      });
    },
    [aiBusy, onChange],
  );

  function handleAddFile(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newFilePath.trim();
    if (!isSafeWorkspacePath(trimmed)) {
      notify('文件路径无效，请使用如 src/components/Card.tsx 的相对路径');
      return;
    }
    if (Object.hasOwn(workspace.files, trimmed)) {
      setActiveFile(trimmed);
      setAddingFile(false);
      return;
    }
    const defaultContent = trimmed.endsWith('.css')
      ? `/* ${trimmed} */\n`
      : trimmed.endsWith('.vue')
      ? `<script setup>\n</script>\n\n<template>\n  <section></section>\n</template>\n`
      : `import React from 'react';\n\nexport function Component() {\n  return <section></section>;\n}\n`;
    const nextWs: WorkspaceSpec = {
      ...workspace,
      files: {
        ...workspace.files,
        [trimmed]: { content: defaultContent },
      },
    };
    const committed = commitWorkspaceGit(nextWs, {
      author: 'User',
      message: `feat: 新建文件 ${trimmed}`,
      baselineFiles: workspace.files,
    });
    onChange(committed);
    setActiveFile(trimmed);
    setAddingFile(false);
    notify(`已创建文件 ${trimmed} 并记录 Git 提交`);
  }

  function handleDeleteFile(path: string) {
    if (path === workspace.entry) {
      notify('入口文件不能删除');
      return;
    }
    const nextFiles = { ...workspace.files };
    delete nextFiles[path];
    const nextWs: WorkspaceSpec = {
      ...workspace,
      files: nextFiles,
    };
    const committed = commitWorkspaceGit(nextWs, {
      author: 'User',
      message: `chore: 删除文件 ${path}`,
      baselineFiles: workspace.files,
    });
    onChange(committed);
    if (activeFile === path) setActiveFile(workspace.entry);
    notify(`已移除文件 ${path} 并记录 Git 提交`);
  }

  function handleSwitchFramework(nextFramework: WorkspaceFramework) {
    if (nextFramework === workspace.framework) return;
    const starter = createDefaultWorkspace(nextFramework, title);
    onChange(starter);
    setActiveFile(starter.entry);
    setSelectedCommitHash(null);
    notify(`已切换为 ${nextFramework.toUpperCase()} 多文件工作区底座`);
  }

  const previewMaxWidth = device === 'mobile' ? '390px' : device === 'tablet' ? '768px' : '100%';
  const changedFileEntries = [...fileStatusMap.entries()];

  return (
    <div
      className={`workspace-studio view-${view} ${filesCollapsed ? 'files-collapsed' : ''}`}
      data-workspace-studio
    >
      {view !== 'preview' && !filesCollapsed && (
        <aside className="workspace-files-pane" aria-label="工作区文件与 Git 版本管理">
          <div className="workspace-files-header">
            <span>
              <FolderTree size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              工作区文件 ({filePaths.length})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <StudioTooltip label="新建工作区文件">
                <StudioButton
                  className="icon-button"
                  aria-label="新建工作区文件"
                  disabled={aiBusy}
                  onClick={() => {
                    setNewFilePath(
                      workspace.framework === 'vue'
                        ? 'src/components/Section.vue'
                        : workspace.framework === 'html'
                        ? 'src/section.js'
                        : 'src/components/Section.tsx',
                    );
                    setAddingFile(v => !v);
                  }}
                >
                  <FilePlus2 size={14} />
                </StudioButton>
              </StudioTooltip>
              <StudioTooltip label="收起工作区文件栏">
                <StudioButton
                  className="icon-button"
                  aria-label="收起工作区文件栏"
                  onClick={() => setFilesCollapsed(true)}
                >
                  <PanelLeft size={14} />
                </StudioButton>
              </StudioTooltip>
            </div>
          </div>

          <div className="workspace-runtime-bar">
            <span>底座 Runtime v{workspace.runtimeVersion}</span>
            <select
              aria-label="工作区框架"
              value={workspace.framework}
              disabled={aiBusy}
              onChange={e => handleSwitchFramework(e.target.value as WorkspaceFramework)}
            >
              <option value="react">React 19 + TS</option>
              <option value="vue">Vue 3.5 SFC</option>
              <option value="html">HTML + ESM</option>
            </select>
          </div>

          {(aiBusy || aiStreamingFile) && (
            <div className="workspace-ai-live-banner" role="status" data-ai-workspace-live>
              <Sparkles size={13} className="spin" />
              <div>
                <strong>{aiStreamingFile ? `AI 正在输出 ${aiStreamingFile.path}` : 'AI 正在生成多文件工作区…'}</strong>
                <small>左侧实时同步文件变更 · 中间展示实时 Diff</small>
              </div>
            </div>
          )}

          {addingFile && (
            <form className="workspace-new-file-form" onSubmit={handleAddFile}>
              <input
                value={newFilePath}
                onChange={e => setNewFilePath(e.target.value)}
                placeholder="src/components/Card.tsx"
                aria-label="新文件路径"
                autoFocus
              />
              <StudioButton type="submit" className="primary-button">创建</StudioButton>
            </form>
          )}

          <div className="workspace-file-list" role="tree" aria-label="文件列表">
            {filePaths.map(path => {
              const st = fileStatusMap.get(path);
              return (
                <div
                  key={path}
                  className={`workspace-file-row ${activeFile === path ? 'active' : ''} ${st?.status === 'AI' ? 'streaming' : ''}`}
                  role="treeitem"
                  aria-selected={activeFile === path}
                >
                  <button
                    type="button"
                    className="workspace-file-button"
                    onClick={() => {
                      setActiveFile(path);
                      if (!aiBusy && !aiStreamingFile) {
                        setCodeMode('code');
                      }
                    }}
                    title={path}
                  >
                    <FileCode2 size={13} />
                    <span>{path}</span>
                  </button>
                  {st && (
                    <button
                      type="button"
                      className={`workspace-git-status-badge status-${st.status.toLowerCase()}`}
                      title={`点击查看 Diff (+${st.additions} / -${st.deletions})`}
                      onClick={() => {
                        setActiveFile(path);
                        setCodeMode('diff');
                      }}
                    >
                      {st.status === 'AI' ? 'AI' : st.status}
                      {(st.additions > 0 || st.deletions > 0) && (
                        <em>+{st.additions}</em>
                      )}
                    </button>
                  )}
                  {path === workspace.entry ? (
                    <span className="workspace-file-badge">入口</span>
                  ) : (
                    <StudioTooltip label={`删除 ${path}`}>
                      <StudioButton
                        className="icon-button"
                        aria-label={`删除 ${path}`}
                        disabled={aiBusy}
                        onClick={() => handleDeleteFile(path)}
                      >
                        <Trash2 size={12} />
                      </StudioButton>
                    </StudioTooltip>
                  )}
                </div>
              );
            })}
          </div>

          <div className="workspace-git-panel" data-workspace-git>
            <div className="workspace-git-header">
              <span>
                <GitBranch size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Git 版本 ({workspace.git?.branch || 'main'})
              </span>
              <span className="workspace-git-head-pill" title="当前 HEAD 提交">
                {headCommit ? `#${headCommit.hash}` : 'init'}
              </span>
            </div>

            {workingChanges.length > 0 && !aiBusy && (
              <form
                className="workspace-git-commit-bar"
                onSubmit={e => {
                  e.preventDefault();
                  handleManualCommit();
                }}
              >
                <input
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  placeholder={`提交 ${workingChanges.length} 个文件修改…`}
                  aria-label="Git 提交说明"
                />
                <StudioButton type="submit" className="secondary-button" aria-label="提交 Git 版本">
                  提交
                </StudioButton>
              </form>
            )}

            <div className="workspace-git-log" role="list" aria-label="Git 提交历史">
              {commits.map((commit, index) => {
                const totalAdd = commit.changes.reduce((s, c) => s + c.additions, 0);
                const totalDel = commit.changes.reduce((s, c) => s + c.deletions, 0);
                const isSelected = selectedCommitHash === commit.hash;
                return (
                  <div
                    key={`${commit.hash}:${commit.timestamp}`}
                    className={`workspace-git-commit-item ${isSelected ? 'active' : ''}`}
                    role="listitem"
                    data-git-commit={commit.hash}
                  >
                    <button
                      type="button"
                      className="workspace-git-commit-main"
                      onClick={() => {
                        setSelectedCommitHash(isSelected ? null : commit.hash);
                        setCodeMode('diff');
                        if (commit.changes[0]?.path && Object.hasOwn(workspace.files, commit.changes[0].path)) {
                          setActiveFile(commit.changes[0].path);
                        }
                      }}
                    >
                      <div className="workspace-git-commit-top">
                        <span className="workspace-git-hash">
                          <GitCommitHorizontal size={12} />
                          {commit.hash}
                        </span>
                        <span className={`workspace-git-author author-${commit.author.toLowerCase()}`}>
                          {commit.author}
                        </span>
                        <span className="workspace-git-time">{formatCommitTime(commit.timestamp)}</span>
                      </div>
                      <div className="workspace-git-msg">{commit.message}</div>
                      <div className="workspace-git-stats">
                        <span>{commit.changes.length} 个文件</span>
                        <span className="diff-stat-add">+{totalAdd}</span>
                        <span className="diff-stat-del">-{totalDel}</span>
                      </div>
                    </button>
                    {index > 0 && commit.files && (
                      <StudioTooltip label={`回滚到此版本 #${commit.hash}`}>
                        <StudioButton
                          className="icon-button workspace-git-revert-btn"
                          aria-label={`回滚到提交 ${commit.hash}`}
                          disabled={aiBusy}
                          onClick={() => handleCheckoutCommit(commit)}
                        >
                          <RotateCcw size={12} />
                        </StudioButton>
                      </StudioTooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      {view !== 'preview' && (
        <section className="workspace-code-pane" aria-label="代码与 Diff 视图">
          <div className="workspace-code-header">
            <span className="workspace-code-title">
              <StudioTooltip label={filesCollapsed ? '展开左侧工作区文件与 Git 面板' : '收起左侧工作区文件与 Git 面板'}>
                <StudioButton
                  className={`icon-button ${!filesCollapsed ? 'active' : ''}`}
                  aria-label={filesCollapsed ? '展开工作区文件栏' : '收起工作区文件栏'}
                  onClick={() => setFilesCollapsed(v => !v)}
                  style={{ width: 24, height: 24, marginRight: 2 }}
                >
                  <PanelLeft size={13} />
                </StudioButton>
              </StudioTooltip>
              <Code2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              <strong>{activeFile}</strong>
              {activeDiff.additions > 0 || activeDiff.deletions > 0 ? (
                <span className="workspace-diff-summary-pill" data-testid="workspace-diff-stats">
                  <b className="diff-stat-add">+{activeDiff.additions}</b>
                  <b className="diff-stat-del">-{activeDiff.deletions}</b>
                </span>
              ) : null}
            </span>

            <div className="workspace-code-header-actions">
              <div className="workspace-mode-toggle" role="tablist" aria-label="代码与 Diff 切换">
                <button
                  type="button"
                  role="tab"
                  aria-selected={codeMode === 'code'}
                  className={codeMode === 'code' ? 'active' : ''}
                  onClick={() => setCodeMode('code')}
                >
                  <Code2 size={12} />
                  代码编辑
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={codeMode === 'diff'}
                  className={codeMode === 'diff' ? 'active' : ''}
                  data-testid="workspace-diff-tab"
                  onClick={() => setCodeMode('diff')}
                >
                  <FileDiff size={12} />
                  Diff 对比
                </button>
              </div>
              <span className="workspace-metrics-pill">
                {(currentFile?.content.length ?? 0).toLocaleString()} 字符
              </span>
              {view === 'edit' && onChangeView && (
                <StudioButton
                  className="secondary-button"
                  aria-label="展开实时预览面板"
                  onClick={() => onChangeView('split')}
                >
                  <Eye size={12} /> 实时预览
                </StudioButton>
              )}
            </div>
          </div>

          <div className="workspace-code-body">
            {codeMode === 'diff' ? (
              <div className="workspace-diff-viewer" data-testid="workspace-diff-viewer">
                <div className="workspace-diff-banner">
                  <span>{activeDiff.label}</span>
                  {changedFileEntries.length > 0 && (
                    <div className="workspace-diff-file-pills">
                      {changedFileEntries.map(([fp, info]) => (
                        <button
                          key={fp}
                          type="button"
                          className={`workspace-diff-file-pill ${activeFile === fp ? 'active' : ''}`}
                          onClick={() => setActiveFile(fp)}
                        >
                          <span>{fp.split('/').pop()}</span>
                          <b className="diff-stat-add">+{info.additions}</b>
                          {info.deletions > 0 && <b className="diff-stat-del">-{info.deletions}</b>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="workspace-diff-scroll" ref={diffScrollRef}>
                  <table className="workspace-diff-table" aria-label={`${activeFile} Diff 对比`}>
                    <tbody>
                      {activeDiff.lines.map((line, idx) => {
                        const shikiHtml =
                          line.type === 'del'
                            ? line.oldLine != null
                              ? shikiDiffLines?.before[line.oldLine - 1]
                              : undefined
                            : line.newLine != null
                            ? shikiDiffLines?.after[line.newLine - 1]
                            : undefined;
                        const tokens = shikiHtml === undefined ? highlightCodeLine(line.text) : null;
                        return (
                          <tr key={idx} className={`diff-row diff-row--${line.type}`}>
                            <td className="diff-num diff-num--old">{line.oldLine ?? ''}</td>
                            <td className="diff-num diff-num--new">{line.newLine ?? ''}</td>
                            <td className="diff-sign">
                              {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                            </td>
                            {shikiHtml !== undefined ? (
                              <td
                                className="diff-code"
                                dangerouslySetInnerHTML={{ __html: shikiHtml || ' ' }}
                              />
                            ) : (
                              <td className="diff-code">
                                {tokens?.map((tok, tIdx) => (
                                  <span key={tIdx} className={`hl-${tok.kind}`}>
                                    {tok.text}
                                  </span>
                                ))}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="workspace-code-editor-stage" data-testid="workspace-code-block-editor">
                <div className="workspace-code-scroll-container">
                  <div className="workspace-code-layer-stack">
                    <pre aria-hidden="true" className="workspace-code-sizer">
                      {`${activeCodeContent}\n`}
                    </pre>
                    <CodeBlock
                      code={activeCodeContent || ' '}
                      lang={codeLang}
                      theme={studioTheme}
                      themes={WORKSPACE_CODE_THEMES}
                      cursor={Boolean(aiStreamingFile && aiStreamingFile.path === activeFile)}
                      copyButton={true}
                      className="workspace-animate-code-block"
                      scrollClassName="workspace-animate-code-scroll"
                    />
                    <textarea
                      ref={textareaRef}
                      className="workspace-code-textarea"
                      aria-label={`${activeFile} 代码编辑器`}
                      value={activeCodeContent}
                      readOnly={aiBusy}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      autoCorrect="off"
                      onChange={e => handleCodeChange(e.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {view !== 'edit' && (
        <section className="workspace-preview-pane" aria-label="工作区实时预览">
          <div className="workspace-preview-header">
            <span>
              <Eye size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              <strong>实时响应式预览</strong>
              <span className="workspace-metrics-pill" style={{ marginLeft: 8 }}>
                {diagnostics.length > 0 || runtimeError || metrics?.rendered === false ? (
                  <>
                    <AlertCircle size={12} /> 待修复
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} /> 编译通过 · 1:1 视口比例
                  </>
                )}
              </span>
              {metrics && (
                <span className="workspace-metrics-pill" style={{ marginLeft: 6 }}>
                  {metrics.interactiveCount} 个交互控件 · {metrics.overflowX ? '检测到横向溢出' : '无横向溢出'}
                </span>
              )}
            </span>
            <StudioButton
              className="secondary-button"
              aria-label="重新运行预览"
              onClick={handleRunAndCommit}
            >
              <Play size={12} /> 刷新运行
            </StudioButton>
          </div>
          <div className="workspace-preview-stage">
            <div className="workspace-preview-device" style={{ maxWidth: previewMaxWidth }}>
              <WorkspacePreview
                key={`${replayKey}:${manualReplay}`}
                workspace={workspace}
                title={title}
                onCompiled={handleCompiled}
                onDiagnostics={(errs, rtErr) => {
                  setDiagnostics(errs);
                  setRuntimeError(rtErr);
                }}
                onMetrics={setMetrics}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
