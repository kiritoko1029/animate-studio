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
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {AnimateUIProvider} from '@animate-ui/react/provider';import {MediaContext} from './src/lib/media/context';import {PageAssets,usePageImage} from './src/components/PageAssets';window.assetProbe=()=>{const url=usePageImage(window.assetValue);return <span id="asset-check">{url}</span>};window.renderAssetMap=reference=>window.perform(()=>root.render(<PageAssets.Provider value={{[reference]:'data:image/png;base64,abc'}}><window.assetProbe/></PageAssets.Provider>));import {MediaLibraryDialog} from './src/components/MediaLibraryDialog';import {initializeLocale} from './src/i18n';initializeLocale();const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.render=value=>window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><MediaContext.Provider value={value}><MediaLibraryDialog onClose={window.closed} onSelect={window.selected}/></MediaContext.Provider></AnimateUIProvider></MotionConfig>));`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent',
  plugins: [{ name: 'raw', setup(build) { build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' })); build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) })); } }],
});
function fixture(t, overrides = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://media.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const win = dom.window;
  win.localStorage.setItem('animate-studio:locale', 'zh-CN');
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  Object.assign(win, { Headers, Request, Response, AbortSignal, AbortController, structuredClone, TextEncoder, TextDecoder });
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {}; win.HTMLElement.prototype.scrollTo = () => {};
  const usedId = crypto.randomUUID(), otherId = crypto.randomUUID();
  const page = createDocument(true); page.blocks = [{ id: 'image', type: 'image', props: { imageUrl: `asset:${usedId}` }, frame: { x: 0, y: 0, width: 400, height: 320 } }];
  const site = createSiteDocument(page);
  const assets = [usedId, otherId].map((id, index) => ({ id, name: index ? '图标.png' : '校园.png', mime: 'image/png', size: 2048, createdAt: new Date().toISOString() }));
  const calls = { refresh: 0, upload: 0, remove: [], migrate: [], selected: [], closed: 0 };
  const context = {
    kind: 'guest', document: site, cloudPageId: 'cloud-site', assets, loading: false, error: '', migrationPending: 0,
    resolve: async id => `blob:${id}`,
    refresh: async () => { calls.refresh++; return assets; },
    upload: async file => { calls.upload++; return { id: crypto.randomUUID(), name: file.name, mime: 'image/png', size: file.size, createdAt: new Date().toISOString() }; },
    remove: async id => { calls.remove.push(id); return { retained: true }; },
    migrate: async id => { calls.migrate.push(id); return { uploaded: 1, failed: 0 }; },
    ...overrides,
  };
  win.calls = calls; win.selected = value => calls.selected.push(value); win.closed = () => calls.closed++;
  win.eval(bundle.outputFiles[0].text);
  t.after(() => { win.unmount?.(); win.close(); assert.deepEqual(errors, []); });
  const click = element => { assert.ok(element, 'expected control'); win.perform(() => element.click()); };
  const until = async (predicate, description) => { const end = Date.now() + 4000; while (!predicate()) { if (Date.now() > end) assert.fail(description); await new Promise(resolve => setTimeout(resolve, 10)); } };
  const button = text => [...win.document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  return { win, document: win.document, calls, assets, usedId, otherId, click, until, button, context };
}

test('media library selects images, filters by name and blocks referenced removal', async t => {
  const f = fixture(t);
  f.win.render(f.context);
  await f.until(() => f.document.querySelector('.media-card'), 'library ready');
  f.click(f.button('使用图片'));
  assert.deepEqual(f.calls.selected, [`asset:${f.usedId}`]);
  f.click(f.document.querySelector(`[aria-label="移除图片 ${f.assets[0].name}"]`));
  await f.until(() => f.document.querySelector('[role="alert"]')?.textContent.includes('当前草稿仍使用'), 'referenced asset cannot be removed');
  assert.deepEqual(f.calls.remove, []);
  f.click(f.document.querySelector(`[aria-label="移除图片 ${f.assets[1].name}"]`));
  await f.until(() => f.document.querySelector('.media-delete-confirm'), 'removal confirmation visible');
  f.click(f.button('确认移除'));
  await f.until(() => f.document.querySelector('.media-message')?.textContent.includes('历史回滚'), 'retention reason visible');
  assert.deepEqual(f.calls.remove, [f.otherId]);
  const search = f.document.querySelector('[aria-label="搜索图片"]');
  Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(search, '不存在');
  f.win.perform(() => search.dispatchEvent(new f.win.Event('input', { bubbles: true })));
  await f.until(() => f.document.body.textContent.includes('没有找到匹配的图片'), 'search filters library');
  assert.equal(f.calls.refresh >= 1, true);
});

test('upload errors, migration retries and completed uploads retain useful state', async t => {
  const f = fixture(t, { migrationPending: 1, upload: async file => { f.calls.upload++; if (file.name === 'bad.png') throw new f.win.Error('存储空间不足'); return { id: crypto.randomUUID(), name: file.name, mime: 'image/png', size: file.size, createdAt: new Date().toISOString() }; } });
  f.win.render(f.context);
  await f.until(() => f.document.querySelector('.media-migration'), 'migration warning ready');
  f.click(f.button('重试迁移'));
  await f.until(() => f.document.querySelector('.media-message')?.textContent.includes('迁移已完成'), 'migration success');
  assert.deepEqual(f.calls.migrate, ['cloud-site']);
  const input = f.document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [new f.win.File(['bad'], 'bad.png', { type: 'image/png' })] });
  Object.defineProperty(input, 'value', { configurable: true, get: () => 'C:\\fakepath\\bad.png', set: () => {} });
  f.win.perform(() => input.dispatchEvent(new f.win.Event('change', { bubbles: true })));
  await f.until(() => f.document.querySelector('[role="alert"]')?.textContent.includes('存储空间不足'), 'upload failure visible');
  assert.equal(f.document.querySelector('.media-card') !== null, true, 'existing library remains after failure');
  Object.defineProperty(input, 'files', { configurable: true, value: [new f.win.File(['ok'], 'good.png', { type: 'image/png' })] });
  Object.defineProperty(input, 'value', { configurable: true, get: () => 'C:\\fakepath\\good.png', set: () => {} });
  f.win.perform(() => input.dispatchEvent(new f.win.Event('change', { bubbles: true })));
  await f.until(() => f.document.querySelector('.media-message')?.textContent.includes('已上传 1 张图片'), 'successful upload visible');
  assert.equal(f.calls.upload, 2);
});

test('embedded asset maps take precedence over the editor media resolver', async t => {
  const f = fixture(t), reference = `asset:${f.usedId}`;
  f.win.assetValue = reference;
  f.win.renderAssetMap(reference);
  await f.until(() => f.document.querySelector('#asset-check')?.textContent === 'data:image/png;base64,abc', 'embedded map is used without editor storage');
});
