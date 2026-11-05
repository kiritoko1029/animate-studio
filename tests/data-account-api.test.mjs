import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createDataCredentialRepository } from '../db/data-credential-repository.ts';
import { handleAccountApi } from '../server/account-api.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { createDocument } from '../src/model.ts';
import { validateSite } from '../server/validation.mjs';
import { encryptDataCredential, decryptDataCredential } from '../server/data-credential-crypto.ts';
import { executeDataQuery, isPrivateAddress, checkDataRateLimit } from '../server/data-query.ts';

const secret = 'data-test-secret-0123456789abcdef';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'studio-data-'));
  const database = await createNodeDatabase({}, { file: join(dir, 'accounts.sqlite') });
  await applyNodeMigrations(database);
  t.after(async () => { await database.close(); await rm(dir, { recursive: true, force: true }); });
  const sqlite = database.db.$client;
  sqlite.prepare('INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('owner', 'Owner', 'owner@example.test', 1, '2026-10-26T00:00:00Z', '2026-10-26T00:00:00Z');
  const repository = createPageRepository(database.db, database.schema);
  const credentials = createDataCredentialRepository(database.db, database.schema.studioDataCredentials);
  const calls = [], books = [{ id: 'a1', title: '设计中的设计' }];
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    calls.push({ method: req.method, url: req.url, authorization: req.headers.authorization, token: req.headers['x-token'], cookie: req.headers.cookie, origin: req.headers.origin, referer: req.headers.referer, agent: req.headers['user-agent'], body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/redirect-private') { res.writeHead(302, { Location: 'http://127.0.0.1:1/private' }); res.end(); return; }
    if (req.url === '/slow') { await new Promise(resolve => setTimeout(resolve, 250)); res.end('[]'); return; }
    if (req.method === 'GET' && req.url === '/api/books') { res.end(JSON.stringify({ data: books })); return; }
    if (req.method === 'POST' && req.url === '/api/books') { const book = { id: crypto.randomUUID(), title: body.title }; books.push(book); res.writeHead(201); res.end(JSON.stringify(book)); return; }
    const match = req.url.match(/^\/api\/books\/([^/]+)$/), index = match ? books.findIndex(book => book.id === match[1]) : -1;
    if (match && index >= 0 && req.method === 'GET') { res.end(JSON.stringify(books[index])); return; }
    if (match && index >= 0 && req.method === 'PUT') { books[index].title = body.title; res.end(JSON.stringify(books[index])); return; }
    res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const base = `http://127.0.0.1:${upstream.address().port}`, host = new URL(base).host;
  const credential = await credentials.create('owner', { name: '图书服务', kind: 'bearer', allowedHosts: [host], encryptedSecret: encryptDataCredential('credential-test-value', secret) });
  const site = createSiteDocument(createDocument(true));
  site.dataSources = [{ id: 'books', name: '图书列表', kind: 'rest', mode: 'collection', url: `${base}/api/books`, responsePath: 'data', transport: 'proxy', credentialId: credential.id }];
  validateSite(site);
  const record = await repository.create('owner', site, crypto.randomUUID());
  const context = {
    auth: { api: {} }, repository, newPageId: () => crypto.randomUUID(), newShareToken: () => crypto.randomUUID().replaceAll('-', ''),
    capabilities: { cloudEnabled: true, emailEnabled: false, githubEnabled: false }, canonicalOrigin: 'https://studio.test',
    resolveUser: async request => request.headers.get('x-test-user') === 'guest' ? null : { id: request.headers.get('x-test-user') || 'owner', email: 'owner@example.test', name: 'Owner' },
    data: { credentials, encryptionSecret: secret, query: { allowedHosts: [host], lookup: async hostname => [{ address: hostname === 'rebinding.example' ? '127.0.0.1' : '93.184.216.34' }] } },
  };
  const call = async (path, body, user = 'owner', method = 'POST') => {
    const result = await handleAccountApi(new Request(`https://studio.test${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'https://studio.test', 'x-test-user': user }, body: JSON.stringify(body) }), context, path);
    return result.payload;
  };
  return { call, repository, credentials, record, site, base, host, credential, calls, books };
}

test('owner-scoped saved sources read data; arbitrary URLs and other users cannot use the proxy', async t => {
  const f = await fixture(t);
  const result = await f.call('/api/account/data/query', { pageId: f.record.id, sourceId: 'books', route: {} });
  assert.equal(result.status, 200); assert.deepEqual(result.body.value, f.books);
  assert.equal(f.calls.at(-1).authorization, 'Bearer credential-test-value');
  f.site.dataSources.push({ id: 'direct', name: '公开直连', kind: 'rest', mode: 'collection', url: 'https://public.example/books' });
  assert.equal((await f.repository.saveSite('owner', f.record.id, f.site, f.record.savedAt)).status, 'saved');
  assert.equal((await f.call('/api/account/data/query', { pageId: f.record.id, sourceId: 'direct' })).status, 400, 'direct sources cannot bypass CORS through the proxy');
  assert.equal((await f.call('/api/account/data/query', { pageId: f.record.id, sourceId: 'books' }, 'other')).status, 404);
  assert.equal((await f.call('/api/account/data/query', { pageId: f.record.id, sourceId: 'books' }, 'guest')).status, 401);
  assert.equal((await f.call('/api/account/data/query', { pageId: f.record.id, sourceId: 'other' })).status, 404);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.call('/api/account/data/query', { pageId: f.record.id, sourceId: 'books', url: 'http://169.254.169.254/' })).status, 400, 'the URL field is rejected by the strict request schema');
  assert.equal(f.calls.length, 1);
});

test('confirmed POST and PUT mutate the fixture, not just the page document', async t => {
  const f = await fixture(t);
  f.site.dataSources.push({ id: 'createBook', name: '创建图书', kind: 'rest', mode: 'single', method: 'POST', url: `${f.base}/api/books`, body: { title: '{{form.title}}' }, transport: 'proxy', credentialId: f.credential.id });
  const saved = await f.repository.saveSite('owner', f.record.id, f.site, f.record.savedAt);
  assert.equal(saved.status, 'saved');
  const write = { pageId: f.record.id, sourceId: 'createBook', form: { title: '新书' } };
  assert.equal((await f.call('/api/account/data/query', write)).status, 400);
  assert.equal(f.books.length, 1, 'unconfirmed writes never reach the service');
  const created = await f.call('/api/account/data/query', { ...write, confirmed: { method: 'POST', host: f.host } });
  assert.equal(created.status, 200); assert.equal(f.books[1].title, '新书');
  f.site.dataSources.push({ id: 'updateBook', name: '更新图书', kind: 'rest', mode: 'single', method: 'PUT', url: `${f.base}/api/books/{{route.id}}`, body: { title: '{{form.title}}' }, transport: 'proxy', credentialId: f.credential.id });
  const next = await f.repository.saveSite('owner', f.record.id, f.site, saved.record.savedAt); assert.equal(next.status, 'saved');
  const updated = await f.call('/api/account/data/query', { pageId: f.record.id, sourceId: 'updateBook', route: { id: 'a1' }, form: { title: '更新后的书名' }, confirmed: { method: 'PUT', host: f.host } });
  assert.equal(updated.status, 200); assert.equal(f.books[0].title, '更新后的书名');
  assert.equal((await f.repository.saveSite('owner', f.record.id, f.site, saved.record.savedAt)).status, 'conflict');
});

test('credential metadata and page snapshots never expose the plaintext secret', async t => {
  const f = await fixture(t);
  const stored = await f.credentials.findOwned('owner', f.credential.id);
  assert.ok(!stored.encryptedSecret.includes('credential-test-value'));
  assert.equal(decryptDataCredential(stored.encryptedSecret, secret), 'credential-test-value');
  const parts = stored.encryptedSecret.split('.'), bytes = Buffer.from(parts[3], 'base64url'); bytes[0] ^= 1; parts[3] = bytes.toString('base64url');
  assert.throws(() => decryptDataCredential(parts.join('.'), secret), /无法解密/);
  const list = await f.call('/api/account/data/credentials', undefined, 'owner', 'GET');
  assert.equal(list.status, 200); assert.equal(list.body.credentials[0].name, '图书服务'); assert.equal(list.body.credentials[0].encryptedSecret, undefined);
  assert.ok(!JSON.stringify(list).includes('credential-test-value'));
  const created = await f.call('/api/account/data/credentials', { name: '测试凭据', kind: 'bearer', allowedHosts: ['api.example.com'], secret: 'another-credential-value' });
  assert.equal(created.status, 201); assert.ok(!JSON.stringify(created).includes('another-credential-value'));
  assert.ok(!JSON.stringify((await f.repository.findOwned('owner', f.record.id)).page).includes('credential-test-value'));
  assert.equal((await f.call(`/api/account/data/credentials/${created.body.id}`, undefined, 'other', 'DELETE')).status, 404);
  assert.equal((await f.call(`/api/account/data/credentials/${created.body.id}`, undefined, 'owner', 'DELETE')).status, 204);
});

test('redirects, SSRF, DNS rebinding, and timeouts are rejected or bounded', async t => {
  const f = await fixture(t);
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(isPrivateAddress(address), true, address);
  assert.equal(isPrivateAddress('93.184.216.34'), false);
  await assert.rejects(executeDataQuery({ source: { id: 'metadata', name: '元数据', kind: 'rest', mode: 'collection', url: 'http://169.254.169.254/latest' }, origin: 'https://studio.test', allowedHosts: [f.host], fetcher: async () => { throw new Error('must not fetch'); } }), /私有网络/);
  await assert.rejects(executeDataQuery({ source: { id: 'redirect', name: '重定向', kind: 'rest', mode: 'collection', url: `${f.base}/redirect-private` }, origin: 'https://studio.test', allowedHosts: [f.host] }), /私有网络/);
  await assert.rejects(executeDataQuery({ source: { id: 'rebind', name: '重绑定', kind: 'rest', mode: 'collection', url: 'https://rebinding.example/books' }, origin: 'https://studio.test', lookup: async () => [{ address: '127.0.0.1' }], fetcher: async () => { throw new Error('must not fetch'); } }), /不安全/);
  await assert.rejects(executeDataQuery({ source: { id: 'slow', name: '慢接口', kind: 'rest', mode: 'collection', url: `${f.base}/slow`, timeoutMs: 100 }, origin: 'https://studio.test', allowedHosts: [f.host] }), error => error.status === 504);
  assert.equal(checkDataRateLimit('data-rate-test', 1000), true);
  for (let i = 1; i < 60; i++) assert.equal(checkDataRateLimit('data-rate-test', 1001), true);
  assert.equal(checkDataRateLimit('data-rate-test', 1002), false);
  assert.equal(checkDataRateLimit('data-rate-test', 62000), true);
});

test('saved POST queries can read through the controlled proxy without weakening legacy write confirmation', async () => {
  const source = { id: 'coils', name: '钢卷查询', kind: 'rest', mode: 'collection', method: 'POST', operation: 'read', url: 'https://coil.example.test/query', transport: 'proxy', body: { planCoils: ['001'] }, headers: { 'content-type': 'application/json;charset=UTF-8' }, responsePath: 'items' };
  const requests = [];
  const options = { source, origin: 'https://studio.test', lookup: async () => [{ address: '93.184.216.34' }], connect: async connection => { requests.push(connection); return Response.json({ items: [{ id: '001' }] }); } };
  assert.deepEqual(await executeDataQuery(options), [{ id: '001' }]);
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(new Headers(requests[0].init.headers).get('content-type'), 'application/json;charset=UTF-8');
  assert.deepEqual(JSON.parse(requests[0].init.body), { planCoils: ['001'] });
  await assert.rejects(executeDataQuery({ ...options, source: { ...source, operation: undefined } }), /明确确认/);
  assert.equal(requests.length, 1);
});

test('owned proxy sources forward transient x-token and Cookie without saving them or accepting overrides', async t => {
  const f = await fixture(t);
  f.site.dataSources[0].browserHeaders = ['x-token', 'Cookie'];
  f.site.dataSources[0].headers = { Origin: 'https://business.example', Referer: 'https://business.example/app', 'User-Agent': 'FixtureClient/1' };
  assert.equal((await f.repository.saveSite('owner', f.record.id, f.site, f.record.savedAt)).status, 'saved');
  const input = { pageId: f.record.id, sourceId: 'books', requestHeaderTarget: f.site.dataSources[0].url, requestHeaders: { 'x-token': 'forward-test-secret', Cookie: 'JSESSIONID=forward-test-session' } };
  const response = await f.call('/api/account/data/query', input);
  assert.equal(response.status, 200); assert.deepEqual(response.body.value, f.books);
  assert.equal(f.calls[0].token, 'forward-test-secret'); assert.equal(f.calls[0].cookie, 'JSESSIONID=forward-test-session');
  assert.equal(f.calls[0].origin, 'https://business.example'); assert.equal(f.calls[0].referer, 'https://business.example/app'); assert.equal(f.calls[0].agent, 'FixtureClient/1');
  const saved = JSON.stringify(await f.repository.findOwned('owner', f.record.id));
  assert.equal(saved.includes('forward-test-secret'), false); assert.equal(saved.includes('forward-test-session'), false);
  assert.equal((await f.call('/api/account/data/query', input, 'other')).status, 404);
  assert.equal((await f.call('/api/account/data/query', { ...input, requestHeaderTarget: 'https://other.example/query' })).status, 409);
  for (const requestHeaders of [undefined, {}, { ...input.requestHeaders, Host: 'other.example' }, { ...input.requestHeaders, 'X-Extra': 'value' }, { ...input.requestHeaders, 'X-Token': 'duplicate' }, { ...input.requestHeaders, Cookie: 'bad\r\ninjected: yes' }]) assert.equal((await f.call('/api/account/data/query', { ...input, requestHeaders })).status, 400);
  assert.equal(f.calls.length, 1, 'invalid header requests never reach the upstream');
});

test('forwarded temporary credentials cannot follow cross-origin redirects or shadow stored credentials', async () => {
  const source = { id: 'temp', name: '临时认证', kind: 'rest', mode: 'single', url: 'https://business.example/query', transport: 'proxy', browserHeaders: ['x-token'] };
  const calls = [];
  const options = { source, origin: 'https://studio.test', requestHeaders: { 'x-token': 'redirect-secret' }, lookup: async () => [{ address: '93.184.216.34' }], connect: async connection => { calls.push(connection); return new Response(null, { status: 307, headers: { Location: 'https://other.example/collect' } }); } };
  await assert.rejects(executeDataQuery(options), error => error.status === 403 && /其他来源/.test(error.message));
  assert.equal(calls.length, 1);
  await assert.rejects(executeDataQuery({ ...options, source: { ...source, browserHeaders: ['Authorization'] }, requestHeaders: { Authorization: 'Bearer temporary' }, credential: { kind: 'bearer' } }), /关联凭据重复/);
  assert.equal(calls.length, 1);
});
