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
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {AnimateUIProvider} from '@animate-ui/react/provider';import {MediaContext} from './src/lib/media/context';import {CollectionManager} from './src/components/CollectionManager';import {DataSourceManager} from './src/components/DataSourceManager';import {AccountProvider} from './src/components/AccountProvider';import {initializeLocale} from './src/i18n';initializeLocale();const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.mount=(site,kind)=>{site=window.JSON.parse(JSON.stringify(site));window.current=site;window.changes=[];window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><AccountProvider><MediaContext.Provider value={window.media}>{kind==='collections'?<CollectionManager site={window.current} onChange={next=>{window.changes.push(next);window.current=next;}}/>:<DataSourceManager site={window.current} dataPageId={window.dataPageId} onChange={next=>{window.changes.push(next);window.current=next;}}/>}</MediaContext.Provider></AccountProvider></AnimateUIProvider></MotionConfig>));};`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
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

test('REST editor tests POST queries with tab-only token headers and saves no token values', async t => {
  const f = fixture(t, false); f.win.mount(f.site, 'sources');
  const originalFetch = f.win.fetch, calls = [];
  f.win.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('http://10.0.0.8/')) return originalFetch(url, init);
    calls.push({ url, init }); return Response.json({ items: [{ coilNo: '001' }] });
  };
  const select = (name, value) => f.win.perform(() => { const element = f.field(name); element.value = value; element.dispatchEvent(new f.win.Event('change', { bubbles: true })); });
  f.click(f.button('REST 接口')); f.input('数据源名称', '钢卷信息'); f.input('接口地址', 'http://10.0.0.8/query');
  select('请求方法', 'POST');
  assert.equal(f.field('请求用途').value, 'read');
  f.input('请求体 JSON', '{"planCoils":["001"],"__sys__":{"status":0},"__blocks__":{}}');
  f.win.perform(() => f.field('请求体 JSON').dispatchEvent(new f.win.FocusEvent('focusout', { bubbles: true })));
  f.input('响应路径', 'items'); select('浏览器 Cookie', 'include');
  f.click(f.button('添加请求头')); f.input('请求头名称 1', 'Content-Type'); f.input('请求头值 1', 'application/json;charset=UTF-8');
  f.click(f.button('添加请求头')); f.input('请求头名称 2', 'x-token'); f.input('请求头值 2', 'test-manager-secret');
  assert.equal(f.field('请求头值 2').type, 'password');
  assert.equal(calls.length, 0);
  f.click(f.button('测试并连接'));
  await f.until(() => f.document.querySelector('.data-source-success')?.textContent.includes('1 条'), 'POST query test reports one record');
  assert.equal(calls.length, 1); assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.headers['x-token'], 'test-manager-secret'); assert.equal(calls[0].init.headers['content-type'], 'application/json;charset=UTF-8');
  assert.deepEqual(JSON.parse(calls[0].init.body).planCoils, ['001']);
  f.click(f.button('保存数据源'));
  const source = f.win.current.dataSources.find(source => source.name === '钢卷信息');
  assert.equal(source.operation, 'read'); assert.deepEqual(Array.from(source.browserHeaders), ['x-token']);
  assert.equal(JSON.stringify(f.win.current).includes('test-manager-secret'), false);
  assert.equal(f.win.localStorage.length, 1, 'only the existing locale preference is stored');
  f.input('接口地址', 'http://10.0.0.9/query'); assert.equal(f.field('请求头值 2').value, '', 'changing the target clears the draft auth value');
});

test('REST editor keeps old POST sources as writes and blocks invalid body or browser-managed headers', async t => {
  const f = fixture(t, false);
  f.site.dataSources = [{ id: 'write', name: '旧提交', kind: 'rest', mode: 'single', method: 'POST', url: 'https://api.example.test/items', body: {} }];
  f.win.mount(f.site, 'sources');
  assert.equal(f.field('请求用途').value, 'write');
  f.click(f.button('测试并连接'));
  await f.until(() => f.document.querySelector('[role="alert"]')?.textContent.includes('提交用途'), 'legacy write is not executed as a test query');
  f.input('请求体 JSON', '{broken'); f.win.perform(() => f.field('请求体 JSON').dispatchEvent(new f.win.FocusEvent('focusout', { bubbles: true })));
  assert.equal(f.button('保存数据源').disabled, true); assert.equal(f.button('测试并连接').disabled, true);
  f.input('请求体 JSON', '{}'); f.win.perform(() => f.field('请求体 JSON').dispatchEvent(new f.win.FocusEvent('focusout', { bubbles: true })));
  f.click(f.button('添加请求头')); f.input('请求头名称 1', 'Cookie'); f.input('请求头值 1', 'test');
  assert.equal(f.button('保存数据源').disabled, true);
  assert.ok(f.document.querySelector('[role="alert"]').textContent.includes('浏览器管理'));
});

test('transport radio selection persists and routes tests through either browser or server', async t => {
  const f = fixture(t, false);
  f.site.dataSources = [{ id: 'coils', name: '钢卷', kind: 'rest', mode: 'collection', method: 'POST', operation: 'read', url: 'https://coils.example.test/query', responsePath: 'items', body: { planCoils: ['001'] }, headers: { Accept: 'application/json' } }];
  f.win.dataPageId = 'cloud-site';
  const fallback = f.win.fetch, calls = [];
  f.win.fetch = async (url, init = {}) => {
    if (url === '/api/account/data/query') { calls.push({ url, init }); return Response.json({ value: [{ coilNo: 'forwarded' }] }); }
    if (url === 'https://coils.example.test/query') { calls.push({ url, init }); return Response.json({ items: [{ coilNo: 'direct' }] }); }
    return fallback(url, init);
  };
  f.win.mount(f.site, 'sources');
  assert.equal(f.field('透传').checked, true);
  assert.equal(f.field('转发').checked, false);
  assert.ok(f.document.querySelector('[aria-label="浏览器 Cookie"]'));
  f.click(f.field('转发'));
  assert.equal(f.field('透传').checked, false);
  assert.equal(f.document.querySelector('[aria-label="浏览器 Cookie"]'), null);
  f.click(f.button('保存数据源'));
  assert.equal(f.win.current.dataSources[0].transport, 'proxy');
  f.click(f.button('测试并连接'));
  await f.until(() => calls.length === 1 && f.document.querySelector('.data-source-success')?.textContent.includes('连接成功'), 'forwarding test completes');
  assert.equal(calls[0].url, '/api/account/data/query');
  assert.deepEqual(JSON.parse(calls[0].init.body), { pageId: 'cloud-site', sourceId: 'coils', route: { id: 'example' }, state: {}, form: {} });
  f.click(f.field('透传')); f.click(f.button('保存数据源')); f.click(f.button('测试并连接'));
  await f.until(() => calls.length === 2 && f.document.querySelector('.data-source-success')?.textContent.includes('连接成功'), 'direct test completes');
  assert.equal(f.win.current.dataSources[0].transport, 'direct');
  assert.equal(calls[1].url, 'https://coils.example.test/query');
  assert.deepEqual(JSON.parse(calls[1].init.body), { planCoils: ['001'] });
  assert.equal(calls[1].init.headers.accept, 'application/json');
  const saved = JSON.parse(JSON.stringify(f.win.current));
  saved.dataSources[0].transport = undefined; saved.dataSources[0].credentialId = 'saved-credential';
  const restored = fixture(t, false); restored.win.mount(saved, 'sources');
  assert.equal(restored.field('转发').checked, true, 'legacy credential sources reflect their actual proxy route');
  restored.click(restored.field('透传')); restored.click(restored.button('保存数据源'));
  assert.equal(restored.win.current.dataSources[0].credentialId, undefined);
});

test('forwarding accepts authentication and Cookie rows and switching to direct explains browser restrictions', async t => {
  const f = fixture(t, false); f.win.dataPageId = 'saved-site';
  f.site.dataSources = [{ id: 'coils', name: '钢卷', kind: 'rest', mode: 'collection', method: 'POST', operation: 'read', url: 'https://coils.example/query', body: {}, transport: 'proxy' }];
  const fallback = f.win.fetch, calls = [];
  f.win.fetch = async (url, init = {}) => { if (url !== '/api/account/data/query') return fallback(url, init); calls.push(JSON.parse(init.body)); return Response.json({ value: [{ id: '001' }] }); };
  f.win.mount(f.site, 'sources');
  f.click(f.button('添加请求头')); f.input('请求头名称 1', 'x-token'); f.input('请求头值 1', 'ui-forward-secret');
  f.click(f.button('添加请求头')); f.input('请求头名称 2', 'Cookie'); f.input('请求头值 2', 'JSESSIONID=ui-fixture');
  assert.equal(f.button('保存数据源').disabled, false);
  assert.equal(f.document.querySelector('.data-source-error'), null);
  f.click(f.button('保存数据源')); f.click(f.button('测试并连接'));
  await f.until(() => f.document.querySelector('.data-source-success')?.textContent.includes('连接成功'), 'temporary headers are usable in forwarding');
  assert.deepEqual(calls[0].requestHeaders, { 'x-token': 'ui-forward-secret', Cookie: 'JSESSIONID=ui-fixture' });
  assert.equal(JSON.stringify(f.win.current).includes('ui-forward-secret'), false);
  f.click(f.field('透传'));
  assert.equal(f.button('保存数据源').disabled, true);
  assert.match(f.document.querySelector('.data-source-error').textContent, /浏览器管理/);
  assert.equal(f.field('请求头值 2').value, 'JSESSIONID=ui-fixture', 'switching transport never discards the draft value');
});
