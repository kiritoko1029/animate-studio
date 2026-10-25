import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument } from '../src/model.ts';
import { defaultAiSettings } from '../src/lib/ai/config.ts';
import { newAiSession, aiSessionsKey, aiUnreadableSessionsKey } from '../src/lib/ai/storage.ts';
import { createBlock } from '../src/model.ts';
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
function fixture(t, options = {}) {
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
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.HTMLElement.prototype.scrollTo = () => {};
  const guest = createDocument(true); guest.name = '浏览器草稿';
  win.localStorage.setItem('animate-studio:guest-draft:v1', JSON.stringify({ page: guest, savedAt: '2026-10-23T00:00:00Z' }));
  const other = createDocument(true); other.name = '另一份云端作品';
  const record = (id, page) => ({ id, name: page.name, page: structuredClone(page), createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', savedAt: '2026-10-23T00:00:00Z', shareToken: null, publishedAt: null });
  const state = { user: { id: 'owner', email: 'owner@studio.test', name: 'Owner' }, pages: new Map([['other', record('other', other)]]), writes: [], failWrites: false, preferences: { version: 1, studioTheme: 'light' }, preferenceWrites: [] };
  state.aiStreams = [];
  state.components = new Map(); state.failComponentWrites = false;
  if (options.setup) options.setup(win, state);
  const optionsFixtureCloudGate = options.cloudReadGate;
  win.fetch = async (url, options = {}) => {
    const path = String(url), method = options.method ?? 'GET', body = options.body ? JSON.parse(options.body) : null;
    if (path === 'https://ai.test/v1/models') return Response.json({ data: [{ id: 'mock-model' }, { id: 'custom-model' }] });
    if (path === 'https://ai.test/v1/responses' || path === 'https://ai.test/v1/messages') {
      const stream = { request: { path, body, headers: options.headers }, cancelled: false, controller: null };
      state.aiStreams.push(stream);
      return new Response(new ReadableStream({ start(controller) { stream.controller = controller; }, cancel() { stream.cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (path === '/api/auth/get-session') return Response.json(state.user ? { user: state.user } : null);
    if (path === '/api/account/config') return Response.json({ cloudEnabled: true, emailEnabled: true, githubEnabled: true });
    if (path === '/api/account/preferences') { if (body) { state.preferences = body; state.preferenceWrites.push(body); } return Response.json(state.preferences); }
    if (path === '/api/account/component-folders') return Response.json({ folders: [] });
    if (path === '/api/account/components') {
      if (method === 'POST') {
        if (state.failComponentWrites) return Response.json({ error: '模拟上传失败' }, { status: 503 });
        const value = { id: `component-${state.components.size + 1}`, name: body.component.name, description: body.component.description ?? '', component: body.component, revision: 1, folderId: body.folderId ?? null, createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z', shareToken: null, publishedAt: null, sharedRevision: null };
        state.components.set(value.id, value); return Response.json(value);
      }
      return Response.json({ components: [...state.components.values()].map(({ component: _definition, ...summary }) => summary) });
    }
    const componentMatch = path.match(/^\/api\/account\/components\/([^/]+)$/);
    if (componentMatch) {
      const value = state.components.get(componentMatch[1]);
      if (!value) return Response.json({ error: '未找到组件' }, { status: 404 });
      if (method === 'PUT') {
        if (body.baseRevision !== value.revision) return Response.json({ error: '组件已在其他地方更新', revision: value.revision }, { status: 409 });
        const next = { ...value, component: body.component, name: body.component.name, revision: value.revision + 1 }; state.components.set(next.id, next); return Response.json(next);
      }
      return Response.json(value);
    }
    if (path === '/api/account/pages') {
      if (method === 'POST') { const value = record('new-page', body.page); state.pages.set(value.id, value); return Response.json(value); }
      return Response.json({ pages: [...state.pages.values()] });
    }
    const match = path.match(/^\/api\/account\/pages\/([^/]+)$/);
    if (match) {
      const id = match[1];
      if (method === 'GET' && optionsFixtureCloudGate) await optionsFixtureCloudGate;
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
    assert.equal(!!doc.querySelector('.workbench-more-menu'), false);
  };
  const chooseLanguage = async value => {
    const trigger = await openMore();
    const label = value === 'en' ? 'English' : '中文';
    click([...doc.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent.trim() === label));
    await until(() => !doc.querySelector('.workbench-more-menu'), 'more menu closes after language selection');
    await until(() => doc.activeElement === trigger, 'focus returns to the more trigger');
  };
  const fill = (element, value) => win.perform(() => {
    assert.ok(element, 'input exists');
    const prototype = element.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  const emit = (stream, event) => stream.controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  const emitOps = (stream, ...ops) => emit(stream, { type: 'response.output_text.delta', delta: ops.map(op => JSON.stringify(op)).join('\n') + '\n' });
  const finish = stream => { emit(stream, { type: 'response.completed', response: { usage: { input_tokens: 120, output_tokens: 30 } } }); stream.controller.close(); };
  return { win, doc, state, errors, click, button, name, rename, fill, emit, emitOps, finish };
}


async function openChat(f) {
  await until(() => f.doc.querySelector('[aria-label="打开 AI 页面助手"]'), 'AI launcher ready');
  f.click(f.doc.querySelector('[aria-label="打开 AI 页面助手"]'));
  await until(() => f.doc.querySelector('.ai-chat'), 'AI chat opens');
}
async function configure(f) {
  f.click(f.doc.querySelector('.ai-chat [aria-label="AI 模型配置"]'));
  await until(() => f.doc.querySelector('.ai-settings-dialog'), 'AI settings opens');
  f.fill(f.doc.querySelector('[aria-label="API 基础地址"]'), 'https://ai.test/v1');
  f.fill(f.doc.querySelector('[aria-label="API 密钥"]'), 'mock-key');
  f.click(f.button('读取模型列表'));
  await until(() => f.doc.querySelector('[aria-label="可用模型"]'), 'models loaded');
  f.fill(f.doc.querySelector('[aria-label="模型名称"]'), 'mock-model');
  f.fill(f.doc.querySelector('[aria-label="思考强度"]'), 'high');
  f.click(f.button('保存配置'));
  await until(() => !f.doc.querySelector('.ai-settings-dialog'), 'settings saved');
}
const add = (seq, id, title = 'Generated heading') => ({ v: 1, seq, op: 'add', id, type: 'heading', props: { title }, frame: { x: 32, y: id === 'second' ? 220 : 32, width: 400, height: 140 }, summary: `新增 ${id}` });

test('AI chat configures models locally, streams components, locks editing, pauses and resumes from manual edits', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  assert.equal(JSON.parse(f.win.localStorage.getItem('animate-studio:ai-settings:v1')).profiles.openai.effort, 'high');
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), 'Create a page');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1 && f.doc.querySelector('.ai-operating'), 'AI locks canvas');
  assert.ok(f.doc.querySelector('.studio-body').hasAttribute('inert')); assert.ok(f.doc.querySelector('.app-header').hasAttribute('inert'));
  const stream = f.state.aiStreams[0];
  assert.deepEqual(stream.request.body.reasoning, { effort: 'high', summary: 'auto' });
  f.emit(stream, { type: 'response.output_text.delta', delta: JSON.stringify(add(1, 'first')).slice(0, 20) });
  assert.equal(f.doc.querySelectorAll('[data-block-id]').length, 0, 'partial JSON is not rendered');
  f.emit(stream, { type: 'response.output_text.delta', delta: JSON.stringify(add(1, 'first')).slice(20) + '\n' });
  await until(() => f.doc.querySelector('[data-block-id="first"]'), 'first component rendered');
  assert.ok(f.doc.querySelector('[data-ai-change="add"]')); assert.match(f.doc.querySelector('.ai-change-bubble').textContent, /新增 first/);
  f.win.perform(() => f.win.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
  assert.ok(f.doc.querySelector('[data-block-id="first"]'), 'global editing shortcuts are locked');
  f.emitOps(stream, { v: 1, seq: 2, op: 'update', id: 'first', props: { title: 'AI revision' }, summary: '更新标题' });
  await until(() => f.doc.querySelector('[data-ai-change="update"]'), 'update highlighted');
  f.emit(stream, { type: 'response.output_text.delta', delta: '{"v":1,"seq":3' });
  f.click(f.doc.querySelector('[aria-label="暂停 AI 输出"]'));
  await until(() => !f.doc.querySelector('.ai-operating'), 'pause unlocks canvas');
  assert.equal(stream.cancelled, true); assert.equal(f.doc.querySelector('.studio-body').hasAttribute('inert'), false);
  f.fill(f.doc.querySelector('textarea[aria-label="标题"]'), 'Manual title');
  f.click(f.button('继续生成'));
  await until(() => f.state.aiStreams.length === 2, 'resumed request starts');
  const resumed = f.state.aiStreams[1], context = JSON.parse(resumed.request.body.input[0].content);
  assert.equal(context.resume, true); assert.equal(context.page.blocks[0].props.title, 'Manual title');
  assert.equal(context.completedOperations.length, 2); assert.ok(!JSON.stringify(context).includes('mock-key'));
  f.emitOps(resumed, add(1, 'second'), { v: 1, seq: 2, op: 'done', summary: '完成页面' }); f.finish(resumed);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelector('[data-block-id="second"]'), 'generation completes');
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => !f.doc.querySelector('[data-block-id="second"]'), 'one undo removes the resumed run');
  assert.ok(f.doc.querySelector('[data-block-id="first"]')?.textContent.includes('Manual title'));
});

test('thinking streams into the chat and incomplete turns continue automatically without unlocking or extra undo entries', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '创建完整页面');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1 && f.doc.querySelector('.ai-progress'), 'request and progress begin');
  assert.match(f.doc.querySelector('.ai-progress').textContent, /正在连接模型/);
  const first = f.state.aiStreams[0];
  f.emit(first, { type: 'response.reasoning_summary_part.added' });
  f.emit(first, { type: 'response.reasoning_summary_text.delta', delta: '先组织标题，再安排功能卡片。' });
  await until(() => f.doc.querySelector('.ai-reasoning-preview')?.textContent.includes('先组织标题'), 'reasoning preview arrives before page operations');
  assert.equal(f.doc.querySelector('.ai-reasoning-text').hidden, true, 'thinking starts as a compact preview');
  f.click(f.doc.querySelector('[aria-label="展开思考内容"]'));
  assert.equal(f.doc.querySelector('.ai-reasoning-text').hidden, false);
  assert.match(f.doc.querySelector('.ai-progress-status').textContent, /正在思考/);
  assert.equal(f.doc.querySelectorAll('[data-block-id]').length, 0);
  f.emitOps(first, add(1, 'first')); f.finish(first);
  await until(() => f.state.aiStreams.length === 2, 'next model request is automatic');
  assert.ok(f.doc.querySelector('.ai-operating')); assert.ok(f.doc.querySelector('.studio-body').hasAttribute('inert')); assert.equal(!!f.button('继续生成'), false);
  assert.match(f.doc.querySelector('.ai-progress-count').textContent, /第 2 轮/);
  const second = f.state.aiStreams[1], context = JSON.parse(second.request.body.input[0].content);
  assert.equal(context.page.blocks[0].id, 'first'); assert.equal(context.resume, true);
  assert.ok(!JSON.stringify(context).includes('先组织标题'));
  f.emitOps(second, add(1, 'second'), { v: 1, seq: 2, op: 'done', summary: '整个页面已完成' }); f.finish(second);
  await until(() => !f.doc.querySelector('.ai-operating'), 'full task completes');
  assert.match(f.doc.querySelector('.ai-progress-status').textContent, /本次生成已完成/);
  assert.match(f.doc.querySelector('.ai-reasoning-text').textContent, /先组织标题/);
  assert.equal(f.doc.querySelector('.ai-reasoning-text').hidden, false, 'streaming and completion preserve the user’s expanded state');
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => f.doc.querySelectorAll('[data-block-id]').length === 0, 'one undo removes both automatic rounds');
});

test('a newly created AI page without custom themes generates across rounds without reloading', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  f.click(f.doc.querySelector('[aria-label="新建 AI 页面"]'));
  await until(() => f.name()?.value === '未命名页面', 'new blank page ready');
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '创建浅绿色电商首页，包含导航、主视觉和产品卡片');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'first round requested');
  const first = f.state.aiStreams[0];
  f.emitOps(first, { v: 1, seq: 1, op: 'page', name: '新页面续写测试', settings: { accent: '#408668', canvasHeight: 1800 }, summary: '设置绿色画布' }, add(2, 'first'));
  f.finish(first);
  await until(() => f.state.aiStreams.length === 2, 'automatic second round starts');
  const second = f.state.aiStreams[1], context = JSON.parse(second.request.body.input[0].content);
  assert.equal(context.page.name, '新页面续写测试');
  assert.equal(context.page.blocks.length, 1, 'first round commits before continuation');
  assert.ok(!context.lastError.includes('自定义主题'));
  f.emitOps(second, add(1, 'second'), { v: 1, seq: 2, op: 'done', summary: '续写完成' }); f.finish(second);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelector('[data-block-id="second"]'), 'new page completes');
  assert.equal(f.state.aiStreams.length, 2); assert.equal(!!f.doc.querySelector('.ai-error'), false);
});

