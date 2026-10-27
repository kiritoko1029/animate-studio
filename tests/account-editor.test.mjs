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
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
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
    if (path === '/api/account/preferences') { if (body) { state.preferences = { ...state.preferences, ...body }; state.preferenceWrites.push(body); } return Response.json(state.preferences); }
    if (path === '/api/account/sites' && method === 'POST') { const value = record('new-page', body.site); state.pages.set(value.id, value); return Response.json(value); }
    const siteMatch = path.match(/^\/api\/account\/sites\/([^/]+)$/);
    if (siteMatch) {
      const id = siteMatch[1];
      if (method === 'PUT') {
        state.writes.push({ id, page: body.site });
        if (state.failWrites) return Response.json({ error: '模拟保存失败' }, { status: 500 });
        if (body.expectedRevision !== state.pages.get(id)?.savedAt) return Response.json({ error: '修订冲突' }, { status: 409 });
        state.pages.set(id, record(id, body.site));
      }
      return Response.json(state.pages.get(id));
    }
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
  assert.equal(f.state.pages.get('new-page').page.pages?.[0]?.page.name, '云端新名称');
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
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.pages?.[0]?.page.name === '会话变化期间的修改', 'latest work retained in browser');
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
  await until(() => f.state.pages.get('new-page').page.pages?.[0]?.page.name === '刷新后继续编辑', 'edited cloud content persisted');
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
  await until(() => f.name()?.value === '浏览器草稿', 'previous draft restored');
  assert.deepEqual(f.errors, []);
});

test('language changes translate the editor and dialogs without changing the page or undo history', async t => {
  const f = fixture(t);
  await until(() => f.name() && f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'editor ready');
  f.rename('用户作品 Button 中文');
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.pages?.[0]?.page.name === '用户作品 Button 中文', 'draft saved');
  const draft = f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1');
  const choose = f.chooseLanguage;
  await choose('en');
  assert.equal(f.doc.documentElement.lang, 'en');
  assert.equal(f.win.localStorage.getItem('animate-studio:locale'), 'en');
  assert.ok(f.button('Preview page'));
  assert.ok(f.doc.querySelector('[aria-label="Page name"]'));
  assert.equal(f.doc.querySelector('[aria-label="Page name"]').value, '用户作品 Button 中文');
  assert.equal(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1'), draft);
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
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.pages?.[0]?.page.blocks[0]?.props.label === '中文 Save', 'authored text saved');
  const draft = f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1');
  await f.chooseLanguage('zh-CN');
  assert.equal(f.doc.querySelector('input[aria-label="标签文字"]'), input);
  assert.equal(input.value, '中文 Save');
  assert.equal(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1'), draft);
  assert.equal(f.doc.title, 'Animate Studio · 页面编辑器');
});

