import { dataSourceLimits } from '../shared/data-sources.mjs';

export type DataConnection = { url: URL; init: { method?: string; headers?: HeadersInit; body?: string | null; signal?: AbortSignal }; addresses: string[] };
type SocketLike = {
  readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>;
  opened: Promise<unknown>; close: () => Promise<void>;
  startTls?: (options: { expectedServerHostname: string }) => SocketLike;
};
export type SocketConnector = (address: { hostname: string; port: number }, options: { secureTransport: string; allowHalfOpen: boolean }) => SocketLike;
const complete = Symbol('complete');
function concat(chunks: Uint8Array[], length: number) {
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
function indexOf(bytes: Uint8Array, sequence: number[], start = 0) {
  outer: for (let index = start; index <= bytes.length - sequence.length; index++) {
    for (let offset = 0; offset < sequence.length; offset++) if (bytes[index + offset] !== sequence[offset]) continue outer;
    return index;
  }
  return -1;
}
const incomplete = Symbol('incomplete');
function parseResponse(bytes: Uint8Array): Response {
  const boundary = indexOf(bytes, [13, 10, 13, 10]);
  if (boundary < 0) throw incomplete;
  const lines = new TextDecoder('latin1').decode(bytes.slice(0, boundary)).split('\r\n');
  const match = lines.shift()?.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.*))?$/);
  if (!match) throw new Error('数据接口响应状态无效。');
  const status = Number(match[1]);
  if (status < 200 || status > 599) throw new Error('数据接口响应状态无效。');
  const headers = new Headers();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  let payload = bytes.slice(boundary + 4);
  const rawLength = headers.get('content-length');
  const length = rawLength === null ? NaN : Number(rawLength);
  if (rawLength !== null && (!/^\d+$/.test(rawLength) || length > dataSourceLimits.responseBytes)) throw new Error('数据接口长度无效或超过 1 MiB。');
  if (headers.get('transfer-encoding')?.toLowerCase().includes('chunked')) {
    const chunks: Uint8Array[] = [];
    let cursor = 0, size = 0;
    while (true) {
      const end = indexOf(payload, [13, 10], cursor);
      if (end < 0) throw incomplete;
      const count = Number.parseInt(new TextDecoder('latin1').decode(payload.slice(cursor, end)).split(';')[0], 16);
      if (!Number.isFinite(count) || count < 0 || count > dataSourceLimits.responseBytes) throw new Error('数据接口分块大小无效。');
      const start = end + 2;
      if (start + count + 2 > payload.length) throw incomplete;
      if (count === 0) {
        if (payload[start] !== 13 || payload[start + 1] !== 10) throw new Error('数据接口分块结束无效。');
        payload = concat(chunks, size); break;
      }
      chunks.push(payload.slice(start, start + count)); size += count;
      if (size > dataSourceLimits.responseBytes) throw new Error('接口响应超过 1 MiB。');
      cursor = start + count + 2;
    }
  } else if (Number.isFinite(length)) {
    if (payload.length < length) throw incomplete;
    payload = payload.slice(0, length);
  }
  if (headers.has('content-encoding') && !['identity', ''].includes(headers.get('content-encoding')!.toLowerCase())) throw new Error('数据接口返回了不支持的内容编码。');
  return new Response(status === 204 || status === 304 ? null : payload, { status, statusText: match[2] ?? '', headers });
}
async function readResponse(reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  try {
    while (size <= dataSourceLimits.responseBytes + 65536) {
      const { value, done } = await reader.read();
      if (value) {
        chunks.push(value); size += value.byteLength;
        try { return parseResponse(concat(chunks, size)); }
        catch (cause) { if (cause !== incomplete) throw cause; }
      }
      if (done) return parseResponse(concat(chunks, size));
    }
    throw new Error('接口响应超过 1 MiB。');
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel(complete); } catch { /* The server may have closed the response. */ }
    reader.releaseLock();
  }
}
export async function fetchSocket(connection: DataConnection, connect: SocketConnector): Promise<Response> {
  const { url, init, addresses } = connection;
  let socket = connect({ hostname: addresses[0], port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) }, { secureTransport: url.protocol === 'https:' ? 'starttls' : 'off', allowHalfOpen: false });
  if (url.protocol === 'https:') socket = socket.startTls!({ expectedServerHostname: url.hostname.replace(/^\[|\]$/g, '') });
  let rejectAbort!: (reason?: unknown) => void;
  const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const guard = <T>(promise: Promise<T>) => Promise.race([promise, cancelled]);
  const abort = () => { rejectAbort(init.signal?.reason); void socket.close().catch(() => {}); };
  if (init.signal?.aborted) abort(); else init.signal?.addEventListener('abort', abort, { once: true });
  try {
    await guard(socket.opened);
    const headers = new Headers(init.headers);
    headers.set('Host', url.host); headers.set('Connection', 'close'); headers.set('Accept-Encoding', 'identity');
    if (init.body !== undefined && init.body !== null) headers.set('Content-Length', String(new TextEncoder().encode(init.body).byteLength));
    const lines = [`${init.method ?? 'GET'} ${url.pathname}${url.search} HTTP/1.1`];
    headers.forEach((value, key) => lines.push(`${key}: ${value}`));
    const request = `${lines.join('\r\n')}\r\n\r\n${init.body ?? ''}`;
    const writer = socket.writable.getWriter();
    await guard(writer.write(new TextEncoder().encode(request))); writer.releaseLock();
    return await guard(readResponse(socket.readable.getReader(), init.signal));
  } finally {
    init.signal?.removeEventListener('abort', abort);
    try { await socket.close(); } catch { /* An aborted socket is already closed. */ }
  }
}