test('AI page selector creates a local page and opens an owned cloud page without leaking provider configuration', async t => {
  const f = fixture(t); await openChat(f);
  f.click(f.doc.querySelector('[aria-label="新建 AI 页面"]'));
  await until(() => f.name()?.value === '未命名页面', 'new page visible');
  const selectPage = async label => {
    const trigger = f.doc.querySelector('[aria-label="AI 目标页面"]');
    f.win.perform(() => trigger.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    await until(() => f.doc.querySelector('[role="menuitemradio"]'), 'page choices visible');
    f.click([...f.doc.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent.includes(label)));
  };
  await selectPage('浏览器草稿 · 本机'); await until(() => f.name()?.value === '浏览器草稿', 'saved local page opened');
  await selectPage('另一份云端作品 · 云端'); await until(() => f.name()?.value === '另一份云端作品', 'owned cloud page opened');
  const records = JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')));
  assert.ok(records.some(record => record.page.name === '未命名页面'));
  assert.ok(!JSON.stringify(records).includes('apiKey'));
});

test('a refreshed interrupted task preserves its newer checkpoint until the user explicitly restores it', async t => {
  let checkpoint;
  const f = fixture(t, { setup(win) {
    const original = JSON.parse(win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
    const page = { ...original, blocks: [{ ...createBlock('heading'), id: 'restored', frame: { x: 32, y: 32, width: 400, height: 120 }, props: { title: 'Recovered component' } }] };
    checkpoint = { ...newAiSession(page), status: 'running', task: 'Finish page' };
    win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify([checkpoint]));
  } });
  await openChat(f);
  await until(() => f.button('恢复检查点'), 'recovery choice is visible');
  assert.equal(f.doc.querySelectorAll('[data-block-id]').length, 0, 'saved checkpoint is not silently applied');
  assert.equal(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.blocks.length, 1, 'initial older canvas did not overwrite checkpoint');
  f.rename('Rename the older canvas');
  // Observe past the manual checkpoint delay: editing is not an implicit recovery choice.
  await new Promise(resolve => f.win.setTimeout(resolve, 800));
  assert.ok(f.button('恢复检查点'), 'manual edits keep the explicit recovery choice');
  assert.equal(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.blocks.length, 1, 'manual edits cannot replace the only recovery copy');
  f.click(f.button('恢复检查点'));
  await until(() => f.doc.querySelector('[data-block-id="restored"]'), 'checkpoint restored');
  assert.ok(f.button('继续生成'));
});

test('transient empty names leave all AI checkpoints readable and resume saving after correction', async t => {
  const f = fixture(t, { setup(win) {
    const page = JSON.parse(win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
    win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify([newAiSession(page), newAiSession(createDocument(true))]));
  } });
  await openChat(f);
  const original = f.win.localStorage.getItem(aiSessionsKey('account:owner'));
  f.rename('');
  await until(() => f.doc.querySelector('.ai-error')?.textContent.includes('非空文本'), 'invalid manual checkpoint is reported');
  assert.equal(f.win.localStorage.getItem(aiSessionsKey('account:owner')), original, 'invalid input did not poison either saved record');
  assert.equal(f.doc.querySelector('[aria-label="管理 AI 对话记录"]').disabled, false);
  f.rename('Valid page name');
  await until(() => JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.name === 'Valid page name', 'valid editing resumes checkpoint persistence');
  // Storage writes precede React's commit; observe the rendered error separately.
  await until(() => !f.doc.querySelector('.ai-error'), 'the corrected checkpoint clears the stale validation error');
  assert.equal(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner'))).length, 2);
});

test('one unreadable AI record does not disable healthy history and is backed up before saving', async t => {
  let bad;
  const f = fixture(t, { setup(win) {
    const page = JSON.parse(win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
    bad = newAiSession({ ...createDocument(true), name: '' });
    win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify([bad, newAiSession(page)]));
  } });
  await openChat(f);
  await until(() => f.doc.querySelector('[data-ai-storage-warning]'), 'isolated record is visible to the user');
  assert.equal(f.doc.querySelector('[aria-label="管理 AI 对话记录"]').disabled, false, 'healthy history remains manageable');
  f.rename('Healthy edited page');
  await until(() => JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.name === 'Healthy edited page', 'healthy history remains writable');
  assert.equal(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner'))).length, 1);
  assert.deepEqual(JSON.parse(f.win.localStorage.getItem(aiUnreadableSessionsKey('account:owner'))), [bad]);
});

test('delayed cloud activation offers its newer checkpoint before continuation can replace it', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { cloudReadGate: gate, setup(win, state) {
    win.history.replaceState(null, '', '/?page=other');
    const original = state.pages.get('other').page;
    const checkpoint = { ...original, blocks: [{ ...createBlock('heading'), id: 'cloud-checkpoint', props: { title: 'Newer cloud checkpoint' }, frame: { x: 32, y: 32, width: 400, height: 120 } }] };
    win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify([{ ...newAiSession(checkpoint), status: 'running', task: 'Finish cloud page' }]));
  } });
  await openChat(f); release();
  await until(() => f.name()?.value === '另一份云端作品' && f.button('恢复检查点'), 'cloud checkpoint reconciliation');
  f.click(f.button('继续生成'));
  assert.equal(f.state.aiStreams.length, 0, 'unacknowledged checkpoint cannot be overwritten by starting a request');
  assert.equal(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.blocks.length, 1);
  f.click(f.button('恢复检查点'));
  await until(() => f.doc.querySelector('[data-block-id="cloud-checkpoint"]'), 'cloud checkpoint restored');
});

