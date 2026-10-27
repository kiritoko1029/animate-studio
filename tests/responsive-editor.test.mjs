import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { createResponsiveCandidate, pageAtDevice, updateDeviceFrame } from '../src/lib/responsive.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

const bundle = await build({ stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {AnimateUIProvider} from '@animate-ui/react/provider';import {ResponsiveSettings} from './src/components/ResponsiveSettings';import {FreeCanvas} from './src/components/FreeCanvas';import {SitePreview} from './src/components/SitePreview';import {initializeLocale} from './src/i18n';initializeLocale();const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.mountSettings=page=>{window.current=page;window.changes=[];window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><ResponsiveSettings document={page} device="mobile" onDeviceChange={device=>window.selectedDevice=device} onSettings={settings=>{window.current={...window.current,settings:{...window.current.settings,...settings}};const changes=[...window.changes,settings];window.mountSettings(window.current);window.changes=changes;}} notify={message=>window.notice=message}/></AnimateUIProvider></MotionConfig>));};window.mountCanvas=(page,base=page)=>{window.current=base;window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><FreeCanvas document={page} device="mobile" selected="heading" selectedIds={['heading']} onSelect={()=>{}} onFrameChange={(id,frame)=>{window.frameArgs=frame;window.frameResult=window.writeFrame(window.current,id,frame,'mobile');}} onFramesChange={()=>{}} onBlockChange={()=>{}} onCanvasSizeChange={()=>{}} onPageMarginChange={()=>{}} onPageSettings={()=>{}} onDelete={()=>{}} onDuplicate={()=>{}} onInspect={()=>{}} onCreateVariable={()=>{}} onAlign={()=>{}} onFillWidth={()=>{}} onLayerChange={()=>{}} isDragging={false}/></AnimateUIProvider></MotionConfig>));};window.mountPreview=site=>window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><SitePreview document={site}/></AnimateUIProvider></MotionConfig>));`, loader: 'jsx', resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent' });
const until = async (predicate, message) => { const end = Date.now() + 3000; while (!predicate()) { if (Date.now() > end) assert.fail(message); await new Promise(resolve => setTimeout(resolve, 10)); } };
function fixture(t) {
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on('error', (...args) => errors.push(args.join(' '))); virtualConsole.on('debug', (...args) => errors.push(args.join(' '))); virtualConsole.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://responsive.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const win = dom.window; win.localStorage.setItem('animate-studio:locale', 'zh-CN'); installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  Object.assign(win, { structuredClone, TextEncoder, TextDecoder, AbortSignal, AbortController });
  const observers = new Set(); win.containerWidth = 390;
  win.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe(element) { observers.add(this); this.element = element; } unobserve() { observers.delete(this); } disconnect() { observers.delete(this); } };
  win.HTMLElement.prototype.getBoundingClientRect = function () { return { width: win.containerWidth, height: 800, x: 0, y: 0, top: 0, left: 0, right: win.containerWidth, bottom: 800, toJSON: () => ({}) }; };
  win.setWidth = width => { win.containerWidth = width; win.perform(() => { for (const observer of observers) observer.callback([{ contentRect: { width } }]); }); };
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {}; win.HTMLElement.prototype.scrollTo = () => {}; win.scrollTo = () => {}; win.confirm = () => true;
  win.eval(bundle.outputFiles[0].text); t.after(() => { win.unmount?.(); win.close(); assert.deepEqual(errors, []); });
  const page = createDocument(true); page.settings.maxWidth = 1000; page.settings.padding = 24;
  page.blocks = [{ id: 'heading', type: 'heading', props: { title: '共用标题' }, frame: { x: 40, y: 40, width: 400, height: 200 } }, { id: 'body', type: 'text', props: { text: '共用正文' }, frame: { x: 40, y: 320, width: 900, height: 200 } }];
  const site = createSiteDocument(win.JSON.parse(JSON.stringify(createResponsiveCandidate(page))));
  const click = element => { assert.ok(element, win.document.body.textContent); win.perform(() => element.click()); };
  return { win, doc: win.document, page, site, click, errors, button: text => [...win.document.querySelectorAll('button')].find(item => item.textContent.trim() === text) };
}

test('responsive settings generate, reset and restore layouts through real controls', async t => {
  const f = fixture(t); f.win.mountSettings(f.win.JSON.parse(JSON.stringify(f.page)));
  f.click(f.button('启用自适应布局'));
  await until(() => f.win.current.settings.responsive?.mode === 'adaptive', `adaptive candidate enabled: ${f.doc.body.textContent} ${f.errors}`);
  assert.equal(f.win.current.settings.responsive.breakpoints.mobile.width, 390);
  f.click(f.button('重新生成当前断点'));
  assert.match(f.win.notice, /已重新生成/);
  f.click(f.button('恢复固定画布'));
  assert.equal(f.win.current.settings.responsive.mode, 'fixed');
  assert.deepEqual(JSON.parse(JSON.stringify(f.win.current.blocks)), f.page.blocks);
  assert.equal(f.win.changes.length, 3, 'only explicit layout actions write changes');
});

test('canvas keyboard edits update only the active breakpoint', async t => {
  const f = fixture(t), page = createResponsiveCandidate(f.page), original = structuredClone(page.blocks);
  f.win.writeFrame = updateDeviceFrame; f.win.mountCanvas(f.win.JSON.parse(JSON.stringify(pageAtDevice(page, 'mobile'))), f.win.JSON.parse(JSON.stringify(page)));
  const frame = f.doc.querySelector('.free-canvas-frame[data-block-id="heading"]'); frame.focus();
  const event = new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  f.win.perform(() => frame.dispatchEvent(event));
  assert.equal(f.win.frameResult !== undefined || event.defaultPrevented, true, JSON.stringify({ active: f.doc.activeElement?.outerHTML, errors: f.errors }));
  await until(() => f.win.frameResult, `frame change written: ${JSON.stringify({ active: f.doc.activeElement?.outerHTML, errors: f.errors })}`);
  assert.deepEqual(JSON.parse(JSON.stringify(f.win.frameResult.blocks)), original);
  assert.equal(f.win.frameResult.settings.responsive.breakpoints.mobile.frames.heading.y, pageAtDevice(page, 'mobile').blocks[0].frame.y + 1, JSON.stringify({ args: f.win.frameArgs, result: f.win.frameResult.settings.responsive.breakpoints.mobile.frames.heading }));
  assert.equal(f.win.frameResult.settings.responsive.breakpoints.tablet.frames.heading.x, pageAtDevice(page, 'tablet').blocks[0].frame.x);
});

test('renderer follows the observed container instead of the browser window width', async t => {
  const f = fixture(t); f.win.innerWidth = 1440; f.win.mountPreview(f.site);
  await until(() => f.doc.querySelector('[data-responsive-device="mobile"]'), `390px container selects mobile: ${f.doc.body.textContent} ${f.errors}`);
  assert.equal(f.doc.querySelector('.page-free-canvas').style.width, '390px');
  f.win.setWidth(768);
  await until(() => f.doc.querySelector('[data-responsive-device="tablet"]'), '768px container selects tablet');
  assert.equal(f.doc.querySelector('.page-free-canvas').style.width, '768px');
  f.win.setWidth(320);
  await until(() => f.doc.querySelector('[data-responsive-device="mobile"]'), '320px container remains usable');
  assert.equal(f.doc.querySelector('.page-free-canvas').style.width, '390px');
  assert.equal(f.doc.querySelectorAll('.page-free-frame').length, 2);
});
