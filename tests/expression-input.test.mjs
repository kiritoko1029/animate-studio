import { installMatchMedia } from './helpers/media-query.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

test('expression input completes with the keyboard, preserves invalid drafts and applies examples', async t => {
  const errors = [];
  const console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.join(' ')));
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">离开</button>', { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console });
  t.after(() => dom.window.close());
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const bundle = await build({
    stdin: { contents: `
      import { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { ExpressionInput } from './src/components/ExpressionInput';
      const context = { variables: [{name:'progress',type:'number',initial:30}], purpose:'text' };
      window.commits = [];
      function Demo() {
        const [value, setValue] = useState('"原值"');
        return <ExpressionInput value={value} label="测试表达式" context={context} onChange={value => { window.commits.push(value); setValue(value); }} />;
      }
      const root = createRoot(document.getElementById('root'));
      flushSync(() => root.render(<Demo />));
      window.perform = action => flushSync(action);
      window.unmount = () => flushSync(() => root.unmount());
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  const { window } = dom;
  installMatchMedia(window);
  window.eval(bundle.outputFiles[0].text);
  t.after(() => window.unmount());
  const input = window.document.querySelector('input');
  const fill = text => window.perform(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, text);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const key = (key, extra = {}) => window.perform(() => input.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...extra })));
  fill('state.');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  key('Enter', { isComposing: true });
  assert.equal(input.value, 'state.', 'IME Enter must not accept a completion or save');
  key('Enter');
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  assert.equal(input.value, 'state.progress');
  assert.equal(window.commits.length, 0, 'completion only changes the draft');
  assert.match(window.document.querySelector('output').textContent, /30/);
  key('Enter');
  assert.equal(window.commits.at(-1), 'state.progress');
  fill('state.progress +');
  key('Enter');
  window.perform(() => window.document.getElementById('outside').focus());
  assert.equal(input.value, 'state.progress +', 'invalid draft survives blur');
  assert.equal(window.commits.length, 1, 'invalid draft must never overwrite the stored expression');
  assert.match(window.document.body.textContent, /尚未保存/);
  const button = name => [...window.document.querySelectorAll('button')].find(b => b.textContent === name);
  window.perform(() => button('恢复').click());
  assert.equal(input.value, 'state.progress');
  window.perform(() => button('变量与示例').click());
  window.perform(() => button('数字后加单位state.progress + "%"').click());
  assert.equal(window.commits.at(-1), 'state.progress + "%"');
  assert.equal(window.document.querySelector('output').textContent, '"30%"');
  assert.deepEqual(errors, []);
});
