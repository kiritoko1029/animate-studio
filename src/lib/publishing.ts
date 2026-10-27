import type { StudioDocument } from '../model.ts';

export const publishHistoryLimit = 20;

export type PublishVersionSummary = { id: string; version: number; createdAt: string; sourceVersion: number | null };
export type PublishVersionDetail = PublishVersionSummary & { page: StudioDocument };
export type PublishResult = { token: string; publishedAt: string; version: number; sourceVersion: number | null; unchanged?: boolean };
export type PublishRequest = { expectedRevision: string; expectedPublishedVersion: number | null };
export type PublishStatus = { status: 'published' | 'unchanged'; result: PublishResult } | { status: 'missing' | 'conflict' | 'closed' };

export function parsePublishRequest(value: unknown): PublishRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('发布请求格式不正确。');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['expectedRevision', 'expectedPublishedVersion'].includes(key))) throw new Error('发布请求包含不支持的字段。');
  if (typeof body.expectedRevision !== 'string' || !body.expectedRevision || body.expectedRevision.length > 40 || !Number.isFinite(Date.parse(body.expectedRevision))) throw new Error('缺少有效的草稿修订前提，请重新保存后再发布。');
  if (body.expectedPublishedVersion !== null && (!Number.isSafeInteger(body.expectedPublishedVersion) || (body.expectedPublishedVersion as number) < 1)) throw new Error('公开版本前提无效，请刷新发布状态。');
  return { expectedRevision: body.expectedRevision, expectedPublishedVersion: body.expectedPublishedVersion as number | null };
}

export function parseRollbackRequest(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('回滚请求格式不正确。');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== 'expectedPublishedVersion') || !Number.isSafeInteger(body.expectedPublishedVersion) || (body.expectedPublishedVersion as number) < 1) throw new Error('公开版本前提无效，请刷新发布状态。');
  return body.expectedPublishedVersion as number;
}

export function parsePublishVersion(value: string): number | null {
  if (!/^[1-9]\d{0,8}$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = Object.keys(left).sort(), b = Object.keys(right).sort();
  return a.length === b.length && a.every((key, index) => key === b[index] && jsonEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
