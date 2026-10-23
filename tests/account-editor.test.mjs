import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument } from '../src/model.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

const bundle = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import App from './src/App';import {initializeLocale} from './src/i18n';initializeLocale();import {AccountProvider} from './src/components/AccountProvider';import {MotionConfig} from 'motion/react';import {AnimateUIProvider} from '@animate-ui/react/provider';const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><AccountProvider><App/></AccountProvider></AnimateUIProvider></MotionConfig>));`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, external: ['shiki', 'virtual:animate-studio-native-export'],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_STUDIO_CLOUD': 'false' }, logLevel: 'silent',
  plugins: [{ name: 'raw', setup(build) { build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' })); build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) })); } }],
});
async function until(predicate, description) {
  const deadline = Date.now() + 4000;
  while (!predicate()) { if (Date.now() > deadline) assert.fail(description); await new Promise(resolve => setTimeout(resolve, 10)); }
}
function fixture(t) {
  const errors = [], console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  console.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://studio.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console });
  const win = dom.window;
  win.localStorage.setItem('animate-studio:locale', 'zh-CN');
  t.after(() => { win.unmount?.(); win.close(); });
  installMatchMedia(win, { reducedMotion: true });
  installWebAnimations(win);
  Object.assign(win, { Headers, Request, Response, AbortSignal, AbortController, structuredClone, TextEncoder, TextDecoder });
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.HTMLElement.prototype.scrollTo = () => {};
  const guest = createDocument(true); guest.name = '浏览器草稿';
  win.localStorage.setItem('animate-studio:guest-draft:v1', JSON.stringify({ page: guest, savedAt: '2026-10-23T00:00:00Z' }));
  const other = createDocument(true); other.name = '另一份云端作品';
  const record = (id, page) => ({ id, name: page.name, page: structuredClone(page), createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', savedAt: '2026-10-23T00:00:00Z', shareToken: null, publishedAt: null });
  const state = { user: { id: 'owner', email: 'owner@studio.test', name: 'Owner' }, pages: new Map([['other', record('other', other)]]), writes: [], failWrites: false, preferences: { version: 1, studioTheme: 'light' }, preferenceWrites: [] };
  win.fetch = async (url, options = {}) => {
    const path = String(url), method = options.method ?? 'GET', body = options.body ? JSON.parse(options.body) : null;
    if (path === '/api/auth/get-session') return Response.json(state.user ? { user: state.user } : null);
    if (path === '/api/account/config') return Response.json({ cloudEnabled: true, emailEnabled: true, githubEnabled: true });
    if (path === '/api/account/preferences') { if (body) { state.preferences = body; state.preferenceWrites.push(body); } return Response.json(state.preferences); }
    if (path === '/api/account/pages') {
      if (method === 'POST') { const value = record('new-page', body.page); state.pages.set(value.id, value); return Response.json(value); }
      return Response.json({ pages: [...state.pages.values()] });
    }
    const match = path.match(/^\/api\/account\/pages\/([^/]+)$/);
    if (match) {
      const id = match[1];
      if (method === 'PUT') {
        state.writes.push({ id, page: body.page });
        if (state.failWrites) return Response.json({ error: '模拟保存失败' }, { status: 500 });
        state.pages.set(id, record(id, body.page));
      }
      return Response.json(state.pages.get(id));
    }
    return Response.json({ error: '未模拟该接口' }, { status: 404 });
  };
  win.eval(bundle.outputFiles[0].text);
  const doc = win.document;
  const click = element => { assert.ok(element, 'expected a visible action'); win.perform(() => element.click()); };
  const button = text => [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  const name = () => doc.querySelector('input[aria-label="页面名称"]');
  const rename = value => win.perform(() => { Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(name(), value); name().dispatchEvent(new win.Event('input', { bubbles: true })); });
  const openMore = async () => {
    const trigger = doc.querySelector('.more-actions-button');
    win.perform(() => trigger.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    await until(() => doc.querySelector('.workbench-more-menu'), 'more menu opens with keyboard');
    return trigger;
  };
  const openAccountPages = async () => {
    await openMore();
    click(doc.querySelector('[aria-label="云端页面"], [aria-label="Cloud pages"]'));
    await until(() => doc.querySelector('.account-dialog'), 'account dialog opens after menu closes');
    assert.equal(doc.querySelector('.workbench-more-menu'), null);
  };
  const chooseLanguage = async value => {
    const trigger = await openMore();
    const label = value === 'en' ? 'English' : '中文';
    click([...doc.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent.trim() === label));
    await until(() => !doc.querySelector('.workbench-more-menu'), 'more menu closes after language selection');
    await until(() => doc.activeElement === trigger, 'focus returns to the more trigger');
  };
  return { win, doc, state, errors, click, button, name, rename, openMore, openAccountPages, chooseLanguage };
}

test('cloud save is explicit; opening another page flushes edits and new pages never overwrite the old cloud page', async t => {
  const f = fixture(t); await until(() => f.name() && f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'editor and account ready');
  assert.equal(f.state.pages.size, 1, 'login alone does not upload the browser draft');
  await f.openAccountPages();
  await until(() => f.button('保存当前页面到云端'), 'page manager ready');
  f.click(f.button('保存当前页面到云端'));
  await until(() => f.button('保存当前云端页面') && !f.button('保存当前云端页面').disabled, 'cloud page saved');
  f.click(f.doc.querySelector('[role="dialog"] [aria-label="关闭"]'));
  f.rename('云端新名称');
  await f.openAccountPages();
  await until(() => [...f.doc.querySelectorAll('.cloud-page-open')].some(b => b.textContent.includes('另一份云端作品')), 'list loaded');
  f.click([...f.doc.querySelectorAll('.cloud-page-open')].find(b => b.textContent.includes('另一份云端作品')));
  await until(() => f.name()?.value === '另一份云端作品', 'selected page opened');
  assert.equal(f.state.pages.get('new-page').page.name, '云端新名称');
  f.win.perform(() => f.doc.querySelector('[aria-label="页面操作"]').dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelector('[role="menuitem"]'), 'new page menu opens');
  f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('空白页面')));
  await until(() => f.name()?.value !== '另一份云端作品', 'new draft created');
  assert.equal(f.state.pages.get('other').page.name, '另一份云端作品');
  assert.deepEqual(f.errors, []);
});

test('a failed cloud save prevents switching and retains the changed document for retry/export', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'account ready');
  await f.openAccountPages();
  await until(() => f.button('保存当前页面到云端'), 'manager ready'); f.click(f.button('保存当前页面到云端'));
  await until(() => f.button('保存当前云端页面') && !f.button('保存当前云端页面').disabled, 'page saved');
  f.click(f.doc.querySelector('[role="dialog"] [aria-label="关闭"]')); f.state.failWrites = true; f.rename('不能丢失的修改');
  await f.openAccountPages();
  await until(() => [...f.doc.querySelectorAll('.cloud-page-open')].some(b => b.textContent.includes('另一份云端作品')), 'list loaded');
  f.click([...f.doc.querySelectorAll('.cloud-page-open')].find(b => b.textContent.includes('另一份云端作品')));
  await until(() => f.doc.querySelector('.account-error')?.textContent.includes('尚未保存'), 'switch failure visible');
  assert.equal(f.name().value, '不能丢失的修改');
  assert.equal(f.state.pages.get('other').page.name, '另一份云端作品');
  assert.deepEqual(f.errors, []);
});

test('a session change cancels pending cloud autosave and retains current edits as a browser draft', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'account ready');
  await f.openAccountPages();
  await until(() => f.button('保存当前页面到云端'), 'manager ready'); f.click(f.button('保存当前页面到云端'));
  await until(() => f.button('保存当前云端页面') && !f.button('保存当前云端页面').disabled, 'cloud page saved');
  f.click(f.doc.querySelector('[role="dialog"] [aria-label="关闭"]')); f.rename('会话变化期间的修改');
  f.state.user = null;
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'signed-out-in-another-tab' }));
  await until(() => f.doc.querySelector('.more-actions-button')?.title === '更多操作', 'session change visible');
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.name === '会话变化期间的修改', 'latest work retained in browser');
  assert.equal(f.state.writes.length, 0, 'the old cloud autosave is cancelled before its debounce commits');
  assert.equal(f.name().value, '会话变化期间的修改');
  assert.deepEqual(f.errors, []);
});

test('account appearance restores from cloud without overwriting the guest preference on sign-out', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'account ready');
  await f.openMore();
  f.click(f.doc.querySelector('[aria-label="切换工作台深色主题"]'));
  await until(() => f.state.preferences.studioTheme === 'dark', 'theme persisted to account');
  assert.equal(f.win.localStorage.getItem('animate-studio:appearance'), null, 'account choices do not overwrite guest settings');
  f.win.unmount(); f.win.eval(bundle.outputFiles[0].text);
  await until(() => f.doc.documentElement.dataset.studioTheme === 'dark', 'account theme restored after reload');
  f.state.user = null;
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'signed-out' }));
  await until(() => f.doc.documentElement.dataset.studioTheme === 'light', 'guest theme restored');
  assert.equal(f.state.preferences.studioTheme, 'dark');
  assert.equal(f.state.preferenceWrites.length, 1, 'restoration must not produce an unintended cloud write');
  assert.deepEqual(f.errors, []);
});

test('refreshing an editor URL restores the active private cloud page after session resolution', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'account ready');
  await f.openAccountPages();
  await until(() => f.button('保存当前页面到云端'), 'manager ready'); f.click(f.button('保存当前页面到云端'));
  await until(() => f.button('保存当前云端页面') && !f.button('保存当前云端页面').disabled, 'page saved');
  f.click(f.doc.querySelector('[role="dialog"] [aria-label="关闭"]')); f.rename('刷新后继续编辑');
  await until(() => f.state.pages.get('new-page').page.name === '刷新后继续编辑', 'edited cloud content persisted');
  assert.equal(new URL(f.win.location.href).searchParams.get('page'), 'new-page');
  f.win.unmount(); f.win.eval(bundle.outputFiles[0].text);
  await until(() => f.name()?.value === '刷新后继续编辑' && f.doc.querySelector('.save-status')?.textContent.includes('云端'), 'same cloud page restored');
  assert.equal(f.state.pages.size, 2, 'restoration does not create duplicate pages');
  assert.deepEqual(f.errors, []);
});

test('starting a new browser draft preserves the existing undo behavior', async t => {
  const f = fixture(t); await until(() => f.name(), 'guest editor ready');
  f.win.perform(() => f.doc.querySelector('[aria-label="页面操作"]').dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelector('[role="menuitem"]'), 'new page menu ready');
  f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('空白页面')));
  await until(() => f.name()?.value && f.name().value !== '浏览器草稿', 'new draft visible');
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => f.name().value === '浏览器草稿', 'previous draft restored');
  assert.deepEqual(f.errors, []);
});

test('language changes translate the editor and dialogs without changing the page or undo history', async t => {
  const f = fixture(t);
  await until(() => f.name() && f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'editor ready');
  f.rename('用户作品 Button 中文');
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.name === '用户作品 Button 中文', 'draft saved');
  const draft = f.win.localStorage.getItem('animate-studio:guest-draft:v1');
  const choose = f.chooseLanguage;
  await choose('en');
  assert.equal(f.doc.documentElement.lang, 'en');
  assert.equal(f.win.localStorage.getItem('animate-studio:locale'), 'en');
  assert.ok(f.button('Preview page'));
  assert.ok(f.doc.querySelector('[aria-label="Page name"]'));
  assert.equal(f.doc.querySelector('[aria-label="Page name"]').value, '用户作品 Button 中文');
  assert.equal(f.win.localStorage.getItem('animate-studio:guest-draft:v1'), draft);
  f.click(f.button('Forms'));
  assert.ok(f.doc.querySelector('[data-component="input"]'));
  assert.equal(f.doc.querySelector('[data-component="hero"]'), null);
  await choose('zh-CN');
  assert.ok(f.button('表单').classList.contains('active'), 'category uses a stable identity');
  assert.equal(f.doc.querySelector('[data-component="hero"]'), null);
  await choose('en');
  f.click(f.doc.querySelector('[aria-label="Data & scripts"]'));
  await until(() => f.doc.querySelector('[aria-label="New variable name"]'), 'English interaction dialog');
  assert.ok(f.button('Add'));
  f.click(f.doc.querySelector('[aria-label="Close interaction studio"]'));
  await until(() => !f.doc.querySelector('[role="dialog"]'), 'dialog closed');
  await f.openAccountPages();
  await until(() => f.button('Save current page to cloud'), 'English account dialog');
  f.click(f.doc.querySelector('[role="dialog"] [aria-label="Close"]'));
  await until(() => !f.doc.querySelector('[role="dialog"]'), 'account dialog closed');
  f.click(f.doc.querySelector('[aria-label="Undo (⌘Z)"]'));
  assert.equal(f.doc.querySelector('[aria-label="Page name"]').value, '浏览器草稿', 'language changes did not add undo entries');
  assert.equal(f.state.writes.length, 0);
  assert.equal(f.state.preferenceWrites.length, 0, 'language is a browser preference');
});

test('language persists across reload and synchronizes across tabs without reloading the document', async t => {
  const f = fixture(t);
  await until(() => f.name(), 'editor ready');
  await f.chooseLanguage('en');
  f.win.unmount(); f.win.eval(bundle.outputFiles[0].text);
  await until(() => f.doc.querySelector('[aria-label="Page name"]'), 'English restored on reload');
  const input = f.doc.querySelector('[aria-label="Page name"]');
  f.win.localStorage.setItem('animate-studio:locale', 'zh-CN');
  f.win.perform(() => f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:locale', newValue: 'zh-CN' })));
  assert.equal(f.doc.documentElement.lang, 'zh-CN');
  assert.equal(f.doc.querySelector('[aria-label="页面名称"]'), input, 'switch does not remount the editor');
});

test('English component editing translates inspector labels and preserves authored content when switching back', async t => {
  const f = fixture(t); await until(() => f.name(), 'editor ready');
  await f.chooseLanguage('en');
  f.click(f.doc.querySelector('[data-component="button"]'));
  await until(() => f.doc.querySelector('input[aria-label="Label"]'), 'English inspector');
  assert.ok(f.doc.querySelector('[aria-label="Reset component properties"]'));
  const input = f.doc.querySelector('input[aria-label="Label"]');
  f.win.perform(() => {
    Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(input, '中文 Save');
    input.dispatchEvent(new f.win.Event('input', { bubbles: true }));
  });
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.blocks[0]?.props.label === '中文 Save', 'authored text saved');
  const draft = f.win.localStorage.getItem('animate-studio:guest-draft:v1');
  await f.chooseLanguage('zh-CN');
  assert.equal(f.doc.querySelector('input[aria-label="标签文字"]'), input);
  assert.equal(input.value, '中文 Save');
  assert.equal(f.win.localStorage.getItem('animate-studio:guest-draft:v1'), draft);
  assert.equal(f.doc.title, 'Animate Studio · 页面编辑器');
});

test('compact header keeps page actions reachable and guest sharing opens sign-in with focus restored', async t => {
  const f = fixture(t); await until(() => f.name(), 'editor ready');
  assert.equal(f.doc.querySelectorAll('.header-actions button').length, 5, 'undo, redo, page, preview and more are the only top-level actions');
  const pageTrigger = f.doc.querySelector('[aria-label="页面操作"]');
  f.win.perform(() => pageTrigger.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelector('.page-actions-menu'), 'page menu ready');
  const items = [...f.doc.querySelectorAll('.page-actions-menu [role="menuitem"]')];
  for (const label of ['空白页面', '从灵感模板开始', '组件联动示例', '导出 HTML', '导出 Vue', '导出 React', '导出页面 JSON', '导入页面 JSON']) assert.ok(items.some(item => item.textContent === label), label);
  let openedImport = 0;
  f.doc.querySelector('input[type="file"]').click = () => { openedImport++; };
  f.click(items.find(item => item.textContent === '导入页面 JSON'));
  await until(() => !f.doc.querySelector('.page-actions-menu'), 'page menu dismissed');
  assert.equal(openedImport, 1);

  f.state.user = null;
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'signed-out' }));
  await until(() => f.doc.querySelector('.more-actions-button').title === '更多操作', 'guest session ready');
  const moreTrigger = await f.openMore();
  f.click(f.doc.querySelector('[aria-label="分享页面"]'));
  await until(() => f.doc.querySelector('#login-email'), 'guest sharing opens real sign-in dialog');
  assert.equal(f.doc.querySelector('.workbench-more-menu'), null);
  assert.ok(f.doc.querySelector('.account-dialog').contains(f.doc.activeElement), 'focus moves into sign-in');
  f.click(f.doc.querySelector('.account-dialog [aria-label="关闭"]'));
  await until(() => !f.doc.querySelector('.account-dialog'), 'sign-in dismissed');
  await until(() => f.doc.activeElement === moreTrigger, 'focus returns to the persistent header trigger');
});
