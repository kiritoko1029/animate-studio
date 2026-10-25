import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createBlock, createDocument } from '../src/model.ts';
import { generateNativeCode } from '../src/lib/code-export/native.ts';
import { createCustomBlock } from '../src/lib/custom-components/instances.ts';
import { componentTemplates } from '../src/lib/custom-components/templates.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

// Both entry points use the real renderer. The export test executes the public
// runtime mount through the same HTML generator used by downloads.
const compiled = await build({
  stdin: { contents: `
    export { mount } from './src/export-runtime';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { MotionConfig } from 'motion/react';
    import { PageRenderer } from './src/components/PageRenderer';
    export function renderPages(element, pages) {
      const root = createRoot(element);
      flushSync(() => root.render(<MotionConfig reducedMotion="always">{pages.map((page, i) => <section key={i} data-copy={i}><PageRenderer document={page}/></section>)}</MotionConfig>));
      return () => flushSync(() => root.unmount());
    }
    export const perform = action => flushSync(action);
  `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', globalName: 'AnimateStudioNative', jsx: 'automatic',
  loader: { '.css': 'empty' }, external: ['shiki'], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
});
const runtime = { code: compiled.outputFiles[0].text, css: '' };

function anchorPage({ actions = false, collision = false, custom = false } = {}) {
  const page = createDocument(true);
  const block = (type, id, y, props = {}) => ({ ...createBlock(type), id, props: { ...createBlock(type).props, animation: 'none', ...props }, frame: { x: 32, y, width: 500, height: 180 } });
  page.blocks = [
    block('navbar', 'navigation', 32, { items: '价格|#pricing,功能|#features,顶部|#' }),
    block('card', 'feature-card', 240),
    block('pricing', 'pricing', 450),
  ];
  if (actions) page.blocks.push({ ...block('text', 'jump', 660, { text: '跳转价格' }), events: { click: [{ type: 'navigate', expression: '"#pricing"' }] } });
  if (collision) page.blocks.push(block('text', 'features', 660, { text: 'ID 比旧别名优先' }));
  if (custom) page.blocks.push({ ...createCustomBlock(componentTemplates[0].definition), id: 'custom-link', frame: { x: 550, y: 32, width: 400, height: 180 } });
  return page;
}

function browser(t, html = '<div id="root"></div>') {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const scrolls = [];
  const dom = new JSDOM(html, { url: 'https://anchors.test/page', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole, beforeParse(window) {
    installMatchMedia(window, { reducedMotion: true });
    installWebAnimations(window);
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.HTMLElement.prototype.scrollIntoView = function () { scrolls.push(this); };
    window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000 });
  } });
  t.after(() => {
    dom.window.unmount?.();
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
    assert.deepEqual(errors, [], 'no browser runtime errors');
  });
  return { window: dom.window, document: dom.window.document, scrolls };
}

function render(t, pages) {
  const fixture = browser(t), { window, document } = fixture;
  window.eval(runtime.code);
  window.unmount = window.AnimateStudioNative.renderPages(document.getElementById('root'), window.JSON.parse(JSON.stringify(pages)));
  return { ...fixture, click: node => window.AnimateStudioNative.perform(() => node.click()) };
}

async function until(predicate, description) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) assert.fail(description); await new Promise(resolve => setTimeout(resolve, 10)); }
}

test('real page navigation reaches generated block IDs while retaining template aliases and page-top links', t => {
  const { document, click, scrolls } = render(t, [anchorPage()]);
  const surface = document.querySelector('.page-surface');
  click(surface.querySelector('a[href="#pricing"]'));
  assert.equal(scrolls.at(-1), surface.querySelector('[data-block-id="pricing"]'));
  click(surface.querySelector('a[href="#features"]'));
  assert.equal(scrolls.at(-1), surface.querySelector('.page-feature-card'));
  click(surface.querySelector('.page-nav-links a[href="#"]'));
  assert.equal(scrolls.at(-1), surface);
});

test('navigate actions and normal links stay inside their own page surface when IDs repeat', async t => {
  const page = anchorPage({ actions: true });
  const { document, click, scrolls } = render(t, [page, structuredClone(page)]);
  const surfaces = [...document.querySelectorAll('.page-surface')];
  assert.equal(surfaces.length, 2);
  for (const surface of surfaces) {
    const target = surface.querySelector('[data-block-id="pricing"]');
    click(surface.querySelector('a[href="#pricing"]'));
    assert.equal(scrolls.at(-1), target);
    const before = scrolls.length;
    click(surface.querySelector('[data-block-id="jump"] p'));
    await until(() => scrolls.length > before, 'the runtime navigate action scrolls');
    assert.equal(scrolls.at(-1), target);
  }
});

test('a stable block ID takes precedence over an earlier template alias', t => {
  const { document, click, scrolls } = render(t, [anchorPage({ collision: true })]);
  click(document.querySelector('a[href="#features"]'));
  assert.equal(scrolls.at(-1), document.querySelector('[data-block-id="features"]'));
  assert.notEqual(scrolls.at(-1), document.querySelector('.page-feature-card'));
});

test('custom component link messages resolve block IDs within their containing page', t => {
  const page = anchorPage({ custom: true });
  const { window, document, scrolls } = render(t, [page, structuredClone(page)]);
  const surfaces = [...document.querySelectorAll('.page-surface')];
  for (const surface of surfaces) {
    const frame = surface.querySelector('iframe');
    const channel = /"channel":"([^"]+)"/.exec(frame.getAttribute('srcdoc'))[1];
    window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow,
      data: window.JSON.parse(JSON.stringify({ source: 'animate-studio-component', channel, type: 'open-link', href: '#pricing' })) }));
    assert.equal(scrolls.at(-1), surface.querySelector('[data-block-id="pricing"]'));
  }
});

test('downloaded native HTML executes block anchors and runtime navigate actions', async t => {
  const page = anchorPage({ actions: true, collision: true });
  const { window, document, scrolls } = browser(t, generateNativeCode(page, 'html', runtime).content);
  await until(() => document.querySelector('[data-block-id="jump"] p'), 'native export renders through its real entry point');
  const surface = document.querySelector('.page-surface');
  surface.querySelector('a[href="#features"]').click();
  assert.equal(scrolls.at(-1), surface.querySelector('[data-block-id="features"]'));
  const before = scrolls.length;
  surface.querySelector('[data-block-id="jump"] p').click();
  await until(() => scrolls.length > before, 'exported navigate action reaches its target');
  assert.equal(scrolls.at(-1), surface.querySelector('[data-block-id="pricing"]'));
  assert.ok(window.AnimateStudioNative.mount, 'download executes the public native mount');
});
