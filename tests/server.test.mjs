import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createApp, closeServer } from '../server/index.mjs';
import { createPageStore } from '../server/store.mjs';
import { componentTypes, createBlock, defaultFrame } from '../src/model.ts';
import { applyPageTheme, getTheme, saveCustomTheme, themePresets } from '../src/lib/themes.ts';
import { canvasPresets } from '../shared/canvas-sizes.mjs';
import navbarIcons from '../shared/navbar-icons.json' with { type: 'json' };

function page(name = '测试页面') {
  return { version: 1, name, settings: { background: '#ffffff', accent: '#408668', maxWidth: 1000, padding: 0 }, blocks: [
    { id: 'hero-1', type: 'hero', props: { title: '你好，世界', text: '构建一个页面', variant: '开始探索', url: '#features', align: 'center', padding: 46, animation: 'fade' } },
  ] };
}

async function fixture(t, options = {}) {
  const dataDir = options.dataDir || await fs.mkdtemp(join(tmpdir(), 'animate-studio-'));
  if (!options.dataDir) t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const app = await createApp({ dataDir, serveFrontend: false, ...options });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const close = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  t.after(close);
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + path, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { dataDir, request, base };
}

test('API reports health, saves a page and loads the same record in a new app instance', async t => {
  const first = await fixture(t);
  assert.deepEqual((await first.request('/api/health')).body, { status: 'ok' });
  assert.deepEqual((await first.request('/api/page')).body, { page: null, savedAt: null });
  const document = page();
  const saved = await first.request('/api/page', 'PUT', { page: document });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.page, document);
  assert.ok(Number.isFinite(Date.parse(saved.body.savedAt)));
  assert.deepEqual((await first.request('/api/page')).body, saved.body);
  const restarted = await fixture(t, { dataDir: first.dataDir });
  assert.deepEqual((await restarted.request('/api/page')).body, saved.body);
  assert.deepEqual(JSON.parse(await fs.readFile(join(first.dataDir, 'page.json'), 'utf8')), saved.body);
});

test('validation endpoint verifies an import without persisting it', async t => {
  const { request } = await fixture(t);
  const checked = await request('/api/validate', 'POST', { page: page() });
  assert.equal(checked.status, 200);
  assert.deepEqual(checked.body, { page: page() });
  assert.deepEqual((await request('/api/page')).body, { page: null, savedAt: null });
});

test('every library component survives import, save and restart with its initial values and frame', async t => {
  const first = await fixture(t);
  const document = page('完整组件库');
  document.settings = { ...document.settings, layout: 'free', canvasHeight: 6000 };
  document.blocks = componentTypes.map((type, i) => ({ ...createBlock(type), frame: defaultFrame(type, 1000, 0, Math.floor(i / 3) * 160) }));
  assert.equal((await first.request('/api/validate', 'POST', { page: document })).status, 200);
  const saved = await first.request('/api/page', 'PUT', { page: document });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.page, document);
  const restarted = await fixture(t, { dataDir: first.dataDir });
  assert.deepEqual((await restarted.request('/api/page')).body.page, document);
});

test('global page margins and aligned frames survive save and restart', async t => {
  const first = await fixture(t);
  const document = page();
  document.settings = { ...document.settings, padding: 37, layout: 'free', canvasHeight: 800 };
  document.blocks = [37, 380, 723].map((x, index) => ({ ...createBlock('button'), frame: { x, y: 37 + index * 116, width: 240, height: 100 } }));
  assert.equal((await first.request('/api/page', 'PUT', { page: document })).status, 200);
  const restarted = await fixture(t, { dataDir: first.dataDir });
  assert.deepEqual((await restarted.request('/api/page')).body.page, document);
});

test('navbar icon choices and custom logo URLs survive import, save and restart', async t => {
  const first = await fixture(t);
  const document = page();
  document.blocks = [undefined, ...Object.keys(navbarIcons), 'none'].map((brandIcon, index) => ({
    id: `nav-${index}`, type: 'navbar', props: { title: '品牌', ...(brandIcon ? { brandIcon } : {}),
      ...(brandIcon === 'image' ? { imageUrl: 'https://example.com/logo.svg' } : {}) },
  }));
  assert.equal((await first.request('/api/validate', 'POST', { page: document })).status, 200);
  assert.equal((await first.request('/api/page', 'PUT', { page: document })).status, 200);
  const restarted = await fixture(t, { dataDir: first.dataDir });
  assert.deepEqual((await restarted.request('/api/page')).body.page, document);
});