test('compact header keeps page actions reachable and guest sharing opens sign-in with focus restored', async t => {
  const f = fixture(t); await until(() => f.name(), 'editor ready');
  assert.equal(f.doc.querySelectorAll('.header-actions button').length, 5, 'undo, redo, page, preview and more are the only top-level actions');
  const pageTrigger = f.doc.querySelector('[aria-label="页面操作"]');
  f.win.perform(() => pageTrigger.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelector('.page-actions-menu'), 'page menu ready');
  const items = [...f.doc.querySelectorAll('.page-actions-menu [role="menuitem"]')];
  for (const label of ['空白页面', '从任务或模板开始…', '组件联动示例', '导出 HTML', '导出 Vue', '导出 React', '导出页面 JSON', '导入页面 JSON']) assert.ok(items.some(item => item.textContent === label), label);
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

test('task templates create editable drafts and the AI entry only opens the assistant', async t => {
  const f = fixture(t); await until(() => f.name(), 'editor ready');
  let modelRequests = 0;
  const fetch = f.win.fetch;
  f.win.fetch = (url, options) => { if (!String(url).startsWith('/api/')) modelRequests++; return fetch(url, options); };
  const openCreation = async () => {
    f.win.perform(() => f.doc.querySelector('[aria-label="页面操作"]').dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    await until(() => f.doc.querySelector('.page-actions-menu'), 'page menu ready');
    f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === '从任务或模板开始…'));
    await until(() => f.doc.querySelector('.page-creation-dialog'), 'task dialog ready');
  };
  await openCreation();
  assert.equal(f.doc.querySelectorAll('.page-creation-task').length, 3);
  f.click(f.doc.querySelector('.page-creation-task--dashboard'));
  await until(() => f.name()?.value === '运营数据概览 · 示例', 'dashboard draft created');
  await until(() => !f.doc.querySelector('.page-creation-dialog'), 'dialog closes after successful creation');
  assert.equal(f.doc.querySelectorAll('.free-canvas-frame').length, 10);
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => f.name()?.value === '浏览器草稿', 'template creation preserves draft undo');
  await openCreation();
  f.click(f.doc.querySelector('.page-creation-ai'));
  await until(() => f.doc.querySelector('.ai-chat textarea[aria-label="向 AI 描述页面"]'), 'existing page assistant opens');
  assert.equal(f.doc.querySelector('.page-creation-dialog'), null);
  assert.equal(f.name().value, '浏览器草稿', 'opening AI does not replace the current page');
  assert.equal(modelRequests, 0, 'opening AI never sends a model request');
});

test('inspector search reveals advanced settings in Chinese and English without adding an undo step', async t => {
  const f = fixture(t); await until(() => f.name(), 'editor ready');
  f.click(f.doc.querySelector('[data-component="button"]'));
  await until(() => f.doc.querySelector('input[aria-label="标签文字"]'), 'button inspector ready');
  const disclosure = f.doc.querySelector('.component-scale-controls').closest('details[data-inspector-advanced]');
  assert.equal(disclosure.open, false, 'advanced scale starts collapsed');
  const search = f.doc.querySelector('input[aria-label="搜索设置"]');
  f.win.perform(() => {
    Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(search, '整体缩放');
    search.dispatchEvent(new f.win.Event('input', { bubbles: true }));
  });
  await until(() => f.doc.querySelector('.inspector-settings-results'), 'Chinese search results');
  const result = [...f.doc.querySelectorAll('.inspector-settings-results [role="option"]')].find(item => item.textContent.includes('组件整体缩放百分比'));
  assert.ok(result, 'hidden scale field is searchable');
  f.click(result);
  assert.equal(disclosure.open, true, 'search opens the advanced disclosure');
  assert.equal(f.doc.activeElement.getAttribute('aria-label'), '组件整体缩放百分比');
  await f.chooseLanguage('en');
  const englishSearch = f.doc.querySelector('input[aria-label="Search settings"]');
  f.win.perform(() => {
    Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(englishSearch, 'Scale');
    englishSearch.dispatchEvent(new f.win.Event('input', { bubbles: true }));
  });
  await until(() => f.doc.querySelector('.inspector-settings-results'), 'English search results');
  assert.ok([...f.doc.querySelectorAll('.inspector-settings-results [role="option"]')].some(item => item.textContent.includes('Component scale')));
  f.click(f.doc.querySelector('[aria-label="Undo (⌘Z)"]'));
  await until(() => !f.doc.querySelector('.free-canvas-frame'), 'searching adds no intermediate undo step');
});

