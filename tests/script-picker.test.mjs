import { installMatchMedia } from './helpers/media-query.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

test('script picker commits valid names, cancels invalid edits and selects duplicate names by ID', async t => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: 'https://studio.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  installMatchMedia(window);
  t.after(() => { window.unmount?.(); window.close(); });
  const bundle = await build({
    stdin: { contents: `
      import { StrictMode, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { ScriptPicker } from './src/components/ScriptPicker';
      const app = createRoot(document.getElementById('root'));
      window.calls = [];
      function Fixture() {
        const [scripts, setScripts] = useState([
          { id: 'first', name: '同名脚本', code: 'ctx.log(1)' },
          { id: 'second', name: '同名脚本', code: 'ctx.log(2)' },
        ]);
        const [id, select] = useState('first');
        window.selected = id;
        return <ScriptPicker scripts={scripts} script={scripts.find(s => s.id === id)} onSelect={select} onRename={(id, name) => {
          window.calls.push({ id, name });
          setScripts(items => items.map(s => s.id === id ? { ...s, name } : s));
        }} />;
      }
      window.perform = action => flushSync(action);
      window.unmount = () => flushSync(() => app.unmount());
      flushSync(() => app.render(<StrictMode><Fixture /></StrictMode>));
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  });
  window.eval(bundle.outputFiles[0].text);
  const input = window.document.querySelector('[role=combobox]');
  const key = key => window.perform(() => input.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
  const edit = value => window.perform(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const readCalls = () => JSON.parse(JSON.stringify(window.calls));
  assert.equal(window.document.activeElement === input, true);
  assert.deepEqual([input.selectionStart, input.selectionEnd], [0, input.value.length]);
  key('ArrowDown');
  key('ArrowDown');
  key('Enter');
  assert.equal(window.selected, 'second', 'duplicate names are selected by stable script IDs');
  edit('  新脚本名称  ');
  key('Enter');
  assert.deepEqual(readCalls(), [{ id: 'second', name: '新脚本名称' }]);
  assert.equal(input.value, '新脚本名称');
  window.perform(() => window.document.querySelector('#outside').focus());
  assert.equal(window.calls.length, 1, 'blur after Enter must not save twice');
  window.perform(() => input.focus());
  edit('   ');
  key('Enter');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(window.calls.length, 1, 'empty names do not overwrite the saved name');
  let parentEscapes = 0;
  window.document.addEventListener('keydown', event => { if (event.key === 'Escape') parentEscapes++; });
  key('Escape');
  assert.equal(input.value, '新脚本名称');
  assert.equal(input.getAttribute('aria-invalid'), 'false');
  assert.equal(parentEscapes, 0, 'Escape restores the name without closing the workbench');
  edit('失焦保存');
  window.perform(() => window.document.querySelector('#outside').focus());
  assert.deepEqual(readCalls().at(-1), { id: 'second', name: '失焦保存' });
  window.perform(() => window.document.querySelector('[aria-label="选择脚本"]').click());
  window.perform(() => window.document.querySelector('[role=option]').click());
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  assert.equal(window.selected, 'first');
  assert.equal(input.value, '同名脚本');
  assert.deepEqual([input.selectionStart, input.selectionEnd], [0, input.value.length], 'switching scripts selects the new name in full');
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(!!window.document.querySelector('[role=listbox]'), false);
  assert.deepEqual(errors, []);
});