test('invalid component values are rejected without replacing the saved page', async t => {
  const { request } = await fixture(t);
  const original = await request('/api/page', 'PUT', { page: page() });
  const invalid = [
    ['navbar', { brandIcon: 'unknown' }], ['navbar', { brandIcon: 42 }], ['navbar', { brandIcon: 'image', imageUrl: 'javascript:alert(1)' }],
    ['inputOtp', { max: 13 }], ['inputOtp', { max: 2.5 }], ['toast', { duration: 0 }], ['typingText', { duration: 30001 }], ['button', { effect: 'invalid' }],
    ['checkbox', { checked: 'true' }], ['rating', { value: 6 }], ['rating', { value: 2.5 }],
    ['slider', { value: -1 }], ['slider', { max: 0 }], ['progress', { value: 51, max: 50 }],
    ['pagination', { value: 0 }], ['pagination', { value: 6, max: 5 }], ['pagination', { max: 2.5 }],
    ['breadcrumb', { url: 'javascript:alert(1)' }], ['avatar', { imageUrl: 'data:image/svg+xml,test' }],
  ];
  for (const [type, props] of invalid) {
    const document = { ...page(), blocks: [{ id: 'invalid', type, props }] };
    assert.equal((await request('/api/validate', 'POST', { page: document })).status, 400, `${type}: ${JSON.stringify(props)}`);
    assert.equal((await request('/api/page', 'PUT', { page: document })).status, 400);
  }
  assert.deepEqual((await request('/api/page')).body, original.body);
});

test('page and component themes survive validation, save and restart for the entire library', async t => {
  const first = await fixture(t);
  const document = applyPageTheme(page('混合主题页面'), 'tech-blue');
  document.blocks = componentTypes.flatMap(type => themePresets.map(theme => ({ ...createBlock(type), props: { theme: theme.id, accent: '#2364aa', radius: 4, title: theme.name } })));
  const blocks = document.blocks;
  for (let start = 0; start < blocks.length; start += 200) {
    const batch = { ...document, blocks: blocks.slice(start, start + 200) };
    assert.equal((await first.request('/api/validate', 'POST', { page: batch })).status, 200);
    assert.equal((await first.request('/api/page', 'PUT', { page: batch })).status, 200);
    const restarted = await fixture(t, { dataDir: first.dataDir });
    assert.deepEqual((await restarted.request('/api/page')).body.page, batch);
  }
});

test('unknown themes and invalid accent colors cannot overwrite the saved document', async t => {
  const { request } = await fixture(t);
  const original = await request('/api/page', 'PUT', { page: page() });
  for (const props of [{ theme: 'unknown' }, { theme: null }, { theme: 1 }, { accent: 'url(https://example.com)' }, { accent: '#12' }]) {
    const document = page();
    document.blocks[0].props = props;
    assert.equal((await request('/api/page', 'PUT', { page: document })).status, 400);
  }
  const document = page();
  document.settings.theme = 'unknown';
  assert.equal((await request('/api/page', 'PUT', { page: document })).status, 400);
  assert.deepEqual((await request('/api/page')).body, original.body);
});

test('free canvas settings and block frames persist and remain optional for legacy flow documents', async t => {
  const { request, dataDir } = await fixture(t);
  const document = page('自由布局');
  document.settings.layout = 'free';
  document.settings.canvasHeight = 1800;
  document.blocks[0].frame = { x: 120, y: 240, width: 640, height: 360 };
  // Bounds are per coordinate; clipping and canvas containment belong to the UI.
  document.blocks.push({ id: 'edge', type: 'button', props: { label: '边缘按钮' }, frame: { x: 1600, y: 6000, width: 40, height: 32 } });
  const saved = await request('/api/page', 'PUT', { page: document });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.page, document);
  const restarted = await fixture(t, { dataDir });
  assert.deepEqual((await restarted.request('/api/page')).body, saved.body);
  const flow = page('传统布局');
  flow.settings.layout = 'flow';
  assert.equal((await request('/api/validate', 'POST', { page: flow })).status, 200);
  assert.equal((await request('/api/validate', 'POST', { page: page() })).status, 200);
});

test('1080p, 2K and 4K canvas dimensions and wide components survive save and restart', async t => {
  const first = await fixture(t);
  const restarted = await fixture(t, { dataDir: first.dataDir });
  for (const { width, height } of canvasPresets) {
    const document = page();
    document.settings = { ...document.settings, maxWidth: width, canvasHeight: height, layout: 'free' };
    document.blocks[0].frame = { x: 0, y: 0, width, height: 390 };
    document.blocks.push({ ...createBlock('button'), frame: { x: width - 240, y: height - 100, width: 240, height: 100 } });
    assert.equal((await first.request('/api/page', 'PUT', { page: document })).status, 200);
    assert.deepEqual((await restarted.request('/api/page')).body.page, document);
  }
});