test('guest disclosure choices survive reload while search stays temporary and outside page history', async t => {
  const f = fixture(t);
  await until(() => f.name(), 'editor ready');
  f.state.user = null;
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'signed-out' }));
  await until(() => f.doc.querySelector('.more-actions-button')?.title === '更多操作', 'guest session ready');
  f.click(f.doc.querySelector('[data-component="hero"]'));
  const group = id => f.doc.querySelector(`[data-inspector-disclosure="${id}"]`);
  await until(() => group('component:hero:advanced') && f.doc.querySelector('.save-status.saved'), 'component added and initial draft saved');
  const draft = f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1');
  f.click(group('component:hero:advanced').querySelector('summary'));
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:inspector-disclosures:v1') ?? '{}')['component:hero:advanced'] === true, 'guest disclosure stored');
  assert.equal(group('component:hero:advanced').open, true);
  assert.equal(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1'), draft, 'disclosure choices do not touch the page draft');
  assert.equal(f.state.preferenceWrites.length, 0, 'guest choices never call the account API');

  const search = f.doc.querySelector('input[aria-label="搜索设置"]');
  f.win.perform(() => {
    Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(search, '附加动效');
    search.dispatchEvent(new f.win.Event('input', { bubbles: true }));
  });
  await until(() => f.doc.querySelector('.inspector-settings-results'), 'search results ready');
  f.click([...f.doc.querySelectorAll('.inspector-settings-results [role="option"]')].find(item => item.querySelector('strong')?.textContent === '附加动效'));
  assert.equal(group('component:hero:effect').open, true);
  assert.deepEqual(JSON.parse(f.win.localStorage.getItem('animate-studio:inspector-disclosures:v1')), { 'component:hero:advanced': true }, 'search reveal is not persisted');
  assert.equal(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1'), draft);
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => !f.doc.querySelector('.free-canvas-frame'), 'one undo removes the component without a preference history step');
  f.click(f.doc.querySelector('[aria-label="重做 (⌘⇧Z)"]'));
  await until(() => f.doc.querySelector('.free-canvas-frame') && JSON.parse(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.pages?.[0]?.page.blocks.length === 1, 'component restored and saved before reload');

  f.win.unmount(); f.win.eval(bundle.outputFiles[0].text);
  await until(() => group('component:hero:advanced')?.open === true, 'saved group restored after reload');
  assert.equal(group('component:hero:effect').open, false, 'temporary search reveal is not restored');
  assert.equal(f.state.preferenceWrites.length, 0);
});

test('account disclosures merge with appearance and guest choices remain isolated on sign-out', async t => {
  const f = fixture(t);
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'first account ready');
  f.click(f.doc.querySelector('[data-component="hero"]'));
  const group = id => f.doc.querySelector(`[data-inspector-disclosure="${id}"]`);
  await until(() => group('component:hero:advanced'), 'hero inspector ready');
  const originalFetch = f.win.fetch, preferenceReads = [];
  f.win.fetch = async (url, options = {}) => {
    const response = await originalFetch(url, options);
    if (String(url) === '/api/account/preferences' && (!options.method || options.method === 'GET')) preferenceReads.push(await response.clone().json());
    return response;
  };
  f.state.preferences = { version: 1, studioTheme: 'light', inspectorDisclosures: { 'component:hero:advanced': true, 'motion:countingNumber:CountingNumber': false } };
  f.state.user = { id: 'second', email: 'second@studio.test', name: 'Second' };
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'second-account' }));
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：second@studio.test"]'), 'second account session ready');
  await until(() => preferenceReads.some(value => value.inspectorDisclosures?.['component:hero:advanced'] === true), 'second account preference response received');
  assert.ok(group('component:hero:advanced'), 'selected component inspector remains mounted after account switch');
  await until(() => group('component:hero:advanced')?.open === true, 'second account preferences restored');

  f.win.localStorage.setItem('animate-studio:inspector-disclosures:v1', JSON.stringify({ 'component:hero:advanced': false, 'component:hero:effect': true }));
  f.click(group('component:hero:advanced').querySelector('summary'));
  await until(() => f.state.preferences.inspectorDisclosures['component:hero:advanced'] === false, 'closed state saved to second account');
  assert.equal(f.state.preferenceWrites.length, 1);
  assert.equal(Object.hasOwn(f.state.preferenceWrites[0], 'studioTheme'), false);
  assert.equal(f.state.preferences.inspectorDisclosures['motion:countingNumber:CountingNumber'], false);
  assert.deepEqual(JSON.parse(f.win.localStorage.getItem('animate-studio:inspector-disclosures:v1')), { 'component:hero:advanced': false, 'component:hero:effect': true }, 'account writes do not overwrite guest preferences');

  await f.openMore();
  f.click(f.doc.querySelector('[aria-label="切换工作台深色主题"]'));
  await until(() => f.state.preferences.studioTheme === 'dark', 'appearance saved');
  assert.equal(f.state.preferences.inspectorDisclosures['component:hero:advanced'], false, 'appearance patch preserves disclosure fields');
  assert.equal(Object.hasOwn(f.state.preferenceWrites[1], 'inspectorDisclosures'), false);
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page.pages?.[0]?.page.blocks.some(block => block.type === 'hero'), 'component draft saved before reload');
  f.win.unmount(); f.win.eval(bundle.outputFiles[0].text);
  await until(() => f.doc.documentElement.dataset.studioTheme === 'dark' && group('component:hero:advanced'), 'account editor restored');
  assert.equal(group('component:hero:advanced').open, false);
  assert.equal(f.state.preferenceWrites.length, 2, 'account restoration does not write');

  f.state.user = null;
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'signed-out' }));
  await until(() => group('component:hero:effect')?.open === true, 'guest disclosure restored after sign-out');
  assert.equal(group('component:hero:advanced').open, false);
  assert.equal(f.doc.documentElement.dataset.studioTheme, 'light');
  assert.equal(f.state.preferenceWrites.length, 2, 'guest restoration never writes to the old account');
});

