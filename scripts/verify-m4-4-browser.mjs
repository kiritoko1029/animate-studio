import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createAuthFactory, resolveSessionUser } from '../server/auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createMediaRepository } from '../db/media-repository.ts';
import { createNodeMediaStorage } from '../server/media-storage-node.ts';
import { createBlock, createDocument } from '../src/model.ts';
import { createSiteDocument, createSitePage } from '../shared/site-document.mjs';

const out = resolve('artifacts/m4-4-collections');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
let app;
const server = createServer((request, response) => app(request, response));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const database = await createNodeDatabase({}, { file: join(work, 'accounts.sqlite') });
await applyNodeMigrations(database);
const sent = [];
const factory = createAuthFactory({ baseURL: origin, secret: 'm4-4-local-verification-secret-0123456789abcdef', database, emailEnabled: true, githubEnabled: false, sender: { send: async data => { sent.push({ ...data }); } } });
const repository = createPageRepository(database.db, database.schema, database.dialect);
const media = { repository: createMediaRepository(database.db, database.schema, database.dialect), storage: createNodeMediaStorage(join(work, 'media')), newId: () => crypto.randomUUID() };
const accounts = { factory, context: { repository, media, newPageId: () => crypto.randomUUID(), newShareToken: () => crypto.randomUUID().replaceAll('-', '').slice(0, 22), capabilities: factory.capabilities, canonicalOrigin: origin, resolveUser: request => resolveSessionUser(factory.auth, request) }, close: () => database.close() };
app = await createApp({ dataDir: join(work, 'data'), serveFrontend: true, production: true, accounts });
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let socket, activePage, nextId = 0, browserVersion = '';
const pending = new Map(), errors = [], steps = [], details = {};
let allowUnloadDialog = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function untilValue(fn, description, timeout = 20000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch { last = undefined; } await delay(60); }
  throw new Error(`Timed out: ${description}${last === undefined ? '' : ` (${last})`}`);
}
async function rpc(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function attach(url) {
  const { targetId } = await rpc('Target.createTarget', { url });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => rpc(method, params, sessionId);
  await call('Page.enable'); await call('Runtime.enable'); await call('DOM.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const until = async (expression, description, timeout) => untilValue(async () => evaluate(`(()=>{try{return Boolean(${expression})}catch{return null}})()`), description, timeout);
  const key = async (key, code = key, virtualKey) => {
    const enter = key === 'Enter', escape = key === 'Escape';
    const windowsVirtualKeyCode = virtualKey ?? (enter ? 13 : escape ? 27 : 0);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, ...(enter ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
  };
  const click = async (selector, text) => {
    await evaluate(`(()=>{const element=${text ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!element)throw new Error('Missing clickable element: '+${JSON.stringify(selector)}+' '+document.body.innerText);element.focus({preventScroll:true});return true})()`);
    await key('Enter');
  };
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await call('Input.insertText', { text: value }); };
  const select = async (selector, value) => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw new Error('Missing select: '+${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  const openMenu = async (selector, text) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`);
    await key('ArrowDown', 'ArrowDown', 40);
    await until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()===${JSON.stringify(text)})`, `${text} menu mounted`);
  };
  const reload = async () => {
    await until(`document.querySelector('.save-status.saved')`, 'autosave settled before reload');
    const url = await evaluate('location.href');
    allowUnloadDialog = true;
    try {
      await call('Page.navigate', { url });
      await until(`document.readyState==='complete'`, 'browser reload completed');
    } finally { allowUnloadDialog = false; }
  };
  return { call, evaluate, until, key, click, fill, select, reload, openMenu, sessionId, targetId };
}
async function settle(page) {
  await page.evaluate(`document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity){try{animation.finish()}catch{}}});true`);
  await page.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
}
async function screenshot(page, name) {
  await settle(page);
  const result = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(out, name), Buffer.from(result.data, 'base64'));
}
async function clickMenuItem(page, label) {
  const clicked = await page.evaluate(`(()=>{const element=[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!element)return false;element.click();return true})()`);
  if (!clicked) throw new Error(`Missing menu item: ${label}`);
}
async function openCollections(page) {
  await page.click('[aria-label="数据与脚本"]');
  await page.until(`document.querySelector('.interaction-studio')`, 'interaction studio mounted');
  await page.click('#logic-tab-collections');
  await page.until(`document.querySelector('.collection-manager') || document.querySelector('.collection-empty')`, 'collections ready');
}
async function applyContent(page) {
  await page.click('.collection-actions .primary-button');
  await page.until(`document.querySelector('.collection-message')?.textContent.includes('内容已应用')`, 'collection applied');
}
async function openPublish(page) {
  await page.openMenu('[aria-label="更多操作"]', '分享页面'); await clickMenuItem(page, '分享页面');
  await page.until(`document.querySelector('#login-email') || document.querySelector('.publish-center-dialog')`, 'sign-in or publish center mounted');
  await page.until(`!document.querySelector('.publish-loading')`, 'publish status loaded');
}
async function closePublish(page) {
  await page.until(`document.querySelector('[aria-label="关闭发布与分享"]')?.disabled===false`, 'publish actions settled');
  await page.click('[aria-label="关闭发布与分享"]');
  await page.until(`!document.querySelector('.publish-center-dialog')`, 'publish center closed');
}
async function publish(page, initial = false) {
  await openPublish(page); await page.click('button', initial ? '检查并发布' : '检查并更新分享');
  await page.click('button', '确认公开发布');
  await page.until(`document.querySelector('.publish-current-status')?.textContent.includes('当前公开版本')`, 'publication completed');
}
async function main() {
  const version = await untilValue(async () => {
    const response = await fetch(`http://127.0.0.1:${JSON.parse((await readFile(join(work, 'chrome', 'DevToolsActivePort'), 'utf8')).split('\n')[0])}/json/version`);
    return response.ok ? response.json() : null;
  }, 'Chrome DevTools ready', 15000);
  browserVersion = version.Browser;
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    } else if (message.method === 'Page.javascriptDialogOpening') {
      steps.push(`dialog:${message.params.type}:${message.params.message}`);
      if (allowUnloadDialog) void rpc('Page.handleJavaScriptDialog', { accept: true }, message.sessionId);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(item => item.value ?? item.description).join(' '));
  });
  const page = await attach('about:blank'); activePage = page;
  const document = createDocument(true); document.name = '内容集合验收'; document.settings.canvasHeight = 1800;
  const list = createBlock('repeater'), table = createBlock('table'), chart = createBlock('chart');
  Object.assign(list, { id: 'article-list', frame: { x: 40, y: 30, width: 620, height: 800 } });
  list.props.sourceId = ''; list.props.dataFields.more.url = '/details/{{item.id}}';
  Object.assign(table, { id: 'article-table', frame: { x: 700, y: 30, width: 620, height: 310 } }); table.props.sourceId = '';
  Object.assign(chart, { id: 'article-chart', frame: { x: 700, y: 380, width: 620, height: 440 } }); chart.props.sourceId = '';
  document.blocks = [list, table, chart];
  const site = createSiteDocument(document, '内容集合验收');
  site.dataSources = [{ id: 'legacy', name: '保留的旧数据', kind: 'static', mode: 'collection', items: [{ id: 'keep', title: '不要删除' }] }];
  const detail = createSitePage(site, '文章详情', 'detail'); detail.path = '/details/:id';
  const detailTitle = createBlock('text'); detailTitle.id = 'detail-title'; detailTitle.props.text = '等待内容'; detailTitle.frame = { x: 48, y: 80, width: 900, height: 150 }; detailTitle.bindings = { text: { kind: 'expression', value: 'data.collection3.title' } };
  detail.page.blocks = [detailTitle]; detail.page.settings.canvasHeight = 700; site.pages.push(detail);
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){localStorage.setItem('animate-studio:locale','zh-CN');if(!localStorage.getItem('animate-studio:guest-site-draft:v1'))localStorage.setItem('animate-studio:guest-site-draft:v1',${JSON.stringify(JSON.stringify({ page: site, savedAt: new Date().toISOString() }))});}` });
  await page.call('Page.navigate', { url: origin });
  await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='内容集合验收'`, 'editor ready');
  await openCollections(page); await page.click('button', '新建内容集合');
  await page.until(`document.querySelector('[aria-label="记录字段 标题"]')`, 'first record ready');
  await page.fill('[aria-label="集合名称"]', '文章列表');
  await page.click('.collection-fields > summary'); await page.click('button', '添加字段');
  await page.fill('[aria-label="新字段 key"]', 'views'); await page.fill('[aria-label="新字段名称"]', '阅读量'); await page.select('[aria-label="新字段类型"]', 'number'); await page.click('button', '添加字段');
  await page.fill('[aria-label="记录字段 标题"]', '第一篇（示例）'); await page.fill('[aria-label="记录字段 阅读量"]', '12'); await applyContent(page);
  await page.click('[aria-label="复制当前记录"]'); await page.fill('[aria-label="记录 ID"]', 'second'); await page.fill('[aria-label="记录字段 标题"]', '第二篇（示例）'); await page.fill('[aria-label="记录字段 阅读量"]', '24'); await applyContent(page);
  await page.click('button', '新建集合'); await page.until(`document.querySelector('[aria-label="集合名称"]')`, 'second collection ready');
  await page.fill('[aria-label="集合名称"]', '文章详情'); await page.select('[aria-label="集合用途"]', 'single'); await page.fill('[aria-label="记录字段 标题"]', '第一篇（示例）'); await applyContent(page);
  await screenshot(page, 'collection-editor.png');
  await page.click('[aria-label="关闭交互工作台"]');
  for (const id of ['article-list', 'article-table', 'article-chart']) {
    await page.evaluate(`document.querySelector('.free-canvas-frame[data-block-id="${id}"]').focus({preventScroll:true});true`); await page.key('Enter');
    await page.until(`document.querySelector('[aria-label="数据源"]')`, `${id} inspector ready`);
    await page.select('[aria-label="数据源"]', 'collection2');
    await page.until(`document.querySelector('[aria-label="数据源"]')?.value==='collection2'`, `${id} bound`);
  }
  await page.select('[aria-label="分类字段"]', 'title'); await page.select('[aria-label="指标字段 1"]', 'views');
  await untilValue(async () => page.evaluate(`JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1')).page.dataSources.some(source=>source.id==='legacy'&&source.items[0].title==='不要删除')`), 'legacy source preserved in autosave');
  await page.reload(); await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='内容集合验收'`, 'editor restored');
  await page.click('#view-tab-preview');
  await page.until(`document.querySelectorAll('.preview-pane [data-repeater-item]').length===2 && document.querySelectorAll('.preview-pane .page-data-table tbody tr').length===2`, 'saved list and table restored');
  assert.equal(await page.evaluate(`document.querySelectorAll('.preview-pane [data-chart-mark]').length`), 2);
  assert.match(await page.evaluate(`document.querySelector('.preview-pane .chart-meta').textContent`), /全部 2 条集合记录/);
  await screenshot(page, 'collection-preview.png');
  steps.push('不写 JSON 新建字段、编辑复制记录，绑定列表、表格、图表并刷新恢复，保留旧数据源');

  await openPublish(page); await page.fill('#login-email', 'm4-4@studio.test'); await page.click('button', '发送验证码');
  const otp = await untilValue(async () => sent.at(-1)?.otp, 'local OTP captured');
  await page.until(`document.querySelector('#login-otp')`, 'OTP input ready'); await page.fill('#login-otp', otp); await page.click('form button', '登录');
  await page.until(`document.querySelector('.more-actions-button')?.title.includes('m4-4@studio.test')`, 'local account ready');
  await publish(page, true);
  const siteId = await page.evaluate(`new URL(location.href).searchParams.get('page')`);
  const token = await page.evaluate(`document.querySelector('.publish-share-link input').value.split('/p/')[1]`);
  assert.ok(siteId && token); details.siteId = siteId; await closePublish(page);
  const shared = await attach(`${origin}/p/${token}`); activePage = shared;
  await shared.until(`document.querySelectorAll('[data-repeater-item]').length===2 && document.querySelectorAll('.page-data-table tbody tr').length===2`, 'public list and table');
  assert.equal(await shared.evaluate(`document.querySelectorAll('[data-chart-mark]').length`), 2);
  await screenshot(shared, 'collection-public.png');
  const detailPage = await attach(`${origin}/p/${token}/details/example`); activePage = detailPage;
  await detailPage.until(`document.querySelector('[data-block-id="detail-title"]')?.textContent==='第一篇（示例）'`, 'matched public detail');
  await detailPage.call('Page.navigate', { url: `${origin}/p/${token}/details/missing` });
  await detailPage.until(`document.querySelector('[role="alert"]')?.textContent.includes('没有找到匹配的内容记录')`, 'missing detail is explicit');
  assert.equal(await detailPage.evaluate(`document.querySelector('[data-block-id="detail-title"]')?.textContent==='第一篇（示例）'`), false, 'missing detail never falls back to the first record');
  await rpc('Target.closeTarget', { targetId: detailPage.targetId }); await rpc('Target.closeTarget', { targetId: shared.targetId }); activePage = page;
  steps.push('公开发布保留集合，动态详情按路由读取，缺失记录明确报错且不回退第一条');

  const previousDownloads = new Map();
  for (const name of await readdir(out)) if (name.endsWith('.html')) previousDownloads.set(name, (await stat(join(out, name))).mtimeMs);
  await page.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  await page.openMenu('[aria-label="页面操作"]', '导出 HTML'); await clickMenuItem(page, '导出 HTML');
  const filename = await untilValue(async () => {
    for (const name of await readdir(out)) {
      if (!name.endsWith('.html')) continue;
      if (previousDownloads.get(name) !== undefined && (await stat(join(out, name))).mtimeMs <= previousDownloads.get(name)) continue;
      const content = await readFile(join(out, name), 'utf8');
      if (/<\/html>\s*$/.test(content)) return name;
    }
    return null;
  }, 'fresh HTML completed');
  const htmlPath = join(out, filename);
  const offline = await attach(`file://${htmlPath}`); activePage = offline;
  await offline.until(`document.querySelectorAll('[data-repeater-item]').length===2 && document.querySelectorAll('.page-data-table tbody tr').length===2`, 'offline collection renders');
  assert.equal(await offline.evaluate(`document.querySelectorAll('[data-chart-mark]').length`), 2);
  await offline.evaluate(`location.hash='/details/example';true`);
  await offline.until(`document.querySelector('[data-block-id="detail-title"]')?.textContent==='第一篇（示例）'`, 'offline detail renders');
  assert.equal(await offline.evaluate(`document.head.querySelector('meta[name="robots"]')?.content`), 'noindex,nofollow');
  await rpc('Target.closeTarget', { targetId: offline.targetId }); activePage = page;
  steps.push('真实 HTML 下载无需外部 CMS，离线列表、图表和路由详情可用，robots 保持 noindex');

  await page.click('#view-tab-edit'); await openCollections(page);
  await page.select('.collection-source-row select', 'collection2');
  await page.until(`document.querySelector('[aria-label="集合名称"]')?.value==='文章列表'`, 'list selected for draft change');
  await page.click('.collection-record-tabs button'); await page.fill('[aria-label="记录字段 标题"]', '尚未公开的修改'); await applyContent(page);
  await page.click('[aria-label="关闭交互工作台"]');
  await publish(page); await page.click('#publish-history-tab'); await page.click('.publish-version');
  await page.until(`document.querySelector('.publish-footer-actions .primary-button')?.textContent==='回滚公开内容'`, 'rollback available');
  await page.click('button', '回滚公开内容'); await page.click('button', '确认公开回滚');
  await page.until(`document.querySelector('.publish-notice')?.textContent.includes('已回滚公开内容')`, 'rollback completed'); await closePublish(page);
  const rolledBack = await attach(`${origin}/p/${token}`); activePage = rolledBack;
  await rolledBack.until(`document.querySelector('[data-repeater-item="example"]')?.textContent.includes('第一篇（示例）')`, 'public rollback restores record');
  assert.equal(await rolledBack.evaluate(`document.body.textContent.includes('尚未公开的修改')`), false);
  await rpc('Target.closeTarget', { targetId: rolledBack.targetId }); activePage = page;
  steps.push('修改草稿不改变公开快照，公开回滚恢复集合且保留草稿独立性');

  await openCollections(page); await page.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.until(`document.querySelector('.interaction-studio').getBoundingClientRect().width<=390`, 'mobile collection manager fits viewport');
  assert.equal(await page.evaluate(`document.documentElement.scrollWidth<=390`), true);
  await screenshot(page, 'collection-mobile.png');
  await page.click('[aria-label="关闭交互工作台"]');
  await page.openMenu('[aria-label="更多操作"]', '切换深色外观'); await clickMenuItem(page, '切换深色外观');
  await openCollections(page);
  await page.until(`document.documentElement.dataset.studioTheme==='dark' && document.querySelector('.collection-manager')`, 'dark collection manager ready');
  await screenshot(page, 'collection-dark.png');
  await page.click('[aria-label="关闭交互工作台"]');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  details.workflow = { guestSave: true, publicDetail: true, missingDetailError: true, offlineExport: true, publicRollback: true, mobile: 390, dark: true, realModel: false, remote: false };
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: true, browser: browserVersion, steps, details, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, steps, artifacts: out, details, errors }, null, 2));
}
try { await main(); }
catch (error) {
  if (activePage) { try { errors.push(await activePage.evaluate('document.body.innerText')); const capture = await activePage.call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, 'failure.png'), Buffer.from(capture.data, 'base64')); } catch { /* Preserve the original failure. */ } }
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: false, error: String(error), browser: browserVersion, steps, details, errors }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    try { if (socket) socket.send(JSON.stringify({ id: ++nextId, method: 'Browser.close', params: {} })); } catch { /* Browser already closed. */ }
    await Promise.race([exited, delay(3000)]);
    if (browser.exitCode === null) { browser.kill('SIGTERM'); await Promise.race([exited, delay(3000)]); }
  }
  await app.locals.closeFrontend?.(); server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve)); await database.close();
}