test('external checkpoint refresh requires choosing between the checkpoint and current canvas', async t => {
  const f = fixture(t); await openChat(f);
  const original = JSON.parse(f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
  const page = { ...original, name: 'Other tab checkpoint', blocks: [{ ...createBlock('heading'), id: 'external', props: { title: 'External change' }, frame: { x: 32, y: 32, width: 400, height: 120 } }] };
  f.win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify([{ ...newAiSession(page), status: 'paused', task: 'Continue' }]));
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: aiSessionsKey('account:owner') }));
  await until(() => f.button('恢复检查点'), 'external checkpoint shown');
  assert.equal(!!f.doc.querySelector('[data-block-id="external"]'), false);
  f.click(f.button('使用当前画布'));
  assert.equal(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.blocks.length, 0, 'only explicit adoption replaces the checkpoint');
});

test('full AI history can be managed from an untracked page and new pages reserve their own slot', async t => {
  const f = fixture(t, { setup(win) {
    const records = Array.from({ length: 12 }, (_, i) => newAiSession({ ...createDocument(true), name: `Stored ${i}` }));
    win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify(records));
  } });
  await openChat(f);
  assert.equal(f.doc.querySelector('[aria-label="新建 AI 页面"]').disabled, true);
  assert.equal(f.doc.querySelector('[aria-label="管理 AI 对话记录"]').disabled, false);
  for (let i = 0; i < 2; i++) {
    f.click(f.doc.querySelector('[aria-label="管理 AI 对话记录"]'));
    await until(() => f.doc.querySelector('.ai-remove-dialog'), 'history management opens without changing page');
    f.click(f.button('移除'));
    await until(() => !f.doc.querySelector('.ai-remove-dialog'), 'history removal completed');
  }
  f.click(f.doc.querySelector('[aria-label="新建 AI 页面"]'));
  await until(() => f.name()?.value === '未命名页面', 'new AI page created');
  await until(() => JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner'))).length === 12, 'current and new pages saved within capacity');
  const records = JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')));
  assert.equal(records[0].page.name, '未命名页面'); assert.ok(records.some(record => record.page.name === '浏览器草稿'));
});

