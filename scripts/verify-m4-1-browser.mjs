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
import { createSiteDocument } from '../shared/site-document.mjs';

const baseline = process.argv.includes('--baseline');
const out = resolve('artifacts/m4-1-publish');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const database = await createNodeDatabase({}, { file: join(work, 'accounts.sqlite') });
await applyNodeMigrations(database);
const sent = [];
const factory = createAuthFactory({ baseURL: origin, secret: 'm4-1-local-verification-secret-0123456789abcdef', database, emailEnabled: true, githubEnabled: false, sender: { send: async data => { sent.push({ ...data }); } } });
const repository = createPageRepository(database.db, database.schema, database.dialect);
const accounts = { factory, context: { repository, newPageId: () => crypto.randomUUID(), newShareToken: () => crypto.randomUUID().replaceAll('-', '').slice(0, 22), capabilities: factory.capabilities, canonicalOrigin: origin, resolveUser: request => resolveSessionUser(factory.auth, request) }, allowLegacyPageApi: false, close: () => database.close() };
const app = await createApp({ dataDir: join(work, 'data'), serveFrontend: true, production: true, accounts });
const server = createServer(app);
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let socket, activePage, nextId = 0, browserVersion = '';
const pending = new Map(), errors = [], steps = [], details = { baseline };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function untilValue(fn, description, timeout = 20000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch { last = undefined; } await delay(50); }
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
    if (text) steps.push(`点击：${text}`);
  };
  const clickText = (text, selector = 'button') => click(selector, text);
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await call('Input.insertText', { text: value }); };
  const openMenu = async (selector, text) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`);
    await key('ArrowDown', 'ArrowDown', 40);
    await until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()===${JSON.stringify(text)})`, `${text} menu mounted`);
    await settle({ evaluate, until });
  };
  return { call, evaluate, until, key, click, clickText, fill, openMenu, sessionId, targetId };
}
async function settle(page) {
  await page.evaluate(`document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity){try{animation.finish()}catch{}}});true`);
  await page.until(`document.getAnimations().every(animation=>animation.playState!=='running'||animation.effect?.getTiming().iterations===Infinity)`, 'visual transitions settled');
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
async function openPublishCenter(page, label = '分享页面') {
  await page.openMenu('[aria-label="更多操作"]', label);
  steps.push('打开更多操作');
  await clickMenuItem(page, label);
  if (label === '分享页面') {
    await page.until(`document.querySelector('#login-email') || document.querySelector('.publish-center-dialog')`, 'sign-in or publish center mounted');
    if (await page.evaluate(`!document.querySelector('#login-email')`)) await page.until(`document.querySelector('.publish-center-dialog')`, 'publish center mounted');
  }
  await page.until(`!document.querySelector('.publish-loading')`, 'publish status loaded');
}
async function api(page, path, options = {}) {
  return page.evaluate(`(()=>{const init=${JSON.stringify({ credentials: 'same-origin', ...options })};if(init.body&&typeof init.body!=='string')init.body=JSON.stringify(init.body);if(init.body)init.headers={'Content-Type':'application/json',...init.headers};return fetch(${JSON.stringify(path)},init).then(async response=>({status:response.status,body:response.status===204?null:await response.json()}))})()`);
}
async function closePublish(page) {
  await page.until(`document.querySelector('[aria-label="关闭发布与分享"]')?.disabled===false`, 'publish actions settled');
  await page.click('[aria-label="关闭发布与分享"]');
  await page.until(`!document.querySelector('.publish-center-dialog')`, 'publish center closed');
}
async function editText(page, text) {
  await page.evaluate(`document.querySelector('[data-block-id="release-copy"]').focus({preventScroll:true});true`);
  await page.until(`document.querySelector('textarea[aria-label="描述文字"]')`, 'text inspector ready');
  await page.fill('textarea[aria-label="描述文字"]', text);
  const id = await page.evaluate(`new URL(location.href).searchParams.get('page')`);
  await untilValue(async () => {
    const result = await api(page, `/api/account/sites/${id}`);
    return result.body?.page?.pages?.[0]?.page?.blocks?.[0]?.props?.text === text ? result : null;
  }, `draft saved: ${text}`);
}
async function selectVersion(page, version) {
  await page.evaluate(`[...document.querySelectorAll('.publish-version')].find(item=>item.querySelector('strong')?.textContent===${JSON.stringify(`版本 ${version}`)})?.focus({preventScroll:true});true`);
  await page.key('Enter');
  await page.until(`document.querySelector('.publish-version-detail h3')?.textContent.includes(${JSON.stringify(`版本 ${version}`)})`, `version ${version} detail ready`);
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
  const document = createDocument(true); document.name = '发布中心验收';
  const block = createBlock('text');
  document.blocks = [{ ...block, id: 'release-copy', props: { ...block.props, text: '第一个公开版本' }, frame: { x: 48, y: 48, width: 760, height: 140 } }];
  const site = createSiteDocument(document);
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){localStorage.setItem('animate-studio:locale','zh-CN');localStorage.setItem('animate-studio:guest-site-draft:v1',${JSON.stringify(JSON.stringify({ page: site, savedAt: new Date().toISOString() }))});}` });
  await page.call('Page.navigate', { url: origin });
  await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='发布中心验收'`, 'editor ready');
  await openPublishCenter(page);
  await page.until(`document.querySelector('#login-email')`, 'local sign-in required');
  await page.fill('#login-email', 'm4-1@studio.test');
  await page.clickText('发送验证码');
  const otp = await untilValue(async () => sent.at(-1)?.otp, 'local OTP captured');
  await page.until(`document.querySelector('#login-otp')`, 'OTP input ready');
  await page.fill('#login-otp', otp);
  await page.clickText('登录', 'form button');
  await page.until(`document.querySelector('.more-actions-button')?.title.includes('m4-1@studio.test')`, 'local account ready');
  await openPublishCenter(page);
  await page.until(`document.querySelector('.publish-center-dialog')`, 'publish center ready');
  await page.clickText('检查并发布');
  await page.clickText('确认公开发布');
  await page.until(`document.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 1')`, 'first version published');
  let token = await page.evaluate(`document.querySelector('.publish-share-link input').value.split('/p/')[1]`);
  const siteId = await page.evaluate(`new URL(location.href).searchParams.get('page')`);
  assert.ok(token && siteId);
  const first = await api(page, `/api/shared/${token}`);
  assert.equal(first.body.page.pages[0].page.blocks[0].props.text, '第一个公开版本');
  assert.equal(first.body.publishedVersion, 1);
  details.firstToken = token;
  await screenshot(page, 'publish-first.png');
  steps.push('真实登录、差异确认和首次公开发布');

  await closePublish(page);
  await editText(page, '第二个公开版本');
  await openPublishCenter(page);
  await page.until(`document.querySelector('[data-testid="publish-diff"]')?.textContent.includes('1 个组件有变化')`, 'draft difference is visible');
  await screenshot(page, 'publish-diff.png');
  await page.clickText('检查并更新分享');
  await page.clickText('确认公开发布');
  await page.until(`document.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 2')`, 'second version published');
  assert.equal((await api(page, `/api/shared/${token}`)).body.page.pages[0].page.blocks[0].props.text, '第二个公开版本');
  assert.equal((await api(page, `/api/shared/${token}`)).body.page.pages[0].page.blocks[0].props.text === '第一个公开版本', false);
  await closePublish(page);
  await editText(page, '尚未公开的第三版草稿');
  const beforeRollback = await api(page, `/api/account/sites/${siteId}`);
  details.beforeRollback = { id: beforeRollback.body.id, savedAt: beforeRollback.body.savedAt, text: beforeRollback.body.page.pages[0].page.blocks[0].props.text };
  await openPublishCenter(page);
  await page.click('#publish-history-tab');
  await page.until(`document.querySelectorAll('.publish-version').length===2`, 'two versions listed');
  await selectVersion(page, 1);
  await page.clickText('回滚公开内容');
  await page.clickText('确认公开回滚');
  await page.until(`[...document.querySelectorAll('.publish-version')].some(item=>item.textContent.includes('回滚自版本 1'))`, 'rollback source shown in history');
  const rolledBack = await api(page, `/api/shared/${token}`);
  assert.equal(rolledBack.body.publishedVersion, 3);
  assert.equal(rolledBack.body.page.pages[0].page.blocks[0].props.text, '第一个公开版本');
  const afterRollback = await api(page, `/api/account/sites/${siteId}`);
  details.afterRollback = { id: afterRollback.body.id, savedAt: afterRollback.body.savedAt, text: afterRollback.body.page.pages[0].page.blocks[0].props.text };
  assert.equal(afterRollback.body.page.pages[0].page.blocks[0].props.text, '尚未公开的第三版草稿');
  assert.equal((await api(page, `/api/shared/${token}`)).body.page.pages[0].page.blocks[0].props.text, '第一个公开版本');
  await screenshot(page, 'publish-history.png');
  const publicPage = await attach(`${origin}/p/${token}`);
  await publicPage.until(`document.querySelector('[data-block-id="release-copy"] .page-paragraph')?.textContent==='第一个公开版本'`, 'public page renders rolled-back content');
  await publicPage.call('Page.close'); activePage = page;
  steps.push('第二版发布、公开回滚生成第三版，原链接不变且未发布草稿不被覆盖');

  await page.clickText('恢复到编辑草稿');
  await page.clickText('确认恢复草稿');
  await page.until(`document.querySelector('[data-block-id="release-copy"] .page-paragraph')?.textContent==='第一个公开版本'`, 'history restored in editor');
  await closePublish(page);
  await page.click('[aria-label="撤销 (⌘Z)"]');
  await page.until(`document.querySelector('[data-block-id="release-copy"] .page-paragraph')?.textContent==='尚未公开的第三版草稿'`, 'one undo restores outgoing draft');
  assert.equal((await api(page, `/api/shared/${token}`)).body.page.pages[0].page.blocks[0].props.text, '第一个公开版本');
  steps.push('恢复历史草稿形成一个撤销步骤，公开站点不随草稿变化');

  await openPublishCenter(page);
  await page.clickText('关闭分享');
  await page.clickText('确认关闭分享');
  await page.until(`document.querySelector('.publish-current-status')?.textContent.includes('当前未公开')`, 'sharing closed');
  assert.equal((await api(page, `/api/shared/${token}`)).status, 404);
  assert.equal((await api(page, `/api/account/sites/${siteId}/versions`)).body.versions.length, 3);
  await page.click('#publish-history-tab');
  await page.until(`document.querySelector('.publish-version-detail h3')`, 'history remains available offline');
  assert.equal(await page.evaluate(`[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='回滚公开内容').disabled`), true);
  steps.push('关闭分享使旧链接失效，历史仍可读且不能直接公开回滚');

  await page.click('#publish-current-tab');
  await page.clickText('检查并发布');
  await page.clickText('确认公开发布');
  await page.until(`document.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 4')`, 'sharing reopened with a new version');
  const reopenedToken = await page.evaluate(`document.querySelector('.publish-share-link input').value.split('/p/')[1]`);
  assert.notEqual(reopenedToken, token, 'a revoked token must not be resurrected');
  token = reopenedToken;
  await closePublish(page);
  await editText(page, '冲突前的新草稿');
  await openPublishCenter(page);
  const ownerId = database.db.$client.prepare('SELECT id FROM "user" WHERE email=?').get('m4-1@studio.test').id;
  const external = await repository.findOwned(ownerId, siteId);
  external.page.name = '另一设备公开版本';
  const externalSaved = await repository.saveSite(ownerId, siteId, external.page, external.savedAt);
  const externalPublished = await repository.publish(ownerId, siteId, 'external-token-must-not-replace', { expectedRevision: externalSaved.record.savedAt, expectedPublishedVersion: 4 });
  assert.equal(externalPublished.status, 'published');
  assert.equal(externalPublished.result.version, 5);
  await page.clickText('检查并更新分享');
  await page.clickText('确认公开发布');
  await page.until(`document.querySelector('.account-error')?.textContent.includes('草稿或公开版本已变化')`, 'stale publication conflict is visible');
  assert.equal((await api(page, `/api/shared/${token}`)).body.page.name, '另一设备公开版本');
  assert.equal((await api(page, `/api/account/sites/${siteId}`)).body.page.pages[0].page.blocks[0].props.text, '冲突前的新草稿');
  await page.clickText('重新读取');
  await page.until(`!document.querySelector('.account-error') && !document.querySelector('.publish-loading')`, 'publish status refreshed after conflict');
  await screenshot(page, 'publish-conflict.png');
  details.conflict = '另一设备发布版本 5 后，旧前提的发布被拒绝；公开内容不被覆盖，本地草稿保留。';
  steps.push('模拟另一设备发布，409 后刷新差异，不错误覆盖公开内容');

  await page.click('#publish-history-tab');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.until(`document.querySelector('.publish-version-detail h3')`, 'mobile history ready');
  assert.ok(await page.evaluate(`document.querySelector('.publish-center-dialog').getBoundingClientRect().width<=370`));
  assert.ok(await page.evaluate(`document.querySelector('.publish-center-dialog').getBoundingClientRect().left>=0 && document.querySelector('.publish-center-dialog').getBoundingClientRect().right<=390`));
  assert.ok(await page.evaluate(`getComputedStyle(document.querySelector('.publish-history-layout')).gridTemplateColumns.split(' ').length===1`));
  assert.ok(await page.evaluate(`[...document.querySelectorAll('.publish-footer-actions button')].every(button=>button.getBoundingClientRect().height>=44)`));
  await screenshot(page, 'publish-mobile.png');
  steps.push('390px 单列历史布局、弹窗边界和至少 44px 的触摸目标');

  await closePublish(page);
  await openPublishCenter(page, '切换深色外观');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await openPublishCenter(page);
  await page.until(`document.documentElement.dataset.studioTheme==='dark' && document.querySelector('.publish-center-dialog')`, 'dark publish center ready');
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.publish-center-dialog')).backgroundColor`), 'rgb(0, 0, 0)');
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.free-canvas-stage')).backgroundColor`), 'rgb(255, 255, 255)');
  await page.evaluate(`document.querySelector('#publish-current-tab').focus({preventScroll:true});true`);
  await page.key('ArrowRight', 'ArrowRight', 40);
  await page.until(`document.activeElement?.id==='publish-history-tab' && document.querySelector('#publish-history-panel')`, 'arrow key changes publish tabs');
  await screenshot(page, 'publish-dark.png');
  await closePublish(page);
  assert.equal(await page.evaluate(`document.activeElement?.classList.contains('more-actions-button')`), true, 'dialog close restores the opener focus');
  steps.push('深色主题不改变页面主题，键盘切换页签及关闭后的焦点恢复');

  details.metrics = { baselinePublishClicks: 3, reviewedPublishClicks: 4, pageSwitches: 0, confirmation: '公开发布前增加一次差异确认', memory: '差异、当前公开版本和恢复路径在同一弹窗中，不需要记住历史内容', rollback: '公开回滚生成新版本；恢复草稿可一次撤销' };
  details.versions = (await api(page, `/api/account/sites/${siteId}/versions`)).body.versions;
  details.reopenedTokenChanged = token !== details.firstToken;
  assert.deepEqual(errors, []);
  await writeFile(join(out, baseline ? 'baseline-report.json' : 'report.json'), JSON.stringify({ ok: true, browser: browserVersion, steps, details, errors, remote: false }, null, 2));
  console.log(JSON.stringify({ ok: true, steps, artifacts: out, details, errors }, null, 2));
}
try { await main(); }
catch (error) {
  if (activePage) {
    try { errors.push(await activePage.evaluate('document.body.innerText')); const capture = await activePage.call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, 'm4-1-failure.png'), Buffer.from(capture.data, 'base64')); } catch { /* Keep the original failure. */ }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: false, error: String(error), browser: browserVersion, steps, details, errors }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    try { if (socket) socket.send(JSON.stringify({ id: ++nextId, method: 'Browser.close', params: {} })); } catch { /* Browser already closed. */ }
    await Promise.race([exited, delay(3000)]);
    if (browser.exitCode === null) { browser.kill('SIGTERM'); await Promise.race([exited, delay(3000)]); }
  }
  await app.locals.closeFrontend?.();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
  await database.close();
}
