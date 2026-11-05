import { isSensitiveDataHeader, validateDataHeaderName, type DataSource } from '../../../shared/data-sources.mjs';
import { getBrowserHeaders } from './browser-headers.ts';

export type HeaderRow = { id: string; name: string; value: string; local: boolean };
export function sourceHeaderRows(source: DataSource | null, scope: string): HeaderRow[] {
  if (!source) return [];
  const local = getBrowserHeaders(scope, source);
  return [
    ...Object.entries(source.headers ?? {}).map(([name, value]) => ({ id: crypto.randomUUID(), name, value, local: false })),
    ...(source.browserHeaders ?? []).map(name => ({ id: crypto.randomUUID(), name, value: local[name] ?? '', local: true })),
  ];
}
export function compileHeaderRows(rows: HeaderRow[], transport: 'direct' | 'proxy' = 'direct') {
  const headers: Record<string, string> = {}, browserHeaders: string[] = [], values: Record<string, string> = {}, names = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name && !row.value) continue;
    validateDataHeaderName(name, transport);
    if (names.has(name.toLowerCase())) throw new Error('请求头名称不能重复（不区分大小写）');
    names.add(name.toLowerCase());
    const local = row.local || isSensitiveDataHeader(name);
    if (row.value.length > (local ? 4096 : 2000) || /[\u0000-\u001f\u007f]/.test(row.value)) throw new Error('请求头值过长或包含控制字符');
    if (local) { browserHeaders.push(name); values[name] = row.value; }
    else headers[name] = row.value;
  }
  if (names.size > 20) throw new Error('请求头最多 20 项');
  return { headers, browserHeaders, values };
}