test('saving model settings validates inactive provider drafts without damaging persisted keys', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  const saved = f.win.localStorage.getItem('animate-studio:ai-settings:v1');
  f.click(f.doc.querySelector('.ai-chat [aria-label="AI 模型配置"]'));
  await until(() => f.doc.querySelector('.ai-settings-dialog'), 'settings open');
  f.fill(f.doc.querySelector('[aria-label="最大输出 Token"]'), '');
  f.win.perform(() => f.button('Anthropic Messages').dispatchEvent(new f.win.MouseEvent('mousedown', { button: 0, bubbles: true })));
  await until(() => f.button('Anthropic Messages')?.getAttribute('data-state') === 'active', 'Anthropic tab active');
  f.click(f.button('保存配置'));
  await until(() => f.doc.querySelector('.ai-settings-dialog .ai-error'), 'inactive invalid draft rejected');
  assert.equal(f.win.localStorage.getItem('animate-studio:ai-settings:v1'), saved);
  assert.equal(f.doc.querySelector('[aria-label="API 密钥"]').value, 'mock-key', 'invalid provider is brought back into view');
});

test('AI reveals offscreen components while user pan stays locked and saved geometry stays unchanged', async t => {
  const f = fixture(t, { setup(win) {
    Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.classList.contains('free-canvas-viewport') ? 800 : 0; } });
    Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.classList.contains('free-canvas-viewport') ? 500 : 0; } });
    const settings = defaultAiSettings(); settings.profiles.openai = { ...settings.profiles.openai, baseUrl: 'https://ai.test/v1', apiKey: 'mock-key', model: 'mock-model' };
    win.localStorage.setItem('animate-studio:ai-settings:v1', JSON.stringify(settings));
  } });
  await openChat(f);
  f.win.perform(() => { const zoom = f.doc.querySelector('[aria-label="画布缩放"]'); zoom.value = '1'; zoom.dispatchEvent(new f.win.Event('change', { bubbles: true })); });
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), 'Add a lower section');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'generation started');
  const operation = { ...add(1, 'lower'), frame: { x: 32, y: 850, width: 400, height: 120 } };
  f.emitOps(f.state.aiStreams[0], operation);
  const stage = () => f.doc.querySelector('[data-free-stage]');
  await until(() => {
    const match = stage()?.style.transform.match(/translate\(([-.\d]+)px, ([-.\d]+)px\)/);
    return match && 850 * Number(stage().dataset.scale) + Number(match[2]) >= 32 && 970 * Number(stage().dataset.scale) + Number(match[2]) <= 468;
  }, 'AI component brought into view');
  const transform = stage().style.transform;
  f.win.perform(() => f.doc.querySelector('[data-canvas-viewport]').dispatchEvent(new f.win.WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true })));
  assert.equal(stage().style.transform, transform, 'user wheel cannot pan during generation');
  assert.deepEqual(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.blocks[0].frame, operation.frame);
  f.click(f.doc.querySelector('[aria-label="暂停 AI 输出"]'));
});

