import { inspectImage, mediaLimits, type MediaMime } from '../shared/media.mjs';

export type BoundedImage = { ok: true; bytes: Uint8Array; mime: MediaMime } | { ok: false; status: number; message: string };
export async function readBoundedImage(request: Request): Promise<BoundedImage> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > mediaLimits.fileBytes) return { ok: false, status: 413, message: '单张图片不能超过 5 MiB。' };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, message: '请选择要上传的图片。' };
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > mediaLimits.fileBytes) { await reader.cancel(); return { ok: false, status: 413, message: '单张图片不能超过 5 MiB。' }; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { ok: true, bytes, mime: inspectImage(bytes) }; }
  catch (error) { return { ok: false, status: 415, message: error instanceof Error ? error.message : '图片格式无效。' }; }
}
