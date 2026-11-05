import { validateDataHeaderName, type DataSource } from '../../../shared/data-sources.mjs';

// Values intentionally never enter a document, browser storage, or AI context.
const values = new Map<string, Record<string, string>>();
const listeners = new Set<(scope: string, source: DataSource) => void>();
export const browserHeaderScope = (siteId: string, owner?: string) => JSON.stringify([owner ?? 'guest', siteId]);
const key = (scope: string, source: DataSource) => JSON.stringify([scope, source.id, source.url]);
export function getBrowserHeaders(scope: string, source: DataSource): Record<string, string> {
  return { ...values.get(key(scope, source)) };
}
export function setBrowserHeaders(scope: string, source: DataSource, input: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const name of source.browserHeaders ?? []) {
    validateDataHeaderName(name, source.transport === 'proxy' || source.credentialId ? 'proxy' : 'direct');
    const value = input[name] ?? '';
    if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('当前标签页请求头值无效');
    next[name] = value;
  }
  const id = key(scope, source);
  if (JSON.stringify(values.get(id) ?? {}) === JSON.stringify(next)) return;
  if (Object.keys(next).length) values.set(id, next); else values.delete(id);
  for (const listener of listeners) listener(scope, source);
}
export function subscribeBrowserHeaders(listener: (scope: string, source: DataSource) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
