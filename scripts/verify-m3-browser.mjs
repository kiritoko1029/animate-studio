import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createApp } from '../server/index.mjs';

const out = resolve('artifacts/m3-browser');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'run-'));
const sales = [
  { month: '1月', visitors: 1680, target: 1600, orders: 136 },
  { month: '2月', visitors: 1920, target: 1800, orders: 162 },
  { month: '3月', visitors: 2140, target: 2000, orders: 188 },
  { month: '4月', visitors: 2260, target: 2200, orders: 240 },
  { month: '5月', visitors: 2420, target: 2400, orders: 260 },
  { month: '6月', visitors: 2420, target: 2600, orders: 300 },
];
const calls = [], timers = new Set(), steps = [], errors = [];
const app = await createApp({ dataDir: join(work, 'data'), serveFrontend: true, production: true, accounts: null });
let origin, site;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  const json = (value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(JSON.stringify(value));
  };
  if (url.pathname.startsWith('/api/')) calls.push({ method: req.method, path: `${url.pathname}${url.search}` });
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }
  if (req.method !== 'GET' && url.pathname.startsWith('/api/')) { json({ error: 'method not allowed' }, 405); return; }
  if (url.pathname === '/api/sales') {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1), size = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 5));
    json(sales.slice((page - 1) * size, page * size)); return;
  }
  if (url.pathname === '/api/empty') { json([]); return; }
  if (url.pathname === '/api/failure') { json({ error: 'fixture failure' }, 500); return; }
  if (url.pathname === '/api/slow') {
    const timer = setTimeout(() => { timers.delete(timer); json(sales); }, 300);
    timers.add(timer); return;
  }
  if (url.pathname === '/api/shared/m3-chart') { json({ page: site, publishedAt: '2026-10-26T00:00:00Z' }); return; }
  app(req, res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
let socket, appClosed = false, nextId = 0, activePage, browserVersion = '';
const pending = new Map(), events = new Map();
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
function on(method, fn) { if (!events.has(method)) events.set(method, []); events.get(method).push(fn); }
async function attach(url) {
  const { targetId } = await rpc('Target.createTarget', { url });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => rpc(method, params, sessionId);
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const until = async (expression, description, timeout) => untilValue(async () => evaluate(`(()=>{try{return Boolean(${expression})}catch{return null}})()`), description, timeout);
  const click = async (selector, text) => {
    await evaluate(`(()=>{const element=${text ? `[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.trim()===${JSON.stringify(text)})` : `document.querySelector(${JSON.stringify(selector)})`};if(!element)throw new Error('Missing clickable element: '+${JSON.stringify(selector)});element.focus({preventScroll:true});return true})()`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  };
  const clickText = (text, selector = 'button') => click(selector, text);
  const fill = async (selector, value) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await call('Input.insertText', { text: value }); };
  const select = (selector, value) => evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}));return element.value})()`);
  const openMenu = async (selector, text) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
    await until(`[...document.querySelectorAll('[role="menuitem"]')].some(item=>item.textContent.trim()===${JSON.stringify(text)})`, `${text} menu mounted`);
  };
  return { call, evaluate, until, click, clickText, fill, select, openMenu, sessionId, targetId };
}
async function settle(page) {
  try {
    await page.evaluate(`document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity){try{animation.finish()}catch{}}});true`);
    await page.until(`document.getAnimations().every(animation=>animation.playState!=='running'||animation.effect?.getTiming().iterations===Infinity)`, 'visual transitions settled');
  } catch (error) {
    const running = await page.evaluate(`document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity).map(animation=>({name:animation.animationName||animation.transitionProperty||animation.constructor.name,target:animation.effect?.target?.getAttribute('class')}))`);
    throw new Error(`${error.message} ${JSON.stringify(running)}`);
  }
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
  browserVersion = version.Browser;
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
  const page = await attach('about:blank'); activePage = page;
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('animate-studio:locale','zh-CN');` });
  await page.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(work, 'downloads'), eventsEnabled: true });
  await page.call('Page.navigate', { url: origin });
  await page.until(`document.querySelector('input[aria-label="页面名称"]')`, 'editor ready');
  await page.openMenu('[aria-label="页面操作"]', '从任务或模板开始…');
  await page.clickText('从任务或模板开始…', '[role="menuitem"]');
  await page.click('.page-creation-task--dashboard');
  await page.until(`document.querySelector('input[aria-label="页面名称"]')?.value==='运营数据概览 · 示例' && document.querySelectorAll('[data-chart-mark]').length===12`, 'dashboard template renders real chart data');
  const selectChart = async () => {
    const id = await page.evaluate(`document.querySelector('[data-chart-svg]').closest('[data-block-id]')?.dataset.blockId`);
    assert.ok(id, 'chart has a stable block id');
    await page.click(`[data-block-id="${id}"]`);
    await page.until(`document.querySelector('select[aria-label="数据源"]')`, 'chart inspector ready');
    return id;
  };
  const chartId = await selectChart();
  assert.equal(await page.evaluate(`document.querySelector('select[aria-label="数据源"]').value`), 'sales');
  assert.equal(await page.evaluate(`document.querySelector('select[aria-label="分类字段"]').value`), 'month');
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[aria-label^="指标字段"]')].map(element=>element.value)`), ['visitors', 'target']);
  assert.equal(await page.evaluate(`document.querySelectorAll('.page-data-table tbody tr').length`), 6);
  steps.push('真实模板入口：图表和表格共享静态数据源');

  for (const type of ['area', 'column', 'bar', 'pie', 'line']) {
    await page.select('select[aria-label="图表类型"]', type);
    await page.until(`document.querySelector('[data-chart-type="${type}"]')`, `chart type ${type}`);
    assert.equal(await page.evaluate(`document.querySelector('select[aria-label="数据源"]').value`), 'sales');
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[aria-label^="指标字段"]')].map(element=>element.value)`), type === 'pie' ? ['visitors'] : ['visitors', 'target']);
  }
  await page.select('select[aria-label="图表类型"]', 'pie');
  await page.click('[data-inspector-disclosure="component:chart:display"] > summary');
  await page.until(`document.querySelector('[data-inspector-disclosure="component:chart:display"]')?.open`, 'advanced chart settings open');
  await page.fill('[aria-label="环形内半径"]', '65');
  await page.until(`document.querySelector('[aria-label="环形内半径"]').value==='65'`, 'donut setting');
  await page.select('select[aria-label="图表类型"]', 'line');
  await page.until(`document.querySelector('[data-chart-type="line"] [data-chart-mark]')`, 'line restored with both measures');
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[aria-label^="指标字段"]')].map(element=>element.value)`), ['visitors', 'target']);
  steps.push('五类图表、环形设置与切换时保留字段映射');

  await page.click('[aria-label="配置分类筛选"]');
  await page.until(`document.querySelector('select[aria-label="筛选变量"]')?.value==='chartCategory'`, 'one-step filter configuration');
  await page.clickText('预览', '.view-switch button');
  await page.until(`document.querySelectorAll('.page-data-table tbody tr').length===6`, 'shared table ready');
  await page.click('[data-chart-mark][data-category="4月"]');
  await page.until(`document.querySelectorAll('.page-data-table tbody tr').length===1 && document.querySelector('.page-data-table')?.textContent.includes('2260')`, 'chart filters table');
  await page.click('[data-chart-mark][data-category="4月"]');
  await page.until(`document.querySelectorAll('.page-data-table tbody tr').length===6`, 'selection clears');
  await page.clickText('编辑', '.view-switch button');
  await page.click('[aria-label="撤销 (⌘Z)"]');
  await page.until(`document.querySelector('select[aria-label="筛选变量"]')?.value===''`, 'filter configuration is one undo step');
  await page.click('[aria-label="重做 (⌘⇧Z)"]');
  await page.until(`document.querySelector('select[aria-label="筛选变量"]')?.value==='chartCategory'`, 'filter configuration redo');
  steps.push('无代码筛选、再次点选清除、一次撤销与重做');

  await page.click('.page-logic-button');
  await page.until(`document.querySelector('#logic-tab-sources')`, 'source tabs mounted');
  await page.click('#logic-tab-sources');
  await page.until(`document.querySelector('.data-source-manager')`, 'data source manager mounted');
  await page.clickText('公开 REST', '.data-source-actions button');
  await page.fill('[aria-label="接口地址"]', `${origin}/api/sales`);
  await page.clickText('测试并连接', '.data-source-actions button');
  await page.until(`document.querySelector('.data-source-success')?.textContent.includes('连接成功') && document.querySelector('.data-source-fields')?.textContent.includes('orders')`, 'REST test and field inference');
  await page.clickText('保存数据源', '.data-source-actions button');
  await page.until(`document.querySelector('.data-source-success')?.textContent.includes('数据源已保存')`, 'REST saved');
  await page.click('[aria-label="关闭交互工作台"]');
  await page.select('select[aria-label="数据源"]', 'books');
  await page.until(`document.querySelector('[aria-label="指标字段 1"]')?.value==='visitors'`, 'REST field recommendation');
  await page.clickText('预览', '.view-switch button');
  await page.until(`document.querySelector('.chart-meta')?.textContent.includes('第 1 页') && document.querySelectorAll('[data-chart-mark]').length===10`, 'REST current page scope');
  await page.click('.data-chart [aria-label="下一页数据"]');
  await page.until(`document.querySelector('.chart-meta')?.textContent.includes('第 2 页') && document.querySelectorAll('[data-chart-mark]').length===2`, 'REST next page');
  await page.click('.data-chart [aria-label="上一页数据"]');
  await page.until(`document.querySelector('.chart-meta')?.textContent.includes('第 1 页') && document.querySelectorAll('[data-chart-mark]').length===10`, 'REST previous page');
  steps.push('公开 REST 连接、字段推荐与当前页分页统计');

  await page.until(`document.querySelector('.save-status.saved')`, 'latest site saved before edge fixtures');
  site = await page.evaluate(`JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1')).page`);
  assert.equal(site.kind, 'site');
  site.dataSources.push(
    { id: 'empty', name: '空数据', kind: 'static', mode: 'collection', items: [] },
    { id: 'failure', name: '失败数据', kind: 'rest', mode: 'collection', url: `${origin}/api/failure` },
    { id: 'slow', name: '超时数据', kind: 'rest', mode: 'collection', url: `${origin}/api/slow`, timeoutMs: 100 },
  );
  await page.evaluate(`localStorage.setItem('animate-studio:guest-site-draft:v1', ${JSON.stringify(JSON.stringify({ page: site, savedAt: new Date().toISOString() }))})`);
  await page.call('Page.reload', { ignoreCache: true });
  await page.until(`document.querySelector('[data-chart-svg]')`, 'edge fixture restored');
  await selectChart();
  await page.clickText('预览', '.view-switch button');
  for (const [id, selector, text] of [['empty', '.data-state', '暂无数据'], ['failure', '.data-state--error', 'HTTP 500'], ['slow', '.data-state--error', '超时']]) {
    await page.select('select[aria-label="数据源"]', id);
    await page.until(`document.querySelector('.data-chart ${selector}')?.textContent.includes(${JSON.stringify(text)})`, `chart ${id} state`);
    assert.equal(await page.evaluate(`document.querySelector('[data-chart-svg]')`), null);
  }
  await page.select('select[aria-label="数据源"]', 'books');
  await page.until(`document.querySelector('[data-chart-mark]')`, 'valid source recovers');
  steps.push('空数据、HTTP 500 和超时均有明确状态，恢复后不伪造图形');

  await page.clickText('编辑', '.view-switch button');
  const tableId = await page.evaluate(`document.querySelector('.page-data-table').closest('[data-block-id]')?.dataset.blockId`);
  assert.ok(tableId);
  await page.click(`[data-block-id="${tableId}"]`);
  await page.until(`document.querySelector('select[aria-label="数据源"]')`, 'table inspector ready');
  await page.select('select[aria-label="数据源"]', 'books');
  await page.until(`document.querySelector('[aria-label="列字段 1"]')?.value==='month'`, 'table shares REST source');
  await selectChart();
  await page.click('[aria-label="配置分类筛选"]');
  await page.until(`document.querySelector('select[aria-label="筛选变量"]')?.value==='chartCategory'`, 'reuse the shared filter variable after source change');
  await page.clickText('预览', '.view-switch button');
  await page.until(`document.querySelectorAll('.page-data-table tbody tr').length===5`, 'shared REST table ready');
  await page.click('[data-chart-mark][data-category="3月"]');
  await page.until(`document.querySelectorAll('.page-data-table tbody tr').length===1 && document.querySelector('.page-data-table')?.textContent.includes('2140')`, 'REST chart filters table');
  await page.click('[data-chart-mark][data-category="3月"]');
  await page.until(`document.querySelectorAll('.page-data-table tbody tr').length===5`, 'REST filter clears');

  const beforeTheme = await page.evaluate(`getComputedStyle(document.querySelector('.chart-widget')).backgroundColor`);
  await page.openMenu('[aria-label="更多操作"]', '切换深色外观');
  await page.clickText('切换深色外观', '[role="menuitem"]');
  assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.chart-widget')).backgroundColor`), beforeTheme);
  await page.openMenu('[aria-label="更多操作"]', '切换浅色外观');
  await page.clickText('切换浅色外观', '[role="menuitem"]');
  await page.evaluate(`window.scrollTo(0,0);document.querySelector('.site-preview')?.scrollTo(0,0);true`);
  await settle(page); await screenshot(page, 'm3-dashboard-desktop.png');
  steps.push('REST 图表联动表格，工作台主题不改变页面图表');

  await page.until(`document.querySelector('.save-status.saved')`, 'final site saved');
  site = await page.evaluate(`JSON.parse(localStorage.getItem('animate-studio:guest-site-draft:v1')).page`);
  assert.ok(site.pages[0].page.blocks.find(block => block.id === chartId).props.filterVariable);
  assert.ok(site.pages[0].page.blocks.find(block => block.id === tableId).props.filterVariable);
  await page.openMenu('[aria-label="页面操作"]', '导出 HTML');
  await page.clickText('导出 HTML', '[role="menuitem"]');
  const download = await untilValue(async () => {
    const file = (await readdir(join(work, 'downloads')).catch(() => [])).find(name => name.endsWith('.html'));
    return file ? join(work, 'downloads', file) : null;
  }, 'native HTML download', 45000);
  const html = await readFile(download, 'utf8');
  assert.ok(html.includes('数据图表') && html.includes('chartType'));
  await copyFile(download, join(out, 'dashboard-site.html'));
  const exported = await attach(pathToFileURL(download).href); activePage = exported;
  await exported.until(`document.querySelectorAll('[data-chart-mark]').length===10 && document.querySelectorAll('.page-data-table tbody tr').length===5`, 'exported chart and table load public REST');
  await exported.click('[data-chart-mark][data-category="3月"]');
  await exported.until(`document.querySelectorAll('.page-data-table tbody tr').length===1`, 'exported selection filters table');
  await exported.call('Page.reload', { ignoreCache: true });
  await exported.until(`document.querySelectorAll('[data-chart-mark]').length===10 && document.querySelectorAll('.page-data-table tbody tr').length===5`, 'nonpersistent selection resets after reload');
  await exported.click('[aria-label="查看数据表"]');
  await exported.until(`document.querySelectorAll('.data-chart-table tbody tr').length===5 && document.querySelector('.data-chart-table')?.textContent.includes('2,140')`, 'export data table alternative');
  await exported.click('[aria-label="返回图表"]');
  await exported.until(`document.querySelector('[data-chart-svg]')`, 'export chart returns');
  steps.push('真实 HTML 导出、公开数据、筛选刷新与非持久化选择');

  await exported.click('.chart-export summary');
  await exported.click('.chart-export button');
  const svgFile = await untilValue(async () => {
    const file = (await readdir(join(work, 'downloads'))).find(name => name.endsWith('.svg'));
    if (!file) return null;
    const path = join(work, 'downloads', file), source = await readFile(path, 'utf8');
    return source.endsWith('</svg>') ? { path, source } : null;
  }, 'real SVG download');
  assert.match(svgFile.source, /1月/); assert.match(svgFile.source, /visitors/); assert.ok(!svgFile.source.includes('var(--page-accent)'));
  await copyFile(svgFile.path, join(out, 'chart.svg'));
  await exported.click('.chart-export summary');
  await exported.evaluate(`document.querySelectorAll('.chart-export button')[1].dataset.m3Png='1'`);
  await exported.click('[data-m3-png]');
  const pngFile = await untilValue(async () => {
    const file = (await readdir(join(work, 'downloads'))).find(name => name.endsWith('.png'));
    if (!file) return null;
    const path = join(work, 'downloads', file), data = await readFile(path);
    if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
    try { const stats = await sharp(data).stats(); return stats.channels.some(channel => channel.stdev > 0) ? path : null; } catch { return null; }
  }, 'nonblank PNG download');
  await copyFile(pngFile, join(out, 'chart.png'));
  steps.push('SVG 含真实数据与解析后的颜色，PNG 文件签名和像素有效');

  await exported.evaluate(`document.querySelector('.chart-focus-dialog [data-chart-mark]')?.focus();true`);
  await exported.click('[data-chart-expand]');
  await exported.until(`document.querySelector('.chart-focus-dialog[open] [data-chart-svg]')`, 'desktop focus view');
  await exported.evaluate(`document.querySelector('.chart-focus-dialog [data-chart-mark]').focus();true`);
  await exported.until(`document.querySelector('.chart-tooltip')?.textContent.includes('visitors')`, 'keyboard tooltip');
  await exported.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await exported.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await exported.until(`!document.querySelector('.chart-focus-dialog') && document.activeElement?.hasAttribute('data-chart-expand')`, 'Escape closes and restores focus');
  await exported.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await exported.until(`document.querySelector('.page-free-scaled-shell')?.getBoundingClientRect().width<=390`, '390px fixed canvas fit');
  assert.ok(await exported.evaluate(`document.querySelector('.page-surface').scrollWidth<=document.querySelector('.page-surface').clientWidth+1`));
  await exported.evaluate(`window.scrollTo(0,0);true`);
  await settle(page); await screenshot(exported, 'm3-mobile.png');
  await exported.evaluate(`document.querySelector('[data-chart-mark]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));true`);
  await exported.until(`document.querySelector('.chart-focus-dialog[open] [data-chart-svg]')`, 'mobile tap opens readable chart');
  assert.ok(await exported.evaluate(`document.querySelector('.chart-focus-dialog').getBoundingClientRect().width>=350`));
  assert.ok(await exported.evaluate(`parseFloat(getComputedStyle(document.querySelector('.chart-focus-dialog .chart-axis-text')).fontSize)>=11`));
  assert.ok(await exported.evaluate(`document.querySelector('.chart-focus-dialog .chart-toolbar button').getBoundingClientRect().height>=44`));
  assert.ok(await exported.evaluate(`document.querySelector('.chart-focus-dialog').scrollWidth<=document.querySelector('.chart-focus-dialog').clientWidth+1`));
  await settle(page); await screenshot(exported, 'm3-focus-mobile.png');
  await exported.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await exported.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await exported.until(`!document.querySelector('.chart-focus-dialog')`, 'mobile focus closes');
  await exported.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  steps.push('键盘提示、Esc 焦点恢复、390px 放大视图与减少动态效果');

  site.pages[0].page.settings = { ...site.pages[0].page.settings, theme: 'midnight', background: '#111111', accent: '#A3D9B1' };
  await page.call('Page.navigate', { url: `${origin}/p/m3-chart` });
  activePage = page;
  await page.until(`document.querySelectorAll('[data-chart-mark]').length===10 && document.querySelectorAll('.page-data-table tbody tr').length===5`, 'shared snapshot chart');
  const contrast = await page.evaluate(`(()=>{const parse=value=>{const match=value.match(/rgba?\\(([^)]+)\\)/);if(!match)throw new Error('Unsupported color '+value);const channels=match[1].split(',').slice(0,3).map(Number);return channels.map(channel=>{const value=channel/255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4})};const luminance=values=>values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;const text=luminance(parse(getComputedStyle(document.querySelector('.chart-axis-text')).fill));const background=luminance(parse(getComputedStyle(document.querySelector('.chart-widget')).backgroundColor));return (Math.max(text,background)+0.05)/(Math.min(text,background)+0.05)})()`);
  assert.ok(contrast >= 4.5, `dark chart text contrast ${contrast}`);
  await settle(page); await screenshot(page, 'm3-dark.png');
  steps.push(`本地分享快照与深色页面主题（文字对比度 ${contrast.toFixed(2)}:1）`);

  assert.equal(calls.filter(call => !['GET', 'OPTIONS'].includes(call.method)).length, 0, 'chart operations never write to REST');
  assert.deepEqual(errors, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: true, browser: browserVersion, steps, calls, errors, ai: 'deterministic tests only; no live model called', note: 'Local REST and local share fixture. Exported HTML uses temporary API addresses.' }, null, 2));
  console.log(JSON.stringify({ ok: true, steps, artifacts: out, errors }, null, 2));
}
try { await main(); }
catch (error) {
  if (activePage) {
    try { errors.push(await activePage.evaluate('document.body.innerText')); const capture = await activePage.call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, 'm3-failure.png'), Buffer.from(capture.data, 'base64')); } catch { /* Keep the original failure. */ }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ ok: false, error: String(error), steps, calls, errors }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  for (const timer of timers) clearTimeout(timer);
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
