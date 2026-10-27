import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlock, createDocument } from '../src/model.ts';
import { toSiteDocument } from '../shared/site-document.mjs';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';
import en from '../src/i18n/en.json' with { type: 'json' };

const bundle = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import App from './src/App';import {initializeLocale} from './src/i18n';initializeLocale();import {AccountProvider} from './src/components/AccountProvider';import {MotionConfig} from 'motion/react';import {AnimateUIProvider} from '@animate-ui/react/provider';const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<MotionConfig reducedMotion="always"><AnimateUIProvider reducedMotion="always"><AccountProvider><App/></AccountProvider></AnimateUIProvider></MotionConfig>));`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, external: ['shiki', 'virtual:animate-studio-native-export'],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_STUDIO_CLOUD': 'false' }, logLevel: 'silent',
  plugins: [{ name: 'raw', setup(build) { build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' })); build.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text', resolveDir: dirname(args.path) })); } }],
});
async function until(predicate, description, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) assert.fail(description); await new Promise(resolve => setTimeout(resolve, 10)); }
}
function fixture(t) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://publish.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const win = dom.window;
  win.localStorage.setItem('animate-studio:locale', 'zh-CN');
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  Object.assign(win, { Headers, Request, Response, AbortSignal, AbortController, structuredClone, TextEncoder, TextDecoder });
  win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {}; win.HTMLElement.prototype.scrollTo = () => {};
  const guest = createDocument(true); guest.name = '发布测试';
  guest.blocks = [{ ...createBlock('text'), id: 'intro', props: { ...createBlock('text').props, text: '版本一' }, frame: { x: 48, y: 48, width: 600, height: 140 } }];
  win.localStorage.setItem('animate-studio:guest-draft:v1', JSON.stringify({ page: guest, savedAt: '2026-10-23T00:00:00Z' }));
  let clock = 0;
  const timestamp = () => new Date(Date.UTC(2026, 9, 27, 0, 0, ++clock)).toISOString();
  const state = { user: { id: 'owner', email: 'owner@publish.test', name: 'Owner' }, pages: new Map(), versions: new Map(), shares: new Map(), publishCalls: 0, rollbackCalls: 0, publishConflict: false, versionDelay: 0, detailDelays: {}, aborts: 0, versionReads: 0 };
  const record = (id, page, savedAt = '2026-10-23T00:00:00.000Z') => {
    const share = state.shares.get(id);
    return { id, name: page.name, page: structuredClone(page), createdAt: savedAt, updatedAt: savedAt, savedAt, shareToken: share?.token ?? null, publishedAt: share?.publishedAt ?? null, publishedVersion: share?.version ?? null };
  };
  const write = (id, page) => {
    const savedAt = timestamp(), previous = state.pages.get(id);
    const current = { ...record(id, page, previous?.createdAt ?? savedAt), updatedAt: savedAt, savedAt };
    state.pages.set(id, current); if (!state.versions.has(id)) state.versions.set(id, []);
    return current;
  };
  const version = (id, snapshot, sourceVersion) => {
    const list = state.versions.get(id) ?? [], number = (list.at(-1)?.version ?? 0) + 1, createdAt = timestamp();
    list.push({ id: `${id}:${number}`, version: number, createdAt, sourceVersion, page: structuredClone(snapshot) }); state.versions.set(id, list);
    const token = state.shares.get(id)?.token ?? 'share-token';
    state.shares.set(id, { token, snapshot: structuredClone(snapshot), publishedAt: createdAt, version: number });
    return { token, publishedAt: createdAt, version: number, sourceVersion };
  };
  win.fetch = async (url, options = {}) => {
    const path = String(url), method = options.method ?? 'GET', body = options.body ? JSON.parse(options.body) : null;
    options.signal?.addEventListener('abort', () => { state.aborts++; }, { once: true });
    const pause = async ms => { if (ms) await new Promise(resolve => setTimeout(resolve, ms)); if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
    if (path === '/api/auth/get-session') return Response.json(state.user ? { user: state.user } : null);
    if (path === '/api/account/config') return Response.json({ cloudEnabled: true, emailEnabled: true, githubEnabled: true });
    if (path === '/api/account/preferences') return Response.json({ version: 1, studioTheme: 'light', inspectorDisclosures: {} });
    if (path === '/api/account/pages' && method === 'GET') return Response.json({ pages: [...state.pages.values()].map(page => record(page.id, page.page, page.updatedAt)) });
    if (path === '/api/account/sites' && method === 'POST') return Response.json(write('cloud-site', body.site), { status: 201 });
    const siteMatch = path.match(/^\/api\/account\/sites\/([^/]+)$/);
    if (siteMatch) {
      const id = siteMatch[1], current = state.pages.get(id);
      if (!current) return Response.json({ error: '未找到站点' }, { status: 404 });
      if (method === 'PUT') {
        if (body.expectedRevision !== current.savedAt) return Response.json({ error: '修订冲突' }, { status: 409 });
        return Response.json(write(id, body.site));
      }
      return Response.json(record(id, current.page, current.updatedAt));
    }
    const versionsMatch = path.match(/^\/api\/account\/sites\/([^/]+)\/versions$/);
    if (versionsMatch) {
      state.versionReads++;
      await pause(state.versionDelay);
      const list = state.versions.get(versionsMatch[1]) ?? [];
      return Response.json({ versions: list.map(({ page, ...metadata }) => metadata).slice().reverse() });
    }
    const versionMatch = path.match(/^\/api\/account\/sites\/([^/]+)\/versions\/(\d+)(\/rollback)?$/);
    if (versionMatch) {
      const [, id, number, rollback] = versionMatch, selected = (state.versions.get(id) ?? []).find(item => item.version === Number(number));
      if (!selected) return Response.json({ error: '未找到版本' }, { status: 404 });
      await pause(state.detailDelays[Number(number)] ?? 0);
      if (rollback) {
        state.rollbackCalls++;
        const share = state.shares.get(id);
        if (!share || share.version !== body.expectedPublishedVersion) return Response.json({ error: '公开版本已变化' }, { status: 409 });
        return Response.json(version(id, selected.page, selected.version));
      }
      return Response.json(selected);
    }
    const pageMatch = path.match(/^\/api\/account\/pages\/([^/]+)$/);
    if (pageMatch) {
      const current = state.pages.get(pageMatch[1]);
      return current ? Response.json(record(current.id, current.page, current.updatedAt)) : Response.json({ error: '未找到页面' }, { status: 404 });
    }
    const shareMatch = path.match(/^\/api\/account\/pages\/([^/]+)\/share$/);
    if (shareMatch) {
      const id = shareMatch[1];
      if (method === 'DELETE') { state.shares.delete(id); return new Response(null, { status: 204 }); }
      state.publishCalls++;
      if (state.publishConflict) return Response.json({ error: '模拟发布冲突' }, { status: 409 });
      const current = state.pages.get(id), share = state.shares.get(id);
      if (!current || current.savedAt !== body?.expectedRevision || (share?.version ?? null) !== body?.expectedPublishedVersion) return Response.json({ error: '发布前提已变化' }, { status: 409 });
      if (share && JSON.stringify(share.snapshot) === JSON.stringify(current.page)) return Response.json({ token: share.token, publishedAt: share.publishedAt, version: share.version, sourceVersion: null, unchanged: true });
      return Response.json(version(id, current.page, null));
    }
    if (path === '/api/shared/share-token') {
      const share = state.shares.get('cloud-site');
      return share ? Response.json({ page: share.snapshot, publishedAt: share.publishedAt, publishedVersion: share.version }) : Response.json({ error: '分享已关闭' }, { status: 404 });
    }
    return Response.json({ error: `未模拟接口 ${path}` }, { status: 404 });
  };
  win.eval(bundle.outputFiles[0].text);
  const doc = win.document;
  t.after(() => { win.unmount?.(); win.close(); assert.deepEqual(errors, []); });
  const click = element => { assert.ok(element, 'expected an action'); win.perform(() => element.click()); };
  const button = text => [...doc.querySelectorAll('button')].find(item => item.textContent.trim() === text);
  const openMore = async () => {
    await until(() => doc.querySelector('.more-actions-button')?.title.includes('owner@publish.test'), 'account session ready');
    win.perform(() => doc.querySelector('.more-actions-button').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    await until(() => doc.querySelector('.workbench-more-menu'), 'more menu ready');
  };
  const openPublish = async (waitLoaded = true) => {
    await openMore(); click(doc.querySelector(`[aria-label="${doc.documentElement.lang === 'en' ? en['分享页面'] : '分享页面'}"]`));
    await until(() => doc.querySelector('.publish-center-dialog'), 'publish center ready');
    if (waitLoaded) await until(() => !doc.querySelector('.publish-loading'), 'publish status loaded');
  };
  const closePublish = async () => {
    await until(() => doc.querySelector('[aria-label="关闭发布与分享"]')?.disabled === false, 'publish actions settled');
    click(doc.querySelector('[aria-label="关闭发布与分享"]'));
    await until(() => !doc.querySelector('.publish-center-dialog'), 'publish center closed');
  };
  const editText = async value => {
    win.perform(() => doc.querySelector('[data-block-id="intro"]').focus());
    await until(() => doc.querySelector('textarea[aria-label="描述文字"]'), 'text inspector ready');
    const input = doc.querySelector('textarea[aria-label="描述文字"]');
    win.perform(() => { Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new win.Event('input', { bubbles: true })); });
    await until(() => state.pages.get('cloud-site')?.page.pages[0].page.blocks[0].props.text === value, `cloud draft saved: ${value}`);
  };
  return { win, doc, state, click, button, openMore, openPublish, closePublish, editText };
}

test('publish center publishes reviewed changes, rolls back publicly and restores drafts with one undo', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('input[aria-label="页面名称"]'), 'editor ready');
  await f.openPublish();
  assert.ok(f.doc.querySelector('[data-testid="publish-diff"]').textContent.includes('1 个页面有变化'));
  f.click(f.button('检查并发布')); f.click(f.button('确认公开发布'));
  await until(() => f.doc.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 1'), 'first version published');
  assert.equal(f.state.versions.get('cloud-site').length, 1);
  await f.closePublish();
  await f.editText('版本二');
  await f.openPublish();
  assert.ok(f.doc.querySelector('[data-testid="publish-diff"]').textContent.includes('1 个组件有变化'));
  f.click(f.button('检查并更新分享')); f.click(f.button('确认公开发布'));
  await until(() => f.doc.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 2'), 'second version published');
  await f.closePublish();
  await f.editText('版本三（未发布）');
  await f.openPublish(); f.click(f.doc.querySelector('#publish-history-tab'));
  await until(() => f.doc.querySelectorAll('.publish-version').length === 2, 'two versions listed');
  f.click([...f.doc.querySelectorAll('.publish-version')].find(item => item.querySelector('strong')?.textContent === '版本 1'));
  await until(() => f.doc.querySelector('.publish-version-detail h3')?.textContent.includes('版本 1'), 'version one compared');
  f.click(f.button('回滚公开内容')); f.click(f.button('确认公开回滚'));
  try {
    await until(() => f.state.shares.get('cloud-site')?.version === 3 && [...f.doc.querySelectorAll('.publish-version')].some(item => item.textContent.includes('回滚自版本 1')), 'rollback creates version three with source metadata');
  } catch (error) {
    console.error('rollback failure context', JSON.stringify({ calls: f.state.rollbackCalls, share: f.state.shares.get('cloud-site'), error: f.doc.querySelector('.account-error')?.textContent, panel: f.doc.querySelector('#publish-history-panel')?.textContent }));
    throw error;
  }
  assert.equal(f.state.pages.get('cloud-site').page.pages[0].page.blocks[0].props.text, '版本三（未发布）', 'public rollback leaves the draft alone');
  assert.equal(f.state.shares.get('cloud-site').snapshot.pages[0].page.blocks[0].props.text, '版本一');
  f.click(f.button('恢复到编辑草稿')); f.click(f.button('确认恢复草稿'));
  await until(() => f.doc.querySelector('[data-block-id="intro"] .page-paragraph')?.textContent === '版本一', 'history restored into the editor');
  await f.closePublish();
  f.click(f.doc.querySelector('[aria-label="撤销 (⌘Z)"]'));
  await until(() => f.doc.querySelector('[data-block-id="intro"] .page-paragraph')?.textContent === '版本三（未发布）', 'one undo restores the outgoing draft');
  assert.equal(f.state.shares.get('cloud-site').snapshot.pages[0].page.blocks[0].props.text, '版本一', 'draft restore and undo never publish implicitly');
  await f.openPublish();
  f.click(f.button('关闭分享')); f.click(f.button('确认关闭分享'));
  await until(() => f.doc.querySelector('.publish-current-status')?.textContent.includes('当前未公开'), 'sharing closed');
  assert.equal(f.state.versions.get('cloud-site').length, 3, 'closing sharing preserves version history');
  f.click(f.doc.querySelector('#publish-history-tab'));
  await until(() => f.doc.querySelector('.publish-version-detail h3'), 'history remains readable while offline');
  assert.equal(f.button('回滚公开内容').disabled, true);
});

test('publish conflicts preserve drafts, prevent duplicate submits and allow a clean retry', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('input[aria-label="页面名称"]'), 'editor ready');
  f.state.publishConflict = true;
  await f.openPublish(); f.click(f.button('检查并发布'));
  const confirm = f.button('确认公开发布'); f.click(confirm); f.click(confirm);
  await until(() => f.doc.querySelector('.account-error')?.textContent.includes('模拟发布冲突'), 'conflict is visible in place');
  assert.equal(f.state.publishCalls, 1);
  assert.equal(f.state.versions.get('cloud-site').length, 0);
  assert.equal(f.doc.querySelector('[data-block-id="intro"] .page-paragraph').textContent, '版本一');
  f.state.publishConflict = false;
  f.click(f.button('重新读取'));
  await until(() => !f.doc.querySelector('.account-error') && !f.doc.querySelector('.publish-loading'), 'publish status reloaded after conflict');
  f.click(f.button('确认公开发布'));
  await until(() => f.doc.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 1'), 'retry publishes normally');
});

test('publish center cancels obsolete reads and renders English workflow labels', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('input[aria-label="页面名称"]'), 'editor ready');
  await f.openPublish(); f.click(f.button('检查并发布')); f.click(f.button('确认公开发布'));
  await until(() => f.doc.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 1'), 'published before cancellation check');
  await f.closePublish();
  f.state.versionDelay = 80; f.state.versionReads = 0;
  await f.openPublish(false);
  await until(() => f.state.versionReads > 0, 'version request started');
  await f.closePublish();
  await until(() => f.state.aborts > 0, 'obsolete version request is aborted');
  assert.equal(f.doc.querySelector('.publish-center-dialog'), null);
  f.state.versionDelay = 0;
  f.win.localStorage.setItem('animate-studio:locale', 'en');
  f.win.perform(() => f.win.dispatchEvent(new f.win.StorageEvent('storage', { key: 'animate-studio:locale', newValue: 'en' })));
  await f.openPublish();
  assert.ok(f.button('Review & update sharing'));
  assert.ok(f.doc.querySelector('#publish-history-tab').textContent.includes('Version history'));
  assert.ok(f.doc.querySelector('.publish-current-status').textContent.includes('Current public version 1'));
  assert.ok(f.doc.querySelector('.publish-diff-summary').textContent.includes('The content is identical'));
});

test('rapid version selection keeps the latest requested snapshot and cancels the older read', async t => {
  const f = fixture(t); await until(() => f.doc.querySelector('input[aria-label="页面名称"]'), 'editor ready');
  await f.openPublish(); f.click(f.button('检查并发布')); f.click(f.button('确认公开发布'));
  await until(() => f.doc.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 1'), 'first version ready');
  await f.closePublish(); await f.editText('第二个版本');
  await f.openPublish(); f.click(f.button('检查并更新分享')); f.click(f.button('确认公开发布'));
  await until(() => f.doc.querySelector('.publish-current-status')?.textContent.includes('当前公开版本 2'), 'second version ready');
  await f.closePublish();
  f.state.detailDelays = { 2: 80, 1: 10 };
  await f.openPublish(); f.click(f.doc.querySelector('#publish-history-tab'));
  await until(() => f.doc.querySelector('.publish-version-detail .publish-loading'), 'older version read is pending');
  f.click([...f.doc.querySelectorAll('.publish-version')].find(item => item.querySelector('strong')?.textContent === '版本 1'));
  await until(() => f.doc.querySelector('.publish-version-detail h3')?.textContent.includes('版本 1'), 'latest selection is rendered');
  assert.ok(f.state.aborts > 0, 'the superseded version request was cancelled');
  assert.equal(f.doc.querySelector('.publish-version-detail h3').textContent.includes('版本 2'), false);
});
