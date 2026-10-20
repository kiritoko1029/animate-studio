import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

test('preview sizing stays within its viewport and notices close and reset across documents', async t => {
  const errors = [];
  const console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.join(' ')));
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://preview.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console });
  const { window } = dom;
  t.after(() => { window.unmount?.(); dom.window.close(); });
  const observers = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(element) { this.element = element; }
    disconnect() { this.disconnected = true; }
  };
  // Portal positioning, focus trapping and keyboard dismissal are also checked in the browser.
  const bundle = await build({
    stdin: { contents: `
      import { StrictMode } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { InteractivePreview } from './src/components/InteractivePreview';
      import { createInteractionDemo } from './src/lib/interactions/demo';
      const app = createRoot(document.getElementById('root'));
      window.perform = action => flushSync(action);
      window.renderPage = () => {
        const page = createInteractionDemo();
        page.settings = { ...page.settings, maxWidth: 1330, canvasHeight: 1502 };
        flushSync(() => app.render(<StrictMode><InteractivePreview document={page} /></StrictMode>));
      };
      window.unmount = () => flushSync(() => app.unmount());
      window.renderPage();
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
    plugins: [{ name: 'raw-resources', setup(build) {
      build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' }));
      build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) }));
    } }],
  });
  window.eval(bundle.outputFiles[0].text);
  const iframe = window.document.querySelector('iframe');
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  const source = iframe.srcdoc;
  const resize = (viewportWidth, fractionalWidth) => {
    Object.defineProperty(iframe, 'clientWidth', { configurable: true, value: viewportWidth });
    window.perform(() => observers.filter(observer => !observer.disconnected).forEach(observer => {
      observer.callback([{ target: observer.element, contentRect: { width: fractionalWidth } }]);
    }));
  };
  // Regression: 621.52 CSS px becomes a 622 px iframe viewport. A 702 px height
  // made the inner scrollbar appear/disappear as the canvas alternated widths.
  resize(622, 621.5234375);
  assert.equal(iframe.style.height, '703px', 'reserve enough height for the rounded iframe viewport');
  // Chromium can ceil its nested viewport even when clientWidth rounds down.
  resize(621, 621.25);
  assert.equal(iframe.style.height, '703px', 'a fractional width below .5 still needs room for the wider iframe viewport');
  resize(300, 299.6);
  assert.equal(iframe.style.height, '339px', 'shrink proportionally when the panel narrows');
  resize(1600, 1599.7);
  assert.equal(iframe.style.height, '1502px', 'do not enlarge the canvas beyond its design size');
  assert.equal(iframe.srcdoc, source, 'resizing preserves the running preview and its data');
  const token = () => JSON.parse(iframe.srcdoc.match(/type: 'as-notify', token: ("[^"]+")/)[1]);
  const send = (source, id, message) => window.perform(() => window.dispatchEvent(new window.MessageEvent('message', { source, data: { type: 'as-notify', token: id, message } })));
  const dialog = () => window.document.querySelector('[role=alertdialog]');
  send(window, token(), '伪造来源');
  send(iframe.contentWindow, 'wrong-token', '过期消息');
  assert.equal(!!dialog(), false);
  send(iframe.contentWindow, token(), '提交成功！<img src=x>');
  assert.equal(dialog().getAttribute('data-state'), 'open');
  assert.equal(dialog().parentNode, window.document.body, 'notice belongs to the visible host viewport, not the tall iframe');
  assert.equal(dialog().querySelector('img'), null, 'notification text stays literal');
  assert.match(dialog().textContent, /提交成功！<img src=x>/);
  let hostEscapes = 0;
  window.addEventListener('keydown', () => hostEscapes++);
  window.perform(() => dialog().querySelector('button').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(hostEscapes, 0, 'dismissing a notice must not close the outer full preview');
  assert.equal(!!dialog(), false);
  send(iframe.contentWindow, token(), '');
  assert.equal(dialog().getAttribute('data-state'), 'open', 'an empty message can still be dismissed');
  window.perform(() => dialog().querySelector('button').click());
  assert.equal(!!dialog(), false, 'confirm button dismisses the notice');
  send(iframe.contentWindow, token(), 'document reset');
  const oldToken = token();
  window.renderPage();
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  assert.equal(!!dialog(), false, 'new document clears the previous notice');
  send(iframe.contentWindow, oldToken, 'stale');
  assert.equal(!!dialog(), false);
  assert.deepEqual(errors, []);
});
