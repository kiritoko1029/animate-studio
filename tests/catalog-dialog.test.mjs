import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installMatchMedia } from './helpers/media-query.mjs';

test('catalog dialogs keep their theme across portals and restore focus after both footer actions', async t => {
  const errors = [], console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.join(' ')));
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url:'https://dialog.test', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:console });
  const { window } = dom;
  t.after(() => { window.unmount?.(); window.close(); });
  installMatchMedia(window, { reducedMotion:true });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const bundle = await build({
    stdin: { contents: `
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { AnimateUIProvider } from '@animate-ui/react/provider';
      import { PageRenderer } from './src/components/PageRenderer';
      import { createBlock, createDocument } from './src/model';
      import { applyPageTheme, getTheme } from './src/lib/themes';
      const root = createRoot(document.getElementById('root'));
      window.perform = action => flushSync(action);
      window.unmount = () => flushSync(() => root.unmount());
      window.render = (type, ownTheme, close = false) => {
        const page = applyPageTheme(createDocument(true), 'animate-dark');
        page.settings.customThemes = [{...getTheme('nature'), id:'custom-dialog', name:'弹窗主题', accent:'#123456', surface:'#edf4ff', text:'#102030'}];
        const block = createBlock(type);
        if (ownTheme) block.props.theme = ownTheme;
        if (type === 'dialog' && close) block.props.motion = {'DialogContent.showCloseButton':true};
        page.blocks = [block];
        flushSync(() => root.render(<AnimateUIProvider reducedMotion="always"><PageRenderer document={page}/></AnimateUIProvider>));
      };
      window.render('dialog');
    `, loader:'jsx', resolveDir:fileURLToPath(new URL('../', import.meta.url)) },
    bundle:true, write:false, format:'iife', jsx:'automatic', external:['shiki'], loader:{'.css':'empty'}, logLevel:'silent', define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'raw', setup(build) {
      build.onResolve({filter:/\?raw$/}, args => ({path:resolve(args.resolveDir, args.path.slice(0,-4)), namespace:'raw'}));
      build.onLoad({filter:/.*/, namespace:'raw'}, async args => ({contents:await readFile(args.path,'utf8'), loader:'text', resolveDir:dirname(args.path)}));
    }}],
  });
  window.eval(bundle.outputFiles[0].text);
  const document = window.document;
  const ready = predicate => new Promise((resolveReady, reject) => {
    const observer = new window.MutationObserver(check);
    const deadline = setTimeout(() => { cleanup(); reject(new Error(`Dialog state timed out: ${errors.join('; ')}`)); }, 4000);
    function cleanup() { clearTimeout(deadline); observer.disconnect(); document.removeEventListener('focusin', check); }
    function check() { if (predicate()) { cleanup(); resolveReady(); } }
    document.addEventListener('focusin', check);
    observer.observe(document.body, {childList:true, subtree:true, attributes:true});
    check();
  });
  const open = async role => {
    await ready(() => document.querySelector('.native-catalog button'));
    const trigger = document.querySelector('.native-catalog button');
    trigger.focus();
    window.perform(() => trigger.click());
    await ready(() => document.querySelector(`[role="${role}"]`));
    return { trigger, popup:document.querySelector(`[role="${role}"]`) };
  };
  const close = async (popup, trigger, label) => {
    window.perform(() => [...popup.querySelectorAll('button')].find(button => button.textContent === label).click());
    await ready(() => !document.contains(popup) && document.activeElement === trigger);
    assert.ok(document.activeElement === trigger, 'closing restores the opener focus');
  };

  let { popup, trigger } = await open('dialog');
  assert.equal(popup.closest('.page-surface'), null, 'exercise the actual detached portal');
  assert.equal(popup.style.getPropertyValue('--page-accent'), '#ffffff');
  assert.equal(popup.style.getPropertyValue('--page-surface'), '#0a0a0a');
  assert.deepEqual([...popup.querySelectorAll('button')].map(button => button.textContent), ['取消','继续']);
  assert.equal(document.activeElement.textContent, '取消');
  await close(popup, trigger, '取消');
  ({ popup, trigger } = await open('dialog'));
  await close(popup, trigger, '继续');

  window.render('dialog', 'custom-dialog', true);
  ({ popup, trigger } = await open('dialog'));
  assert.equal(popup.style.getPropertyValue('--page-accent'), '#123456');
  assert.equal(popup.style.getPropertyValue('--page-surface'), '#edf4ff');
  assert.equal(popup.style.getPropertyValue('--page-ink'), '#102030');
  assert.ok(popup.querySelector('button[aria-label="关闭"]'), 'explicit close-button settings remain effective');
  window.perform(() => popup.querySelector('button[aria-label="关闭"]').click());
  await ready(() => !document.contains(popup) && document.activeElement === trigger);

  window.render('alertDialog');
  ({ popup, trigger } = await open('alertdialog'));
  assert.equal(popup.querySelector('button[aria-label="关闭"]'), null);
  assert.equal(document.activeElement.textContent, '取消');
  await close(popup, trigger, '取消');
  ({ popup, trigger } = await open('alertdialog'));
  await close(popup, trigger, '继续');
  assert.deepEqual(errors, []);
});
