import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createAuthFactory, resolveSessionUser } from '../server/auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createBlock, createDocument } from '../src/model.ts';
import { createSiteDocument, createSitePage } from '../shared/site-document.mjs';

const out = resolve('artifacts/m4-2-seo');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
let app;
const server = createServer((request, response) => app(request, response));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const database = await createNodeDatabase({}, { file: join(work, 'accounts.sqlite') });
await applyNodeMigrations(database);
const sent = [];
const factory = createAuthFactory({ baseURL: origin, secret: 'm4-2-local-verification-secret-0123456789abcdef', database, emailEnabled: true, githubEnabled: false, sender: { send: async data => { sent.push({ ...data }); } } });
const repository = createPageRepository(database.db, database.schema, database.dialect);
const accounts = { factory, context: { repository, newPageId: () => crypto.randomUUID(), newShareToken: () => crypto.randomUUID().replaceAll('-', '').slice(0, 22), capabilities: factory.capabilities, canonicalOrigin: origin, resolveUser: request => resolveSessionUser(factory.auth, request) }, close: () => database.close() };
app = await createApp({ dataDir: join(work, 'data'), serveFrontend: true, production: true, accounts });
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let socket, activePage, nextId = 0, browserVersion = '';
const pending = new Map(), errors = [], steps = [], details = { baseline: ['artifacts/m4-1-publish/baseline-published.png', 'artifacts/m4-1-publish/baseline-share.png'] };
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
  await call('Page.enable'); await call('Runtime.enable');
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
    await evaluate(`(()=>{const element=${text ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!element)throw new Error('Missing clickable element: '+${JSON.stringify(selector)});element.focus({preventScroll:true});return true})()`);
    await key('Enter');
  };
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await call('Input.insertText', { text: value }); };
  const openMenu = async (selector, text) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`);
    await key('ArrowDown', 'ArrowDown', 40);
    await until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()===${JSON.stringify(text)})`, `${text} menu mounted`);
    await settle({ evaluate, until });
  };
  return { call, evaluate, until, key, click, fill, openMenu, sessionId, targetId };
}
async function settle(page) {
  await page.evaluate(`document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity){try{animation.finish()}catch{}}});true`);
  await page.until(`document.getAnimations().every(animation=>animation.playState!=='running'||animation.effect?.getTiming().iterations===Infinity)`, 'visual transitions settled');
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
async function api(page, path) { return page.evaluate(`fetch(${JSON.stringify(path)},{credentials:'same-origin'}).then(async response=>({status:response.status,body:await response.json()}))`); }
async function openPublish(page) {
  await page.openMenu('[aria-label="更多操作"]', '分享页面');
  await clickMenuItem(page, '分享页面');
  await page.until(`document.querySelector('#login-email') || document.querySelector('.publish-center-dialog')`, 'sign-in or publish center mounted');
  if (await page.evaluate(`!document.querySelector('#login-email')`)) await page.until(`document.querySelector('.publish-center-dialog')`, 'publish center mounted');
  await page.until(`!document.querySelector('.publish-loading')`, 'publish status loaded');
}
async function publish(page, initial = false) {
  await openPublish(page); await page.click(initial ? 'button' : 'button', initial ? '检查并发布' : '检查并更新分享');
  await page.click('button', '确认公开发布');
  await page.until(`document.querySelector('.publish-current-status')?.textContent.includes('当前公开版本')`, 'publication completed');
}
async function closePublish(page) {
  await page.until(`document.querySelector('[aria-label="关闭发布与分享"]')?.disabled===false`, 'publish actions settled');
  await page.click('[aria-label="关闭发布与分享"]');
  await page.until(`!document.querySelector('.publish-center-dialog')`, 'publish center closed');
}
async function openPageSettings(page) {
  await page.click('#inspector-tab-page');
  await page.until(`document.querySelector('.seo-settings')`, 'SEO settings visible');
  await page.evaluate(`document.querySelector('.seo-settings').scrollIntoView({block:'center'});true`);
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
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(item => item.value ?? item.description).join(' '));
  });
  const page = await attach('about:blank'); activePage = page;
  const document = createDocument(true); document.name = '首页';
  const text = createBlock('text'); text.props.text = '校园新闻、通知公告与招生信息。';
  const button = createBlock('button'); button.props = { ...button.props, label: '阅读校园新闻', url: '/news' };
  document.blocks = [{ ...text, id: 'intro', frame: { x: 48, y: 48, width: 760, height: 140 } }, { ...button, id: 'news-link', frame: { x: 48, y: 220, width: 240, height: 100 } }];
  const site = createSiteDocument(document, 'SEO 验收站点');
  const news = createSitePage(site, '新闻中心'); news.path = '/news'; news.page.blocks = [{ ...createBlock('text'), id: 'news-text', props: { ...createBlock('text').props, text: '校园最新公告与活动。' }, frame: { x: 48, y: 48, width: 760, height: 140 } }];
  const detail = createSitePage(site, '文章详情', 'detail'); detail.path = '/articles/:id'; detail.page.blocks = [];
  site.pages.push(news, detail);
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){localStorage.setItem('animate-studio:locale','zh-CN');localStorage.setItem('animate-studio:guest-site-draft:v1',${JSON.stringify(JSON.stringify({ page: site, savedAt: new Date().toISOString() }))});}` });
  await page.call('Page.navigate', { url: origin });
  await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='首页'`, 'editor ready');
  await openPageSettings(page);
  await page.fill('input[aria-label="搜索标题"]', '知行大学 · 官方网站');
  await page.fill('textarea[aria-label="搜索描述"]', '校园新闻、通知公告与招生服务，一页直达。');
  await page.fill('input[aria-label="分享图片地址"]', '/landscape.svg');
  await page.click('input[aria-label="搜索标题"]');
  await page.until(`document.querySelector('[data-testid="seo-preview"] strong')?.textContent==='知行大学 · 官方网站'`, 'SEO preview follows edits');
  await page.until(`document.querySelector('.seo-share-preview img')?.getAttribute('src')?.endsWith('/landscape.svg')`, 'share image preview ready');
  await untilValue(async () => page.evaluate(`(()=>{const draft=JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1'));return draft.page.pages[0].seo?.title==='知行大学 · 官方网站'})()`), 'guest SEO saved');
  await screenshot(page, 'seo-editor.png');
  steps.push('页面设置编辑标题、描述和分享图，实时预览并保存游客草稿');

  await openPublish(page);
  await page.until(`document.querySelector('#login-email')`, 'local sign-in required');
  await page.fill('#login-email', 'm4-2@studio.test'); await page.click('button', '发送验证码');
  const otp = await untilValue(async () => sent.at(-1)?.otp, 'local OTP captured');
  await page.until(`document.querySelector('#login-otp')`, 'OTP input ready'); await page.fill('#login-otp', otp); await page.click('form button', '登录');
  await page.until(`document.querySelector('.more-actions-button')?.title.includes('m4-2@studio.test')`, 'local account ready');
  await publish(page, true); await closePublish(page);
  const siteId = await page.evaluate(`new URL(location.href).searchParams.get('page')`);
  await openPublish(page);
  const token = await page.evaluate(`document.querySelector('.publish-share-link input').value.split('/p/')[1]`);
  assert.ok(token && siteId); details.token = token; await closePublish(page);

  const shared = await attach(`${origin}/p/${token}`); activePage = shared;
  await shared.until(`document.title==='知行大学 · 官方网站'`, 'published home metadata');
  assert.equal(await shared.evaluate(`document.head.querySelector('meta[property="og:image"]')?.content`), `${origin}/landscape.svg`);
  await shared.until(`document.querySelector('[data-block-id="news-link"] button')?.textContent.includes('阅读校园新闻')`, 'public navigation ready');
  await shared.click('button', '阅读校园新闻');
  await shared.until(`location.pathname==='/p/${token}/news' && document.title==='新闻中心 · SEO 验收站点'`, 'client deep-route metadata');
  assert.equal(await shared.evaluate(`document.head.querySelector('meta[property="og:image"]')`), null, 'previous social image is removed on route change');
  assert.equal(await shared.evaluate(`document.head.querySelector('link[rel="canonical"]')?.href`), `${origin}/p/${token}/news`);
  assert.equal(await shared.evaluate(`fetch('sitemap.xml').then(response=>response.text()).then(xml=>new DOMParser().parseFromString(xml,'application/xml').querySelectorAll('url').length)`), 2);
  await shared.until(`document.body.innerText.includes('校园最新公告与活动。')`, 'public news content visible');
  await screenshot(shared, 'seo-public.png');
  await shared.call('Page.navigate', { url: `${origin}/p/${token}/articles/42` });
  await shared.until(`document.head.querySelector('meta[name="robots"]')?.content==='noindex,nofollow'`, 'dynamic route noindex');
  await screenshot(shared, 'seo-dynamic-noindex.png');
  steps.push('公开首页、客户端深链、分享图清理、动态 noindex 与静态站点地图');
  await rpc('Target.closeTarget', { targetId: shared.targetId }); activePage = page;

  await page.click('#sidebar-tab-pages');
  await page.evaluate(`[...document.querySelectorAll('.site-page-open')].find(item=>item.querySelector('span')?.textContent==='新闻中心').focus({preventScroll:true});true`);
  await page.key('Enter');
  await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='新闻中心'`, 'news editor selected');
  await openPageSettings(page);
  await page.fill('input[aria-label="搜索标题"]', '新闻中心 · 知行大学');
  await page.fill('textarea[aria-label="搜索描述"]', '阅读校园新闻与最新公告。');
  const id = await page.evaluate(`new URL(location.href).searchParams.get('page')`);
  await untilValue(async () => (await api(page, `/api/account/sites/${id}`)).body.page.pages.find(entry=>entry.id===news.id)?.seo?.title === '新闻中心 · 知行大学', 'cloud SEO saved');
  await publish(page); await closePublish(page);
  assert.match(await (await fetch(`${origin}/p/${token}/news`)).text(), /新闻中心 · 知行大学/);
  assert.match(await (await fetch(`${origin}/p/${token}`)).text(), /知行大学 · 官方网站/);
  await page.click('[aria-label="允许搜索引擎收录"]');
  await page.until(`document.querySelector('[aria-label="允许搜索引擎收录"]')?.getAttribute('aria-checked')==='false'`, 'news indexing disabled');
  await untilValue(async () => (await api(page, `/api/account/sites/${id}`)).body.page.pages.find(entry=>entry.id===news.id)?.seo?.noIndex === true, 'noindex saved');
  assert.match(await (await fetch(`${origin}/p/${token}/news`)).text(), /content="index,follow"/, 'draft noindex is not public yet');
  await publish(page); await closePublish(page);
  assert.match(await (await fetch(`${origin}/p/${token}/news`)).text(), /content="noindex,nofollow"/);
  assert.equal(await (await fetch(`${origin}/p/${token}/sitemap.xml`)).text().then(text=>(text.match(/<url>/g)||[]).length), 1);
  steps.push('新闻 SEO 更新保持链接，noindex 草稿不提前公开，发布后从站点地图移除');

  await page.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await openPageSettings(page);
  assert.ok(await page.evaluate(`document.querySelector('.seo-settings').getBoundingClientRect().left>=0 && document.querySelector('.seo-settings').getBoundingClientRect().right<=390`));
  await screenshot(page, 'seo-mobile.png');
  await page.openMenu('[aria-label="更多操作"]', '切换深色外观'); await clickMenuItem(page, '切换深色外观');
  await page.until(`document.documentElement.dataset.studioTheme==='dark'`, 'dark workbench enabled');
  await openPageSettings(page);
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.seo-search-preview')).backgroundColor`), 'rgb(10, 10, 10)');
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.free-canvas-stage')).backgroundColor`), 'rgb(255, 255, 255)');
  await screenshot(page, 'seo-dark.png');
  details.workflow = { old: '手写 meta 标签并记住每个公开路由', current: '页面设置中编辑并预览，公开发布复用同一站点快照', draftIsolation: true, deepRouteMetadata: true, noindex: true };
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: true, browser: browserVersion, steps, details, errors, remote: false }, null, 2));
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
