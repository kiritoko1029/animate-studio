import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createBlock, createDocument } from '../src/model.ts';
import { createSiteDocument, createLayoutDocument } from '../shared/site-document.mjs';
import { createResponsiveCandidate } from '../src/lib/responsive.ts';

const out = resolve('artifacts/m4-5-responsive');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
let app;
const server = createServer((request, response) => app(request, response));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
app = await createApp({ dataDir: join(work, 'data'), serveFrontend: true, production: true });
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let socket, activePage, nextId = 0, browserVersion = '';
const pending = new Map(), errors = [], steps = [], details = {};
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
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const until = async (expression, description, timeout) => untilValue(async () => evaluate(`(()=>{try{return Boolean(${expression})}catch{return null}})()`), description, timeout);
  const key = async (key, code = key, virtualKey) => {
    const enter = key === 'Enter', escape = key === 'Escape', arrow = key.startsWith('Arrow');
    const windowsVirtualKeyCode = virtualKey ?? (enter ? 13 : escape ? 27 : arrow ? { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40 }[key] : 0);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, ...(enter ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
  };
  const click = async (selector, text) => {
    await evaluate(`(()=>{const element=${text ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!element)throw new Error('Missing clickable element: '+${JSON.stringify(selector)}+' '+document.body.innerText);element.focus({preventScroll:true});return true})()`);
    await key('Enter');
  };
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await call('Input.insertText', { text: value }); };
  const resize = async width => { await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 }); await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`); };
  const reload = async () => {
    let loaded = false;
    const listener = event => { const message = JSON.parse(event.data); if (message.method === 'Page.loadEventFired' && message.sessionId === sessionId) { loaded = true; socket.removeEventListener('message', listener); } };
    socket.addEventListener('message', listener); await call('Page.reload'); await untilValue(() => loaded || null, 'browser reload completed');
  };
  return { call, evaluate, until, key, click, fill, resize, reload, sessionId, targetId };
}
async function screenshot(page, name) {
  await page.evaluate(`document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity){try{animation.finish()}catch{}}});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  const result = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(out, name), Buffer.from(result.data, 'base64'));
}
async function clickMenuItem(page, label) {
  const clicked = await page.evaluate(`(()=>{const element=[...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!element)return false;element.click();return true})()`);
  if (!clicked) throw new Error(`Missing menu item: ${label}`);
}
async function saved(page) { return page.evaluate(`JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1')).page`); }
async function previewAt(page, width, device) {
  if (await page.evaluate(`!document.querySelector('.full-preview')`)) await page.click('[aria-label="预览页面"]');
  await page.click(device === 'tablet' ? '[aria-label="平板预览"]' : '[aria-label="手机预览"]');
  await page.evaluate(`document.querySelector('.full-preview-page').style.maxWidth='${width}px';true`);
  await page.resize(device === 'tablet' ? 1440 : width + 56);
  steps.push(await page.evaluate(`JSON.stringify([...document.querySelectorAll('.full-preview-page .page-surface')].map(element=>element.outerHTML.slice(0,300)))`));
  await page.until(`document.querySelector('.full-preview-page [data-responsive-device]')`, 'full preview mounted');
  await page.until(`document.querySelector('.full-preview-page [data-responsive-device]')?.dataset.responsiveDevice==='${device}'`, `${width}px preview selects ${device}`);
  await page.evaluate(`document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity){try{animation.finish()}catch{}}});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  const sizes = await page.evaluate(`({outer:document.querySelector('.full-preview-page').getBoundingClientRect().width,inner:document.querySelector('.full-preview-page .site-preview').getBoundingClientRect().width})`);
  steps.push(JSON.stringify(sizes));
  assert.ok(Math.abs(sizes.outer - width) <= 2 && sizes.inner > 0 && sizes.inner <= sizes.outer, JSON.stringify(sizes));
  steps.push(await page.evaluate(`JSON.stringify({width:innerWidth,lists:document.querySelectorAll('.full-preview-page [data-repeater-item]').length,marks:document.querySelectorAll('.full-preview-page [data-chart-mark]').length,charts:document.querySelectorAll('.full-preview-page [data-chart-svg]').length,device:document.querySelector('.full-preview-page [data-responsive-device]')?.dataset.responsiveDevice})`));
  await page.until(`document.querySelectorAll('.full-preview-page [data-repeater-item]').length===2 && document.querySelectorAll('.full-preview-page [data-chart-mark]').length===2`, 'collection and chart remain live');
  assert.equal(await page.evaluate(`!!document.querySelector('.full-preview-page .data-form')`), true);
  assert.equal(await page.evaluate(`!!document.querySelector('.full-preview-page [data-block-id="header-brand"]')`), true);
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
      void rpc('Page.handleJavaScriptDialog', { accept: true }, message.sessionId);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'debug') steps.push(message.params.args.map(item => item.value ?? item.description).join(' '));
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(item => item.value ?? item.description).join(' '));
  });
  const page = await attach('about:blank'); activePage = page; await page.resize(1440);
  const pageDocument = createDocument(true); pageDocument.name = '响应式验收'; pageDocument.settings.maxWidth = 1000; pageDocument.settings.canvasHeight = 2400; pageDocument.settings.padding = 24;
  const title = createBlock('heading'), card = createBlock('card'), list = createBlock('repeater'), chart = createBlock('chart'), form = createBlock('form');
  Object.assign(title, { id: 'title', frame: { x: 40, y: 40, width: 400, height: 200 } }); title.props.title = '图书馆管理';
  Object.assign(card, { id: 'summary', frame: { x: 500, y: 40, width: 440, height: 260 } }); card.props.title = '馆藏概览';
  Object.assign(list, { id: 'books', frame: { x: 40, y: 360, width: 920, height: 800 } }); list.props.sourceId = 'books';
  Object.assign(chart, { id: 'chart', frame: { x: 40, y: 1200, width: 920, height: 440 } }); chart.props = { ...chart.props, sourceId: 'books', categoryField: 'category', dataColumns: [{ key: 'count', label: '馆藏数', path: 'count', aggregate: 'sum' }], chartType: 'column' };
  Object.assign(form, { id: 'form', frame: { x: 40, y: 1700, width: 500, height: 640 } }); form.props.submitSourceId = '';
  pageDocument.blocks = [title, card, list, chart, form];
  const site = createSiteDocument(pageDocument, '响应式验收');
  site.dataSources = [{ id: 'books', name: '图书集合', kind: 'collection', mode: 'collection', fields: [{ key: 'title', label: '书名', type: 'text' }, { key: 'text', label: '简介', type: 'longText' }, { key: 'category', label: '分类', type: 'text' }, { key: 'count', label: '数量', type: 'number' }], records: [{ id: 'one', values: { title: '设计中的设计', text: '设计读物', category: '设计', count: 12 } }, { id: 'two', values: { title: '信息架构', text: '信息组织', category: '技术', count: 8 } }] }];
  site.sharedLayout.header = createLayoutDocument('header', pageDocument.settings);
  site.sharedLayout.header.blocks = [{ id: 'brand', type: 'text', props: { text: '共享页头' }, frame: { x: 24, y: 24, width: 400, height: 120 } }];
  site.sharedLayout.header = createResponsiveCandidate(site.sharedLayout.header); site.pages[0].layout = ['header'];
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){localStorage.setItem('animate-studio:locale','zh-CN');if(!localStorage.getItem('animate-studio:guest-site-draft:v1'))localStorage.setItem('animate-studio:guest-site-draft:v1',${JSON.stringify(JSON.stringify({ page: site, savedAt: new Date().toISOString() }))});}` });
  await page.call('Page.navigate', { url: origin }); await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='响应式验收'`, 'editor ready');
  assert.equal((await saved(page)).pages[0].page.settings.responsive, undefined, 'old fixed documents do not opt in automatically');
  await page.click('#inspector-tab-page'); await page.until(`document.querySelector('.responsive-settings')`, 'responsive settings ready');
  await page.click('button', '启用自适应布局');
  await page.until(`document.querySelector('.responsive-settings')?.textContent.includes('重新生成当前断点')`, 'adaptive candidates generated');
  await page.click('[aria-label="手机视图"]');
  await page.until(`document.querySelector('.free-canvas-stage')?.style.width==='390px'`, 'mobile editor uses mobile design width');
  await untilValue(async () => (await saved(page)).pages[0].page.settings.responsive?.mode === 'adaptive', 'candidate saved');
  let document = await saved(page);
  assert.equal(document.pages[0].page.blocks.find(block => block.id === 'title').frame.x, 40, 'desktop remains unchanged after enabling');
  assert.equal(document.pages[0].page.blocks.find(block => block.id === 'summary').frame.x, 500);
  await page.evaluate(`document.querySelector('.free-canvas-frame[data-block-id="title"]').focus({preventScroll:true});true`);
  await page.evaluate(`document.querySelector('.free-canvas-frame[data-block-id="title"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}));document.querySelector('.free-canvas-frame[data-block-id="title"]').dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}));true`);
  await untilValue(async () => (await saved(page)).pages[0].page.settings.responsive.breakpoints.mobile.frames.title.y === 25, 'mobile keyboard edit saved');
  document = await saved(page);
  assert.equal(document.pages[0].page.blocks.find(block => block.id === 'title').frame.x, 40, 'mobile edit never writes desktop');
  assert.equal(document.pages[0].page.settings.responsive.breakpoints.tablet.frames.title.x, Math.round(40 * 768 / 1000), 'mobile edit never writes tablet');
  await page.until(`document.querySelector('[aria-label="在当前断点显示"]')`, 'visibility control ready');
  await page.evaluate(`document.querySelector('[aria-label="在当前断点显示"]').click();true`);
  await page.until(`!document.querySelector('.free-canvas-frame[data-block-id="title"]')`, 'hidden only at mobile');
  assert.equal((await saved(page)).pages[0].page.blocks.some(block => block.id === 'title'), true, 'hiding does not delete the block');
  await page.evaluate(`document.querySelector('[aria-label="在当前断点显示"]').click();true`);
  await page.until(`document.querySelector('.free-canvas-frame[data-block-id="title"]')`, 'hidden block restored');
  await page.click('[aria-label="撤销 (⌘Z)"]');
  await page.until(`!document.querySelector('.free-canvas-frame[data-block-id="title"]')`, 'undo restores hidden state');
  await page.click('[aria-label="撤销 (⌘Z)"]');
  await page.until(`document.querySelector('.free-canvas-frame[data-block-id="title"]')`, 'second undo restores visibility');
  await page.click('[aria-label="撤销 (⌘Z)"]');
  await untilValue(async () => (await saved(page)).pages[0].page.settings.responsive.breakpoints.mobile.frames.title.x === 24, 'undo restores previous mobile frame');
  const undoDisabled = await page.evaluate(`document.querySelector('[aria-label="撤销 (⌘Z)"]').disabled`);
  await page.click('[aria-label="平板视图"]'); await page.click('[aria-label="手机视图"]');
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="撤销 (⌘Z)"]').disabled`), undoDisabled, 'switching devices adds no history');
  await page.reload(); await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='响应式验收'`, 'responsive draft restored');
  await page.click('[aria-label="手机视图"]'); await page.click('#view-tab-preview');
  await previewAt(page, 390, 'mobile'); await screenshot(page, 'responsive-mobile-390.png');
  await previewAt(page, 768, 'tablet'); await screenshot(page, 'responsive-tablet-768.png');
  await previewAt(page, 320, 'mobile'); await screenshot(page, 'responsive-mobile-320.png');
  await page.fill('.full-preview-page .data-form input[name="title"]', '测试图书');
  await page.evaluate(`document.querySelector('.full-preview-page .data-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true`);
  await page.until(`document.querySelector('.full-preview-page .data-form-status')?.textContent.includes('提交数据源')`, 'form stays usable without a write endpoint');
  await page.click('button', '返回编辑');
  steps.push('候选生成、手机独立编辑、隐藏恢复、撤销和刷新；320/390/768px 下动态列表、图表、表单和共享布局可用');

  const previousDownloads = new Map();
  for (const name of await readdir(out)) if (name.endsWith('.html')) previousDownloads.set(name, (await stat(join(out, name))).mtimeMs);
  await page.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  await page.evaluate(`document.querySelector('[aria-label="页面操作"]').focus({preventScroll:true});true`); await page.key('ArrowDown', 'ArrowDown', 40);
  await page.until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()==='导出 HTML')`, 'export menu mounted'); await clickMenuItem(page, '导出 HTML');
  const filename = await untilValue(async () => {
    for (const name of await readdir(out)) {
      if (!name.endsWith('.html')) continue;
      if (previousDownloads.get(name) !== undefined && (await stat(join(out, name))).mtimeMs <= previousDownloads.get(name)) continue;
      const content = await readFile(join(out, name), 'utf8'); if (/<\/html>\s*$/.test(content)) return name;
    }
    return null;
  }, 'fresh HTML completed');
  const htmlPath = join(out, filename), offline = await attach(`file://${htmlPath}`); activePage = offline;
  for (const [width, device] of [[390, 'mobile'], [768, 'tablet'], [320, 'mobile'], [1440, 'desktop']]) {
    await offline.resize(width); await offline.until(`document.querySelector('[data-responsive-device]')?.dataset.responsiveDevice==='${device}'`, `offline ${width}px layout`);
    await offline.until(`document.querySelectorAll('[data-repeater-item]').length===2 && document.querySelectorAll('[data-chart-mark]').length===2`, `offline ${width}px live data`);
    assert.equal(await offline.evaluate(`!!document.querySelector('.data-form') && !!document.querySelector('[data-block-id="header-brand"]')`), true);
    if (width !== 1440) await screenshot(offline, `offline-${width}.png`);
  }
  assert.equal(await offline.evaluate(`document.head.querySelector('meta[name="robots"]')?.content`), 'noindex,nofollow');
  steps.push('真实 HTML 下载在离线环境按容器宽度切换，保留动态内容、共享布局和 noindex');
  details.workflow = { fixedDefault: true, isolatedBreakpoints: true, hiddenRestore: true, undo: true, noHistoryForPreview: true, widths: [320, 390, 768, 1440], offline: true, remote: false };
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
  await app.locals.closeFrontend?.(); server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve));
}
