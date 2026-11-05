import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataSource, validateDataSources, prepareDataSource, resolveDataTemplate, readDataPath, inferDataFields, normalizeDataValue } from '../shared/data-sources.mjs';
import { requestDataSource, createDataStore, DataRequestError } from '../src/lib/data/runtime.ts';
import { createInteractionRuntime } from '../shared/interactions.mjs';
import { itemField } from '../src/lib/data/item.ts';

const books = [{ id: 'a1', title: '设计中的设计', available: true }, { id: 'b2', title: '信息架构', available: false }];
const collection = { id: 'books', name: '图书列表', kind: 'static', mode: 'collection', items: books, pageSize: 1 };
const detail = { id: 'book', name: '图书详情', kind: 'rest', mode: 'single', url: 'https://api.example.com/books/{{route.id}}' };

test('site data sources validate public JSON without secrets or executable templates', () => {
  validateDataSources([collection, detail]);
  assert.throws(() => validateDataSource({ ...detail, url: 'https://user:password@example.com/data' }), /用户信息/);
  assert.throws(() => validateDataSource({ ...detail, url: 'javascript:alert(1)' }), /请求地址/);
  assert.throws(() => validateDataSource({ ...detail, url: 'https://example.com/{{state.x;alert(1)}}' }), /占位符/);
  assert.throws(() => validateDataSource({ ...detail, headers: { Authorization: 'Bearer secret' } }), /认证信息/);
  assert.throws(() => validateDataSource({ ...detail, query: { token: 'secret' } }), /令牌/);
  assert.throws(() => validateDataSource({ ...detail, url: 'https://example.com/books?api_key=secret' }), /URL 查询/);
  assert.throws(() => validateDataSource({ ...detail, headers: { 'X-Token': 'secret' } }), /认证信息/);
  assert.throws(() => validateDataSource({ ...detail, method: 'GET', body: { id: '{{route.id}}' } }), /不能携带/);
  assert.throws(() => validateDataSources([collection, collection]), /不能重复/);
  assert.throws(() => validateDataSource({ ...collection, items: JSON.parse('[{"__proto__":{"admin":true}}]') }), /不安全的字段/);
});

test('safe templates and paths resolve values, never inherited properties', () => {
  assert.equal(resolveDataTemplate('/books/{{route.id}}?q={{state.query}}', { route: { id: 'a b' }, state: { query: '设计&艺术' } }, true), '/books/a%20b?q=%E8%AE%BE%E8%AE%A1%26%E8%89%BA%E6%9C%AF');
  assert.equal(resolveDataTemplate('{{route.id}}', { route: { id: 42 } }), 42);
  assert.throws(() => resolveDataTemplate('{{route.__proto__.admin}}', { route: {} }), /缺少数据参数/);
  assert.throws(() => resolveDataTemplate('{{route.missing}}', { route: {} }), /缺少数据参数/);
  assert.equal(readDataPath({ items: [{ title: '馆藏' }] }, 'items[0].title'), '馆藏');
  assert.equal(readDataPath({ items: [] }, 'items[0].__proto__'), undefined);
  assert.deepEqual(prepareDataSource(detail, { route: { id: 'a b' } }).url, 'https://api.example.com/books/a%20b');
  assert.deepEqual(prepareDataSource({ ...detail, method: 'POST', body: { title: '{{form.title}}', count: '{{form.count}}' } }, { route: { id: 'a1' }, form: { title: '新书', count: 2 } }).body, { title: '新书', count: 2 });
  assert.deepEqual(inferDataFields(books[0]).map(field => field.path), ['id', 'title', 'available']);
  assert.throws(() => normalizeDataValue(detail, books), /应返回对象/);
});

test('public reads bound response size, timeout, method and private export access', async t => {
  assert.deepEqual(await requestDataSource(collection), books);
  const calls = [];
  const remote = { ...detail, url: 'https://api.example.com/books/a1', responsePath: 'data.book' };
  const value = await requestDataSource(remote, { fetcher: async (url, init) => { calls.push({ url, init }); return Response.json({ data: { book: books[0] } }); } });
  assert.deepEqual(value, books[0]); assert.equal(calls.length, 1);
  await assert.rejects(requestDataSource({ ...detail, method: 'POST', body: {} }), /用户提交表单/);
  await assert.rejects(requestDataSource({ ...detail, transport: 'proxy' }, { access: { scope: 'export' } }), /私有数据/);
  const slow = requestDataSource({ ...detail, url: 'https://api.example.com/books/a1', timeoutMs: 100 }, { fetcher: (_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason)); }) });
  await assert.rejects(slow, error => error instanceof DataRequestError && error.code === 'timeout');
  await assert.rejects(requestDataSource({ ...detail, url: 'https://api.example.com/books/a1' }, { fetcher: async () => new Response('{"large":"' + 'x'.repeat(1024 * 1024) + '"}', { headers: { 'Content-Type': 'application/json' } }) }), /1 MiB/);
  await assert.rejects(requestDataSource({ ...detail, url: 'https://api.example.com/books/a1' }, { fetcher: async () => Response.json(books) }), /应返回对象/);
});