test('pending manual checkpoint writes cannot overwrite a newer record from another tab', async t => {
  const f = fixture(t, { setup(win) {
    const page = JSON.parse(win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
    win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify([newAiSession(page)]));
  } });
  await openChat(f);
  f.rename('Manual pending');
  const current = JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0];
  const external = { ...current, page: { ...current.page, name: 'External newer', blocks: [{ ...createBlock('heading'), id: 'newer', props: { title: 'Newer checkpoint' }, frame: { x: 32, y: 32, width: 400, height: 120 } }] }, status: 'paused', task: 'Finish' };
  f.win.localStorage.setItem(aiSessionsKey('account:owner'), JSON.stringify([external]));
  f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: aiSessionsKey('account:owner') }));
  await until(() => f.button('恢复检查点'), 'external recovery prompt');
  // This barrier is scheduled after the pending 650ms checkpoint; it observes a forbidden late write.
  await new Promise(resolve => f.win.setTimeout(resolve, 800));
  const saved = JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0];
  assert.equal(saved.page.name, 'External newer'); assert.equal(saved.page.blocks.length, 1);
  assert.equal(f.name().value, 'Manual pending', 'manual work remains on the canvas until the user chooses');
});

test('a cleared thinking budget is normalized when manual thinking is turned off before saving', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  f.click(f.doc.querySelector('.ai-chat [aria-label="AI 模型配置"]'));
  await until(() => f.doc.querySelector('.ai-settings-dialog'), 'settings opens');
  f.win.perform(() => f.button('Anthropic Messages').dispatchEvent(new f.win.MouseEvent('mousedown', { button: 0, bubbles: true })));
  await until(() => f.button('Anthropic Messages')?.getAttribute('data-state') === 'active', 'Anthropic tab active');
  const mode = async label => {
    const trigger = f.doc.querySelector('button[aria-label="思考模式"]');
    f.win.perform(() => trigger.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    await until(() => f.doc.querySelector('[role="menuitemradio"]'), 'thinking choices open');
    f.click([...f.doc.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent === label));
    await until(() => !f.doc.querySelector('.ai-select-menu'), 'thinking choices close');
  };
  await mode('手动预算（旧模型）');
  f.fill(f.doc.querySelector('[aria-label="思考 Token 预算"]'), '');
  await mode('模型默认');
  f.click(f.button('保存配置'));
  await until(() => !f.doc.querySelector('.ai-settings-dialog'), 'valid normalized settings saved');
  const settings = JSON.parse(f.win.localStorage.getItem('animate-studio:ai-settings:v1'));
  assert.equal(settings.profiles.anthropic.thinkingBudget, 2048);
  assert.equal(settings.profiles.openai.apiKey, 'mock-key');
});

