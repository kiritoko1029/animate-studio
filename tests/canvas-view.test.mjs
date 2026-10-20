import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { fitCanvasView, zoomCanvasAt, wheelPixels } from '../src/lib/canvas-view.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);

test('fit includes both dimensions and cursor zoom preserves the pointed design coordinate at every limit', () => {
  const fitted = fitCanvasView({ width: 640, height: 480 }, { width: 1000, height: 1400 });
  assert.ok(fitted.x >= 32 && fitted.y >= 40);
  assert.ok(fitted.x + 1000 * fitted.scale <= 608);
  assert.ok(fitted.y + 1400 * fitted.scale <= 440);
  for (const initial of [fitted, { x: -1350, y: 230, scale: 2.5, mode: 'manual' }]) {
    for (const target of [.001, .4, 1, 4, 100]) {
      const point = { x: 313, y: 217 };
      const next = zoomCanvasAt(initial, target, point);
      close((point.x - initial.x) / initial.scale, (point.x - next.x) / next.scale);
      close((point.y - initial.y) / initial.scale, (point.y - next.y) / next.scale);
      assert.ok(next.scale >= .05 && next.scale <= 4);
    }
  }
  assert.equal(wheelPixels(3, 1, 500), wheelPixels(48, 0, 500));
  assert.equal(wheelPixels(1, 2, 500), 500);
});