test('rejects invalid layouts, canvas heights and unsafe or incomplete block frames', async t => {
  const { request } = await fixture(t);
  for (const layout of ['absolute', '', 1, null]) {
    const document = page();
    document.settings.layout = layout;
    assert.equal((await request('/api/validate', 'POST', { page: document })).status, 400);
  }
  for (const canvasHeight of [319, 6001, '800', null]) {
    const document = page();
    document.settings.canvasHeight = canvasHeight;
    assert.equal((await request('/api/validate', 'POST', { page: document })).status, 400);
  }
  const frame = { x: 0, y: 0, width: 100, height: 100 };
  const invalidFrames = [
    null, [], {}, { x: 0, y: 0, width: 100 }, { ...frame, x: -1 }, { ...frame, x: 3841 },
    { ...frame, y: -1 }, { ...frame, y: 6001 }, { ...frame, width: 39 }, { ...frame, width: 3841 },
    { ...frame, height: 31 }, { ...frame, height: 3001 }, { ...frame, width: '100' },
    { ...frame, height: null }, { ...frame, rotate: 20 }, { ...frame, constructor: 'unsafe' },
    JSON.parse('{"x":0,"y":0,"width":100,"height":100,"__proto__":{}}'),
  ];
  for (const invalidFrame of invalidFrames) {
    const document = page();
    document.blocks[0].frame = invalidFrame;
    assert.equal((await request('/api/page', 'PUT', { page: document })).status, 400, JSON.stringify(invalidFrame));
  }
  assert.deepEqual((await request('/api/page')).body, { page: null, savedAt: null });
});

test('rejects invalid document shape, unknown keys, prototype keys, duplicate ids and out of bounds styles', async t => {
  const { request } = await fixture(t);
  const invalid = [
    { ...page(), version: 2 },
    { ...page(), name: '' },
    { ...page(), unknown: true },
    { ...page(), settings: { ...page().settings, accent: 'red' } },
    { ...page(), settings: { ...page().settings, maxWidth: 50000 } },
    { ...page(), blocks: [{ ...page().blocks[0], type: 'script' }] },
    { ...page(), blocks: [page().blocks[0], page().blocks[0]] },
    { ...page(), blocks: Array.from({ length: 201 }, (_, i) => ({ id: `text-${i}`, type: 'text', props: {} })) },
    { ...page(), blocks: [{ id: 'one', type: 'text', props: { text: 3 } }] },
    { ...page(), blocks: [{ id: 'one', type: 'text', props: { fontSize: 500 } }] },
    { ...page(), blocks: [{ id: 'one', type: 'text', props: { animation: 'bounce' } }] },
    { ...page(), blocks: [{ id: 'one', type: 'text', props: { title: 'x'.repeat(301) } }] },
    { ...page(), blocks: [{ id: 'one', type: 'text', props: { onClick: 'alert(1)' } }] },
    JSON.parse(JSON.stringify(page()).replace('"version":1', '"version":1,"__proto__":{"polluted":true}')),
    { ...page(), blocks: [{ id: 'one', type: 'text', props: { constructor: 'bad' } }] },
  ];
  for (const document of invalid) {
    const response = await request('/api/page', 'PUT', { page: document });
    assert.equal(response.status, 400, JSON.stringify(document));
    assert.equal(typeof response.body.error, 'string');
  }
  assert.equal((await request('/api/page', 'PUT', { page: page(), extra: true })).status, 400);
  assert.equal((await request('/api/page', 'PUT', {})).status, 400);
  assert.deepEqual((await request('/api/page')).body, { page: null, savedAt: null });
  assert.equal({}.polluted, undefined);
});

test('rejects executable, protocol-relative and malformed URLs while accepting supported links', async t => {
  const { request } = await fixture(t);
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//evil.example', '/\\evil.example', 'https:evil.example', 'https://', ' https://example.com', 'java\nscript:alert(1)', 'mailto:a@b.com%0d%0aBcc:c@d.com']) {
    const document = page();
    document.blocks[0].props.url = url;
    assert.equal((await request('/api/validate', 'POST', { page: document })).status, 400, url);
  }
  for (const url of ['https://example.com/a', 'http://localhost:4173', 'mailto:hello@example.com', 'tel:+8612345678901', '#features', '/about', '']) {
    const document = page();
    document.blocks[0].props.url = url;
    assert.equal((await request('/api/validate', 'POST', { page: document })).status, 200, url);
  }
  for (const imageUrl of ['mailto:a@b.com', '#image', 'data:image/svg+xml,abc', '//example.com/image.png']) {
    const document = page();
    document.blocks = [{ id: 'image-1', type: 'image', props: { imageUrl } }];
    assert.equal((await request('/api/validate', 'POST', { page: document })).status, 400, imageUrl);
  }
});

