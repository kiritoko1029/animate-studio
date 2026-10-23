import { installMatchMedia } from './helpers/media-query.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

test('native previews retain bindings, focus, sizing, notices and reset behavior', async t => {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://preview.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  installMatchMedia(window, { reducedMotion: true });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  t.after(() => { window.unmount?.(); window.close(); });
  const observers = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(element) { this.element = element; }
    unobserve() {}
    disconnect() { this.disconnected = true; }
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const bundle = await build({
    stdin: { contents: `
      import { StrictMode } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { InteractivePreview } from './src/components/InteractivePreview';
      import { createInteractionDemo } from './src/lib/interactions/demo';
      const app = createRoot(document.getElementById('root'));
      window.perform = action => flushSync(action);
      window.reopenPage = () => {
        flushSync(() => app.render(null));
        flushSync(() => app.render(<StrictMode><InteractivePreview document={JSON.parse(JSON.stringify(window.page))} debug /></StrictMode>));
      };
      window.renderPage = () => {
        const page = createInteractionDemo();
        page.settings = { ...page.settings, maxWidth: 1330, canvasHeight: 1502 };
        page.blocks.find(block=>block.props.label==='提交').events.click[1].expression=JSON.stringify('提交成功！<img src=x>');
        window.page = page;
        flushSync(() => app.render(<StrictMode><InteractivePreview document={page} debug /></StrictMode>));
      };
      window.unmount = () => flushSync(() => app.unmount());
      window.renderPage();
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', external: ['shiki'], loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  window.eval(bundle.outputFiles[0].text);
  const doc = window.document;
  assert.equal(doc.querySelector('iframe'), null);
  const name = doc.querySelector('input[placeholder="试着输入一个名字"]');
  assert.ok(name, `${errors.join('; ')} ${doc.body.textContent.slice(0,1000)}`);
  const fill = value => window.perform(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,value);
    name.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
  fill('小林');
  assert.ok(doc.body.textContent.includes('你好，小林！'));
  assert.equal(doc.querySelector('input[placeholder="试着输入一个名字"]'), name, 'typing into a binding preserves the native input and caret');
  const resize = width => window.perform(() => observers.filter(observer => !observer.disconnected && observer.element?.classList.contains('page-free-viewport')).forEach(observer => observer.callback([{contentRect:{width}}])));
  resize(621.25);
  assert.ok(Math.abs(parseFloat(doc.querySelector('.page-free-scaled-shell').style.height)-1502*621.25/1330)<.01);
  resize(1600);
  assert.equal(doc.querySelector('.page-free-scaled-shell').style.height,'1502px');
  assert.equal(name.value,'小林');
  const submit = () => [...doc.querySelectorAll('button')].find(button=>button.textContent==='提交');
  assert.equal(submit().disabled,true);
  window.perform(()=>doc.querySelector('[role="checkbox"]').click());
  assert.equal(submit().disabled,false);
  window.perform(()=>submit().click());
  await Promise.resolve();
  window.perform(()=>{});
  const dialog = () => doc.querySelector('[role="alertdialog"]');
  assert.ok(dialog());
  assert.equal(dialog().parentNode,doc.body);
  assert.equal(dialog().querySelector('img'),null);
  assert.match(dialog().textContent, /提交成功！<img src=x>/);
  let escaped = 0; window.addEventListener('keydown',()=>escaped++);
  window.perform(()=>dialog().querySelector('button').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(escaped,0);
  assert.equal(dialog(),null);
  window.perform(()=>submit().click());
  await Promise.resolve(); window.perform(()=>{});
  assert.ok(dialog());
  window.perform(()=>dialog().querySelector('button').click());
  assert.equal(dialog(),null);
  window.reopenPage();
  assert.equal(doc.querySelector('input[placeholder="试着输入一个名字"]').value, '小林', 'reopening the page restores saved control values');
  assert.equal(submit().disabled, false, 'restored variables also update dependent bindings');
  window.perform(() => doc.querySelector('button[title="重置运行数据"]').click());
  window.reopenPage();
  assert.equal(doc.querySelector('input[placeholder="试着输入一个名字"]').value, '');
  assert.equal(submit().disabled, true, 'reset clears the values restored by future mounts');
  window.renderPage();
  assert.equal(doc.querySelector('input[placeholder="试着输入一个名字"]').value,'');
  assert.equal(submit().disabled,true);
  assert.deepEqual(errors,[]);
});
