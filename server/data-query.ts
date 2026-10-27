import { isIP } from 'node:net';
import { normalizeDataValue, prepareDataSource, readDataPath, validateDataSource, type DataSource, type DataTemplateContext } from '../shared/data-sources.mjs';
import { readBoundedJson } from '../src/lib/data/runtime.ts';
import type { DataCredentialRecord } from '../db/data-credential-repository.ts';
import { decryptDataCredential } from './data-credential-crypto.ts';
import type { DataConnection } from './data-socket.ts';

export class DataQueryError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function normalizeAllowedHost(value: unknown): string {
  if (typeof value !== 'string' || value.length > 260 || /[\s\\?#@]/.test(value)) throw new Error('允许的主机格式无效。');
  const url = new URL(`http://${value}`);
  if (url.username || url.password || url.pathname !== '/' || !url.hostname) throw new Error('允许的主机格式无效。');
  return url.host.toLowerCase().replace(/\.$/, '');
}
export function normalizeAllowedHosts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error('请填写 1–10 个允许的主机。');
  return [...new Set(value.map(normalizeAllowedHost))];
}
function hostMatches(url: URL, allowed: string[]) {
  const host = normalizeAllowedHost(url.host), name = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  return allowed.some(value => host === value || name === value.replace(/^\[|\]$/g, ''));
}
function ipv4Bytes(address: string) { return address.split('.').map(part => Number(part)); }
function ipv6Bytes(address: string): number[] | null {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(value) !== 6) return null;
  const [head, tail = ''] = value.split('::');
  const left = head ? head.split(':') : [], right = tail ? tail.split(':') : [];
  const parse = (parts: string[]) => parts.flatMap(part => part.includes('.') ? [0, 0] : [Number(`0x${part}`)]);
  const bytes = [...parse(left), ...Array((8 - left.length - right.length) * 2).fill(0), ...parse(right)];
  if (bytes.length !== 16) return null;
  const ipv4 = tail.split('.').length === 4 ? tail : head.split('.').length === 4 ? head : '';
  if (ipv4) bytes.splice(12, 4, ...ipv4Bytes(ipv4));
  return bytes;
}
export function isPrivateAddress(raw: string): boolean {
  const address = raw.replace(/^\[|\]$/g, '').split('%')[0];
  if (isIP(address) === 4) {
    const [a, b, c] = ipv4Bytes(address);
    return a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && c === 0 || b === 2 || b === 88 && c === 99) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113;
  }
  const bytes = ipv6Bytes(address);
  if (!bytes) return true;
  const zero = (start: number, end: number) => bytes.slice(start, end).every(value => value === 0);
  if (zero(0, 12) && bytes.slice(12).some(value => value !== 0)) return isPrivateAddress(bytes.slice(12).join('.'));
  if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPrivateAddress(bytes.slice(12).join('.'));
  if (JSON.stringify(bytes.slice(0, 12)) === JSON.stringify([0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0])) return isPrivateAddress(bytes.slice(12).join('.'));
  if (bytes[0] < 0x20 || bytes[0] > 0x3f) return true;
  return bytes[0] === 0x20 && (bytes[1] === 0x02 || bytes[1] === 0x01 && (bytes[2] === 0 && bytes[3] <= 0x1f || bytes[2] === 0x0d && bytes[3] === 0xb8));
}
async function dnsJson(hostname: string, fetcher: typeof fetch, timeoutMs: number): Promise<string[]> {
  const url = new URL('https://cloudflare-dns.com/dns-query'); url.searchParams.set('name', hostname); url.searchParams.set('type', 'A');
  const read = async (type: 'A' | 'AAAA') => {
    url.searchParams.set('type', type);
    const response = await fetcher(url, { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(Math.max(1, timeoutMs)) });
    if (!response.ok) throw new DataQueryError(502, '无法验证数据接口的网络地址。');
    const result = await readBoundedJson(response, 16384) as { Answer?: { type: number; data: string }[] };
    if (!Array.isArray(result.Answer)) return [];
    return result.Answer.filter(item => (type === 'A' ? item.type === 1 : item.type === 28) && isIP(item.data)).map(item => item.data);
  };
  return [...await read('A'), ...await read('AAAA')];
}
export type DataQueryOptions = {
  source: DataSource; context?: DataTemplateContext; origin: string; credential?: DataCredentialRecord | null; encryptionSecret?: string;
  fetcher?: typeof fetch; lookup?: (hostname: string) => Promise<{ address: string }[]>; allowedHosts?: string[]; confirmed?: { method: string; host: string }; connect?: (connection: DataConnection) => Promise<Response>;
};
export async function executeDataQuery(options: DataQueryOptions): Promise<unknown> {
  const source = validateDataSource(options.source);
  const prepared = prepareDataSource(source, options.context);
  if (prepared.url === undefined) throw new DataQueryError(400, '静态数据不需要服务端代理。');
  if (!['GET', 'POST', 'PUT', 'PATCH'].includes(prepared.method ?? 'GET')) throw new DataQueryError(400, '数据请求方法无效。');
  let target = new URL(prepared.url, options.origin);
  if (prepared.method !== 'GET' && (!options.confirmed || options.confirmed.method !== prepared.method || options.confirmed.host !== target.host)) throw new DataQueryError(400, '写入请求需要用户在表单中明确确认方法与主机。');
  const secret = options.credential ? decryptDataCredential(options.credential.encryptedSecret, options.encryptionSecret ?? '') : null;
  const fetcher = options.fetcher ?? fetch;
  const allowedLocal = options.allowedHosts ?? [];
  const dnsCache = new Map<string, Promise<string[]>>();
  const deadline = Date.now() + Math.min(source.timeoutMs ?? 10000, 15000);
  const remaining = () => { const value = deadline - Date.now(); if (value <= 0) throw new DataQueryError(504, '数据接口请求超时。'); return value; };
  const bounded = async <T>(promise: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout>;
    try { return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new DataQueryError(504, '数据接口请求超时。')), remaining()); })]); }
    finally { clearTimeout(timer!); }
  };
  const check = async (url: URL): Promise<string[] | undefined> => {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new DataQueryError(400, '数据接口地址或重定向不安全。');
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (hostname.length > 253 || hostname === 'localhost' || hostname.endsWith('.localhost') || /(?:\.local|\.internal|\.lan|\.home)$/.test(hostname) || !hostname.includes('.') && !isIP(hostname)) {
      if (!hostMatches(url, allowedLocal)) throw new DataQueryError(403, '数据接口不允许访问本机或内部主机。');
    }
    if (isIP(hostname) && isPrivateAddress(hostname) && !hostMatches(url, allowedLocal)) throw new DataQueryError(403, '数据接口不允许访问私有网络或元数据地址。');
    if (options.credential && !hostMatches(url, options.credential.allowedHosts)) throw new DataQueryError(403, '数据接口主机不在凭据允许列表中。');
    if (hostMatches(url, allowedLocal)) return undefined;
    if (!dnsCache.has(hostname)) dnsCache.set(hostname, (async () => {
      if (isIP(hostname)) { if (isPrivateAddress(hostname)) throw new DataQueryError(403, '数据接口不允许访问私有网络地址。'); return [hostname]; }
      const addresses = options.lookup ? await options.lookup(hostname) : await dnsJson(hostname, fetcher, remaining()).then(items => items.map(address => ({ address })));
      if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new DataQueryError(403, '数据接口解析到了不安全或不可用的网络地址。');
      return addresses.map(item => item.address);
    })());
    try { return await bounded(dnsCache.get(hostname)!); }
    catch (cause) { if (cause instanceof DataQueryError) throw cause; throw new DataQueryError(502, '无法验证数据接口的网络地址。'); }
  };
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await check(target);
    if (options.credential && !hostMatches(target, options.credential.allowedHosts)) throw new DataQueryError(403, '重定向目标不在凭据允许列表中。');
    const requestBody = prepared.body === undefined ? undefined : JSON.stringify(prepared.body);
    if (requestBody && new TextEncoder().encode(requestBody).byteLength > 1024 * 1024) throw new DataQueryError(413, '请求体不能超过 1 MiB。');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), remaining());
    let response: Response;
    try {
      const headers = new Headers({ Accept: 'application/json', ...prepared.headers, ...(prepared.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(secret ? options.credential!.kind === 'api-key' ? { 'X-Api-Key': secret } : { Authorization: `Bearer ${secret}` } : {}) });
      if (options.connect) headers.set('Host', target.host);
      const init = { method: prepared.method, headers, ...(requestBody === undefined ? {} : { body: requestBody }), signal: controller.signal, redirect: 'manual' as const };
      response = options.connect && addresses ? await options.connect({ url: target, init, addresses }) : await fetcher(target, init);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new DataQueryError(502, '数据接口重定向次数过多或地址无效。');
        target = new URL(location, target);
        if (response.status === 303 || (response.status === 301 || response.status === 302) && prepared.method === 'POST') throw new DataQueryError(400, '写入接口不能通过重定向改变请求方法。');
        continue;
      }
      if (!response.ok) throw new DataQueryError(502, `数据接口返回 HTTP ${response.status}。`);
      return normalizeDataValue(source, readDataPath(await readBoundedJson(response), source.responsePath));
    } catch (error) {
      if (error instanceof DataQueryError) throw error;
      if (controller.signal.aborted) throw new DataQueryError(504, '数据接口请求超时。');
      throw new DataQueryError(502, '无法连接数据接口，请检查地址、TLS 和网络设置。');
    } finally { clearTimeout(timer); }
  }
  throw new DataQueryError(502, '数据接口重定向次数过多。');
}
const rate = new Map<string, { start: number; count: number }>();
export function checkDataRateLimit(userId: string, now = Date.now()) {
  if (rate.size > 2000) for (const [id, entry] of rate) if (now - entry.start > 60000) rate.delete(id);
  const previous = rate.get(userId), entry = !previous || now - previous.start >= 60000 ? { start: now, count: 0 } : previous;
  entry.count++; rate.set(userId, entry);
  return entry.count <= 60;
}
