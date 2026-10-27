import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createBlock, createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';

const out = resolve('artifacts/text-selection');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
const text = '请选择这段文字，确认高亮清晰可见。';
const pageDocument = createDocument(true);
pageDocument.name = '文字选择验收';
pageDocument.settings = { ...pageDocument.settings, accent: '#F2C94C', background: '#FFFFFF', maxWidth: 1000, canvasHeight: 720, padding: 48, layout: 'free' };
const block = createBlock('text');
pageDocument.blocks = [{ ...block, id: 'select-text', props: { ...block.props, text, padding: 24, fontSize: 18, color: '#171717' }, frame: { x: 80, y: 96, width: 700, height: 120 } }];
const site = createSiteDocument(pageDocument);
const app = await createApp({ dataDir: join(work, 'data'), serveFrontend: true, production: true, accounts: null });
const server = createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let socket, activePage, appClosed = false, nextId = 0, browserVersion = '';
const pending = new Map(), errors = [], steps = [], details = {};
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
  const key = async key => {
    const escape = key === 'Escape';
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: escape ? 27 : 13, nativeVirtualKeyCode: escape ? 27 : 13, ...(escape ? {} : { text: '\r', unmodifiedText: '\r' }) });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: escape ? 27 : 13, nativeVirtualKeyCode: escape ? 27 : 13 });
  };
  const click = async (selector, text) => {
    await evaluate(`(()=>{const element=${text ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!element)throw new Error('Missing clickable element: '+${JSON.stringify(selector)});element.focus({preventScroll:true});return true})()`);
    await key('Enter');
  };
  const clickText = (text, selector = 'button') => click(selector, text);
  const mouse = (type, x, y, extra = {}) => call('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y, { button: 'none', buttons: 0 });
    await mouse('mousePressed', from.x, from.y, { button: 'left', buttons: 1, clickCount: 1 });
    await mouse('mouseMoved', to.x, to.y, { button: 'left', buttons: 1 });
    await mouse('mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1 });
  };
  const doubleClick = async point => {
    for (const clickCount of [1, 2]) {
      await mouse('mousePressed', point.x, point.y, { button: 'left', buttons: 1, clickCount });
      await mouse('mouseReleased', point.x, point.y, { button: 'left', buttons: 0, clickCount });
    }
  };
  const selectionPoints = selector => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)}),range=document.createRange();range.selectNodeContents(element);const rects=[...range.getClientRects()],first=rects[0],last=rects.at(-1);return first?{from:{x:first.left+4,y:first.top+first.height/2},to:{x:last.right-4,y:last.top+last.height/2}}:null})()`);
  const selectionStyle = selector => evaluate(`(()=>{const style=getComputedStyle(document.querySelector(${JSON.stringify(selector)}),'::selection');return {background:style.backgroundColor,color:style.color}})()`);
  return { call, evaluate, until, key, click, clickText, drag, doubleClick, selectionPoints, selectionStyle };
}
async function settle(page) {
  await page.evaluate(`document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity){try{animation.finish()}catch{}}});true`);
  await page.until(`document.getAnimations().every(animation=>animation.playState!=='running'||animation.effect?.getTiming().iterations===Infinity)`, 'visual transitions settled');
  await page.until(`!document.querySelector('.ai-site-dialog')||getComputedStyle(document.querySelector('.ai-site-dialog')).opacity==='1'`, 'AI dialog fully visible');
}
async function screenshot(page, name) {
  await page.until(`document.getAnimations().every(animation=>animation.playState!=='running'||animation.effect?.getTiming().iterations===Infinity)`, `visual transitions settled for ${name}`);
  const result = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(out, name), Buffer.from(result.data, 'base64'));
}
function contrast(first, second) {
  const luminance = color => {
    const match = color.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/);
    assert.ok(match, `browser returns an RGB selection color: ${color}`);
    const [r, g, b] = match.slice(1).map(Number).map(value => { value /= 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){localStorage.setItem('animate-studio:locale','zh-CN');localStorage.setItem('animate-studio:guest-site-draft:v1',${JSON.stringify(JSON.stringify({ page: site, savedAt: new Date().toISOString() }))});}` });
  await page.call('Page.navigate', { url: origin });
  await page.until(`document.querySelector('[data-block-id="select-text"] .page-paragraph')?.textContent===${JSON.stringify(text)}`, 'editor and text fixture ready');
  const frameSelector = '[data-block-id="select-text"]';
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(frameSelector)})).userSelect`), 'none');
  let point = await page.selectionPoints(`${frameSelector} .page-paragraph`);
  assert.ok(point, 'text has measurable browser geometry');
  await page.doubleClick({ x: point.from.x + 24, y: point.from.y });
  await page.until(`document.querySelector(${JSON.stringify(frameSelector)})?.dataset.canvasInteractive==='true'`, 'double-click enters interaction preview');
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(frameSelector)})).userSelect`), 'text');
  point = await page.selectionPoints(`${frameSelector} .page-paragraph`);
  await page.drag(point.from, point.to);
  await page.until(`document.getSelection()?.toString()===${JSON.stringify(text)}`, 'real pointer drag selects the entire text');
  details.canvasLight = await page.selectionStyle(`${frameSelector} .page-paragraph`);
  assert.equal(details.canvasLight.background, 'rgb(242, 201, 76)');
  assert.equal(details.canvasLight.color, 'rgb(0, 0, 0)');
  assert.ok(contrast(details.canvasLight.background, details.canvasLight.color) >= 4.5);
  await screenshot(page, 'canvas-text-selection.png');
  steps.push('普通画布禁止误选文字；双击进入交互后可真实拖选文字，浅色强调色搭配深色高亮文字');

  await page.evaluate(`document.querySelector(${JSON.stringify(frameSelector)}).focus({preventScroll:true});true`);
  await page.key('Escape');
  await page.until(`!document.querySelector(${JSON.stringify(frameSelector)})?.dataset.canvasInteractive`, 'Escape returns to component editing');
  const beforeDrag = await page.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(frameSelector)}).getBoundingClientRect();return {x:r.left+30,y:r.top+30,scale:Number(document.querySelector('[data-free-stage]').dataset.scale)}})()`);
  await page.drag(beforeDrag, { x: beforeDrag.x + 96 * beforeDrag.scale, y: beforeDrag.y + 32 * beforeDrag.scale });
  await page.until(`(()=>{const value=JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1'));const block=value?.page.pages[0].page.blocks[0];return block?.frame.x===176&&block?.frame.y===128})()`, 'component drag is saved after leaving interaction mode');
  details.drag = await page.evaluate(`JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1')).page.pages[0].page.blocks[0].frame`);
  steps.push('Esc 返回编辑后仍可拖动组件，坐标实际更新并自动保存');

  await page.click('[aria-label="打开 AI 页面助手"]');
  await page.until(`document.querySelector('.ai-chat')`, 'AI page assistant opens');
  await page.clickText('创建整站');
  await page.until(`document.querySelector('.ai-site-dialog')`, 'AI site dialog opens');
  await page.until(`document.querySelector('.ai-site-dialog')`, 'AI site dialog ready');
  await settle(page);
  await page.clickText('解释当前结构', '.ai-site-actions button');
  await page.until(`document.querySelector('.ai-site-message')?.textContent.includes('共有 1 个页面')`, 'site explanation without a live model');
  point = await page.selectionPoints('.ai-site-message');
  await page.drag(point.from, point.to);
  details.aiLightText = await page.evaluate(`document.getSelection()?.toString() ?? ''`);
  assert.match(details.aiLightText, /文字选择验收[\s\S]*共享布局：未启用。/);
  details.aiLight = await page.selectionStyle('.ai-site-message');
  assert.ok(contrast(details.aiLight.background, details.aiLight.color) >= 4.5, `light AI selection contrast ${contrast(details.aiLight.background, details.aiLight.color)}`);
  await screenshot(page, 'ai-selection-light.png');
  await page.click('[aria-label="关闭整站创作"]');
  await page.until(`!document.querySelector('.ai-site-dialog')`, 'AI site dialog closes before changing appearance');
  await page.click('[aria-label="更多操作"]');
  await page.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await page.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await page.until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()==='切换深色外观')`, 'appearance menu opens');
  await page.clickText('切换深色外观', '[role="menuitem"]');
  await page.until(`document.documentElement.dataset.studioTheme==='dark'`, 'dark workbench active');
  await page.click('[aria-label="收起 AI 对话"]');
  await page.clickText('创建整站');
  await page.until(`document.querySelector('.ai-site-dialog')`, 'AI site dialog ready');
  await settle(page);
  await page.clickText('解释当前结构', '.ai-site-actions button');
  await page.until(`document.querySelector('.ai-site-dialog .ai-site-message')?.textContent.includes('共有 1 个页面')`, 'dark site explanation without a live model');
  point = await page.selectionPoints('.ai-site-message');
  await page.drag(point.from, point.to);
  details.aiDarkText = await page.evaluate(`document.getSelection()?.toString() ?? ''`);
  assert.match(details.aiDarkText, /文字选择验收[\s\S]*共享布局：未启用。/);
  details.aiDark = await page.selectionStyle('.ai-site-message');
  assert.ok(contrast(details.aiDark.background, details.aiDark.color) >= 4.5, `dark AI selection contrast ${contrast(details.aiDark.background, details.aiDark.color)}`);
  await screenshot(page, 'ai-selection-dark.png');
  steps.push('AI 整站说明在浅色和深色工作台都有清晰可见的文字选区；未请求真实模型');

  assert.deepEqual(errors, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: true, browser: browserVersion, origin, steps, details, errors, ai: 'Height regression uses deterministic model output in tests/site-ai.test.mjs; this browser check does not call a live model.' }, null, 2));
  console.log(JSON.stringify({ ok: true, steps, artifacts: out, details, errors }, null, 2));
}
try { await main(); }
catch (error) {
  if (activePage) {
    try { errors.push(await activePage.evaluate('document.body.innerText')); const capture = await activePage.call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, 'text-selection-failure.png'), Buffer.from(capture.data, 'base64')); } catch { /* Keep the original failure. */ }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: false, error: String(error), browser: browserVersion, steps, details, errors }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    try { if (socket) socket.send(JSON.stringify({ id: ++nextId, method: 'Browser.close', params: {} })); } catch { /* The browser may have closed already. */ }
    await Promise.race([exited, delay(3000)]);
    if (browser.exitCode === null) { browser.kill('SIGTERM'); await Promise.race([exited, delay(3000)]); }
  }
  if (!appClosed) { appClosed = true; await app.locals.closeFrontend?.(); }
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
