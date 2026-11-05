export type WorkspaceFramework = 'react' | 'vue' | 'html';
export type WorkspaceRuntimeVersion = '2026.1';

export type WorkspaceFile = {
  content: string;
  language?: string;
};

export type WorkspaceCompiledBundle = {
  html: string;
  js: string;
  css: string;
  compiledAt?: string;
};

export type WorkspaceGitFileChange = {
  path: string;
  status: 'A' | 'M' | 'D';
  additions: number;
  deletions: number;
};

export type WorkspaceGitCommit = {
  hash: string;
  parentHash: string | null;
  branch: string;
  message: string;
  author: 'AI' | 'User' | 'System';
  timestamp: number;
  changes: WorkspaceGitFileChange[];
  files?: Record<string, string>;
};

export type WorkspaceGitState = {
  branch: string;
  head: string;
  commits: WorkspaceGitCommit[];
};

export type WorkspaceSpec = {
  version: 1;
  runtimeVersion: WorkspaceRuntimeVersion;
  framework: WorkspaceFramework;
  entry: string;
  files: Record<string, WorkspaceFile>;
  compiled?: WorkspaceCompiledBundle;
  git?: WorkspaceGitState;
};

export const workspaceLimits: Readonly<{
  maxFiles: number;
  maxFileChars: number;
  maxTotalChars: number;
  maxCompiledChars: number;
  maxPathLength: number;
  maxGitCommits: number;
  maxGitSnapshotChars: number;
  frameworks: readonly WorkspaceFramework[];
  runtimeVersions: readonly WorkspaceRuntimeVersion[];
}>;

export function isSafeWorkspacePath(filePath: unknown): filePath is string;
export function validateWorkspace(workspace: unknown, path?: string): WorkspaceSpec;
export function computeLineDiffStats(beforeText?: string, afterText?: string): { additions: number; deletions: number };
export function computeWorkspaceChanges(
  beforeFiles: Record<string, WorkspaceFile | string> | undefined,
  afterFiles: Record<string, WorkspaceFile | string> | undefined,
): WorkspaceGitFileChange[];
export function commitWorkspaceGit(
  workspace: WorkspaceSpec,
  options?: {
    message?: string;
    author?: 'AI' | 'User' | 'System';
    timestamp?: number;
    baselineFiles?: Record<string, WorkspaceFile | string>;
  },
): WorkspaceSpec;
export function createDefaultWorkspace(framework?: WorkspaceFramework, title?: string): WorkspaceSpec;