const askOp = (seq, questions) => ({ v: 1, seq, op: 'ask', text: '开始前确认几个细节：', questions });

test('the assistant asks for style and screen choices, then continues with the chosen and recommended answers', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '做一个产品介绍页');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'first request');
  assert.match(f.state.aiStreams[0].request.body.instructions, /"op":"ask"/);
  f.emitOps(f.state.aiStreams[0], { v: 1, seq: 1, op: 'message', text: '先确认方向。' }, askOp(2, [
    { id: 'style', title: '视觉风格', options: ['极简留白', '科技深色', '温暖插画'] },
    { id: 'screen', title: '目标屏幕', options: ['桌面 1920 宽', '手机 390 宽'] },
    { id: 'sections', title: '页面区块', options: ['功能', '价格', '问答'], multiple: true },
  ]));
  f.finish(f.state.aiStreams[0]);
  await until(() => f.doc.querySelector('.ai-question') && !f.doc.querySelector('.ai-operating'), 'question card replaces the running state');
  assert.equal(f.state.aiStreams.length, 1, 'a question never triggers automatic continuation');
  assert.match(f.doc.querySelector('.ai-chat-header small').textContent, /等待你的选择/);
  assert.match(f.doc.querySelector('[aria-label="向 AI 描述页面"]').placeholder, /选择上面的选项/);
  const option = label => [...f.doc.querySelectorAll('.ai-question-option')].find(item => item.textContent.includes(label));
  assert.match(option('极简留白').textContent, /推荐/); assert.doesNotMatch(option('功能').textContent, /推荐/, 'multi-select options have no single recommendation');
  const confirm = () => f.button('确认并继续');
  assert.equal(confirm().disabled, true, 'an empty answer cannot be sent');
  f.click(option('科技深色')); f.click(option('价格')); f.click(option('问答'));
  assert.equal(option('科技深色').getAttribute('aria-pressed'), 'true');
  f.click(option('温暖插画')); assert.equal(option('科技深色').getAttribute('aria-pressed'), 'false', 'single choice replaces the selection');
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '品牌名叫 Forma');
  f.click(confirm());
  await until(() => f.state.aiStreams.length === 2, 'answer starts the next request');
  const context = JSON.parse(f.state.aiStreams[1].request.body.input[0].content);
  assert.equal(context.resume, false);
  assert.equal(context.task, '做一个产品介绍页\n\n视觉风格：温暖插画\n页面区块：价格、问答\n品牌名叫 Forma\n其余问题请按你的推荐决定。');
  assert.equal(context.recentConversation.at(-2).questions.length, 3);
  assert.equal(context.recentConversation.at(-1).text, '视觉风格：温暖插画\n页面区块：价格、问答\n品牌名叫 Forma\n其余问题请按你的推荐决定。');
  assert.equal(f.doc.querySelector('[aria-label="向 AI 描述页面"]').value, '', 'the note was sent with the answer');
  assert.equal(!!f.doc.querySelector('.ai-question'), false, 'an answered question becomes a summary');
  assert.match(f.doc.querySelector('.ai-question-summary').textContent, /目标屏幕/);
  f.emitOps(f.state.aiStreams[1], askOp(1, [{ id: 'tone', title: '语气', options: ['专业', '轻松'] }, { id: 'extra', title: '附加区块', options: ['团队', '案例'], multiple: true }]));
  f.finish(f.state.aiStreams[1]);
  await until(() => f.button('按推荐生成') && !f.doc.querySelector('.ai-operating'), 'second question');
  f.click(f.button('按推荐生成'));
  await until(() => f.state.aiStreams.length === 3, 'recommended answers continue immediately');
  assert.match(JSON.parse(f.state.aiStreams[2].request.body.input[0].content).task, /语气：专业\n其余问题请按你的推荐决定。$/);
  f.emitOps(f.state.aiStreams[2], add(1, 'first'), { v: 1, seq: 2, op: 'done', summary: '页面完成' }); f.finish(f.state.aiStreams[2]);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelector('[data-block-id="first"]'), 'page generated after answers');
});