test('site page tree and shared layout apply as one undoable workspace operation', async t => {
  const f = fixture(t); await until(() => f.name(), 'editor ready');
  const set = (element, value) => f.win.perform(() => {
    const prototype = element.tagName === 'SELECT' ? f.win.HTMLSelectElement : element.tagName === 'TEXTAREA' ? f.win.HTMLTextAreaElement : f.win.HTMLInputElement;
    Object.getOwnPropertyDescriptor(prototype.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new f.win.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  const openPages = async () => { f.win.perform(() => f.doc.getElementById('sidebar-tab-pages').dispatchEvent(new f.win.MouseEvent('mousedown', { bubbles: true, button: 0 }))); await until(() => f.doc.querySelector('.site-navigator'), 'page tree opens'); };
  const createPage = async (name, path, kind = 'page') => {
    f.click(f.button('新建页面')); await until(() => f.doc.querySelector('.site-page-dialog'), 'page dialog opens');
    set(f.doc.querySelector('.site-page-dialog input'), name);
    if (kind !== 'page') set(f.doc.querySelector('.site-page-dialog select'), kind);
    set([...f.doc.querySelectorAll('.site-page-dialog form > label')].find(label => label.textContent.includes('站内路径')).querySelector('input'), path);
    f.click(f.button('保存页面设置'));
    await until(() => f.name()?.value === name, 'new page active');
  };
  await openPages(); await createPage('产品列表', '/products'); await createPage('产品详情', '/products/:id', 'detail');
  assert.equal(f.doc.querySelectorAll('.site-page-row').length, 3);
  f.click(f.doc.querySelector('[aria-label="复制页面产品列表"]'));
  await until(() => f.doc.querySelectorAll('.site-page-row').length === 4, 'page duplicated');
  f.click(f.doc.querySelector('[aria-label="删除页面产品列表 副本"]'));
  f.click(f.button('删除页面并清理链接'));
  await until(() => f.doc.querySelectorAll('.site-page-row').length === 3, 'page deletion confirmed');
  f.click(f.button('共享页头'));
  await until(() => f.name()?.value === '共享页头', 'shared header editor active');
  f.win.perform(() => f.doc.getElementById('sidebar-tab-components').dispatchEvent(new f.win.MouseEvent('mousedown', { bubbles: true, button: 0 })));
  f.click(f.doc.querySelector('[data-component="navbar"]'));
  await until(() => f.doc.querySelector('.free-canvas-frame'), 'navbar added to shared header');
  await openPages(); f.click(f.doc.querySelector('[aria-label="设置共享页头应用范围"]'));
  for (const checkbox of f.doc.querySelectorAll('.site-scope-option input')) f.click(checkbox);
  f.click(f.button('确认应用范围'));
  f.click(f.doc.querySelector('[aria-label="预览页面"]'));
  await until(() => f.doc.querySelector('.full-preview [data-block-id^="header-"]'), 'shared header composed in preview');
  f.click(f.button('返回编辑'));
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  f.click(f.doc.querySelector('[aria-label="预览页面"]'));
  await until(() => f.doc.querySelector('.full-preview'), 'preview reopened after undo');
  assert.equal(f.doc.querySelector('.full-preview [data-block-id^="header-"]'), null, 'one undo removes the whole layout scope change');
  f.click(f.button('返回编辑'));
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => !f.doc.querySelector('.free-canvas-frame'), 'layout edit itself remains undoable');
  assert.deepEqual(f.errors, []);
});

test('AI site flow confirms a plan, applies once and restores the whole site with undo', async t => {
  const f = fixture(t); await until(() => f.name(), 'editor ready');
  const original = JSON.parse(f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
  const profile = { baseUrl: 'https://ai.fixture/v1', apiKey: 'fixture-key', model: 'site-test', effort: '', maxOutputTokens: 8192, thinking: 'default', thinkingBudget: 2048, reasoningSummary: true };
  f.win.localStorage.setItem('animate-studio:ai-settings:v1', JSON.stringify({ version: 1, provider: 'openai', profiles: { openai: profile, anthropic: profile } }));
  const plan = { name: '测试官网', summary: '首页、产品列表和动态详情。', sharedLayout: [], deletes: [], pages: [{ id: original.id, name: '首页', path: '/', kind: 'page', layout: [] }, { id: 'products', name: '产品列表', path: '/products', kind: 'page', layout: [] }, { id: 'detail', name: '产品详情', path: '/products/:id', kind: 'detail', layout: [] }] };
  const aiPage = (id, name) => ({ version: 1, id, name, settings: structuredClone(original.settings), blocks: [{ id: `${id}-title`, type: 'heading', props: { title: calls > 2 ? `${name} · 已更新` : name, fontSize: 32, padding: 20 }, frame: { x: 48, y: 48, width: 1000, height: 130 } }] });
  const originalFetch = f.win.fetch; let calls = 0;
  f.win.fetch = async (url, options) => {
    if (String(url) !== 'https://ai.fixture/v1/responses') return originalFetch(url, options);
    calls++;
    const phase = JSON.parse(JSON.parse(options.body).input[0].content).mode;
    const records = phase === 'site-plan' ? [{ op: 'message', text: '先确认三个页面。' }, { op: 'sitePlan', ...plan }] : [{ op: 'sitePage', id: 'products', page: aiPage('products', '产品列表') }, { op: 'sitePage', id: 'detail', page: aiPage('detail', '产品详情') }, { op: 'done', summary: '整站完成' }];
    const text = records.map((record, index) => JSON.stringify({ v: 1, seq: index + 1, ...record })).join('\n') + '\n';
    const events = [{ type: 'response.output_text.delta', delta: text }, { type: 'response.completed', response: { usage: { input_tokens: 20, output_tokens: 30 } } }];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  f.win.perform(() => f.doc.querySelector('[aria-label="页面操作"]').dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelector('.page-actions-menu'), 'page menu opens');
  f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === '从任务或模板开始…'));
  await until(() => f.doc.querySelector('.page-creation-site-ai'), 'site AI entry visible'); f.click(f.doc.querySelector('.page-creation-site-ai'));
  await until(() => f.doc.querySelector('textarea[aria-label="描述你想创建的站点"]'), 'site assistant opens');
  const input = f.doc.querySelector('textarea[aria-label="描述你想创建的站点"]');
  f.win.perform(() => { Object.getOwnPropertyDescriptor(f.win.HTMLTextAreaElement.prototype, 'value').set.call(input, '创建一个产品官网'); input.dispatchEvent(new f.win.Event('input', { bubbles: true })); });
  f.click(f.button('规划站点'));
  await until(() => f.doc.querySelector('.ai-site-plan'), 'structure plan requires confirmation');
  assert.equal(calls, 1); assert.equal(f.name().value, '浏览器草稿', 'planning does not modify the current page');
  f.click(f.button('确认计划，生成整站'));
  await until(() => f.doc.querySelector('.ai-site-complete'), 'site applied after all pages complete');
  assert.equal(calls, 2); assert.equal(f.name().value, '首页');
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? '{}').page?.pages?.length === 3, 'whole site autosaved');
  f.click(f.doc.querySelector('[aria-label="关闭整站创作"]'));
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => f.name()?.value === '浏览器草稿', 'single undo restores the old site');
  await until(() => JSON.parse(f.win.localStorage.getItem('animate-studio:guest-site-draft:v1') ?? '{}').page?.pages?.length === 1, 'undo autosaves the restored site');
  f.click(f.doc.querySelector('[aria-label="重做 (⌘⇧Z)"]'));
  await until(() => f.name()?.value === '首页', 'redo reapplies the complete site');

  await f.openAccountPages(); f.click(f.button('保存当前页面到云端'));
  await until(() => f.button('保存当前云端页面') && !f.button('保存当前云端页面').disabled, 'site saved to cloud');
  f.click(f.doc.querySelector('[role="dialog"] [aria-label="关闭"]'));
  f.click(f.doc.querySelector('[aria-label="打开 AI 页面助手"]'));
  await until(() => f.button('创建整站'), 'site mode in the existing assistant'); f.click(f.button('创建整站'));
  await until(() => f.doc.querySelector('textarea[aria-label="描述你想创建的站点"]'), 'cloud site assistant ready');
  const cloudInput = f.doc.querySelector('textarea[aria-label="描述你想创建的站点"]');
  f.win.perform(() => { Object.getOwnPropertyDescriptor(f.win.HTMLTextAreaElement.prototype, 'value').set.call(cloudInput, '更新整个站点'); cloudInput.dispatchEvent(new f.win.Event('input', { bubbles: true })); });
  f.click(f.button('规划站点')); await until(() => f.doc.querySelector('.ai-site-plan'), 'cloud plan ready');
  f.click(f.button('确认计划，生成整站')); await until(() => f.doc.querySelector('.ai-site-complete'), 'cloud site result applied');
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(f.state.writes.length, 0, 'AI does not write the cloud site automatically');
  assert.ok(f.doc.querySelector('.save-status.pending'), 'cloud draft is explicitly pending save');
  f.click(f.doc.querySelector('[aria-label="关闭整站创作"]'));
  await f.openAccountPages(); f.click(f.button('保存当前云端页面'));
  await until(() => f.state.writes.length === 1, 'explicit save persists the cloud site');
  assert.equal(f.state.pages.get('new-page').page.pages.length, 3);
  assert.deepEqual(f.errors, []);
});

