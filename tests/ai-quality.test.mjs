import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { createBlock, createDocument } from '../src/model.ts';
import { inspectAiPage } from '../src/lib/ai/quality.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

function block(id, type = 'heading', props = {}, frame = { x: 24, y: 24, width: 200, height: 120 }) {
  return { ...createBlock(type), id, props: { ...createBlock(type).props, ...props }, frame };
}
function page(...blocks) { return { ...createDocument(true), blocks }; }
function rendered(t, contents = '<p>Visible text</p>') {
  const dom = new JSDOM(`<div class="page-surface" style="background: #fff"><div data-block-id="main"><div class="page-block" style="color: #000; font-size: 16px; font-weight: 400">${contents}</div></div></div>`);
  t.after(() => dom.window.close());
  const win = dom.window, doc = win.document, surface = doc.querySelector('.page-surface'), content = doc.querySelector('.page-block');
  win.Element.prototype.getClientRects = () => [{ width: 200, height: 120, x: 0, y: 0 }];
  const dimensions = { clientWidth: 200, clientHeight: 120, scrollWidth: 200, scrollHeight: 120 };
  for (const key of Object.keys(dimensions)) Object.defineProperty(content, key, { configurable: true, get: () => dimensions[key] });
  return { win, doc, surface, content, dimensions };
}

test('structure checks canvas bounds and overlap while allowing a lower textless animated background', () => {
  const background = block('background', 'gradientBackground', { title: '', text: '' }, { x: 0, y: 0, width: 800, height: 600 });
  const a = block('a'), b = block('b', 'heading', {}, { x: 150, y: 60, width: 200, height: 120 });
  const clipped = block('clipped', 'text', {}, { x: 1900, y: 24, width: 100, height: 80 });
  const result = inspectAiPage(page(background, a, b, clipped));
  assert.equal(result.measured, false);
  assert.deepEqual(result.issues.filter(issue => issue.kind === 'overlap'), [{ kind: 'overlap', blockIds: ['a', 'b'] }]);
  assert.deepEqual(result.issues.filter(issue => issue.kind === 'bounds'), [{ kind: 'bounds', blockIds: ['clipped'] }]);
  assert.ok(inspectAiPage(page({ ...background, props: { ...background.props, title: 'A heading' } }, a)).issues.some(issue => issue.kind === 'overlap'));
  assert.ok(!inspectAiPage(page(a, { ...b, frame: { ...b.frame, x: 224, y: 24 } })).issues.some(issue => issue.kind === 'overlap'), 'touching edges are not overlap');
});

test('link checks understand stable block IDs, original aliases, nav defaults and breadcrumb current items', () => {
  const p = page(
    block('nav', 'navbar', { items: 'Pricing|#pricing,Missing|#missing,Top|#' }),
    block('pricing', 'pricing', { url: '#features' }), block('feature-card', 'card', { url: '#' }),
    block('crumbs', 'breadcrumb', { items: 'Bad parent|#parent\nCurrent page|#not-a-link' }),
  );
  assert.deepEqual(inspectAiPage(p).issues.filter(issue => issue.kind === 'link'), [
    { kind: 'link', blockIds: ['nav'], detail: '#missing' }, { kind: 'link', blockIds: ['crumbs'], detail: '#parent' },
  ]);
  assert.deepEqual(inspectAiPage(page(block('nav', 'navbar', { items: 'Features' }))).issues.filter(issue => issue.kind === 'link'), [{ kind: 'link', blockIds: ['nav'], detail: '#features' }]);
});

test('rendered checks use actual scroll dimensions and inspect links emitted by extended components', t => {
  const f = rendered(t, '<a href="#missing">Missing target</a>');
  f.dimensions.scrollHeight = 160;
  const p = page(block('main'));
  assert.deepEqual(inspectAiPage(p, f.surface).issues.map(issue => issue.kind), ['overflow', 'link']);
  assert.equal(inspectAiPage(p, f.surface).measured, true);
  f.dimensions.scrollHeight = 120; f.dimensions.scrollWidth = 220;
  assert.ok(inspectAiPage(p, f.surface).issues.some(issue => issue.kind === 'overflow'));
  f.dimensions.clientWidth = 0;
  assert.equal(inspectAiPage(p, f.surface).measured, false, 'layoutless or hidden content cannot imply a clean visual result');
});

