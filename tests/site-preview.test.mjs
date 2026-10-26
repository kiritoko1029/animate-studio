import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createBlock, createDocument } from '../src/model.ts';
import { createSiteDocument, createSitePage, createLayoutDocument } from '../shared/site-document.mjs';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

const bundle = await build({ stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {SitePreview} from './src/components/SitePreview';window.mount=(site,mode,basePath)=>{const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<MotionConfig reducedMotion="always"><SitePreview document={site} mode={mode} basePath={basePath} toolbar/></MotionConfig>));};`, loader: 'jsx', resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent' });
const until = async (predicate, message) => { const end = Date.now() + 4000; while (!predicate()) { if (Date.now() > end) assert.fail(message); await new Promise(resolve => setTimeout(resolve, 10)); } };
function siteFixture() {
  const site = createSiteDocument(createDocument(true));
  const go = createBlock('button'); Object.assign(go, { id: 'go', props: { ...go.props, label: '查看详情', url: '/products/42' }, frame: { x: 40, y: 40, width: 240, height: 100 } });
  const missing = createBlock('button'); Object.assign(missing, { id: 'missing', props: { ...missing.props, label: '失效链接', url: '/missing' }, frame: { x: 300, y: 40, width: 240, height: 100 } });
  const external = createBlock('button'); Object.assign(external, { id: 'external', props: { ...external.props, label: '外部网站', url: 'https://example.com' }, frame: { x: 560, y: 40, width: 240, height: 100 } });
  site.pages[0].page.blocks = [go, missing, external];
  const list = createSitePage(site, '产品列表'); list.path = '/products';
  const detail = createSitePage(site, '产品详情', 'detail'); detail.path = '/products/:id';
  const text = createBlock('text'); Object.assign(text, { id: 'route-text', frame: { x: 40, y: 40, width: 600, height: 160 }, bindings: { text: { kind: 'expression', value: 'route.id' } } });
  detail.page.blocks = [text]; site.pages.push(list, detail);
  site.sharedLayout.header = createLayoutDocument('header', site.pages[0].page.settings);
  site.sharedLayout.header.blocks = [{ ...createBlock('navbar'), id: 'shared-nav', props: { ...createBlock('navbar').props, items: '首页|/,产品|/products' }, frame: { x: 0, y: 0, width: 1920, height: 85 } }];
  for (const entry of site.pages) entry.layout = ['header'];
  return { site, detail };
}
function fixture(t, mode, path) {
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM('<div id="root"></div>', { url: `https://studio.test${path}`, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const win = dom.window; Object.assign(win, { structuredClone, TextEncoder, TextDecoder, AbortSignal, AbortController });
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {}; win.HTMLElement.prototype.scrollTo = () => {}; win.scrollTo = () => {};
  const opened = []; win.open = (...args) => opened.push(args);
  win.eval(bundle.outputFiles[0].text);
  const { site, detail } = siteFixture();
  win.mount(structuredClone(site), mode, mode === 'share' ? '/p/token' : '');
  const click = element => { assert.ok(element, 'expected interactive element'); win.perform(() => element.click()); };
  t.after(() => { win.unmount?.(); win.close(); assert.deepEqual(errors, []); });
  return { win, doc: win.document, site, detail, click, opened };
}

test('shared site navigation resolves dynamic parameters, history, missing links and external links', async t => {
  const f = fixture(t, 'share', '/p/token');
  await until(() => f.doc.querySelector('[data-block-id="go"] button'), 'home renders');
  assert.ok(f.doc.querySelector('a[href="/p/token/products"]'), 'shared layout uses the token base path');
  assert.equal(f.doc.querySelector('.page-nav-links a[aria-current="page"]').textContent, '首页');
  f.click(f.doc.querySelector('[data-block-id="go"] button'));
  await until(() => f.doc.querySelector('.site-preview')?.dataset.sitePage === f.detail.id, 'detail route renders');
  await until(() => f.doc.querySelector('[data-block-id="route-text"]')?.textContent === '42', 'route parameter binds into page content');
  assert.equal(f.win.location.pathname, '/p/token/products/42');
  assert.equal(f.doc.querySelector('.page-nav-links a[aria-current="page"]').textContent, '产品');
  f.click(f.doc.querySelector('[aria-label="返回上一页"]'));
  await until(() => f.doc.querySelector('.site-preview')?.dataset.sitePage === f.site.homePageId, 'browser back returns home');
  f.click(f.doc.querySelector('[data-block-id="missing"] button'));
  await until(() => f.doc.querySelector('.site-not-found'), 'unknown path gets a useful 404');
  f.click(f.doc.querySelector('.site-not-found button'));
  await until(() => f.doc.querySelector('[data-block-id="external"] button'), 'return from 404');
  f.click(f.doc.querySelector('[data-block-id="external"] button'));
  assert.deepEqual(f.opened, [['https://example.com', '_blank', 'noopener,noreferrer']], 'external links retain existing behavior');
});

test('exported single-file site preserves dynamic route after reload', async t => {
  const f = fixture(t, 'export', '/exported.html');
  await until(() => f.doc.querySelector('[data-block-id="go"] button'), 'export home renders');
  f.click(f.doc.querySelector('[data-block-id="go"] button'));
  await until(() => f.doc.querySelector('[data-block-id="route-text"]')?.textContent === '42', 'export detail renders');
  assert.equal(f.win.location.hash, '#/products/42');
  f.win.unmount(); f.win.mount(structuredClone(f.site), 'export', '');
  await until(() => f.doc.querySelector('[data-block-id="route-text"]')?.textContent === '42', 'hash route survives a runtime reload');
});