for (const platform of ['MacIntel', 'Win32', 'Linux x86_64']) {
test(`${platform}: canvas gestures zoom, pan, recover from cancellation, respect editor focus and dispose listeners`, async t => {
  const modifier = platform === 'MacIntel' ? { metaKey: true } : { altKey: true };
  const otherModifier = platform === 'MacIntel' ? { altKey: true } : { metaKey: true };
  const dom = new JSDOM('<div id="root"></div><input id="field"/><div class="cm-content" contenteditable="true"></div>', { url: 'https://canvas.test', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window.navigator, 'platform', { value: platform });
  t.after(() => { window.unmount?.(); window.close(); });
  const observers = [];
  window.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  Object.defineProperties(window.HTMLElement.prototype, { clientWidth: { get: () => 640 }, clientHeight: { get: () => 480 } });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 480 });
  const capture = new Set();
  window.HTMLElement.prototype.setPointerCapture = id => capture.add(id);
  window.HTMLElement.prototype.hasPointerCapture = id => capture.has(id);
  window.HTMLElement.prototype.releasePointerCapture = id => capture.delete(id);
  const bundle = await build({
    stdin: { contents: `
      import { act, StrictMode, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { useCanvasViewport } from './src/components/useCanvasViewport';
      function Fixture() {
        const [busy, setBusy] = useState(false); window.setBusy = setBusy;
        const camera = useCanvasViewport({width:1000,height:1400},false,busy);
        window.fit = camera.fit; window.zoomTo = camera.zoomTo; window.reveal = camera.reveal;
        return <div className="free-canvas"><button id="tool">Tool</button><div ref={camera.viewportRef} tabIndex={0} id="viewport" data-view={JSON.stringify(camera.view)} data-panning={camera.panning} data-can-pan={camera.canPan} {...camera.handlers} /></div>;
      }
      const app = createRoot(document.getElementById('root'));
      window.IS_REACT_ACT_ENVIRONMENT = true;
      window.perform = action => act(() => flushSync(action));
      window.unmount = () => act(() => flushSync(() => app.unmount()));
      act(() => flushSync(() => app.render(<StrictMode><Fixture/></StrictMode>)));
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, jsx: 'automatic', format: 'iife', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
  });
  window.eval(bundle.outputFiles[0].text);
  const viewport = window.document.getElementById('viewport');
  const view = () => JSON.parse(viewport.dataset.view);
  const wheel = options => {
    const event = new window.WheelEvent('wheel', { clientX: 360, clientY: 210, deltaY: -100, bubbles: true, cancelable: true, ...options });
    window.perform(() => viewport.dispatchEvent(event)); return event;
  };
  const key = (code, options = {}, target = viewport, type = 'keydown') => {
    const event = new window.KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code === 'Escape' ? 'Escape' : '', bubbles: true, cancelable: true, ...options });
    window.perform(() => target.dispatchEvent(event)); return event;
  };
  const pointer = (type, x, y, button = 0) => {
    const event = new window.MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    window.perform(() => viewport.dispatchEvent(event));
  };
  viewport.focus();
  const initial = view();
  assert.equal(wheel(modifier).defaultPrevented, true);
  assert.ok(view().scale > initial.scale);
  close((260 - view().x) / view().scale, (260 - initial.x) / initial.scale);
  close((160 - view().y) / view().scale, (160 - initial.y) / initial.scale);
  const zoomed = view();
  assert.equal(wheel({ ctrlKey: true }).defaultPrevented, false, 'browser zoom / pinch remains available without the canvas modifier');
  assert.deepEqual(view(), zoomed);
  wheel(otherModifier);
  assert.equal(view().scale, zoomed.scale, 'the other platform modifier does not zoom');
  window.perform(() => window.fit());
  wheel(modifier);
  wheel({ deltaX: 35, deltaY: 60 });
  close(view().x, zoomed.x - 35); close(view().y, zoomed.y - 60);
  key('Space');
  assert.equal(viewport.dataset.canPan, 'true');
  const beforePan = view();
  pointer('pointerdown', 200, 180); pointer('pointermove', 340, 230);
  close(view().x, beforePan.x + 140); close(view().y, beforePan.y + 50);
  pointer('pointercancel', 340, 230);
  assert.deepEqual(view(), beforePan, 'cancelled pointer restores camera position');
  assert.equal(capture.size, 0);
  window.perform(() => window.dispatchEvent(new window.Event('blur')));
  assert.equal(viewport.dataset.canPan, 'false', 'Alt-Tab / lost focus never leaves the space-pan tool stuck');
  pointer('pointerdown', 200, 180, 1); pointer('pointermove', 240, 210, 1); pointer('pointerup', 240, 210, 1);
  close(view().x, beforePan.x + 40); close(view().y, beforePan.y + 30);
  assert.equal(capture.size, 0);
  const tool = window.document.getElementById('tool'); tool.focus();
  assert.equal(key('Space', {}, tool).defaultPrevented, false, 'Space still activates a focused toolbar button');
  const field = window.document.getElementById('field'); field.focus();
  assert.equal(key('Space', {}, field).defaultPrevented, false, 'typing spaces in property fields is untouched');
  assert.equal(key('Digit0', modifier, field).defaultPrevented, false);
  const editor = window.document.querySelector('.cm-content'); editor.focus();
  assert.equal(key('Digit1', modifier, editor).defaultPrevented, false, 'script editor keeps its shortcuts');
  viewport.focus();
  const beforeShortcuts = view();
  for (const code of ['Digit0', 'Digit1']) assert.equal(key(code, otherModifier).defaultPrevented, false);
  for (const code of ['KeyS', 'KeyZ', 'KeyD', 'Equal', 'Minus']) assert.equal(key(code, { metaKey: true }).defaultPrevented, false, 'unrelated command shortcuts remain available');
  assert.deepEqual(view(), beforeShortcuts);
  assert.equal(key('Digit1', modifier).defaultPrevented, true); assert.equal(view().scale, 1);
  assert.equal(key('Digit0', modifier).defaultPrevented, true); assert.deepEqual(view(), initial);
  window.perform(() => window.setBusy(true));
  wheel(modifier); pointer('pointerdown', 200, 180, 1);
  assert.deepEqual(view(), initial, 'zoom/pan cannot change coordinates mid component gesture');
  assert.equal(capture.size, 0);
  window.perform(() => window.setBusy(false));
  window.perform(() => window.zoomTo(1));
  const beforeResize = view();
  window.perform(() => observers.filter(x => !x.disconnected).forEach(x => x.callback([{ contentRect: { width: 840, height: 580 } }])));
  close(view().x, beforeResize.x + 100); close(view().y, beforeResize.y + 50);
  window.perform(() => window.reveal({ x: 0, y: 1200, width: 100, height: 100 }));
  close(view().y + 1250 * view().scale, 290, 'layer selection reveals offscreen objects');
  window.unmount();
  assert.equal(wheel(modifier).defaultPrevented, false);
  assert.equal(observers.every(x => x.disconnected), true);
});
}
