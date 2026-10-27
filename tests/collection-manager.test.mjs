import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

const bundle = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {AnimateUIProvider} from '@animate-ui/react/provider';import {MediaContext} from './src/lib/media/context';import {CollectionManager} from './src/components/CollectionManager';import {DataSourceManager} from './src/components/DataSourceManager';import {AccountProvider} from './src/components/AccountProvider';import {initializeLocale} from './src/i18n';initializeLocale();const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.mount=(site,kind)=>{site=window.JSON.parse(JSON.stringify(site));window.current=site;window.changes=[];window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><AccountProvider><MediaContext.Provider value={window.media}>{kind==='collections'?<CollectionManager site={window.current} onChange={next=>{window.changes.push(next);window.current=next;}}/>:<DataSourceManager site={window.current} onChange={next=>{window.changes.push(next);window.current=next;}}/>}</MediaContext.Provider></AccountProvider></AnimateUIProvider></MotionConfig>));};`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent',
  plugins: [{ name: 'raw', setup(build) { build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' })); build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) })); } }],
});
const staticSource = { id: 'legacy', name: '旧静态数据', kind: 'static', mode: 'collection', items: [{ id: 'one', title: '保留' }] };
function fixture(t, collection = true) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://collections.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const win = dom.window; win.localStorage.setItem('animate-studio:locale', 'zh-CN');
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  Object.assign(win, { Headers, Request, Response, AbortSignal, AbortController, TextEncoder, TextDecoder });
  win.structuredClone = value => win.JSON.parse(JSON.stringify(value));
  win.fetch = async url => Response.json(String(url).includes('get-session') ? null : { cloudEnabled: false, emailEnabled: false, githubEnabled: false });
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {}; win.HTMLElement.prototype.scrollTo = () => {};
  const assetId = crypto.randomUUID(), page = createDocument(true);
  page.blocks = [{ id: 'list', type: 'repeater', props: { sourceId: 'collection3', dataFields: { title: { title: 'title' } } }, frame: { x: 20, y: 20, width: 560, height: 820 }, children: [{ id: 'title', type: 'heading', props: { title: '标题' } }] }];
  const site = createSiteDocument(page); site.dataSources = collection ? [staticSource, { id: 'articles', name: '已有集合', kind: 'collection', mode: 'collection', fields: [{ key: 'title', label: '标题', type: 'text' }], records: [{ id: 'old', values: { title: '旧文章' } }] }] : [staticSource];
  win.media = { kind: 'guest', document: site, assets: [{ id: assetId, name: '封面.png', mime: 'image/png', size: 100, createdAt: new Date().toISOString() }], loading: false, error: '', migrationPending: 0, resolve: async id => `blob:${id}`, refresh: async () => [], upload: async () => { throw new Error('not needed'); }, remove: async () => ({ retained: true }), migrate: async () => ({ uploaded: 0, failed: 0 }) };
  let confirm = true; const confirmations = [];
  win.confirm = message => { confirmations.push(message); return confirm; };
  win.eval(bundle.outputFiles[0].text);
  t.after(() => { win.unmount?.(); win.close(); assert.deepEqual(errors, []); });
  const click = element => { assert.ok(element, 'expected control'); win.perform(() => element.click()); };
  const until = async (predicate, description) => { const end = Date.now() + 4000; while (true) { try { if (predicate()) return; } catch {} if (Date.now() > end) assert.fail(`${description}: ${win.document.body.textContent}`); await new Promise(resolve => setTimeout(resolve, 10)); } };
  const button = text => [...win.document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  const field = name => { const input = win.document.querySelector(`[aria-label="${name}"]`); assert.ok(input, `missing field ${name}`); return input; };
  const input = (name, value) => { const element = field(name), prototype = element.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype; win.perform(() => { Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new win.Event('input', { bubbles: true })); }); };
  const refresh = () => { const changes = win.changes; win.mount(win.current, 'collections'); win.changes = changes; };
  return { win, document: win.document, site, assetId, click, until, button, field, input, refresh, confirmations, setConfirm(value) { confirm = value; } };
}

test('collection editor creates, edits, duplicates and deletes without dropping other data sources', async t => {
  const f = fixture(t); f.win.mount(f.site, 'collections');
  f.click(f.button('新建集合'));
  await f.until(() => f.field('记录字段 标题'), 'default record ready');
  f.input('记录字段 标题', '更新后的文章');
  f.click(f.field('复制当前记录'));
  f.input('记录 ID', 'article-2'); f.click(f.button('应用内容'));
  await f.until(() => f.win.changes.length === 1, 'collection applied');
  assert.deepEqual([...f.win.current.dataSources].map(source => source.id), ['legacy', 'articles', 'collection3']);
  assert.equal(f.win.current.dataSources[2].records.length, 2);
  assert.equal(f.win.current.dataSources[2].records[1].values.title, '更新后的文章');
  f.refresh();
  await f.until(() => f.field('记录字段 标题').value === '第一条内容', 'parent update restores a selectable record');
  assert.match(f.document.querySelector('[role="status"]').textContent, /内容已应用/);
  f.click(f.button('新增记录')); f.input('记录字段 标题', '尚未应用');
  f.setConfirm(false); f.click(f.document.querySelector('.collection-record-tabs button'));
  assert.equal(f.field('记录字段 标题').value, '尚未应用');
  f.setConfirm(true); f.click(f.document.querySelector('.collection-record-tabs button'));
  assert.equal(f.field('记录字段 标题').value, '第一条内容');
  assert.equal(f.confirmations.length > 0, true);
  f.click(f.document.querySelector('.collection-fields > summary')); f.click(f.button('添加字段'));
  f.input('新字段 key', '__proto__'); f.input('新字段名称', '非法字段'); f.click(f.button('添加字段'));
  await f.until(() => f.document.querySelector('[role="alert"]')?.textContent.includes('字段 key'), 'unsafe field key is rejected');
  f.input('新字段 key', 'summary'); f.input('新字段名称', '摘要'); f.click(f.button('添加字段'));
  await f.until(() => f.field('记录字段 摘要'), 'new field becomes a normal input');
  f.click(f.button('选择图片'));
  await f.until(() => f.button('使用图片'), 'real media picker opens');
  f.click(f.button('使用图片'));
  await f.until(() => f.field('记录字段 封面图').value === `asset:${f.assetId}`, 'selected media updates the record');
  f.click(f.button('应用内容'));
  await f.until(() => f.win.changes.length === 2, 'image and field applied');
  assert.equal(f.win.current.dataSources[2].records.find(record => record.id === 'example').values.cover, `asset:${f.assetId}`);
  assert.equal(f.win.current.dataSources[2].fields[3].key, 'summary');
  f.refresh();
  f.click(f.field('删除当前记录')); f.click(f.button('应用内容'));
  await f.until(() => f.win.changes.length === 3, 'record removed');
  f.refresh();
  assert.equal(f.win.current.dataSources[2].records.length, 1);
  f.click(f.button('删除集合'));
  await f.until(() => f.win.changes.length === 4, 'collection removed');
  assert.deepEqual([...f.win.current.dataSources].map(source => source.id), ['legacy', 'articles']);
  assert.equal(f.win.current.pages[0].page.blocks[0].props.sourceId, '');
});

test('a second collection opens with its first record ready after parent synchronization', async t => {
  const f = fixture(t); f.win.mount(f.site, 'collections'); f.click(f.button('新建集合'));
  await f.until(() => f.field('记录字段 标题'), 'first collection ready');
  f.click(f.field('复制当前记录')); f.input('记录 ID', 'article-2'); f.click(f.button('应用内容'));
  await f.until(() => f.win.changes.length === 1, 'first collection applied'); f.refresh();
  f.click(f.button('新建集合'));
  await f.until(() => f.field('记录字段 标题'), 'second collection has a selected record');
  f.click(f.button('应用内容'));
  await f.until(() => f.win.changes.length === 2, 'second collection applied'); f.refresh();
  assert.equal(f.field('记录字段 标题').value, '第一条内容');
});

test('legacy data source editing and removal preserve content collections', async t => {
  const f = fixture(t); f.win.mount(f.site, 'sources');
  f.input('数据源名称', '更新后的静态数据'); f.click(f.button('保存数据源'));
  await f.until(() => f.win.changes.length === 1, 'legacy source saved');
  assert.deepEqual([...f.win.current.dataSources].map(source => source.id), ['articles', 'legacy']);
  f.click(f.button('删除并解除绑定'));
  await f.until(() => f.win.changes.length === 2, 'legacy source removed');
  assert.deepEqual([...f.win.current.dataSources].map(source => source.id), ['articles']);
});