test('malformed and oversized JSON requests return JSON errors with no internal path', async t => {
  const { base, request, dataDir } = await fixture(t);
  const malformed = await fetch(base + '/api/page', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400);
  assert.match(malformed.headers.get('content-type'), /application\/json/);
  assert.equal(typeof (await malformed.json()).error, 'string');
  const huge = await request('/api/page', 'PUT', { page: { ...page(), name: 'x'.repeat(600000) } });
  assert.equal(huge.status, 413);
  assert.ok(!JSON.stringify(huge.body).includes(dataDir));
});

test('failed atomic rename preserves the saved document and later saves still succeed', async t => {
  const dataDir = await fs.mkdtemp(join(tmpdir(), 'animate-atomic-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  let failRename = false;
  const store = createPageStore({ dataDir, fs: { ...fs, rename: async (...args) => {
    if (failRename) throw new Error(`simulated rename failure at ${dataDir}`);
    return fs.rename(...args);
  } } });
  const { request } = await fixture(t, { dataDir, store });
  const original = await request('/api/page', 'PUT', { page: page('原有页面') });
  failRename = true;
  const failed = await request('/api/page', 'PUT', { page: page('不可提交的页面') });
  assert.equal(failed.status, 500);
  assert.ok(!JSON.stringify(failed.body).includes(dataDir));
  assert.deepEqual((await request('/api/page')).body, original.body);
  assert.deepEqual(JSON.parse(await fs.readFile(join(dataDir, 'page.json'), 'utf8')), original.body);
  assert.deepEqual(await fs.readdir(dataDir), ['page.json']);
  failRename = false;
  assert.equal((await request('/api/page', 'PUT', { page: page('重试成功') })).status, 200);
  assert.equal((await request('/api/page')).body.page.name, '重试成功');
});

test('concurrent API saves leave a complete document and no temporary files', async t => {
  const { request, dataDir } = await fixture(t);
  const documents = Array.from({ length: 20 }, (_, i) => page(`并发页面 ${i}`));
  const responses = await Promise.all(documents.map(document => request('/api/page', 'PUT', { page: document })));
  responses.forEach((response, index) => {
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.page, documents[index]);
  });
  const current = (await request('/api/page')).body;
  assert.ok(responses.some(response => JSON.stringify(response.body) === JSON.stringify(current)));
  assert.deepEqual(JSON.parse(await fs.readFile(join(dataDir, 'page.json'), 'utf8')), current);
  assert.deepEqual(await fs.readdir(dataDir), ['page.json']);
});

test('store commits queued writes in order and snapshots documents before waiting', async t => {
  const dataDir = await fs.mkdtemp(join(tmpdir(), 'animate-queue-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const store = createPageStore({ dataDir });
  const document = page('排队的页面');
  const writes = Array.from({ length: 10 }, (_, i) => store.save(page(`页面 ${i}`)));
  writes.push(store.save(document));
  document.name = '调用方在排队后修改';
  await Promise.all(writes);
  assert.equal((await store.read()).page.name, '排队的页面');
});

test('shutdown closes the frontend before waiting for the HTTP close callback', async () => {
  const calls = [];
  let frontendClosed = false;
  const server = {
    close(callback) {
      calls.push('http');
      assert.equal(frontendClosed, true, 'HMR connections must be closed first');
      callback();
    },
    closeIdleConnections() { calls.push('idle'); },
    closeAllConnections() { assert.fail('completed shutdown should not force active connections'); },
  };
  await closeServer(server, async () => { calls.push('frontend'); frontendClosed = true; });
  assert.deepEqual(calls, ['frontend', 'http', 'idle']);
});

test('shutdown closes HTTP even when frontend cleanup reports an error', async () => {
  const failure = new Error('frontend cleanup failed');
  let httpClosed = false;
  await assert.rejects(closeServer({ close(callback) { httpClosed = true; callback(); } }, async () => { throw failure; }), failure);
  assert.equal(httpClosed, true);
});

test('shutdown ends a stuck active HTTP connection after the grace period', async t => {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.write('stream remains open');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = httpRequest({ host: '127.0.0.1', port: server.address().port }, response => response.resume());
  request.on('error', () => {});
  t.after(() => request.destroy());
  const connected = new Promise(resolve => request.once('response', resolve));
  request.end();
  await connected;
  await closeServer(server, async () => {}, { graceMs: 10 });
  assert.equal(server.listening, false);
});


test('custom theme definitions and all component references survive import and server restart', async t => {
  const first = await fixture(t);
  const theme = { ...getTheme('tech-blue'), id: 'custom-ocean', name: '海盐蓝品牌风', accent: '#087f8c', radius: 19, controlRadius: 11 };
  const document = saveCustomTheme(page(), theme);
  document.blocks = componentTypes.map(type => ({ ...createBlock(type), props: { theme: theme.id, title: theme.name } }));
  assert.equal((await first.request('/api/validate', 'POST', { page: document })).status, 200);
  assert.equal((await first.request('/api/page', 'PUT', { page: document })).status, 200);
  const restarted = await fixture(t, { dataDir: first.dataDir });
  assert.deepEqual((await restarted.request('/api/page')).body.page, document);
});

test('invalid custom themes and dangling references cannot overwrite saved data', async t => {
  const { request } = await fixture(t);
  const theme = { ...getTheme('nature'), id: 'custom-brand', name: '品牌主题' };
  const document = saveCustomTheme(page(), theme);
  const original = await request('/api/page', 'PUT', { page: document });
  const invalid = [
    { accent: 'red' }, { canvas: '#xyz' }, { name: ' ' }, { name: 'x'.repeat(41) },
    { description: 'x'.repeat(121) }, { id: 'nature' }, { id: 'custom-' },
    { radius: -1 }, { controlRadius: 81 }, { scheme: 'auto' },
    { shadow: 'url(https://example.com)' }, { headingFont: 'url(https://example.com)' }, { extra: true },
  ];
  for (const patch of invalid) {
    const broken = structuredClone(document);
    Object.assign(broken.settings.customThemes[0], patch);
    assert.equal((await request('/api/page', 'PUT', { page: broken })).status, 400, JSON.stringify(patch));
  }
  for (const mutate of [
    doc => delete doc.settings.customThemes[0].text,
    doc => doc.settings.customThemes.push({ ...theme }),
    doc => doc.settings.customThemes.push({ ...theme, id: 'custom-another', name: ' 品牌主题 ' }),
    doc => doc.settings.customThemes = null,
    doc => doc.settings.customThemes = Array.from({ length: 31 }, (_, i) => ({ ...theme, id: `custom-${i}`, name: `主题${i}` })),
    doc => doc.settings.theme = 'custom-missing',
    doc => doc.blocks[0].props.theme = 'custom-missing',
  ]) {
    const broken = structuredClone(document); mutate(broken);
    assert.equal((await request('/api/page', 'PUT', { page: broken })).status, 400);
  }
  assert.deepEqual((await request('/api/page')).body, original.body);
});

test('variables, bindings, events and script source survive import, save and restart without execution', async t => {
  const { createInteractionDemo } = await import('../src/lib/interactions/demo.ts');
  const document = createInteractionDemo();
  document.scripts[0].code = 'throw new Error("must only execute when triggered")';
  const first = await fixture(t);
  assert.equal((await first.request('/api/validate', 'POST', { page: document })).status, 200);
  assert.equal((await first.request('/api/page', 'PUT', { page: document })).status, 200);
  const restarted = await fixture(t, { dataDir: first.dataDir });
  assert.deepEqual((await restarted.request('/api/page')).body.page, document);
  const invalid = structuredClone(document);
  invalid.blocks.find(b => b.type === 'input').bindings.value.value = 'missing';
  assert.equal((await first.request('/api/page', 'PUT', { page: invalid })).status, 400);
  assert.deepEqual((await first.request('/api/page')).body.page, document);
});


test('Animate page themes persist their canvas color through save and restart', async t => {
  const first = await fixture(t);
  for (const id of ['animate-light', 'animate-dark']) {
    const document = applyPageTheme(page(), id);
    const saved = await first.request('/api/page', 'PUT', { page: document });
    assert.equal(saved.status, 200);
    const restarted = await fixture(t, { dataDir: first.dataDir });
    const restored = (await restarted.request('/api/page')).body.page;
    assert.deepEqual(restored, document);
    assert.equal(restored.settings.background, id === 'animate-dark' ? '#000000' : '#ffffff');
  }
});
