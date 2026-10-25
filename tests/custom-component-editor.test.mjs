import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument } from '../src/model.ts';
import { componentTemplates } from '../src/lib/custom-components/templates.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

/**
 * Editor flows for custom components, rendered with the real App bundle in
 * JSDOM. JSDOM does not load srcdoc documents, so frame execution is covered
 * by tests/custom-components.test.mjs and the browser check; here frames are
 * asserted structurally and their host messages are simulated from the
 * frame's real contentWindow.
 */
const bundle = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {EditorView} from 'codemirror';import App from './src/App';import {AccountProvider} from './src/components/AccountProvider';import {MotionConfig} from 'motion/react';import {AnimateUIProvider} from '@animate-ui/react/provider';window.CodeMirrorView=EditorView;const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><AccountProvider><App/></AccountProvider></AnimateUIProvider></MotionConfig>));`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, external: ['shiki', 'virtual:animate-studio-native-export'],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_STUDIO_CLOUD': 'false' }, logLevel: 'silent',
  plugins: [{ name: 'raw', setup(build) { build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' })); build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) })); } }],
});

async function until(predicate, description, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) assert.fail(description); await new Promise(resolve => setTimeout(resolve, 10)); }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture(t, { user = null, storage = {}, components = [], folders = [] } = {}) {
  const errors = [], console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  console.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  t.after(() => assert.deepEqual(errors, [], 'no uncaught browser errors'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://studio.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console });
  const win = dom.window;
  t.after(() => { win.unmount?.(); win.close(); });
  installMatchMedia(win, { reducedMotion: true });
  installWebAnimations(win);
  // Keep JSDOM's own AbortController: motion's gestures pass its signal to JSDOM listeners.
  Object.assign(win, { Headers, Response, structuredClone });
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {};
  // Selecting a component scrolls the inspector to the top; JSDOM has no scrolling.
  win.Element.prototype.scrollTo = () => {};
  // CodeMirror measures text; JSDOM has no layout.
  win.Range.prototype.getClientRects = () => [];
  win.Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });
  const guest = createDocument(true); guest.name = '组件测试页面';
  win.localStorage.setItem('animate-studio:guest-draft:v1', JSON.stringify({ page: guest, savedAt: '2026-10-23T00:00:00Z' }));
  for (const [key, value] of Object.entries(storage)) win.localStorage.setItem(key, value);
  const state = { user, components: new Map(components.map(item => [item.id, item])), folders: new Map(folders.map(item => [item.id, item])), requests: [], shares: new Map() };
  const summary = ({ component: _c, ...item }) => item;
  win.fetch = async (url, options = {}) => {
    const path = String(url), method = options.method ?? 'GET', body = options.body ? JSON.parse(options.body) : null;
    state.requests.push({ method, path, body });
    if (path === '/api/auth/get-session') return Response.json(state.user ? { user: state.user } : null);
    if (path === '/api/account/config') return Response.json({ cloudEnabled: true, emailEnabled: true, githubEnabled: false });
    if (path === '/api/account/preferences') return Response.json({ version: 1, studioTheme: 'light' });
    if (!state.user && path.startsWith('/api/account/')) return Response.json({ error: '请先登录' }, { status: 401 });
    if (path === '/api/account/component-folders') {
      if (method === 'POST') {
        const now = new Date().toISOString(), folder = { id: crypto.randomUUID(), name: body.name.trim(), createdAt: now, updatedAt: now };
        state.folders.set(folder.id, folder); return Response.json(folder, { status: 201 });
      }
      return Response.json({ folders: [...state.folders.values()] });
    }
    const folderMatch = path.match(/^\/api\/account\/component-folders\/([^/]+)$/);
    if (folderMatch) {
      const folder = state.folders.get(folderMatch[1]);
      if (!folder) return Response.json({ error: '未找到该文件夹。' }, { status: 404 });
      if (method === 'DELETE') { state.folders.delete(folder.id); for (const item of state.components.values()) if (item.folderId === folder.id) item.folderId = null; return new Response(null, { status: 204 }); }
      Object.assign(folder, { name: body.name.trim(), updatedAt: new Date().toISOString() }); return Response.json(folder);
    }
    if (path === '/api/account/components') {
      if (method === 'POST') {
        const now = new Date().toISOString();
        const record = { id: crypto.randomUUID(), name: body.component.name, description: body.component.description ?? '', revision: 1, createdAt: now, updatedAt: now, folderId: body.folderId ?? null, shareToken: null, publishedAt: null, sharedRevision: null, component: body.component };
        state.components.set(record.id, record);
        return Response.json(record, { status: 201 });
      }
      return Response.json({ components: [...state.components.values()].map(summary) });
    }
    const moveMatch = path.match(/^\/api\/account\/components\/([^/]+)\/folder$/);
    if (moveMatch) {
      const record = state.components.get(moveMatch[1]);
      if (!record || body.folderId && !state.folders.has(body.folderId)) return Response.json({ error: '未找到该组件或文件夹。' }, { status: 404 });
      record.folderId = body.folderId; return Response.json(record);
    }
    const share = path.match(/^\/api\/account\/components\/([^/]+)\/share$/);
    if (share) {
      const record = state.components.get(share[1]);
      if (method === 'DELETE') { Object.assign(record, { shareToken: null, publishedAt: null, sharedRevision: null }); return new Response(null, { status: 204 }); }
      Object.assign(record, { shareToken: record.shareToken ?? 'sharetoken0123456789', publishedAt: new Date().toISOString(), sharedRevision: record.revision });
      return Response.json({ token: record.shareToken, publishedAt: record.publishedAt, revision: record.revision });
    }
    const one = path.match(/^\/api\/account\/components\/([^/]+)$/);
    if (one) {
      const record = state.components.get(one[1]);
      if (!record) return Response.json({ error: '未找到该组件。' }, { status: 404 });
      if (method === 'PUT') {
        if (state.beforeComponentSave) await state.beforeComponentSave();
        if (body.baseRevision !== record.revision) return Response.json({ error: '组件已在其他地方更新', revision: record.revision }, { status: 409 });
        Object.assign(record, { component: body.component, name: body.component.name, revision: record.revision + 1, updatedAt: new Date().toISOString() });
      }
      if (method === 'DELETE') { state.components.delete(one[1]); return new Response(null, { status: 204 }); }
      return Response.json(record);
    }
    return Response.json({ error: '未模拟该接口' }, { status: 404 });
  };
  win.eval(bundle.outputFiles[0].text);
  const doc = win.document;
  const click = element => { assert.ok(element, 'expected a visible action'); win.perform(() => element.click()); };
  const button = (text, root = doc) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  const buttonLike = (text, root = doc) => [...root.querySelectorAll('button')].find(b => b.textContent.includes(text));
  const labelled = label => doc.querySelector(`[aria-label="${label}"]`);
  const type = (element, value) => win.perform(() => {
    const prototype = element instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  const choose = (element, value) => win.perform(() => { element.value = value; element.dispatchEvent(new win.Event('change', { bubbles: true })); });
  const press = (element, key, options = {}) => win.perform(() => element.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })));
  const openMenu = trigger => { assert.ok(trigger, 'menu trigger'); trigger.focus(); press(trigger, 'Enter'); };
  const text = () => doc.body.textContent;
  const guestPage = () => JSON.parse(win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
  const library = () => JSON.parse(win.localStorage.getItem('animate-studio:custom-components:v1') ?? '{"components":[]}').components;
  const editorFor = panel => win.CodeMirrorView.findFromDOM(doc.querySelector(`[data-panel="${panel}"] .cm-editor`));
  const ready = () => doc.querySelector('input[aria-label="页面名称"]');
  return { win, doc, state, errors, click, button, buttonLike, labelled, type, choose, press, openMenu, text, guestPage, library, editorFor, ready };
}

async function openMyComponents(f) {
  await until(() => f.ready(), 'editor ready');
  f.click(f.button('我的组件'));
  await until(() => f.doc.querySelector('.custom-library'), 'my components panel');
}

test('guests create a component from a template, keep it locally and place an independent copy on the page', async t => {
  const f = fixture(t);
  await until(() => f.ready(), 'editor ready');
  assert.ok(f.buttonLike('用 HTML、CSS、JavaScript 编写自己的组件'), 'the library shows a clear custom component entry');
  await openMyComponents(f);
  assert.match(f.text(), /还没有自己的组件/);
  f.click([...f.doc.querySelectorAll('.custom-template-grid button')].find(b => b.textContent.includes('计数按钮')));
  await until(() => f.labelled('组件名称')?.value === '点赞按钮', 'designer opened with the template');
  const frame = f.doc.querySelector('.ccd-stage-frame iframe');
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  assert.match(frame.getAttribute('srcdoc'), /Content-Security-Policy/);
  assert.match(f.text(), /选择模板或修改代码/, 'progressive steps are shown');
  assert.ok(f.labelled('编写指南'), 'the writing guide is one click away');
  f.click(f.labelled('编写指南'));
  assert.match(f.text(), /编写入口[\s\S]*组件 API[\s\S]*样式作用域[\s\S]*尺寸[\s\S]*保存与分享/);

  f.click(f.button('保存到本机'));
  await until(() => f.library().length === 1, 'saved to the browser library');
  assert.equal(f.library()[0].name, '点赞按钮');
  assert.match(f.doc.querySelector('.ccd-location').textContent, /本机 · v1/);
  await until(() => f.button('添加到页面') && !f.button('添加到页面').disabled, 'save finished');
  f.click(f.button('添加到页面'));
  await until(() => !f.doc.querySelector('.component-designer'), 'designer closes after adding');
  await until(() => f.doc.querySelector('.custom-source-card'), 'instance inspector');
  assert.match(f.text(), /与组件库中的 v1 一致/);
  const canvasFrame = f.doc.querySelector('.free-canvas-block-content .custom-component-frame iframe');
  assert.equal(canvasFrame.getAttribute('sandbox'), 'allow-scripts', 'the canvas renders the same sandboxed frame');
  await until(() => f.guestPage().blocks.some(block => block.type === 'custom'), 'page autosaved');
  const placed = f.guestPage().blocks.find(block => block.type === 'custom');
  assert.equal(placed.props.custom.js, componentTemplates[1].definition.js, 'the page embeds the full definition');
  assert.deepEqual(placed.props.custom.source, { kind: 'local', id: f.library()[0].id, revision: 1 });
  assert.equal(placed.frame.width, 240, 'the default size from the definition is used');

  // Editing the source never changes the placed copy until the user updates it.
  f.click(f.button('编辑源组件'));
  await until(() => f.labelled('组件名称')?.value === '点赞按钮', 'designer opened for the source');
  f.type(f.labelled('组件名称'), '点赞按钮 二代');
  f.click(f.button('保存'));
  await until(() => f.library()[0].revision === 2, 'source saved as v2');
  await until(() => !f.labelled('关闭设计器').closest('.component-designer').querySelector('.ccd-actions .primary-button').disabled, 'save finished');
  f.click(f.labelled('关闭设计器'));
  await until(() => !f.doc.querySelector('.component-designer'), 'designer closed without a prompt after saving');
  await until(() => /组件库中已有 v2，此实例仍是 v1/.test(f.text()), 'inspector reports the newer source');
  assert.equal(f.doc.querySelector('.inspected-component strong').textContent, '点赞按钮');
  f.click(f.button('更新此实例'));
  await until(() => f.doc.querySelector('.inspected-component strong').textContent === '点赞按钮 二代', 'instance updated explicitly');
  await until(() => f.guestPage().blocks.find(block => block.type === 'custom')?.props.custom.source.revision === 2, 'update saved');

  // Deleting the source keeps the page working and offers to recover it.
  f.openMenu(f.labelled('「点赞按钮 二代」的更多操作'));
  await until(() => f.doc.querySelector('[role="menuitem"]'), 'item menu');
  f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('删除')));
  await until(() => f.doc.querySelector('.custom-delete-confirm'), 'delete confirmation');
  assert.match(f.doc.querySelector('.custom-delete-confirm').textContent, /本页已插入的 1 个副本不受影响/);
  f.click(f.button('删除', f.doc.querySelector('.custom-delete-confirm')));
  await until(() => f.library().length === 0, 'source deleted');
  assert.ok(f.doc.querySelector('.free-canvas-block-content .custom-component-frame iframe'), 'the instance still renders');
  f.click(f.doc.querySelector('.free-canvas-frame'));
  await until(() => /源组件已删除/.test(f.text()), 'inspector explains the missing source');
  f.click(f.button('保存为我的组件'));
  await until(() => f.library().length === 1 && f.library()[0].origin === 'page', 'recovered from the page copy');
});

test('unsaved designer work is protected on close and restored after a reload', async t => {
  const f = fixture(t);
  await openMyComponents(f);
  f.click(f.button('新建组件'));
  await until(() => f.labelled('组件名称'), 'designer open');
  f.type(f.labelled('组件名称'), '未保存的组件');
  f.win.perform(() => f.editorFor('css').dispatch({ changes: { from: 0, insert: '/* 改过 */\n' } }));
  await until(() => /未保存/.test(f.doc.querySelector('.ccd-header').textContent), 'dirty marker');
  f.click(f.labelled('关闭设计器'));
  await until(() => /保存对「未保存的组件」的修改/.test(f.text()), 'close asks before discarding');
  f.click(f.button('继续编辑'));
  assert.ok(f.doc.querySelector('.component-designer'), 'continue keeps the designer open');
  await until(() => f.win.localStorage.getItem('animate-studio:custom-component-drafts:v1')?.includes('未保存的组件'), 'draft mirrored to this browser');

  // Simulate a reload: a new window with the same browser storage.
  const storage = Object.fromEntries(Object.entries({ ...f.win.localStorage }).filter(([key]) => key.startsWith('animate-studio:') && key !== 'animate-studio:guest-draft:v1'));
  const g = fixture(t, { storage });
  await openMyComponents(g);
  await until(() => /未保存的修改/.test(g.doc.querySelector('.custom-drafts')?.textContent ?? ''), 'drafts are listed after reload');
  g.click(g.button('继续编辑', g.doc.querySelector('.custom-drafts')));
  await until(() => g.labelled('组件名称')?.value === '未保存的组件', 'draft restored');
  assert.match(g.editorFor('css').state.doc.toString(), /^\/\* 改过 \*\//);
  g.click(g.labelled('关闭设计器'));
  await until(() => g.button('放弃修改'), 'close prompt');
  g.click(g.button('放弃修改'));
  await until(() => !g.doc.querySelector('.component-designer'), 'discarded');
  assert.equal(g.win.localStorage.getItem('animate-studio:custom-component-drafts:v1'), null, 'discarding clears the draft');
  assert.equal(g.library().length, 0, 'nothing was saved without an explicit save');
});

test('signing in never uploads local components; account saves and sharing are explicit', async t => {
  const local = { id: 'local-1', revision: 1, createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', ...componentTemplates[2].definition };
  const guest = fixture(t, { storage: { 'animate-studio:custom-components:v1': JSON.stringify({ version: 1, components: [local] }) } });
  await openMyComponents(guest);
  guest.click([...guest.doc.querySelectorAll('.custom-source-switch button')].find(b => b.textContent.includes('账号')));
  await until(() => /登录后使用账号组件/.test(guest.text()), 'guests see what signing in enables');
  guest.click([...guest.doc.querySelectorAll('.custom-source-switch button')].find(b => b.textContent.includes('本机')));
  guest.click(guest.labelled('编辑「信息卡片」'));
  await until(() => guest.labelled('组件名称'), 'designer');
  guest.click(guest.button('保存到账号'));
  await until(() => /登录后保存到账号与分享/.test(guest.text()), 'account save explains sign-in');
  guest.click(guest.button('登录', guest.doc.querySelector('.ccd-confirm')));
  await until(() => /登录你的创作空间/.test(guest.text()), 'the real sign-in dialog opens');

  const f = fixture(t, { user: { id: 'owner', email: 'owner@studio.test', name: 'Owner' }, storage: { 'animate-studio:custom-components:v1': JSON.stringify({ version: 1, components: [local] }) } });
  await openMyComponents(f);
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：owner@studio.test"]'), 'signed in');
  await pause(100);
  assert.equal(f.state.requests.filter(request => request.path.startsWith('/api/account/components')).length, 0, 'signing in reads and writes no components');
  f.openMenu(f.labelled('「信息卡片」的更多操作'));
  await until(() => f.doc.querySelector('[role="menuitem"]'), 'item menu');
  f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('复制到账号')));
  await until(() => f.state.components.size === 1, 'explicit copy to the account');
  assert.equal(f.library().length, 1, 'the local copy is kept');
  await until(() => f.doc.querySelector('.custom-source-switch button.active')?.textContent.includes('账号'), 'account tab shown');
  await until(() => f.labelled('编辑「信息卡片」'), 'account list');
  f.click(f.labelled('编辑「信息卡片」'));
  await until(() => /账号 · v1/.test(f.doc.querySelector('.ccd-location')?.textContent ?? ''), 'designer opened for the account copy');
  f.click(f.labelled('分享组件'));
  await until(() => f.button('创建分享链接'), 'share dialog');
  f.click(f.button('创建分享链接'));
  await until(() => f.doc.querySelector('#component-share-link')?.value.endsWith('/c/sharetoken0123456789'), 'share link created');
  assert.match(f.text(), /已发布版本 v1/);
  f.click(f.button('关闭分享'));
  await until(() => /这个组件还没有分享/.test(f.text()), 'share closed');
});

test('custom instances relay only valid frame messages to page interactions', async t => {
  const page = createDocument(true); page.name = '联动页面';
  const definition = { ...componentTemplates[2].definition };
  page.variables = [{ name: 'headline', type: 'string', initial: '来自变量的标题' }];
  page.blocks = [{ id: 'custom-a', type: 'custom', props: { custom: { ...definition, source: { kind: 'local', id: 'x', revision: 1 } }, title: definition.fields.title, text: definition.fields.text, label: definition.fields.label }, frame: { x: 40, y: 40, width: 380, height: 220 }, bindings: { title: { kind: 'variable', value: 'headline' } }, events: { click: [{ type: 'notify', expression: '"组件被点击"' }] } }];
  const f = fixture(t, { storage: { 'animate-studio:guest-draft:v1': JSON.stringify({ page, savedAt: '2026-10-23T00:00:00Z' }) } });
  await until(() => f.ready(), 'editor ready');
  f.click(f.button('预览页面'));
  const frame = await (async () => { await until(() => f.doc.querySelector('.full-preview .custom-component-frame iframe'), 'preview frame'); return f.doc.querySelector('.full-preview .custom-component-frame iframe'); })();
  const channel = /"channel":"([^"]+)"/.exec(frame.getAttribute('srcdoc'))[1];
  assert.match(frame.getAttribute('srcdoc'), /来自变量的标题/, 'bound fields reach the component');
  const posted = [];
  frame.contentWindow.postMessage = data => posted.push(data);
  // postMessage clones data into the receiving realm; do the same for simulated frame messages.
  const send = (data, source = frame.contentWindow) => f.win.perform(() => f.win.dispatchEvent(new f.win.MessageEvent('message', { data: f.win.JSON.parse(JSON.stringify({ source: 'animate-studio-component', channel, ...data })), source })));
  send({ type: 'click' }, f.win);
  send({ type: 'click', extra: 1 });
  send({ type: 'ready', channel: 'stale-run' });
  await pause(50);
  assert.deepEqual(posted, [], 'messages from other windows, runs or with unknown fields are ignored');
  assert.doesNotMatch(f.text(), /组件被点击/);
  send({ type: 'ready' });
  await until(() => posted.some(message => message.type === 'update' && message.props.title === '来自变量的标题'), 'ready frames receive fields');
  const opened = [];
  f.win.open = (...args) => { opened.push(args); return null; };
  send({ type: 'open-link', href: 'javascript:alert(1)' });
  send({ type: 'click' });
  await until(() => /组件被点击/.test(f.text()), 'click forwarded to the page action');
  assert.deepEqual(opened, [], 'links never open when click actions replace them, and unsafe links never open');
});

test('restoring an older local draft preserves its revision and cannot silently overwrite a newer save', async t => {
  const local = { id: 'draft-source', revision: 2, createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:02:00Z', ...componentTemplates[2].definition, name: '已保存的新版本' };
  const draft = { target: { kind: 'local', id: local.id }, baseRevision: 1, definition: { ...componentTemplates[2].definition, name: '旧草稿的修改' }, updatedAt: '2026-10-23T00:01:00Z' };
  const f = fixture(t, { storage: {
    'animate-studio:custom-components:v1': JSON.stringify({ version: 1, components: [local] }),
    'animate-studio:custom-component-drafts:v1': JSON.stringify({ version: 1, drafts: { 'local:draft-source': draft } }),
  } });
  await openMyComponents(f);
  f.click(f.button('继续编辑', f.doc.querySelector('.custom-drafts')));
  await until(() => f.labelled('组件名称')?.value === '旧草稿的修改', 'older draft restored');
  f.click(f.button('保存'));
  await until(() => f.doc.querySelector('[role="alertdialog"]')?.textContent.includes('组件已在其他地方修改'), 'restored draft must still conflict');
  assert.equal(f.library()[0].name, '已保存的新版本');
  assert.equal(f.library()[0].revision, 2);
});

function cloudRecord(name = '账号私有组件') {
  return { id: 'cloud-source', name, description: '', revision: 1, createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', shareToken: null, publishedAt: null, sharedRevision: null, component: { ...componentTemplates[2].definition, name } };
}
async function openCloudDesigner(f, name) {
  await openMyComponents(f);
  f.click([...f.doc.querySelectorAll('.custom-source-switch button')].find(b => b.textContent.includes('账号')));
  await until(() => f.labelled(`编辑「${name}」`), 'account component listed');
  f.click(f.labelled(`编辑「${name}」`));
  await until(() => f.labelled('组件名称'), 'account designer ready');
}

test('account switches close a private designer and keep its draft visible only to the original owner', async t => {
  const owner = { id: 'owner-a', email: 'a@studio.test', name: 'A' };
  const f = fixture(t, { user: owner, components: [cloudRecord()] });
  await openCloudDesigner(f, '账号私有组件');
  f.type(f.labelled('组件名称'), 'A 的未保存修改');
  f.state.user = { id: 'owner-b', email: 'b@studio.test', name: 'B' };
  f.win.dispatchEvent(new f.win.Event('focus'));
  await until(() => f.doc.querySelector('.more-actions-button[title="账号：b@studio.test"]') && !f.doc.querySelector('.component-designer'), 'private designer closes on account change');
  assert.doesNotMatch(f.doc.querySelector('.custom-drafts')?.textContent ?? '', /A 的未保存修改/);
  const stored = JSON.parse(f.win.localStorage.getItem('animate-studio:custom-component-drafts:v1'));
  const draft = Object.values(stored.drafts).find(value => value.ownerId === owner.id);
  assert.equal(draft.definition.name, 'A 的未保存修改');
  f.state.user = owner;
  f.win.dispatchEvent(new f.win.Event('focus'));
  await until(() => f.doc.querySelector('.custom-drafts')?.textContent.includes('A 的未保存修改'), 'original account sees its preserved work');
});

test('saving and adding uses the saved snapshot while edits made during the request remain open', async t => {
  const f = fixture(t, { user: { id: 'owner', email: 'owner@studio.test', name: 'Owner' }, components: [cloudRecord()] });
  await openCloudDesigner(f, '账号私有组件');
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  let saving = false;
  f.state.beforeComponentSave = () => { saving = true; return barrier; };
  f.type(f.labelled('组件名称'), '本次保存版本');
  f.click(f.button('保存并添加到页面'));
  await until(() => saving, 'save is deliberately in flight');
  f.type(f.labelled('组件名称'), '保存期间的新修改');
  release();
  await until(() => f.guestPage().blocks.some(block => block.type === 'custom'), 'saved snapshot inserted');
  assert.equal(f.state.components.get('cloud-source').component.name, '本次保存版本');
  const inserted = f.guestPage().blocks.find(block => block.type === 'custom');
  assert.equal(inserted.props.custom.name, '本次保存版本');
  assert.equal(inserted.props.custom.source.revision, 2);
  assert.equal(f.labelled('组件名称').value, '保存期间的新修改');
  assert.match(f.doc.querySelector('.ccd-dirty').textContent, /未保存/);
});

test('failed draft persistence is reported before the close dialog promises recovery', async t => {
  const f = fixture(t);
  await openMyComponents(f);
  f.click(f.button('新建组件'));
  await until(() => f.labelled('组件名称'), 'new designer');
  const setItem = f.win.Storage.prototype.setItem;
  f.win.Storage.prototype.setItem = function (key, value) {
    if (key === 'animate-studio:custom-component-drafts:v1') throw new Error('quota');
    return setItem.call(this, key, value);
  };
  f.type(f.labelled('组件名称'), '不能暂存的修改');
  f.click(f.labelled('关闭设计器'));
  await until(() => f.doc.querySelector('[role="alertdialog"]'), 'close dialog');
  assert.match(f.doc.querySelector('[role="alertdialog"]').textContent, /浏览器未能暂存草稿/);
  assert.doesNotMatch(f.doc.querySelector('[role="alertdialog"]').textContent, /修改已暂存/);
  assert.equal(f.labelled('组件名称').value, '不能暂存的修改');
});

test('component folders persist, filter and move library items without changing their source version', async t => {
  const component = { ...componentTemplates[0].definition, name: '文件夹组件', id: 'local-folder-item', revision: 1, createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z' };
  const f = fixture(t, { storage: { 'animate-studio:custom-components:v1': JSON.stringify({ version: 1, components: [component] }) } });
  await openMyComponents(f);
  f.click(f.labelled('新建文件夹'));
  await until(() => f.labelled('文件夹名称'), 'folder dialog opens');
  f.type(f.labelled('文件夹名称'), '营销模块'); f.click(f.button('保存', f.doc.querySelector('.custom-folder-dialog')));
  await until(() => !f.doc.querySelector('.custom-folder-dialog') && /这个分组还没有组件/.test(f.text()), 'new folder selected');
  const folder = JSON.parse(f.win.localStorage.getItem('animate-studio:custom-components:v1')).folders[0];
  assert.equal(folder.name, '营销模块');
  f.choose(f.labelled('组件文件夹'), 'all');
  f.openMenu(f.labelled('「文件夹组件」的更多操作'));
  await until(() => [...f.doc.querySelectorAll('[role="menuitem"]')].some(item => item.textContent.includes('移动到文件夹')), 'component menu');
  f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('移动到文件夹')));
  await until(() => f.labelled('目标文件夹'), 'move dialog');
  f.choose(f.labelled('目标文件夹'), folder.id); f.click(f.button('移动', f.doc.querySelector('.custom-folder-dialog')));
  await until(() => !f.doc.querySelector('.custom-folder-dialog') && f.library()[0].folderId === folder.id, 'component moved');
  assert.equal(f.library()[0].revision, 1);
  f.choose(f.labelled('组件文件夹'), folder.id);
  assert.equal(f.doc.querySelectorAll('.custom-item').length, 1);
  f.openMenu(f.labelled('文件夹操作'));
  await until(() => [...f.doc.querySelectorAll('[role="menuitem"]')].some(item => item.textContent.includes('重命名文件夹')), 'folder menu');
  f.click([...f.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('重命名文件夹')));
  await until(() => f.labelled('文件夹名称'), 'rename dialog');
  f.type(f.labelled('文件夹名称'), '交互模块'); f.click(f.button('保存', f.doc.querySelector('.custom-folder-dialog')));
  await until(() => !f.doc.querySelector('.custom-folder-dialog') && f.labelled('组件文件夹').selectedOptions[0].textContent.includes('交互模块'), 'folder renamed');
  const g = fixture(t, { storage: { 'animate-studio:custom-components:v1': f.win.localStorage.getItem('animate-studio:custom-components:v1') } });
  await openMyComponents(g); g.choose(g.labelled('组件文件夹'), folder.id);
  assert.equal(g.doc.querySelectorAll('.custom-item').length, 1, 'folder membership survives a reload');
  g.openMenu(g.labelled('文件夹操作'));
  await until(() => [...g.doc.querySelectorAll('[role="menuitem"]')].some(item => item.textContent.includes('删除文件夹')), 'folder deletion menu');
  g.click([...g.doc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('删除文件夹')));
  await until(() => g.doc.querySelector('.custom-folder-dialog'), 'folder delete confirmation');
  assert.match(g.doc.querySelector('.custom-folder-dialog').textContent, /不会删除组件/);
  g.click(g.button('删除文件夹', g.doc.querySelector('.custom-folder-dialog')));
  await until(() => !g.doc.querySelector('.custom-folder-dialog') && g.library()[0].folderId === null, 'components moved to ungrouped');
  assert.equal(g.library().length, 1); assert.equal(g.library()[0].revision, 1);
  assert.equal(g.labelled('组件文件夹').value, 'none');
});

test('a new component can be uploaded directly into the selected account folder and read back', async t => {
  const user = { id: 'owner', name: '作者', email: 'owner@test.local' };
  const f = fixture(t, { user }); await openMyComponents(f);
  f.click(f.buttonLike('账号', f.doc.querySelector('.custom-source-switch')));
  await until(() => f.labelled('新建文件夹'), 'account folders loaded');
  f.click(f.labelled('新建文件夹')); await until(() => f.labelled('文件夹名称'), 'new account folder dialog');
  f.type(f.labelled('文件夹名称'), '云端常用'); f.click(f.button('保存', f.doc.querySelector('.custom-folder-dialog')));
  await until(() => !f.doc.querySelector('.custom-folder-dialog') && f.state.folders.size === 1, 'account folder persisted');
  const folder = [...f.state.folders.values()][0];
  f.click(f.button('新建组件')); await until(() => f.labelled('组件名称'), 'designer opens');
  f.type(f.labelled('组件名称'), '云端分组组件'); f.click(f.labelled('保存到账号'));
  await until(() => f.state.components.size === 1 && f.doc.querySelector('.ccd-location')?.textContent.includes('账号'), 'uploaded to account');
  const record = [...f.state.components.values()][0]; assert.equal(record.folderId, folder.id);
  f.click(f.labelled('关闭设计器')); await until(() => !f.doc.querySelector('.component-designer'), 'designer closes');
  await until(() => f.doc.querySelectorAll('.custom-item').length === 1, 'uploaded component appears in its folder');
  f.click(f.labelled('添加「云端分组组件」到页面'));
  await until(() => f.doc.querySelector('.free-canvas-block-content iframe'), 'cloud component read and inserted');
  assert.ok(f.state.requests.some(request => request.path === `/api/account/components/${record.id}` && request.method === 'GET'));
  assert.equal(record.revision, 1);
});

const libraryHookBundle = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {useCustomLibrary} from './src/components/custom/useCustomLibrary';const root=createRoot(document.getElementById('root'));function Probe(){const library=useCustomLibrary({id:'owner',email:'owner@test.local',name:'Owner'});window.libraryHook=library;return <output>{JSON.stringify(library.cloud)}</output>}window.unmount=()=>flushSync(()=>root.unmount());flushSync(()=>root.render(<Probe/>));`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
});
function deferredResponse() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function hookFixture(t, fetcher) {
  const errors = [], console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://library.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console });
  const win = dom.window;
  Object.assign(win, { Headers, Response, structuredClone });
  win.fetch = (url, options = {}) => fetcher(String(url), options.method ?? 'GET', options.body ? JSON.parse(options.body) : null);
  win.eval(libraryHookBundle.outputFiles[0].text);
  t.after(() => { win.unmount(); win.close(); assert.deepEqual(errors, []); });
  return { api: () => win.libraryHook, state: () => JSON.parse(win.document.querySelector('output').textContent) };
}
const hookRecord = (id, overrides = {}) => ({ id, name: id, description: '', revision: 4, createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z', folderId: null, shareToken: null, publishedAt: null, sharedRevision: null, component: { ...componentTemplates[0].definition, name: id }, ...overrides });
const hookSummary = ({ component: _component, ...record }) => record;

test('a pending cloud list cannot erase an upload and the fresh list retains other account components', async t => {
  const stale = deferredResponse(), store = new Map(); let lists = 0;
  t.after(() => stale.resolve());
  const f = hookFixture(t, async (path, method, body) => {
    if (path === '/api/account/component-folders') return Response.json({ folders: [] });
    if (method === 'POST') { const record = hookRecord('uploaded', { name: body.component.name, component: body.component }); store.set(record.id, record); return Response.json(record); }
    const captured = [...store.values()].map(hookSummary);
    if (++lists === 1) await stale.promise;
    return Response.json({ components: captured });
  });
  const initial = f.api().refreshCloud();
  await until(() => lists === 1 && f.state().status === 'loading', 'old empty list is pending');
  store.set('other-device', hookRecord('other-device'));
  await f.api().createCloud({ ...componentTemplates[0].definition, name: 'Uploaded result' });
  await until(() => lists >= 2 && f.state().status === 'ready' && f.state().items.length === 2, 'mutation reconciles a fresh full list');
  stale.resolve(); await initial;
  assert.deepEqual(f.state().items.map(item => item.id).sort(), ['other-device', 'uploaded']);
  assert.equal(f.state().status, 'ready');
});

test('late lists and detail loads cannot restore a moved folder when source revision is unchanged', async t => {
  const staleList = deferredResponse(), staleDetail = deferredResponse();
  t.after(() => { staleList.resolve(); staleDetail.resolve(); });
  const folder = { id: 'folder-new', name: 'New folder', createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z' };
  let record = hookRecord('item'), lists = 0, details = 0;
  const f = hookFixture(t, async (path, method, body) => {
    if (path === '/api/account/component-folders') return Response.json({ folders: [folder] });
    if (path.endsWith('/folder')) { record = { ...record, folderId: body.folderId }; return Response.json(record); }
    if (path === '/api/account/components') {
      const captured = hookSummary(record); if (++lists === 2) await staleList.promise;
      return Response.json({ components: [captured] });
    }
    const captured = structuredClone(record); if (++details === 1) await staleDetail.promise;
    return Response.json(captured);
  });
  await f.api().refreshCloud(); await until(() => f.state().status === 'ready', 'initial component visible');
  const oldList = f.api().refreshCloud(), oldDetail = f.api().loadCloud('item');
  await until(() => lists === 2 && details === 1, 'both old snapshots are captured');
  await f.api().moveCloud('item', folder.id);
  await until(() => lists >= 3 && f.state().status === 'ready' && f.state().items[0].folderId === folder.id, 'move is visible without a revision increment');
  staleList.resolve(); staleDetail.resolve();
  const [, loaded] = await Promise.all([oldList, oldDetail]);
  assert.equal(details, 2, 'a detail response crossing a mutation is reread');
  assert.equal(loaded.folderId, folder.id); assert.equal(loaded.revision, 4);
  assert.equal(f.state().items[0].folderId, folder.id); assert.equal(f.state().items[0].revision, 4);
});

test('a failed reconciliation leaves a recoverable error instead of permanent cloud loading', async t => {
  const stale = deferredResponse(); t.after(() => stale.resolve());
  let lists = 0, failRefresh = true, record;
  const f = hookFixture(t, async (path, method, body) => {
    if (path === '/api/account/component-folders') return Response.json({ folders: [] });
    if (method === 'POST') { record = hookRecord('uploaded', { component: body.component }); return Response.json(record); }
    if (++lists === 1) { await stale.promise; return Response.json({ components: [] }); }
    if (failRefresh) return Response.json({ error: '模拟列表读取失败' }, { status: 500 });
    return Response.json({ components: [hookSummary(record)] });
  });
  const old = f.api().refreshCloud(); await until(() => lists === 1, 'initial list is pending');
  await f.api().createCloud(componentTemplates[0].definition);
  await until(() => f.state().status === 'error', 'failed background refresh is actionable');
  assert.equal(f.state().items[0].id, 'uploaded', 'the successful upload remains cached');
  stale.resolve(); await old;
  assert.equal(f.state().status, 'error', 'an obsolete successful response cannot hide the refresh failure');
  failRefresh = false; await f.api().refreshCloud();
  await until(() => f.state().status === 'ready', 'explicit retry completes');
  assert.equal(f.state().items[0].id, 'uploaded');
});
