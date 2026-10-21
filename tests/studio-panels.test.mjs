import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { defaultPanelWidths, fitPanelWidths, panelStorageKey, readPanelWidths } from '../src/lib/studio-panels.ts';

test('panel widths respect saved preferences, responsive bounds and the central workspace', () => {
  assert.deepEqual(fitPanelWidths({}, 1440, true), defaultPanelWidths(1440));
  for (const width of [801, 900, 1024, 1280, 1440, 1920]) {
    const fitted = fitPanelWidths({ left: 420, right: 480 }, width, true);
    assert.ok(fitted.left >= 180 && fitted.left <= 420);
    assert.ok(fitted.right >= 216 && fitted.right <= 480);
    assert.ok(width - fitted.left - fitted.right >= 360, String(width));
  }
  assert.deepEqual(fitPanelWidths({ left: 320, right: 350 }, 1440, true), { left: 320, right: 350 });
  assert.equal(fitPanelWidths({ left: 420, right: 480 }, 801, false).left, 420);
  assert.equal(fitPanelWidths({ left: 420 }, 700, true).left, 340, 'floating inspector does not consume a desktop column');
  for (const value of [null, 'bad json', 'null', '[]', '"text"']) assert.deepEqual(readPanelWidths(value), {});
  assert.deepEqual(readPanelWidths('{"left":-1,"right":9999}'), { left: 180, right: 480 });
  assert.deepEqual(readPanelWidths('{"left":"300","right":null}'), {});
});

test('resizers update continuously, persist on release, cancel safely and support keyboard reset', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://layout.test', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  t.after(() => { window.unmount?.(); window.close(); });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 1440 });
  let observer;
  window.ResizeObserver = class { constructor(callback) { this.callback = callback; observer = this; } observe() {} disconnect() { this.disconnected = true; } };
  const captures = new Set();
  window.HTMLElement.prototype.setPointerCapture = id => captures.add(id);
  window.HTMLElement.prototype.hasPointerCapture = id => captures.has(id);
  window.HTMLElement.prototype.releasePointerCapture = id => captures.delete(id);
  window.localStorage.setItem(panelStorageKey, '{"left":260,"right":300}');
  const bundle = await build({
    stdin: { contents: `
      import { act, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { ResizableStudioLayout } from './src/components/ResizableStudioLayout';
      function Fixture(){const [open,setOpen]=useState(true);window.setInspector=setOpen;return <ResizableStudioLayout inspectorOpen={open}><aside/><main/>{open&&<aside/>}</ResizableStudioLayout>;}
      const root=createRoot(document.getElementById('root'));
      window.IS_REACT_ACT_ENVIRONMENT=true;
      window.perform=action=>act(()=>flushSync(action));
      window.unmount=()=>act(()=>flushSync(()=>root.unmount()));
      window.perform(()=>root.render(<Fixture/>));
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  window.eval(bundle.outputFiles[0].text);
  const doc = window.document, left = doc.querySelector('[aria-label="调整组件库宽度"]'), right = doc.querySelector('[aria-label="调整属性面板宽度"]');
  const value = node => Number(node.getAttribute('aria-valuenow'));
  const saved = () => JSON.parse(window.localStorage.getItem(panelStorageKey));
  const pointer = (node, type, x) => window.perform(() => {
    const event = new window.MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 1 }); node.dispatchEvent(event);
  });
  const key = (node, key, extra = {}) => window.perform(() => node.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })));
  assert.deepEqual([value(left), value(right)], [260, 300]);
  pointer(left, 'pointerdown', 260); pointer(left, 'pointermove', 340);
  assert.equal(value(left), 340);
  assert.equal(saved().left, 260, 'do not write storage every pointer frame');
  assert.ok(doc.querySelector('.studio-resize-shield'), 'iframe content cannot swallow resizing');
  pointer(left, 'pointerup', 340);
  assert.equal(saved().left, 340);
  assert.equal(captures.size, 0);
  pointer(right, 'pointerdown', 1140); pointer(right, 'pointermove', 1080);
  assert.equal(value(right), 360, 'leftwards movement widens the right panel');
  key(right, 'Escape');
  assert.equal(value(right), 300);
  assert.equal(saved().right, 300);
  pointer(left, 'pointerdown', 340); pointer(left, 'pointermove', 400); pointer(left, 'pointercancel', 400);
  assert.equal(value(left), 340);
  pointer(left, 'pointerdown', 340); pointer(left, 'pointermove', 380);
  window.perform(() => window.dispatchEvent(new window.Event('blur')));
  assert.equal(value(left), 340);
  key(left, 'ArrowRight', { shiftKey: true }); assert.equal(value(left), 380);
  key(right, 'ArrowLeft'); assert.equal(value(right), 308);
  window.perform(() => left.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })));
  assert.equal(value(left), 230);
  key(right, 'Enter'); assert.equal(value(right), 244);
  window.perform(() => observer.callback([{ contentRect: { width: 700 } }]));
  assert.equal(doc.querySelectorAll('[role="separator"]').length, 1);
  window.perform(() => observer.callback([{ contentRect: { width: 500 } }]));
  assert.equal(doc.querySelectorAll('[role="separator"]').length, 0);
  window.unmount(); assert.ok(observer.disconnected);
});
