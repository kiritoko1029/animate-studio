import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import sharp from 'sharp';
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

const out = resolve('artifacts/m4-3-media');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
let app;
const server = createServer((request, response) => app(request, response));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const database = await createNodeDatabase({}, { file: join(work, 'accounts.sqlite') });
await applyNodeMigrations(database);
const sent = [];
const factory = createAuthFactory({ baseURL: origin, secret: 'm4-3-local-verification-secret-0123456789abcdef', database, emailEnabled: true, githubEnabled: false, sender: { send: async data => { sent.push({ ...data }); } } });
const repository = createPageRepository(database.db, database.schema, database.dialect);
const media = { repository: createMediaRepository(database.db, database.schema, database.dialect), storage: createNodeMediaStorage(join(work, 'media')), newId: () => crypto.randomUUID() };
const accounts = { factory, context: { repository, media, newPageId: () => crypto.randomUUID(), newShareToken: () => crypto.randomUUID().replaceAll('-', '').slice(0, 22), capabilities: factory.capabilities, canonicalOrigin: origin, resolveUser: request => resolveSessionUser(factory.auth, request) }, close: () => database.close() };
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
    await evaluate(`(()=>{const element=${text ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!element)throw new Error('Missing clickable element: '+${JSON.stringify(selector)});element.focus({preventScroll:true});return true})()`);
    await key('Enter');
  };
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await call('Input.insertText', { text: value }); };
  const setFile = async (selector, files) => {
    const { root } = await call('DOM.getDocument', { depth: 1 });
    const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`File input not found: ${selector}`);
    await call('DOM.setFileInputFiles', { nodeId, files });
  };
  const openMenu = async (selector, text) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`);
    await key('ArrowDown', 'ArrowDown', 40);
    await until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()===${JSON.stringify(text)})`, `${text} menu mounted`);
    await settle({ evaluate, until });
  };
  const reload = async () => {
    let loaded = false;
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Page.loadEventFired' && message.sessionId === sessionId) { loaded = true; socket.removeEventListener('message', listener); }
    };
    socket.addEventListener('message', listener);
    await call('Page.reload');
    await untilValue(() => loaded || null, 'browser reload completed');
  };
  return { call, evaluate, until, key, click, fill, setFile, reload, openMenu, sessionId, targetId };
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
  let failNextMedia = false, interceptionEnabled = false;
  const expectedNetworkErrors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Fetch.requestPaused' && interceptionEnabled) {
      if (failNextMedia) { failNextMedia = false; expectedNetworkErrors.push('injected migration failure'); void rpc('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Failed' }, message.sessionId); }
      else void rpc('Fetch.continueRequest', { requestId: message.params.requestId }, message.sessionId);
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = message.params.args.map(item => item.value ?? item.description).join(' ');
      if (text.includes('ERR_FAILED')) expectedNetworkErrors.push(text); else errors.push(text);
    }
  });
  const page = await attach('about:blank'); activePage = page;
  const pngPath = join(work, 'campus.png'), invalidPath = join(work, 'invalid.svg');
  await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 48, g: 96, b: 72 } } }).png().toFile(pngPath);
  await writeFile(invalidPath, '<svg onload="alert(1)"></svg>');
  const document = createDocument(true); document.name = '媒体库验收';
  const brand = createBlock('navbar'); brand.props.brandIcon = 'image'; brand.props.imageUrl = '';
  const picture = createBlock('image'); picture.props = { ...picture.props, imageUrl: '', title: '校园图片' };
  document.blocks = [{ ...brand, id: 'brand', frame: { x: 48, y: 24, width: 900, height: 85 } }, { ...picture, id: 'picture', frame: { x: 48, y: 150, width: 440, height: 340 } }];
  const site = createSiteDocument(document, '媒体库验收');
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){localStorage.setItem('animate-studio:locale','zh-CN');if(!localStorage.getItem('animate-studio:guest-site-draft:v1'))localStorage.setItem('animate-studio:guest-site-draft:v1',${JSON.stringify(JSON.stringify({ page: site, savedAt: new Date().toISOString() }))});}` });
  await page.call('Page.navigate', { url: origin });
  await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='媒体库验收'`, 'editor ready');
  await page.evaluate(`document.querySelector('.free-canvas-frame[data-block-id="picture"]').focus({preventScroll:true});true`);
  await page.key('Enter');
  await page.until(`document.querySelector('input[aria-label="图片地址"]')`, 'image inspector ready');
  await page.click('[aria-label="从媒体库选择图片"]');
  await page.until(`document.querySelector('.media-library-dialog')`, 'media library ready');
  await page.setFile('input[accept="image/png,image/jpeg,image/webp,image/gif"]', [pngPath]);
  await page.until(`[...document.querySelectorAll('.media-card')].some(item=>item.textContent.includes('campus.png'))`, 'real file uploaded');
  await screenshot(page, 'media-library.png');
  await page.click('[aria-label="使用图片 campus.png"]');
  await page.until(`document.querySelector('[data-block-id="picture"] img')?.naturalWidth>0`, 'selected image renders');
  await untilValue(async () => page.evaluate(`JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1')).page.pages[0].page.blocks.find(block=>block.id==='picture').props.imageUrl.startsWith('asset:')`), 'guest asset reference saved');
  const assetId = await page.evaluate(`JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1')).page.pages[0].page.blocks.find(block=>block.id==='picture').props.imageUrl.slice(6)`);
  await page.reload();
  await page.until(`document.querySelector('[data-block-id="picture"] img')?.naturalWidth>0`, 'IndexedDB restores image after refresh');
  steps.push('真实 PNG 上传、图片选择、游客草稿与刷新后的 IndexedDB 图片恢复');
  await openPageSettings(page);
  await page.click('[aria-label="从媒体库选择图片"]');
  await page.click('[aria-label="使用图片 campus.png"]');
  await page.until(`document.querySelector('input[aria-label="分享图片地址"]')?.value==='asset:${assetId}'`, 'SEO references the same asset');
  await page.until(`document.querySelector('.seo-share-preview img')?.naturalWidth>0`, 'SEO media preview renders');
  await page.evaluate(`document.querySelector('.free-canvas-frame[data-block-id="brand"]').focus({preventScroll:true});true`);
  await page.key('Enter');
  await page.until(`document.querySelector('input[aria-label="Logo 图片地址"]')`, 'logo inspector ready');
  await page.click('[aria-label="从媒体库选择图片"]');
  await page.click('[aria-label="使用图片 campus.png"]');
  await page.until(`document.querySelector('.page-brand-mark--image img')?.naturalWidth>0`, 'logo media renders');
  await page.click('[aria-label="从媒体库选择图片"]');
  await page.setFile('input[accept="image/png,image/jpeg,image/webp,image/gif"]', [invalidPath]);
  await page.until(`document.querySelector('.media-error')?.textContent.includes('仅支持有效')`, 'disguised SVG rejected');
  await page.click('[aria-label="关闭媒体库"]');
  steps.push('同一素材用于图片、Logo 和 SEO，非法文件保留明确错误');

  interceptionEnabled = true;
  await page.call('Fetch.enable', { patterns: [{ urlPattern: '*api/account/sites/*/media?*', requestStage: 'Request' }] });
  failNextMedia = true;
  await openPublish(page);
  await page.until(`document.querySelector('#login-email')`, 'local sign-in required');
  await page.fill('#login-email', 'm4-3@studio.test'); await page.click('button', '发送验证码');
  const otp = await untilValue(async () => sent.at(-1)?.otp, 'local OTP captured');
  await page.until(`document.querySelector('#login-otp')`, 'OTP input ready'); await page.fill('#login-otp', otp); await page.click('form button', '登录');
  await page.until(`document.querySelector('.more-actions-button')?.title.includes('m4-3@studio.test')`, 'local account ready');
  await openPublish(page); await page.click('button', '检查并发布'); await page.click('button', '确认公开发布');
  await page.until(`document.querySelector('.publish-center-dialog')?.textContent.includes('仍有图片未上传')`, 'incomplete migration blocks publication');
  await closePublish(page);
  await page.click('[aria-label="从媒体库选择图片"]');
  await page.until(`document.querySelector('.media-migration')`, 'migration pending remains visible');
  assert.equal(await page.evaluate(`document.querySelector('[data-block-id="picture"] img')?.naturalWidth>0`), true, 'guest fallback keeps the image visible');
  await screenshot(page, 'media-migration.png');
  interceptionEnabled = false;
  await page.call('Fetch.disable');
  await page.click('button', '重试迁移');
  await page.until(`document.querySelector('.media-message')?.textContent.includes('图片迁移已完成')`, 'migration retry succeeds');
  await page.click('[aria-label="关闭媒体库"]');
  await publish(page, true); await closePublish(page);
  const siteId = await page.evaluate(`new URL(location.href).searchParams.get('page')`);
  await openPublish(page);
  const token = await page.evaluate(`document.querySelector('.publish-share-link input').value.split('/p/')[1]`);
  assert.ok(token && siteId); details.token = token; await closePublish(page);
  const cloudMedia = await api(page, `/api/account/sites/${siteId}/media`);
  assert.equal(cloudMedia.body.assets.length, 1);
  steps.push('迁移失败保留本地图片并阻止发布，重试成功后才允许公开');

  const shared = await attach(`${origin}/p/${token}`); activePage = shared;
  await shared.until(`document.querySelector('[data-block-id="picture"] img')?.naturalWidth>0`, 'public media renders');
  assert.equal(await shared.evaluate(`document.head.querySelector('meta[property="og:image"]')?.content`), `${origin}/api/shared/${token}/media/${assetId}`);
  assert.equal(await shared.evaluate(`performance.getEntriesByType('resource').some(entry=>entry.name.includes('/api/shared/${token}/media/${assetId}'))`), true);
  await screenshot(shared, 'media-public.png');
  await rpc('Target.closeTarget', { targetId: shared.targetId }); activePage = page;
  steps.push('公开分享和 SEO 使用受控媒体地址，浏览器实际读取公开图片');

  const previousDownloads = new Map();
  for (const name of await readdir(out)) if (name.endsWith('.html')) previousDownloads.set(name, (await stat(join(out, name))).mtimeMs);
  await page.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  await page.openMenu('[aria-label="页面操作"]', '导出 HTML'); await clickMenuItem(page, '导出 HTML');
  const filename = await untilValue(async () => {
    for (const name of await readdir(out)) {
      if (!name.endsWith('.html')) continue;
      if (previousDownloads.get(name) !== undefined && (await stat(join(out, name))).mtimeMs <= previousDownloads.get(name)) continue;
      if (!previousDownloads.has(name) && (await stat(join(out, name))).mtimeMs < Date.now() - 1000) continue;
      const content = await readFile(join(out, name), 'utf8');
      if (/<\/html>\s*$/.test(content)) return name;
    }
    return null;
  }, 'fresh HTML completed');
  const htmlPath = join(out, filename), html = await readFile(htmlPath, 'utf8');
  assert.ok(html.includes('data:image/png;base64,'), 'export embeds the real image bytes');
  const offline = await attach(`file://${htmlPath}`); activePage = offline;
  await offline.until(`document.querySelector('[data-block-id="picture"] img')?.naturalWidth>0`, 'offline exported image renders');
  assert.equal(await offline.evaluate(`document.head.querySelector('meta[name="robots"]')?.content`), 'noindex,nofollow');
  await rpc('Target.closeTarget', { targetId: offline.targetId }); activePage = page;
  steps.push('真实 HTML 下载内嵌图片，离线打开仍能显示，robots 保持 noindex');

  await page.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.click('[aria-label="从媒体库选择图片"]');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.until(`document.querySelector('.media-library-dialog')`, 'mobile media library ready');
  await page.until(`document.querySelector('.media-library-dialog').getBoundingClientRect().width<=374`, 'mobile dialog fits the viewport');
  const controlSizes = await page.evaluate(`[...document.querySelectorAll('.media-card-actions .studio-control')].map(button=>({height:button.getBoundingClientRect().height,minHeight:getComputedStyle(button).minHeight,transform:getComputedStyle(button).transform}))`);
  assert.ok(controlSizes.every(button=>button.height>=44), JSON.stringify(controlSizes));
  await screenshot(page, 'media-mobile.png');
  await page.click('[aria-label="关闭媒体库"]');
  await page.openMenu('[aria-label="更多操作"]', '切换深色外观'); await clickMenuItem(page, '切换深色外观');
  await page.click('[aria-label="从媒体库选择图片"]');
  await page.until(`document.documentElement.dataset.studioTheme==='dark' && document.querySelector('.media-library-dialog')`, 'dark media library ready');
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.media-library-dialog')).backgroundColor`), 'rgb(0, 0, 0)');
  await screenshot(page, 'media-dark.png');
  details.workflow = { guestPersistence: 'IndexedDB', migrationFailureBlockedPublish: true, migrationRetry: true, sharedAssetAccess: true, offlineImage: true, injectedFailures: expectedNetworkErrors.length };
  assert.ok(expectedNetworkErrors.length >= 1);
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: true, browser: browserVersion, steps, details, errors, expectedNetworkErrors, remote: false }, null, 2));
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