test('one source is deduplicated, stale reads are cancelled and pagination is local for static data', async () => {
  const store = createDataStore([collection], { scope: 'preview' });
  await store.load('books', store.keyFor('books'));
  assert.equal(store.get('books').items.length, 1);
  assert.equal(store.get('books').items[0].id, 'a1');
  assert.equal(store.get('books').pageCount, 2);
  await store.load('books', store.keyFor('books'));
  store.get('books').setPage(2);
  await store.load('books', store.keyFor('books'), 2);
  assert.equal(store.get('books').items[0].id, 'b2');
  assert.deepEqual(store.values().books, books);
  store.dispose();
});

test('primitive collection entries remain renderable instead of being silently filtered', async () => {
  const store = createDataStore([{ id: 'labels', name: '标签', kind: 'static', mode: 'collection', items: ['文字', null, 3] }], { scope: 'preview' });
  await store.load('labels', store.keyFor('labels'));
  assert.equal(store.get('labels').items[0].value, '文字');
  assert.equal(store.get('labels').items[1].value, null);
  assert.equal(store.get('labels').items[2].value, 3);
  assert.equal(itemField('{{item}}', store.get('labels').items[2], 2), '3');
  store.dispose();
});

test('interaction expressions expose read-only data roots alongside route and state', () => {
  const runtime = createInteractionRuntime({ blocks: [] }, { data: { book: books[0], books } });
  assert.equal(runtime.evaluate('data.book.title'), '设计中的设计');
  assert.equal(runtime.evaluate('data.books[0].title'), '设计中的设计');
  assert.equal(runtime.evaluate('data.books[1].available'), false);
  assert.equal(runtime.evaluate('data.__proto__'), undefined);
  runtime.setData({ book: books[1] });
  assert.equal(runtime.evaluate('data.book.title'), '信息架构');
  assert.throws(() => runtime.validateExpression('data.book.title = "x"'), /表达式/);
  assert.throws(() => runtime.validateExpression('unknown.title'), /仅支持/);
});

test('POST queries preserve nested JSON and custom content type across direct preview and export', async () => {
  const source = { ...detail, id: 'coils', mode: 'collection', url: 'http://10.0.0.8/query', method: 'POST', operation: 'read', responsePath: 'items', headers: { 'content-type': 'application/json;charset=UTF-8', 'X-Plant': 'A' }, credentials: 'include', body: { planCoils: '{{state.coils}}', __sys__: { status: 0 }, __blocks__: {} } };
  validateDataSource(source);
  const calls = [];
  for (const scope of ['editor', 'share', 'export']) {
    const result = await requestDataSource(source, { access: { scope }, context: { state: { coils: ['001', '002'] } }, fetcher: async (url, init) => { calls.push({ url, init }); return Response.json({ items: books }); } });
    assert.deepEqual(result, books);
  }
  for (const { url, init } of calls) {
    assert.equal(url, source.url); assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'include');
    assert.equal(init.headers['content-type'], 'application/json;charset=UTF-8');
    assert.equal(init.headers['x-plant'], 'A');
    assert.deepEqual(JSON.parse(init.body), { planCoils: ['001', '002'], __sys__: { status: 0 }, __blocks__: {} });
  }
  await assert.rejects(requestDataSource(source, { allowWrite: true }), /用于提交/);
  await assert.rejects(requestDataSource({ ...source, operation: undefined }), /用户提交表单/);
  assert.throws(() => validateDataSource({ ...source, method: 'PUT' }), /查询数据源/);
  assert.throws(() => validateDataSource({ ...detail, method: 'GET', operation: 'write' }), /提交数据源/);
});

test('tab-only headers are scoped to owner/site/source/URL and never enter persisted sources', async () => {
  const { browserHeaderScope, getBrowserHeaders, setBrowserHeaders } = await import('../src/lib/data/browser-headers.ts');
  const { compileHeaderRows } = await import('../src/lib/data/header-fields.ts');
  const compiled = compileHeaderRows([{ id: 'one', name: 'x-token', value: 'test-tab-secret', local: false }, { id: 'two', name: 'Content-Type', value: 'application/json;charset=UTF-8', local: false }]);
  const source = { ...detail, url: 'https://coil.example.test/query', browserHeaders: compiled.browserHeaders, headers: compiled.headers };
  validateDataSource(source);
  const scope = browserHeaderScope('test-site', 'owner');
  setBrowserHeaders(scope, source, compiled.values);
  assert.equal(JSON.stringify(source).includes('test-tab-secret'), false);
  let calls = 0;
  const fetcher = async (_url, init) => { calls++; assert.equal(init.headers['x-token'], 'test-tab-secret'); assert.equal(init.redirect, 'error'); return Response.json(books[0]); };
  await requestDataSource(source, { access: { scope: 'editor', browserScope: scope }, fetcher });
  for (const access of [{ scope: 'export', browserScope: scope }, { scope: 'share', browserScope: scope }, { scope: 'editor', browserScope: browserHeaderScope('test-site', 'other') }, { scope: 'editor', browserScope: browserHeaderScope('another-site', 'owner') }]) await assert.rejects(requestDataSource(source, { access, fetcher }), /标签页/);
  await assert.rejects(requestDataSource({ ...source, url: 'https://other.example.test/query' }, { access: { scope: 'editor', browserScope: scope }, fetcher }), /标签页/);
  assert.equal(calls, 1);
  assert.deepEqual(getBrowserHeaders(scope, { ...source, id: 'different' }), {});
  setBrowserHeaders(scope, { ...source, browserHeaders: undefined }, {});
  await assert.rejects(requestDataSource(source, { access: { scope: 'editor', browserScope: scope }, fetcher }), /标签页/);
});