test('contrast checks visible text against composited solid ancestors with a large-text threshold', t => {
  const f = rendered(t, '<p style="color:#888;font-size:16px">Readable size test</p>'), p = page(block('main'));
  assert.ok(inspectAiPage(p, f.surface).issues.some(issue => issue.kind === 'contrast'));
  const text = f.doc.querySelector('p');
  text.style.fontSize = '24px';
  assert.ok(!inspectAiPage(p, f.surface).issues.some(issue => issue.kind === 'contrast'), 'large text may use a 3:1 threshold');
  text.style.fontSize = '19px'; text.style.fontWeight = '700';
  assert.ok(!inspectAiPage(p, f.surface).issues.some(issue => issue.kind === 'contrast'));
  text.style.fontSize = '16px'; text.style.color = '#fff'; text.style.backgroundColor = 'rgba(0,0,0,0.2)';
  const contrast = inspectAiPage(p, f.surface).issues.find(issue => issue.kind === 'contrast');
  assert.equal(contrast.detail, '1.6:1 / 4.5:1', 'a translucent background is composited over the white canvas');
});

test('unknown gradients, hidden text and uncertain lower layers are skipped instead of guessed', t => {
  const f = rendered(t, '<p style="color:#fff;background-image:linear-gradient(black,white)">Unknown backdrop</p><span aria-hidden="true" style="color:#fff">Decorative</span>');
  const p = page(block('main'));
  assert.ok(!inspectAiPage(p, f.surface).issues.some(issue => issue.kind === 'contrast'));
  f.doc.querySelector('p').style.backgroundImage = 'none';
  const under = block('under', 'gradientBackground', { title: '', text: '' });
  assert.ok(!inspectAiPage(page(under, p.blocks[0]), f.surface).issues.some(issue => issue.kind === 'contrast'), 'a transparent text frame over another painted frame has an unknown backdrop');
  f.content.style.backgroundColor = '#fff';
  assert.ok(inspectAiPage(page(under, p.blocks[0]), f.surface).issues.some(issue => issue.kind === 'contrast'), 'an opaque local surface makes the actual text background known');
});

test('quality report resamples after layout and fonts, locates issues, and releases observers on unmount', async t => {
  const bundle = await build({
    stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {AiQualityReport} from './src/components/ai/AiQualityReport';const root=createRoot(document.getElementById('report'));window.mount=page=>flushSync(()=>root.render(<AiQualityReport page={page} getSurface={()=>document.querySelector('.page-surface')} onReveal={id=>window.revealed=id}/>));window.unmount=()=>flushSync(()=>root.unmount());`, loader: 'jsx', resolveDir: process.cwd() },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  const dom = new JSDOM('<div id="report"></div><div class="page-surface" style="background:white"><div data-block-id="main"><div class="page-block" style="color:black;font-size:16px">Text</div></div></div>', { runScripts: 'dangerously', pretendToBeVisual: true });
  const win = dom.window; t.after(() => { win.unmount?.(); win.close(); });
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  win.Element.prototype.getClientRects = () => [{ width: 200, height: 120 }];
  const content = win.document.querySelector('.page-block');
  let scrollHeight = 120;
  for (const [key, value] of Object.entries({ clientWidth: 200, clientHeight: 120, scrollWidth: 200 })) Object.defineProperty(content, key, { get: () => value });
  Object.defineProperty(content, 'scrollHeight', { get: () => scrollHeight });
  const callbacks = [], observers = [];
  win.ResizeObserver = class { constructor(callback) { callbacks.push(callback); observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  let ready;
  win.document.fonts = { ready: new Promise(resolve => { ready = resolve; }) };
  win.eval(bundle.outputFiles[0].text); win.mount(page(block('main')));
  const settle = () => new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
  const until = async (predicate, message) => {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
      if (Date.now() > deadline) assert.fail(`${message}: ${win.document.querySelector('[data-ai-quality]')?.textContent}`);
      await new Promise(resolve => win.requestAnimationFrame(resolve));
    }
  };
  await until(() => win.document.querySelector('[data-ai-quality]')?.textContent.includes('当前未发现'), 'initial report settles');
  scrollHeight = 180; callbacks[0]();
  await until(() => win.document.querySelector('[data-ai-quality]')?.textContent.includes('内容可能溢出'), 'overflow report settles');
  win.document.querySelector('[data-ai-quality] button').click(); assert.equal(win.revealed, 'main');
  scrollHeight = 120; ready();
  await until(() => win.document.querySelector('[data-ai-quality]')?.textContent.includes('当前未发现'), 'font readiness report settles');
  win.unmount();
  assert.ok(observers.every(observer => observer.disconnected));
  callbacks[0](); await settle(); assert.equal(win.document.querySelector('[data-ai-quality]'), null, 'late layout notifications cannot recreate an unmounted report');
});