test('queued disclosure writes preserve the latest click order', async t => {
  const f = fixture(t);
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'account ready');
  f.click(f.doc.querySelector('[data-component="hero"]'));
  const group = () => f.doc.querySelector('[data-inspector-disclosure="component:hero:advanced"]');
  await until(() => group(), 'hero inspector ready');
  const originalFetch = f.win.fetch, calls = [];
  let releaseFirst;
  t.after(() => releaseFirst?.());
  f.win.fetch = (url, options = {}) => {
    if (String(url) === '/api/account/preferences' && options.method === 'PATCH') {
      const body = JSON.parse(options.body); calls.push(body);
      if (calls.length === 1) return new Promise(resolve => {
        releaseFirst = () => { f.state.preferences = { ...f.state.preferences, ...body }; resolve(Response.json(f.state.preferences)); };
      });
      f.state.preferences = { ...f.state.preferences, ...body };
      return Promise.resolve(Response.json(f.state.preferences));
    }
    return originalFetch(url, options);
  };
  f.click(group().querySelector('summary'));
  await until(() => calls.length === 1, 'first preference request started');
  f.click(group().querySelector('summary'));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length, 1, 'second write waits for the first request');
  releaseFirst();
  await until(() => calls.length === 2 && f.state.preferences.inspectorDisclosures['component:hero:advanced'] === false, 'latest closed state persisted last');
  assert.equal(calls[0].inspectorDisclosures['component:hero:advanced'], true);
  assert.equal(calls[1].inspectorDisclosures['component:hero:advanced'], false);
  assert.equal(group().open, false);
});

