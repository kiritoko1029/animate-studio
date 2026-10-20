import { ValidationError, validateSaveRequest } from './validation.mjs';

const maxBodyBytes = 512 * 1024;
const workspacePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body, status = 200, extraHeaders = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
});

class RequestError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function readBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError('请求正文必须使用 application/json。', 415);
  }
  if (Number(request.headers.get('content-length')) > maxBodyBytes) {
    throw new RequestError('页面数据过大（上限 512 KB）。', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('请求正文必须是有效的 JSON。', 400);
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        throw new RequestError('页面数据过大（上限 512 KB）。', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError('请求正文必须是有效的 JSON。', 400); }
}

/** The browser's unguessable workspace key selects an isolated persistent record. */
export async function handleCloudApi(request, getStore) {
  const path = new URL(request.url).pathname;
  const allowed = { '/api/health': ['GET'], '/api/page': ['GET', 'PUT'], '/api/validate': ['POST'] }[path];
  if (!allowed) return json({ error: '未找到 API。' }, 404);
  if (!allowed.includes(request.method)) return json({ error: '不支持此请求方法。' }, 405, { Allow: allowed.join(', ') });
  if (path === '/api/health') return json({ status: 'ok' });
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: '此接口仅接受当前站点的请求。' }, 403);
  }
  const workspace = request.headers.get('x-studio-workspace');
  if (path === '/api/page' && (!workspace || !workspacePattern.test(workspace))) {
    return json({ error: '浏览器工作区无效，请刷新页面重试。' }, 400);
  }
  try {
    if (request.method === 'GET') return json(await getStore(workspace).read());
    const page = validateSaveRequest(await readBody(request));
    if (path === '/api/validate') return json({ page });
    return json(await getStore(workspace).save(page));
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    if (error instanceof ValidationError) return json({ error: error.message }, 400);
    return json({ error: request.method === 'GET' ? '无法读取已保存的页面，请稍后重试。' : '页面保存失败，请保留当前页面并重试。' }, 500);
  }
}
