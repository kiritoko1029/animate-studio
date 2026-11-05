// Disposable, loopback-only workspace for the M0 user-study task cards.
import { createServer } from 'node:http';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../server/index.mjs';

await access(resolve('dist/index.html')).catch(() => { throw new Error('请先执行 npm run build，生成 Node 前端产物。'); });
const dataDir = await mkdtemp(join(tmpdir(), 'animate-m0-study-'));
const app = await createApp({ dataDir, serveFrontend: true, production: true, accounts: null });
const initialItems = [
  { id: 'p1', title: '品牌官网', category: '网站', amount: 120 },
  { id: 'p2', title: '产品介绍', category: '网站', amount: 80 },
  { id: 'p3', title: '运营看板', category: '工具', amount: 160 },
  { id: 'p4', title: '客户管理', category: '工具', amount: 100 },
];
const items = structuredClone(initialItems);
function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(value));
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/study-api/')) return app(req, res);
  if (req.method === 'OPTIONS') return json(res, null, 204);
  const match = url.pathname.match(/^\/study-api\/items(?:\/([a-zA-Z0-9-]+))?$/);
  if (!match) return json(res, { error: '测试路径不存在' }, 404);
  const id = match[1], item = id && items.find(value => value.id === id);
  if (id && !item) return json(res, { error: '测试记录不存在' }, 404);
  if (req.method === 'GET') {
    const positive = (value, fallback) => /^\d+$/.test(value ?? '') && Number(value) > 0 ? Number(value) : fallback;
    const size = Math.min(100, positive(url.searchParams.get('pageSize'), 100));
    const page = positive(url.searchParams.get('page'), 1);
    return json(res, id ? item : items.slice((page - 1) * size, page * size));
  }
  if (!(req.method === 'POST' && !id || req.method === 'PUT' && id)) return json(res, { error: '仅支持 GET、POST 和单条 PUT' }, 405);
  try {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 16384) return json(res, { error: '测试请求不能超过 16 KiB' }, 413);
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).some(key => !['title', 'category', 'amount'].includes(key))
      || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100
      || typeof body.category !== 'string' || !body.category.trim() || body.category.length > 40
      || typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0) {
      return json(res, { error: '需要 title（1–100 字）、category（1–40 字）和非负数值 amount' }, 400);
    }
    const next = { id: id ?? crypto.randomUUID(), title: body.title.trim(), category: body.category.trim(), amount: body.amount };
    if (item) Object.assign(item, next); else items.push(next);
    return json(res, next, item ? 200 : 201);
  } catch { return json(res, { error: '测试请求必须是有效 JSON' }, 400); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(JSON.stringify({ workspace: origin, list: `${origin}/study-api/items`, detail: `${origin}/study-api/items/p1`,
  create: `POST ${origin}/study-api/items`, update: `PUT ${origin}/study-api/items/p1`,
  example: { title: '用户测试项目', category: '网站', amount: 150 },
  note: '一次性本机测试：账号关闭；写入只改变内存中的示例记录。每位参与者重启并使用新的浏览器配置；退出后接口失效。' }, null, 2));
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await app.locals.closeFrontend?.();
  await rm(dataDir, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close().catch(error => { console.error(error); process.exitCode = 1; }); });