test('a collapsed chat reopens with a waiting question and the launcher marks it', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '做一个页面');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'request started');
  f.click(f.doc.querySelector('.ai-chat-header [aria-label="收起 AI 对话"]'));
  await until(() => !f.doc.querySelector('.ai-chat'), 'chat collapsed');
  f.emitOps(f.state.aiStreams[0], askOp(1, [{ id: 'style', title: '风格', options: ['极简', '活泼'] }])); f.finish(f.state.aiStreams[0]);
  await until(() => f.doc.querySelector('.ai-question'), 'chat reopens for the question');
  f.click(f.doc.querySelector('.ai-chat-header [aria-label="收起 AI 对话"]'));
  await until(() => f.doc.querySelector('.ai-launcher-badge'), 'launcher shows a pending question');
  assert.match(f.doc.querySelector('.ai-launcher').getAttribute('aria-label'), /等待你的回答/);
});

test('AI versions bring a generated page back after undo and a later edit cleared redo', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '创建页面');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'request started');
  f.emitOps(f.state.aiStreams[0], add(1, 'first'), add(2, 'second'), { v: 1, seq: 3, op: 'done', summary: '页面完成' }); f.finish(f.state.aiStreams[0]);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelector('.ai-version'), 'generated version recorded');
  assert.match(f.doc.querySelector('.ai-version').textContent, /AI 生成版本.*2 个组件/); assert.ok(f.doc.querySelector('.ai-version-current'));
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => !f.doc.querySelector('[data-block-id]'), 'one undo removes the whole run');
  await until(() => f.doc.querySelector('.toast')?.textContent.includes('已撤销整次 AI 生成'), 'undo explains how to get the run back');
  f.rename('误操作后的页面');
  await until(() => f.doc.querySelector('[aria-label="重做 (⌘⇧Z)"]').disabled, 'a later edit clears redo');
  // The checkpoint follows the canvas, but the generated version stays in storage.
  await until(() => JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].page.name === '误操作后的页面', 'checkpoint follows the canvas');
  assert.equal(JSON.parse(f.win.localStorage.getItem(aiSessionsKey('account:owner')))[0].versions.at(-1).page.blocks.length, 2);
  const restore = f.doc.querySelector('.ai-version-restore');
  assert.ok(restore, 'the generated version can be restored');
  f.click(restore);
  await until(() => f.doc.querySelector('[data-block-id="first"]') && f.doc.querySelector('[data-block-id="second"]'), 'generated page restored');
  await until(() => f.doc.querySelector('.ai-version-current'), 'restored version is marked current');
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => !f.doc.querySelector('[data-block-id]') && f.name().value === '误操作后的页面', 'restoring is itself undoable');
});

test('the editor passes the user selection to AI and reports generated links without spending extra requests', async t => {
  const f = fixture(t, { setup(win) {
    const draft = JSON.parse(win.localStorage.getItem('animate-studio:guest-draft:v1'));
    draft.page.blocks = [{ ...createBlock('heading'), id: 'selected-heading', frame: { x: 32, y: 32, width: 400, height: 140 } }];
    win.localStorage.setItem('animate-studio:guest-draft:v1', JSON.stringify(draft));
  } });
  await openChat(f); await configure(f);
  f.win.perform(() => f.doc.querySelector('[data-block-id="selected-heading"]').focus());
  await until(() => f.doc.querySelector('.ai-composer .ai-mini-status')?.textContent.includes('已选中 1 个组件'), 'selection is visible in the composer');
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '修改这个标题并添加按钮');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'request started');
  assert.deepEqual(JSON.parse(f.state.aiStreams[0].request.body.input[0].content).selectedBlockIds, ['selected-heading']);
  f.emitOps(f.state.aiStreams[0], { v: 1, seq: 1, op: 'add', id: 'cta', type: 'button', props: { label: '去价格区', url: '#missing-pricing' }, frame: { x: 32, y: 300, width: 240, height: 100 } }, { v: 1, seq: 2, op: 'done', summary: '完成' });
  f.finish(f.state.aiStreams[0]);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelector('[data-ai-quality]')?.textContent.includes('#missing-pricing'), 'quality report identifies the broken generated link');
  const locate = f.doc.querySelector('[data-ai-quality] button');
  f.click(locate);
  await until(() => f.doc.querySelector('[data-block-id="cta"]').hasAttribute('data-selected'), 'quality report reveals the affected block');
  assert.equal(f.state.aiStreams.length, 1, 'quality checks do not request automatic paid fixes');
});

