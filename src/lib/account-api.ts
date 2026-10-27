import type { StudioDocument } from '../model';
import type { InspectorDisclosurePreferences } from './workbench-preferences';
import type { PublishResult } from './publishing';

export type AccountUser = { id: string; name: string; email: string; image?: string | null };
export type AccountCapabilities = { cloudEnabled: boolean; emailEnabled: boolean; githubEnabled: boolean };
export type CloudPageSummary = { id: string; name: string; createdAt: string; updatedAt: string; shareToken: string | null; publishedAt: string | null; publishedVersion: number | null };
export type CloudPageRecord = CloudPageSummary & { page: StudioDocument; savedAt: string };
export type PublishCommit = { record: CloudPageRecord; result: PublishResult };
export type Preferences = { version: 1; studioTheme: 'light' | 'dark'; inspectorDisclosures?: InspectorDisclosurePreferences };
export class AccountApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function accountApi<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(15000),
      ...(options.body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new AccountApiError('连接失败，请检查网络后重试。当前编辑内容仍然保留。', 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const authMessages: Record<string, string> = {
      INVALID_OTP: '验证码不正确，请检查后重试。', OTP_EXPIRED: '验证码已过期，请重新发送。',
      OTP_NOT_FOUND: '请先获取验证码，再尝试登录。', TOO_MANY_ATTEMPTS: '尝试次数过多，请重新获取验证码。',
      TOO_MANY_REQUESTS: '操作过于频繁，请稍后再试。',
    };
    const fallback = response.status === 401 ? '登录已过期，请重新登录后继续。' : response.status === 429 ? '操作过于频繁，请稍后再试。' : '操作失败，请稍后重试。';
    throw new AccountApiError(authMessages[data?.code] ?? (typeof data?.error === 'string' ? data.error : fallback), response.status);
  }
  return data as T;
}

export const cloudPagePath = (id: string) => `/api/account/pages/${encodeURIComponent(id)}`;
export const cloudSitePath = (id: string) => `/api/account/sites/${encodeURIComponent(id)}`;
export const cloudSiteVersionsPath = (id: string) => `${cloudSitePath(id)}/versions`;
export const cloudSiteVersionPath = (id: string, version: number) => `${cloudSiteVersionsPath(id)}/${version}`;
export const shareUrl = (token: string) => `${window.location.origin}/p/${encodeURIComponent(token)}`;
export type { PublishResult, PublishVersionDetail, PublishVersionSummary } from './publishing';