test('header rows reject browser-managed fields, duplicate names and unsafe values without persisting auth', async () => {
  const { compileHeaderRows } = await import('../src/lib/data/header-fields.ts');
  const row = (name, value = 'test') => ({ id: name, name, value, local: false });
  for (const name of ['Cookie', 'Origin', 'Referer', 'Connection', 'Sec-Fetch-Site']) assert.throws(() => compileHeaderRows([row(name)]), /浏览器管理/);
  assert.throws(() => compileHeaderRows([row('Accept'), row('accept')]), /重复/);
  assert.throws(() => compileHeaderRows([row('X-Plant', 'a\r\nb')]), /控制字符/);
  validateDataSource({ ...detail, browserHeaders: ['x-token', 'Cookie'], transport: 'proxy' });
  assert.throws(() => validateDataSource({ ...detail, credentials: 'include', transport: 'proxy' }), /仅支持浏览器/);
  assert.throws(() => validateDataSource({ ...detail, browserHeaders: ['Cookie'] }), /浏览器管理/);
  assert.throws(() => validateDataSource({ ...detail, browserHeaders: ['x-token'], url: 'https://{{state.host}}/query' }), /主机不能/);
  assert.throws(() => validateDataSource({ ...collection, operation: 'read' }), /仅 REST/);
});

test('changing tab headers refreshes only subscribed matching sources and stops after disposal', async () => {
  const { setBrowserHeaders } = await import('../src/lib/data/browser-headers.ts');
  const source = { ...detail, url: 'https://coil.example.test/refresh', browserHeaders: ['x-token'] };
  const scope = 'refresh-test'; let calls = 0;
  setBrowserHeaders(scope, source, { 'x-token': 'first' });
  const store = createDataStore([source], { scope: 'editor', browserScope: scope }, async () => { calls++; return Response.json(books[0]); });
  const unsubscribe = store.subscribe(() => {});
  await store.load(source.id, store.keyFor(source.id));
  setBrowserHeaders('another-scope', source, { 'x-token': 'ignored' });
  assert.equal(calls, 1);
  setBrowserHeaders(scope, source, { 'x-token': 'second' });
  await store.load(source.id, store.keyFor(source.id));
  assert.equal(calls, 2);
  unsubscribe(); store.dispose();
  setBrowserHeaders(scope, source, { 'x-token': 'third' });
  assert.equal(calls, 2);
});

test('forwarding includes declared tab headers and their saved target without persisting values', async () => {
  const { setBrowserHeaders } = await import('../src/lib/data/browser-headers.ts');
  const { compileHeaderRows } = await import('../src/lib/data/header-fields.ts');
  const rows = compileHeaderRows([{ id: 'a', name: 'x-token', value: 'forward-token', local: false }, { id: 'b', name: 'Cookie', value: 'JSESSIONID=fixture-session', local: false }, { id: 'c', name: 'Origin', value: 'https://business.example', local: false }], 'proxy');
  const source = { ...detail, url: 'https://business.example/query', method: 'POST', operation: 'read', transport: 'proxy', body: { ids: ['001'] }, headers: rows.headers, browserHeaders: rows.browserHeaders };
  validateDataSource(source); setBrowserHeaders('forward-scope', source, rows.values);
  const calls = [];
  await requestDataSource(source, { access: { scope: 'editor', pageId: 'saved-site', browserScope: 'forward-scope' }, fetcher: async (url, init) => { calls.push({ url, init }); return Response.json({ value: { id: '001' } }); } });
  assert.equal(calls[0].url, '/api/account/data/query');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.requestHeaders, { 'x-token': 'forward-token', Cookie: 'JSESSIONID=fixture-session' });
  assert.equal(body.requestHeaderTarget, source.url);
  assert.equal(JSON.stringify(source).includes('forward-token'), false);
  assert.equal(JSON.stringify(source).includes('fixture-session'), false);
  for (const name of ['Host', 'Content-Length', 'Connection', 'Sec-Fetch-Site']) assert.throws(() => compileHeaderRows([{ id: name, name, value: 'bad', local: true }], 'proxy'), /传输层管理/);
});