const generatedComponent = { name: '切换价格卡', description: '月付与年付切换', html: '<button data-prop="label"></button>', css: 'button{color:var(--as-text)}', js: 'document.querySelector("button").addEventListener("click",()=>component.log("clicked"));', fields: { label: '切换方案' }, size: { width: 360, height: 200 } };
test('AI creates reusable components without changing the page and cloud upload failures retain the local definition', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  const original = JSON.parse(f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page;
  f.click(f.button('创建组件'));
  await until(() => f.doc.querySelector('[aria-label="向 AI 描述组件"]'), 'component creation mode opens');
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述组件"]'), '创建月付年付价格卡');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'component request starts');
  assert.equal(JSON.parse(f.state.aiStreams[0].request.body.input[0].content).mode, 'component');
  f.emitOps(f.state.aiStreams[0], { v: 1, seq: 1, op: 'component', id: 'pricing', component: generatedComponent }, { v: 1, seq: 2, op: 'done', summary: '组件完成' }); f.finish(f.state.aiStreams[0]);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelector('.ai-component-result'), 'reusable component is previewed');
  const local = JSON.parse(f.win.localStorage.getItem('animate-studio:custom-components:v1')).components;
  assert.equal(local.length, 1); assert.equal(local[0].html, generatedComponent.html);
  assert.deepEqual(JSON.parse(f.win.localStorage.getItem('animate-studio:guest-draft:v1')).page, original);
  assert.equal(f.doc.querySelectorAll('.free-canvas-frame').length, 0, 'component draft does not replace the original canvas');
  f.state.failComponentWrites = true; f.click(f.button('上传到云端'));
  await until(() => f.doc.querySelector('.ai-component-result .ai-error')?.textContent.includes('模拟上传失败'), 'failed upload is visible');
  assert.equal(JSON.parse(f.win.localStorage.getItem('animate-studio:custom-components:v1')).components.length, 1);
  f.state.failComponentWrites = false; f.click(f.button('上传到云端'));
  await until(() => f.button('已保存到云端'), 'cloud upload can be retried');
  assert.deepEqual([...f.state.components.values()][0].component, generatedComponent);
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述组件"]'), '把按钮文字改成开始创作'); f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 2, 'refinement starts');
  const refined = { ...generatedComponent, fields: { label: '开始创作' } };
  f.emitOps(f.state.aiStreams[1], { v: 1, seq: 1, op: 'component', id: 'pricing', component: refined }, { v: 1, seq: 2, op: 'done', summary: '修改完成' }); f.finish(f.state.aiStreams[1]);
  await until(() => f.button('更新云端组件'), 'upload association survives unmount while AI is generating');
  f.click(f.button('生成页面')); f.click(f.button('创建组件'));
  await until(() => f.button('更新云端组件'), 'mode switches preserve the upload target');
  f.click(f.button('更新云端组件'));
  await until(() => f.button('已保存到云端') && [...f.state.components.values()][0].revision === 2, 'refinement updates the same cloud component');
  assert.equal(f.state.components.size, 1);
  assert.deepEqual([...f.state.components.values()][0].component, refined);
  const links = JSON.parse(f.win.localStorage.getItem('animate-studio:ai-component-uploads:v1:account%3Aowner'));
  assert.equal(Object.values(links)[0].revision, 2, 'the cloud association survives refresh in owner-scoped storage');
  f.click(f.button('添加到页面'));
  await until(() => f.doc.querySelector('.free-canvas-frame .custom-component-frame'), 'saved component can be inserted into the original page');
  assert.equal(f.name().value, original.name);
});

test('AI page generation saves custom source in the library and can reuse it on the next request', async t => {
  const f = fixture(t); await openChat(f); await configure(f);
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '在页面中开发一个价格卡组件');
  f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 1, 'page request starts');
  f.emitOps(f.state.aiStreams[0], { v: 1, seq: 1, op: 'component', id: 'custom-first', component: generatedComponent, frame: { x: 32, y: 32, width: 360, height: 200 } }, { v: 1, seq: 2, op: 'done', summary: '页面完成' }); f.finish(f.state.aiStreams[0]);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelector('.free-canvas-frame .custom-component-frame'), 'custom component is applied to the page');
  const local = JSON.parse(f.win.localStorage.getItem('animate-studio:custom-components:v1')).components[0];
  f.fill(f.doc.querySelector('[aria-label="向 AI 描述页面"]'), '在下方复用这个组件'); f.click(f.doc.querySelector('[aria-label="发送 AI 消息"]'));
  await until(() => f.state.aiStreams.length === 2, 'reuse request starts');
  const context = JSON.parse(f.state.aiStreams[1].request.body.input[0].content);
  assert.ok(context.availableComponents.some(item => item.ref.id === local.id));
  f.emitOps(f.state.aiStreams[1], { v: 1, seq: 1, op: 'component', id: 'custom-copy', componentRef: { kind: 'local', id: local.id }, frame: { x: 32, y: 280, width: 360, height: 200 } }, { v: 1, seq: 2, op: 'done', summary: '复用完成' }); f.finish(f.state.aiStreams[1]);
  await until(() => !f.doc.querySelector('.ai-operating') && f.doc.querySelectorAll('.free-canvas-frame .custom-component-frame').length === 2, 'second instance is copied from the owned library');
  assert.equal(JSON.parse(f.win.localStorage.getItem('animate-studio:custom-components:v1')).components.length, 1, 'reuse does not duplicate library definitions');
});