test('a late preference response from an old account cannot replace guest state', async t => {
  const f = fixture(t);
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'first account ready');
  f.click(f.doc.querySelector('[data-component="hero"]'));
  const group = () => f.doc.querySelector('[data-inspector-disclosure="component:hero:advanced"]');
  await until(() => group(), 'hero inspector ready');
  f.win.localStorage.setItem('animate-studio:inspector-disclosures:v1', JSON.stringify({ 'component:hero:advanced': true }));
  const originalFetch = f.win.fetch;
  let release, requestSignal;
  t.after(() => release?.());
  f.win.fetch = (url, options = {}) => {
    if (String(url) === '/api/account/preferences' && (!options.method || options.method === 'GET')) {
      requestSignal = options.signal;
      return new Promise(resolve => { release = () => resolve(Response.json({ version: 1, studioTheme: 'dark', inspectorDisclosures: { 'component:hero:advanced': false } })); });
    }
    return originalFetch(url, options);
  };
  f.state.user = { id: 'stale', email: 'stale@studio.test', name: 'Stale' };
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'stale-account' }));
  await until(() => typeof release === 'function', 'old account preference request started');
  f.state.user = null;
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'signed-out' }));
  await until(() => f.doc.querySelector('.more-actions-button')?.title === '更多操作' && group()?.open === true, 'guest preferences restored');
  assert.equal(requestSignal.aborted, true, 'old account request is aborted');
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(group().open, true, 'late response cannot close the guest group');
  assert.equal(f.doc.documentElement.dataset.studioTheme, 'light', 'late response cannot replace guest appearance');
  assert.equal(f.state.preferenceWrites.length, 0);
});

