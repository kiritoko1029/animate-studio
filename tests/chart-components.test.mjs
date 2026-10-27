import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createBlock, createDocument } from '../src/model.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

const bundle = await build({ stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {PageRenderer} from './src/components/PageRenderer';window.mount=(page,sources)=>{const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<MotionConfig reducedMotion="always"><PageRenderer document={page} dataSources={sources} dataAccess={{scope:'export'}}/></MotionConfig>));};`, loader: 'jsx', resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent' });
const until = async (predicate, message) => { const end = Date.now() + 4000; while (!predicate()) { if (Date.now() > end) assert.fail(typeof message === 'function' ? message() : message); await new Promise(resolve => setTimeout(resolve, 10)); } };
const sales = [
  { month: '1月', visitors: 100, orders: 4 },
  { month: '2月', visitors: 160, orders: 7 },
  { month: '3月', visitors: 120, orders: 5 },
];
function chartPage() {
  const page = createDocument(true), chart = createBlock('chart');
  chart.id = 'sales-chart'; chart.frame = { x: 20, y: 20, width: 640, height: 440 };
  chart.props = { ...chart.props, sourceId: 'sales', categoryField: 'month', dataColumns: [{ key: 'visitors', label: '访问量', path: 'visitors', aggregate: 'sum' }, { key: 'orders', label: '订单', path: 'orders', aggregate: 'sum' }] };
  page.blocks = [chart];
  return { page, chart };
}
const source = { id: 'sales', name: '销售数据', kind: 'static', mode: 'collection', items: sales, pageSize: 10 };
function fixture(t, fetcher) {
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on('error', (...args) => errors.push(args.join(' '))); virtualConsole.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://studio.test/dashboard', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const win = dom.window; Object.assign(win, { structuredClone, TextEncoder, TextDecoder, AbortSignal, AbortController, Response });
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {}; win.HTMLElement.prototype.scrollTo = () => {}; win.scrollTo = () => {};
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new win.Event('close')); };
  win.URL.createObjectURL = blob => { win.lastBlob = blob; return 'blob:chart'; }; win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () { win.download = { name: this.download, blob: win.lastBlob }; };
  const calls = []; win.fetch = fetcher ?? (async (url, init = {}) => { calls.push({ url: String(url), init }); return Response.json(sales); });
  win.eval(bundle.outputFiles[0].text);
  t.after(() => { win.unmount?.(); win.close(); assert.deepEqual(errors, []); });
  return { win, doc: win.document, calls, errors, mount: (page, sources = [source]) => win.mount(win.JSON.parse(JSON.stringify(page)), win.JSON.parse(JSON.stringify(sources))) };
}

test('real chart rendering covers five types without changing the source or mapping', async t => {
  const f = fixture(t), { page, chart } = chartPage();
  f.mount(page);
  await until(() => f.doc.querySelectorAll('[data-chart-type="line"] [data-chart-mark]').length === 6, () => `line chart renders real records: ${f.doc.body.textContent} ${f.errors.join(' | ')} marks=${f.doc.querySelectorAll('[data-chart-mark]').length} types=${f.doc.querySelectorAll('[data-chart-type]').length} svg=${f.doc.querySelector('[data-chart-svg]')?.outerHTML.slice(0, 1600)}`);
  assert.match(f.doc.querySelector('.chart-meta').textContent, /全部 3 条静态记录/);
  for (const type of ['area', 'column', 'bar', 'pie']) {
    const next = { ...page, blocks: [{ ...chart, props: { ...chart.props, chartType: type } }] };
    f.win.unmount(); f.mount(next);
    await until(() => f.doc.querySelector(`[data-chart-type="${type}"]`), `${type} renders`);
    assert.equal(next.blocks[0].props.sourceId, 'sales');
    assert.deepEqual(next.blocks[0].props.dataColumns, chart.props.dataColumns);
    assert.equal(f.doc.querySelectorAll('[data-chart-mark]').length, type === 'pie' ? 3 : 6);
  }
  assert.ok(f.doc.querySelector('[data-chart-type="pie"] path[fill-rule="evenodd"]').getAttribute('d').includes('A'));
});

test('chart selection filters the shared table, emits structured values and clears again', async t => {
  const f = fixture(t), { page, chart } = chartPage(), table = createBlock('table');
  table.id = 'sales-table'; table.props = { ...table.props, sourceId: 'sales', dataColumns: [{ key: 'month', label: '月份', path: 'month' }, { key: 'visitors', label: '访问', path: 'visitors' }] };
  chart.props = { ...chart.props, filterVariable: 'category', filterField: 'month' };
  chart.events = { change: [{ type: 'set', variable: 'echo', expression: 'event.value.category' }] };
  table.props.filterVariable = 'category'; table.props.filterField = 'month';
  page.variables = [{ name: 'category', type: 'string', initial: '', persistent: false }, { name: 'echo', type: 'string', initial: '', persistent: false }];
  page.blocks = [chart, table]; f.mount(page);
  await until(() => f.doc.querySelectorAll('[data-chart-mark]').length === 6, 'chart ready');
  assert.equal(f.doc.querySelectorAll('.page-data-table tbody tr').length, 3);
  f.win.perform(() => f.doc.querySelector('[data-chart-mark][data-category="1月"]').dispatchEvent(new f.win.MouseEvent('click', { bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelectorAll('.page-data-table tbody tr').length === 1, 'table filters to the selected category');
  assert.match(f.doc.querySelector('.page-data-table tbody').textContent, /100/);
  assert.equal(f.doc.querySelector('[data-chart-clear]').textContent, '清除筛选：1月');
  f.win.perform(() => f.doc.querySelector('[data-chart-mark][data-category="1月"]').dispatchEvent(new f.win.MouseEvent('click', { bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelectorAll('.page-data-table tbody tr').length === 3, 'second selection clears the filter');
});

test('chart table alternative, real SVG download and mobile focus view work', async t => {
  const f = fixture(t), { page } = chartPage(); f.mount(page);
  await until(() => f.doc.querySelector('[data-chart-mark]'), 'chart ready');
  f.win.perform(() => f.doc.querySelector('[aria-label="查看数据表"]').click());
  await until(() => f.doc.querySelector('.data-chart-table'), 'data table opens');
  assert.equal(f.doc.querySelectorAll('.data-chart-table tbody tr').length, 3);
  assert.match(f.doc.querySelector('.data-chart-table').textContent, /160/);
  f.win.perform(() => f.doc.querySelector('[aria-label="返回图表"]').click());
  await until(() => f.doc.querySelector('[data-chart-svg]'), 'chart returns');
  f.win.perform(() => { f.doc.querySelector('.chart-export summary').click(); f.doc.querySelector('.chart-export button').click(); });
  await until(() => f.win.download?.name.endsWith('.svg'), 'SVG download starts');
  const svg = await new Promise((resolve, reject) => { const reader = new f.win.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsText(f.win.download.blob); });
  assert.match(svg, /<svg/); assert.match(svg, /1月/); assert.match(svg, /访问量/);
  f.win.perform(() => { const trigger = f.doc.querySelector('[data-chart-expand]'); trigger.focus(); trigger.click(); });
  await until(() => f.doc.querySelector('.chart-focus-dialog[open]'), 'focus view opens');
  assert.ok(f.doc.querySelector('.chart-focus-dialog [data-chart-svg]'));
  f.win.perform(() => f.doc.querySelector('.chart-focus-dialog').close());
  await until(() => !f.doc.querySelector('.chart-focus-dialog'), 'focus view closes');
  await until(() => f.doc.activeElement?.hasAttribute('data-chart-expand'), 'focus returns to the expand trigger');
});

test('chart shows real request errors and empty data instead of a fabricated graph', async t => {
  const f = fixture(t, async () => Response.json({ error: 'failure' }, { status: 500 })), { page } = chartPage();
  f.mount(page, [{ id: 'sales', name: '失败接口', kind: 'rest', mode: 'collection', url: '/api/sales' }]);
  await until(() => f.doc.querySelector('.data-state--error')?.textContent.includes('HTTP 500'), 'HTTP error is visible');
  assert.equal(f.doc.querySelector('[data-chart-svg]'), null);
  f.win.unmount(); f.mount(page, [{ id: 'sales', name: '空数据', kind: 'static', mode: 'collection', items: [] }]);
  await until(() => f.doc.querySelector('.data-state')?.textContent.includes('暂无数据'), 'empty state is visible');
  assert.equal(f.doc.querySelector('[data-chart-svg]'), null);
});
