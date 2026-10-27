export const mediaLimits = { fileBytes: 5 * 1024 * 1024, perSite: 100, totalBytes: 50 * 1024 * 1024 };
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = message => { throw new Error(message); };
export function isMediaId(value) { return typeof value === 'string' && idPattern.test(value); }
export function mediaReference(id) { if (!isMediaId(id)) fail('素材标识无效'); return `asset:${id}`; }
export function parseMediaReference(value) {
  if (typeof value !== 'string' || !value.startsWith('asset:')) return null;
  const id = value.slice(6);
  return isMediaId(id) ? id : null;
}
export function collectMediaReferences(document) {
  const ids = new Set(), visited = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    for (const item of Object.values(value)) {
      if (typeof item === 'string') { const id = parseMediaReference(item); if (id) ids.add(id); }
      else if (item && typeof item === 'object') visit(item);
    }
  };
  visit(document);
  return [...ids];
}
export function validateMediaName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value)) fail('图片名称必须是 1–120 个字符，且不能包含控制字符');
  return value.trim();
}
const starts = (bytes, values) => values.every((value, index) => bytes[index] === value);
const ascii = (bytes, start, end) => String.fromCharCode(...bytes.slice(start, end));
export function inspectImage(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (!bytes.length) fail('不能上传空图片');
  if (bytes.byteLength > mediaLimits.fileBytes) fail('单张图片不能超过 5 MiB');
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytes.length >= 14 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return 'image/gif';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  fail('仅支持有效的 PNG、JPEG、WebP 或 GIF 图片，不能上传 SVG、HTML 或其他文件');
}
export function mediaUsage(assets) { return { count: assets.length, bytes: assets.reduce((total, asset) => total + asset.size, 0) }; }
