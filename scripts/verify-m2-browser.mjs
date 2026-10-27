import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/index.mjs';
import { createDocument, createBlock } from '../src/model.ts';
import { createSiteDocument, createSitePage, createLayoutDocument } from '../shared/site-document.mjs';
import { validateSite } from '../server/validation.mjs';

const out = resolve('artifacts/m2-browser');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
const books = [
  { id: 'a1', title: '设计中的设计', author: '原研哉', available: true },
  { id: 'b2', title: '信息架构', author: '彼得·莫尔维尔', available: true },
];
const calls = [], timers = new Set();
function json(res, value, status = 200, origin = '*') {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(value));
}
const app = await createApp({ dataDir: join(work, 'data'), serveFrontend: true, production: true, accounts: null });
let site, origin;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  if (url.pathname.startsWith('/api/books')) {
    calls.push({ method: req.method, path: url.pathname });
    if (req.method === 'OPTIONS') return json(res, {});
    if (req.method === 'GET' && url.pathname === '/api/books') return json(res, books);
    if (req.method === 'POST' && url.pathname === '/api/books') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const book = { id: crypto.randomUUID(), title: input.title, author: input.author, available: true };
      books.push(book); return json(res, book, 201);
    }
    const match = url.pathname.match(/^\/api\/books\/([^/]+)$/), book = match && books.find(item => item.id === match[1]);
    if (!book) return json(res, { error: 'not found' }, 404);
    if (req.method === 'GET') return json(res, book);
    if (req.method === 'PUT') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      Object.assign(book, JSON.parse(Buffer.concat(chunks).toString('utf8'))); return json(res, book);
    }
  }
  if (url.pathname === '/api/loans') { calls.push({ method: req.method, path: url.pathname }); return json(res, []); }
  if (url.pathname === '/api/categories') { calls.push({ method: req.method, path: url.pathname }); return json(res, { error: 'fixture failure' }, 500); }
  if (url.pathname === '/api/tasks') {
    calls.push({ method: req.method, path: url.pathname });
    const timer = setTimeout(() => { timers.delete(timer); json(res, []); }, 300); timers.add(timer); return;
  }
  if (url.pathname === '/api/shared/browser-test') return json(res, { page: site, publishedAt: '2026-10-26T00:00:00Z' });
  return app(req, res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
site = createSiteDocument(createDocument(true));
site.name = '知阅 · 图书工作台';
site.pages[0].name = '工作台'; site.pages[0].page.name = '工作台';
for (const entry of site.pages) entry.page.settings = { ...entry.page.settings, maxWidth: 1440, canvasHeight: 1080, padding: 48, layout: 'free' };
const homeHeading = createBlock('heading'); Object.assign(homeHeading, { id: 'home-heading', frame: { x: 48, y: 72, width: 650, height: 130 } }); homeHeading.props.title = '知阅 · 图书工作台';
const homeTable = createBlock('table'); Object.assign(homeTable, { id: 'home-table', frame: { x: 48, y: 250, width: 800, height: 310 } }); Object.assign(homeTable.props, { title: '馆藏实时数据', sourceId: 'books', dataColumns: [{ key: 'title', label: '书名', path: 'title' }, { key: 'author', label: '作者', path: 'author' }] });
site.pages[0].page.blocks = [homeHeading, homeTable];
const library = createSitePage(site, '馆藏管理'); library.path = '/books';
const list = createBlock('repeater'); Object.assign(list, { id: 'book-list', frame: { x: 48, y: 48, width: 610, height: 820 } }); list.props.dataFields.description.text = 'author'; list.props.dataFields.more.url = '/books/{{item.id}}';
const createForm = createBlock('form'); Object.assign(createForm, { id: 'create-book', frame: { x: 682, y: 48, width: 310, height: 640 } });
Object.assign(createForm.props, { title: '新增馆藏', submitSourceId: 'createBook', successText: '创建成功，列表已刷新。', successUrl: '/books' });
createForm.children[1].props = { ...createForm.children[1].props, name: 'author', label: '作者', required: true, maxLength: 80 }; createForm.children[2].props.label = '新增图书';
library.page.blocks = [list, createForm];
const detail = createSitePage(site, '图书详情', 'detail'); detail.path = '/books/:id';
const detailTitle = createBlock('heading'); Object.assign(detailTitle, { id: 'detail-title', frame: { x: 48, y: 48, width: 680, height: 130 }, bindings: { title: { kind: 'expression', value: 'data.book.title' } } });
const detailAuthor = createBlock('text'); Object.assign(detailAuthor, { id: 'detail-author', frame: { x: 48, y: 190, width: 680, height: 100 }, bindings: { text: { kind: 'expression', value: 'data.book.author' } } });
const updateForm = createBlock('form'); Object.assign(updateForm, { id: 'update-book', frame: { x: 48, y: 320, width: 620, height: 640 } });
Object.assign(updateForm.props, { title: '编辑馆藏', submitSourceId: 'updateBook', successText: '馆藏已更新。' });
updateForm.children[1].props = { ...updateForm.children[1].props, name: 'author', label: '作者', required: true, maxLength: 80 }; updateForm.children[2].props.label = '保存修改';
detail.page.blocks = [detailTitle, detailAuthor, updateForm];
const loans = createSitePage(site, '借阅管理'); loans.path = '/loans';
const empty = createBlock('repeater'); Object.assign(empty, { id: 'empty-loans', frame: { x: 48, y: 48, width: 650, height: 500 }, props: { ...empty.props, title: '借阅记录', sourceId: 'emptyLoans' } }); loans.page.blocks = [empty];
const categories = createSitePage(site, '分类统计'); categories.path = '/categories';
const failed = createBlock('repeater'); Object.assign(failed, { id: 'failed-categories', frame: { x: 48, y: 48, width: 650, height: 500 }, props: { ...failed.props, title: '分类数据', sourceId: 'failedCategories' } }); categories.page.blocks = [failed];
const tasks = createSitePage(site, '今日待办'); tasks.path = '/tasks';
const slow = createBlock('repeater'); Object.assign(slow, { id: 'slow-tasks', frame: { x: 48, y: 48, width: 650, height: 500 }, props: { ...slow.props, title: '待办数据', sourceId: 'slowTasks' } }); tasks.page.blocks = [slow];
site.pages.push(library, detail, loans, categories, tasks);
for (const entry of site.pages) { entry.layout = ['sidebar']; entry.page.settings = { ...entry.page.settings, maxWidth: 1440, canvasHeight: 1080, padding: 48, layout: 'free' }; }
site.sharedLayout.sidebar = createLayoutDocument('sidebar', site.pages[0].page.settings);
const navigation = createBlock('sidebar'); Object.assign(navigation, { id: 'library-navigation', frame: { x: 0, y: 0, width: 320, height: 820 }, props: { ...navigation.props, navigation: 'site' } });
site.sharedLayout.sidebar.blocks = [navigation];
site.dataSources = [
  { id: 'books', name: '馆藏列表', kind: 'rest', mode: 'collection', url: `${origin}/api/books`, pageSize: 5 },
  { id: 'book', name: '馆藏详情', kind: 'rest', mode: 'single', url: `${origin}/api/books/{{route.id}}` },
  { id: 'createBook', name: '新增馆藏', kind: 'rest', mode: 'single', method: 'POST', url: `${origin}/api/books`, body: { title: '{{form.title}}', author: '{{form.author}}' } },
  { id: 'updateBook', name: '更新馆藏', kind: 'rest', mode: 'single', method: 'PUT', url: `${origin}/api/books/{{route.id}}`, body: { title: '{{form.title}}', author: '{{form.author}}' } },
  { id: 'emptyLoans', name: '借阅记录', kind: 'rest', mode: 'collection', url: `${origin}/api/loans` },
  { id: 'failedCategories', name: '分类数据', kind: 'rest', mode: 'collection', url: `${origin}/api/categories` },
  { id: 'slowTasks', name: '待办数据', kind: 'rest', mode: 'collection', url: `${origin}/api/tasks`, timeoutMs: 100 },
];
validateSite(site);

const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let socket, appClosed = false, nextId = 0;
const pending = new Map(), events = new Map(), dialogWaiters = [], dialogMessages = [];
const steps = [], errors = [];
let activePage;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function untilValue(fn, description, timeout = 20000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch { last = undefined; } await delay(50); }
  throw new Error(`Timed out: ${description}${last === undefined ? '' : ` (${last})`}`);
}
async function rpc(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
function on(method, fn) { if (!events.has(method)) events.set(method, []); events.get(method).push(fn); }
async function attach(url) {
  const { targetId } = await rpc('Target.createTarget', { url });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => rpc(method, params, sessionId);
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression, awaitPromise = true) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const until = async (expression, description, timeout) => untilValue(async () => evaluate(`(()=>{try{return Boolean(${expression})}catch{return null}})()`), description, timeout);
  const click = async (selector, text) => {
    await evaluate(`(()=>{const element=${text ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!element)throw new Error('Missing clickable element');element.focus({preventScroll:true});return true})()`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  };
  const clickText = (text, selector = 'button') => click(selector, text);
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await call('Input.insertText', { text: value }); };
  const select = (selector, value) => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}));return element.value})()`);
  const submit = async (selector, method) => {
    const dialog = dialogMessages.length ? Promise.resolve(dialogMessages.shift()) : new Promise((resolve, reject) => {
      dialogWaiters.push(resolve);
      setTimeout(() => reject(new Error('Timed out waiting for form confirmation')), 15000);
    });
    const pendingClick = click(selector);
    const actual = await dialog;
    assert.match(actual, new RegExp(`${method}.*127\\.0\\.0\\.1`));
    await call('Page.handleJavaScriptDialog', { accept: true });
    await pendingClick;
  };
  return { call, evaluate, until, click, clickText, fill, select, submit, sessionId, targetId };
}
async function screenshot(page, name) {
  const result = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(out, name), Buffer.from(result.data, 'base64'));
}
async function main() {
  const version = await untilValue(async () => {
    const response = await fetch(`http://127.0.0.1:${JSON.parse((await readFile(join(work, 'chrome', 'DevToolsActivePort'), 'utf8')).split('\n')[0])}/json/version`);
    return response.ok ? response.json() : null;
  }, 'Chromium DevTools ready', 15000);
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    } else {
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(item => item.value ?? item.description).join(' '));
      for (const fn of events.get(message.method) ?? []) fn(message.params);
    }
  });
  on('Page.javascriptDialogOpening', params => { if (dialogWaiters.length) dialogWaiters.shift()(params.message); else dialogMessages.push(params.message); });
  const page = await attach('about:blank'); activePage = page;
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('animate-studio:guest-site-draft:v1', ${JSON.stringify(JSON.stringify({ page: site, savedAt: '2026-10-26T00:00:00Z' }))});localStorage.setItem('animate-studio:locale','zh-CN');` });
  await page.call('Page.navigate', { url: origin });
  await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='工作台'`, 'editor opens fixture');
  await page.click('.page-logic-button');
  await page.until(`document.querySelector('#logic-tab-sources')`, 'data source tab mounted');
  await page.click('#logic-tab-sources');
  await page.until(`document.querySelector('.data-source-manager')`, 'data source manager mounted');
  await page.clickText('公开 REST', '.data-source-actions button');
  await page.fill('[aria-label="接口地址"]', `${origin}/api/books`);
  await page.clickText('测试并连接', '.data-source-actions button');
  await page.until(`document.querySelector('.data-source-success')?.textContent.includes('连接成功') && document.querySelector('.data-source-fields')?.textContent.includes('available')`, 'data source test and field inference');
  await page.clickText('保存数据源', '.data-source-actions button');
  await page.until(`document.querySelector('.data-source-success')?.textContent.includes('数据源已保存')`, 'source saved');
  await page.click('[aria-label="关闭交互工作台"]');
  await page.clickText('编辑', '.view-switch button');
  await page.click('[data-block-id="home-table"]');
  await page.until(`document.querySelector('select[aria-label="数据源"] option[value="books2"]')`, 'new source is selectable');
  await page.select('select[aria-label="数据源"]', 'books2');
  await page.until(`document.querySelector('[aria-label="列字段 3"]')?.value==='author'`, 'field mapping updates the table');
  await page.clickText('添加数据列', '.data-inspector-columns button');
  await page.until(`document.querySelector('[aria-label="列字段 4"]')?.value==='available'`, 'user adds the availability field');
  steps.push('数据源工作台：连接公开接口、字段推断和组件映射');
  await page.clickText('预览', '.view-switch button');
  await page.until(`document.querySelector('.site-preview')`, 'site preview ready');
  await page.until(`document.querySelector('a[data-sidebar="menu-sub-button"][href="/books"]')`, 'sidebar navigation mounted');
  await page.click('a[data-sidebar="menu-sub-button"][href="/books"]');
  await page.until(`document.querySelector('.site-preview')?.dataset.sitePage==='${library.id}' && document.querySelectorAll('[data-repeater-item]').length===2`, 'shared sidebar and REST collection');
  assert.equal(await page.evaluate(`document.querySelector('.native-sidebar-sub a[aria-current="page"]').textContent`), '馆藏管理');
  steps.push('共享侧栏切页与公开 GET /api/books');
  await page.click('[data-repeater-item="a1"] .page-button');
  await page.until(`document.querySelector('.site-preview')?.dataset.sitePage==='${detail.id}' && document.querySelector('[data-block-id="detail-title"]')?.textContent==='设计中的设计'`, 'detail binding');
  await page.until(`document.querySelector('form[aria-label="编辑馆藏"] input[name="title"]')`, 'update form is ready');
  await page.fill('form[aria-label="编辑馆藏"] input[name="title"]', '更新后的书名'); await page.fill('form[aria-label="编辑馆藏"] textarea[name="author"]', '更新后的作者');
  await page.submit('form[aria-label="编辑馆藏"] button[type="submit"]', 'PUT');
  await page.until(`document.querySelector('[data-block-id="detail-title"]')?.textContent==='更新后的书名'`, 'PUT refreshes detail');
  assert.equal(books[0].title, '更新后的书名'); steps.push('GET /api/books/:id 详情与确认后 PUT 更新');
  await page.click('[aria-label="返回上一页"]');
  await page.until(`document.querySelector('.site-preview')?.dataset.sitePage==='${library.id}' && [...document.querySelectorAll('[data-repeater-item]')].some(item=>item.textContent.includes('更新后的书名'))`, 'updated list');
  await page.until(`document.querySelector('form[aria-label="新增馆藏"] input[name="title"]')`, 'create form is ready');
  await page.fill('form[aria-label="新增馆藏"] input[name="title"]', '浏览器新增图书'); await page.fill('form[aria-label="新增馆藏"] textarea[name="author"]', '测试作者');
  await page.submit('form[aria-label="新增馆藏"] button[type="submit"]', 'POST');
  await page.until(`[...document.querySelectorAll('[data-repeater-item]')].some(item=>item.textContent.includes('浏览器新增图书'))`, 'POST refreshes collection');
  assert.equal(books.length, 3); steps.push('确认后 POST 创建并刷新列表');
  await page.click('a[data-sidebar="menu-sub-button"][href="/loans"]'); await page.until(`document.querySelector('.data-state')?.textContent.includes('暂无数据')`, 'empty state');
  await page.click('a[data-sidebar="menu-sub-button"][href="/categories"]'); await page.until(`document.querySelector('.data-state--error')?.textContent.includes('HTTP 500')`, 'HTTP error state');
  await page.click('a[data-sidebar="menu-sub-button"][href="/tasks"]'); await page.until(`document.querySelector('.data-state--error')?.textContent.includes('超时')`, 'timeout state');
  steps.push('空数据、HTTP 错误与超时状态');
  await page.click('a[data-sidebar="menu-sub-button"][href="/"]'); await page.until(`document.querySelectorAll('[data-block-id="home-table"] tbody tr').length===3`, 'home table refresh');
  await page.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(work, 'downloads') });
  await page.click('[aria-label="页面操作"]');
  await page.until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()==='导出 HTML')`, 'export menu mounted');
  await page.clickText('导出 HTML', '[role="menuitem"]');
  const download = await untilValue(async () => {
    const files = await readdir(join(work, 'downloads')).catch(() => []);
    const file = files.find(name => name.endsWith('.html'));
    return file ? join(work, 'downloads', file) : null;
  }, 'native HTML download', 45000);
  steps.push('通过编辑器实际下载 HTML');
  assert.ok((await readFile(download, 'utf8')).includes('books2'), 'exported document contains the newly configured source');
  const exported = await attach(pathToFileURL(download).href);
  await exported.until(`document.querySelector('.site-preview')`, 'export opens');
  await exported.until(`document.querySelector('a[data-sidebar="menu-sub-button"][href="#/books"]')`, 'export navigation mounted');
  await exported.click('a[data-sidebar="menu-sub-button"][href="#/books"]');
  await exported.until(`document.querySelectorAll('[data-repeater-item]').length===3`, 'export reads collection');
  await exported.click('[data-repeater-item="a1"] .page-button');
  await exported.until(`location.hash==='#/books/a1' && document.querySelector('[data-block-id="detail-title"]')?.textContent==='更新后的书名'`, 'export dynamic route');
  await exported.call('Page.reload', { ignoreCache: true });
  await exported.until(`location.hash==='#/books/a1' && document.querySelector('[data-block-id="detail-title"]')?.textContent==='更新后的书名'`, 'export route survives refresh');
  await exported.until(`document.querySelector('form[aria-label="编辑馆藏"] input[name="title"]')`, 'export update form is ready');
  await exported.fill('form[aria-label="编辑馆藏"] input[name="title"]', '导出后更新'); await exported.fill('form[aria-label="编辑馆藏"] textarea[name="author"]', '导出后作者');
  await exported.submit('form[aria-label="编辑馆藏"] button[type="submit"]', 'PUT');
  await exported.until(`document.querySelector('[data-block-id="detail-title"]')?.textContent==='导出后更新'`, 'export confirmed PUT');
  assert.equal(books[0].title, '导出后更新');
  await exported.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await exported.until(`document.querySelector('.page-free-scaled-shell')?.getBoundingClientRect().width<=390`, '390px export fit');
  assert.ok(await exported.evaluate(`document.querySelector('.page-surface').scrollWidth<=document.querySelector('.page-surface').clientWidth+1`));
  assert.ok(await exported.evaluate(`[...document.querySelectorAll('.data-form')].every(form=>getComputedStyle(form).overflowY!=='auto' && getComputedStyle(form).overflowY!=='scroll')`));
  await screenshot(exported, 'm2-export-mobile.png'); steps.push('HTML 导出、路由刷新、确认后 PUT 与 390px 窄屏');
  await page.call('Page.navigate', { url: `${origin}/p/browser-test/books` });
  await page.until(`document.querySelectorAll('[data-repeater-item]').length===3`, 'shared snapshot collection');
  await page.click('[data-repeater-item="a1"] .page-button');
  await page.until(`location.pathname==='/p/browser-test/books/a1' && document.querySelector('[data-block-id="detail-title"]')?.textContent==='导出后更新'`, 'shared detail route');
  await screenshot(page, 'm2-shared-desktop.png'); steps.push('分享快照与动态深链（本地快照响应）');
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(calls.filter(call => call.method === 'PUT').length, 2);
  assert.equal(calls.filter(call => !['GET', 'POST', 'PUT', 'OPTIONS'].includes(call.method)).length, 0);
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({ steps, calls, errors, export: pathToFileURL(download).href }, null, 2));
  await writeFile(join(out, 'library-site.html'), await readFile(download, 'utf8'));
  console.log(JSON.stringify({ ok: true, steps, calls, artifacts: out }, null, 2));
}
try { await main(); }
catch (error) {
  if (activePage) {
    try { errors.push(await activePage.evaluate('document.body.innerText')); const capture = await activePage.call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, 'm2-failure.png'), Buffer.from(capture.data, 'base64')); } catch { /* Preserve the original failure. */ }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: false, error: String(error), steps, calls, errors }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  for (const timer of timers) clearTimeout(timer);
  try { if (socket) socket.send(JSON.stringify({ id: ++nextId, method: 'Browser.close', params: {} })); } catch { /* The owned browser may already have exited. */ }
  if (browser.exitCode === null) browser.kill('SIGTERM');
  if (!appClosed) { appClosed = true; await app.locals.closeFrontend?.(); }
  await new Promise(resolve => server.close(resolve));
}
