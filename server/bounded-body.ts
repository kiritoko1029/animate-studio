/**
 * Shared bounded JSON body reader for request handlers. Counts UTF-8 bytes
 * while streaming and cancels the request body as soon as the limit is
 * exceeded, so a lying or absent Content-Length cannot buffer an oversized
 * payload, and multi-byte characters count as their real byte length.
 */

const decoder = new TextDecoder();

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: number; message: string };

export async function readBoundedJson(request: Request, maxBodyBytes = 512 * 1024): Promise<BodyResult> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return { ok: false, status: 415, message: '请求正文必须使用 application/json。' };
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    return { ok: false, status: 413, message: '页面数据过大（上限 512 KB）。' };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, message: '请求正文必须是有效的 JSON。' };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        return { ok: false, status: 413, message: '页面数据过大（上限 512 KB）。' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(decoder.decode(bytes)) };
  } catch {
    return { ok: false, status: 400, message: '请求正文必须是有效的 JSON。' };
  }
}
