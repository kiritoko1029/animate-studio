import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

test('text can be selected in component interaction preview without changing normal canvas editing', async t => {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://text-selection.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  t.after(() => { window.unmount?.(); window.close(); });
  installMatchMedia(window, { reducedMotion: true });
  installWebAnimations(window);
  Object.assign(window, { structuredClone, TextEncoder, TextDecoder });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  const css = await Promise.all(['studio-tokens.css', 'styles.css', 'page.css', 'free-canvas.css'].map(async name => {
    const source = await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
    return source.split('\n').filter(line => !line.startsWith('@import ')).join('\n');
  }));
  const style = window.document.createElement('style');
  style.textContent = css.join('\n');
  window.document.head.append(style);
  const bundle = await build({
    stdin: { contents: `
      import {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {flushSync} from 'react-dom';
      import {DndContext} from '@dnd-kit/core';
      import {FreeCanvas} from './src/components/FreeCanvas';
      import {createDocument,createBlock} from './src/model';
      const text = {...createBlock('text'),id:'select-text',props:{...createBlock('text').props,text:'请选择这段文字'},frame:{x:48,y:48,width:640,height:140}};
      const page = {...createDocument(true),blocks:[text]};
      const noop=()=>{};
      function Fixture(){const [selected,setSelected]=useState('select-text');return <DndContext><FreeCanvas document={page} selected={selected} onSelect={setSelected} onFrameChange={noop} onBlockChange={noop} onCanvasSizeChange={noop} onPageMarginChange={noop} onPageSettings={noop} onDelete={noop} onDuplicate={noop} onInspect={noop} onCreateVariable={noop} onAlign={noop} onFillWidth={noop} onLayerChange={noop} isDragging={false} device="desktop"/></DndContext>;}
      const root=createRoot(document.getElementById('root'));
      window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());
      window.perform(()=>root.render(<Fixture/>));
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', external: ['shiki'], loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
    plugins: [{ name: 'raw', setup(build) { build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' })); build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) })); } }],
  });
  window.eval(bundle.outputFiles[0].text);
  const doc = window.document, frame = () => doc.querySelector('[data-block-id="select-text"]');
  assert.equal(window.getComputedStyle(frame()).userSelect, 'none', 'normal editing remains component dragging, not text selection');
  window.perform(() => frame().dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true })));
  assert.equal(frame().getAttribute('data-canvas-interactive'), 'true');
  assert.equal(window.getComputedStyle(frame()).userSelect, 'text');
  const paragraph = frame().querySelector('.page-paragraph'), range = doc.createRange();
  range.selectNodeContents(paragraph);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  assert.equal(selection.toString(), '请选择这段文字');
  window.perform(() => frame().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  assert.equal(frame().hasAttribute('data-canvas-interactive'), false);
  assert.equal(window.getComputedStyle(frame()).userSelect, 'none');
  assert.deepEqual(errors, []);
});
