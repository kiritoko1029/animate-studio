import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installMatchMedia } from './helpers/media-query.mjs';

test('plain and bound catalog previews use the same interactive v2 components', async t => {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://upgrade.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  t.after(() => { window.unmount?.(); window.close(); });
  installMatchMedia(window, { reducedMotion: true });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  const bundle = await build({
    stdin: { contents: `
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { AnimateUIProvider } from '@animate-ui/react/provider';
      import { PageRenderer } from './src/components/PageRenderer';
      import { createDocument, createBlock } from './src/model';
      const root=createRoot(document.getElementById('root'));
      const page={...createDocument(),blocks:[{...createBlock('toggle'),id:'a'},{...createBlock('toggle'),id:'b'},{...createBlock('themeTogglerButton'),id:'theme'}]};
      window.perform=action=>flushSync(action);
      window.unmount=()=>flushSync(()=>root.unmount());
      window.render=bound=>flushSync(()=>root.render(<AnimateUIProvider reducedMotion="always"><PageRenderer document={bound?{...page,variables:[{name:'saved',type:'boolean',initial:false}],blocks:page.blocks.map(block=>({...block,bindings:{checked:{kind:'variable',value:'saved'}}}))}:page}/></AnimateUIProvider>));
      window.render(false);
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', external: ['shiki'], loader: { '.css': 'empty' }, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'raw', setup(build) {
      build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' }));
      build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) }));
    } }],
  });
  window.eval(bundle.outputFiles[0].text);
  const nativeButtons = () => [...window.document.querySelectorAll('[data-animate-ui="v2"] button[aria-pressed]')];
  // Wait for the lazy module's observable render, not an arbitrary animation duration.
  await new Promise((resolveReady, reject) => {
    const check = () => { if (nativeButtons().length === 2) { observer.disconnect(); clearTimeout(deadline); resolveReady(); } };
    const observer = new window.MutationObserver(check);
    observer.observe(window.document.getElementById('root'), { childList: true, subtree: true });
    const deadline = setTimeout(() => { observer.disconnect(); reject(new Error(`v2 preview did not mount: ${errors.join('; ')}`)); }, 4000);
    check();
  });
  assert.equal(window.document.querySelector('iframe'), null);
  assert.deepEqual(nativeButtons().map(button => button.getAttribute('aria-pressed')), ['false','false']);
  window.perform(() => nativeButtons()[0].click());
  assert.deepEqual(nativeButtons().map(button => button.getAttribute('aria-pressed')), ['true','false']);
  window.perform(() => window.document.querySelector('[aria-label="切换明暗主题"]').click());
  assert.equal(window.document.querySelector('.page-surface').style.colorScheme, 'dark');
  window.perform(() => window.document.querySelector('[aria-label="切换明暗主题"]').click());
  assert.equal(window.document.querySelector('.page-surface').style.colorScheme, 'light');
  window.render(true);
  assert.equal(window.document.querySelector('iframe'), null, 'adding bindings must not switch to a substitute renderer');
  assert.equal(nativeButtons().length, 2);
  assert.deepEqual(nativeButtons().map(button => button.getAttribute('aria-pressed')), ['false','false']);
  window.perform(() => nativeButtons()[0].click());
  assert.deepEqual(nativeButtons().map(button => button.getAttribute('aria-pressed')), ['true','true'], 'both official toggles share the bound variable');
  assert.deepEqual(errors, []);
});