test('failed account preference reads cannot carry the previous account disclosures forward', async t => {
  const f = fixture(t);
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'first account ready');
  f.click(f.doc.querySelector('[data-component="hero"]'));
  const group = () => f.doc.querySelector('[data-inspector-disclosure="component:hero:advanced"]');
  await until(() => group(), 'hero inspector ready');
  f.click(group().querySelector('summary'));
  await until(() => f.state.preferences.inspectorDisclosures?.['component:hero:advanced'] === true, 'first account preference saved');
  assert.equal(group().open, true);
  const originalFetch = f.win.fetch;
  let failedReads = 0;
  f.win.fetch = (url, options = {}) => {
    if (String(url) === '/api/account/preferences' && (!options.method || options.method === 'GET')) {
      failedReads++;
      return Promise.resolve(Response.json({ error: '模拟偏好读取失败' }, { status: 500 }));
    }
    return originalFetch(url, options);
  };
  f.state.user = { id: 'second', email: 'second@studio.test', name: 'Second' };
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:account-change', newValue: 'second-account' }));
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：second@studio.test"]') && failedReads > 0, 'second account preference read failed');
  await until(() => group()?.open === false, 'previous account disclosure is cleared while preferences are unavailable');
  assert.equal(f.state.preferenceWrites.length, 1, 'failed restoration does not write to either account');
  assert.equal(f.state.preferences.inspectorDisclosures['component:hero:advanced'], true, 'first account stored preference remains intact');
});
