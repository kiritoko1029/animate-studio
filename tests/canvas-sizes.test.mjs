import { installMatchMedia } from './helpers/media-query.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { canvasPresets, canvasLimits } from '../shared/canvas-sizes.mjs';
import { createDocument, createBlock, toFreeDocument } from '../src/model.ts';
import { placeBlock } from '../src/lib/layout.ts';
import { validatePage } from '../server/validation.mjs';

test('new blank pages and the template default to 1080p with every component inside the canvas', () => {
  for (const blank of [true, false]) {
    const page = createDocument(blank);
    assert.equal(page.settings.maxWidth, 1920);
    assert.equal(page.settings.canvasHeight, 1080);
    for (const block of page.blocks) {
      assert.ok(block.frame.x + block.frame.width <= 1920);
      assert.ok(block.frame.y + block.frame.height <= 1080);
    }
    assert.deepEqual(toFreeDocument(page), page);
    assert.doesNotThrow(() => validatePage(page));
  }
});

test('all presets support placement at the far right and full-width components', () => {
  for (const { width, height } of canvasPresets) {
    const page = createDocument(true);
    page.settings = { ...page.settings, maxWidth: width, canvasHeight: height };
    const result = placeBlock(page, createBlock('card'), { x: width - 400, y: 0 });
    assert.equal(result.block.frame.x, width - 400);
    assert.equal(result.page.settings.canvasHeight, height);
    result.page.blocks.push({ ...createBlock('navbar'), frame: { x: 0, y: height - 85, width, height: 85 } });
    assert.doesNotThrow(() => validatePage(result.page));
    assert.deepEqual(toFreeDocument(result.page), result.page, 'a component at the bottom must not grow a preset on reload');
  }
});

test('legacy custom sizes remain intact and widths beyond the supported maximum are rejected', () => {
  const page = createDocument(true);
  page.settings.maxWidth = 1000; page.settings.canvasHeight = 1400;
  assert.deepEqual(toFreeDocument(page).settings, page.settings);
  page.settings.maxWidth = canvasLimits.maxWidth + 1;
  assert.throws(() => validatePage(page), /maxWidth/);
  assert.throws(() => placeBlock(page, createBlock('card')), /3840/);
});

test('size controls apply both preset dimensions together and commit custom dimensions after editing', async t => {
  const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: 'https://canvas-size.test', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  installMatchMedia(window);
  t.after(() => { window.unmount?.(); window.close(); });
  const bundle = await build({
    stdin: { contents: `
      import { act, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { CanvasSizeSelect, CanvasSizeControls } from './src/components/CanvasSizeControls';
      window.changes=[];
      function Fixture(){
        const [size,setSize]=useState({width:1920,height:1080});
        const change=size=>{window.changes.push(size);setSize(size);};
        return <><CanvasSizeSelect {...size} onChange={change}/><CanvasSizeControls {...size} onChange={change}/></>;
      }
      const root=createRoot(document.getElementById('root'));
      window.IS_REACT_ACT_ENVIRONMENT=true;
      window.perform=action=>act(()=>flushSync(action));
      window.unmount=()=>act(()=>flushSync(()=>root.unmount()));
      window.perform(()=>root.render(<Fixture/>));
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, jsx: 'automatic', format: 'iife', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
  });
  window.eval(bundle.outputFiles[0].text);
  const doc = window.document, select = doc.querySelector('select');
  const width = doc.querySelector('[aria-label="画布宽度"]'), height = doc.querySelector('[aria-label="画布高度"]');
  const key = key => window.perform(() => width.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
  const fill = value => window.perform(() => {
    width.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(width, value);
    width.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(select.value, '1080p');
  window.perform(() => { select.value = '4k'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.deepEqual([width.value, height.value], ['3840', '2160']);
  assert.equal(window.changes.length, 1, 'preset updates width and height as one edit');
  fill('1'); assert.equal(window.changes.length, 1, 'partial typing must not snap to the minimum');
  fill('1800'); key('Enter');
  assert.deepEqual([width.value, height.value, select.value], ['1800', '2160', 'custom']);
  fill('999'); key('Escape'); assert.equal(width.value, '1800');
  fill(''); window.perform(() => doc.getElementById('outside').focus()); assert.equal(width.value, '1800');
  fill('9999'); key('Enter'); assert.equal(width.value, '3840');
  window.perform(() => [...doc.querySelectorAll('button')].find(button => button.textContent.startsWith('2K')).click());
  assert.deepEqual([width.value, height.value, select.value], ['2560', '1440', '2k']);
});
