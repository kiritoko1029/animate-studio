import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDatabase, applyNodeMigrations, newPageId, newShareToken } from '../server/node-database.ts';
import { createAuthFactory, resolveSessionUser } from '../server/auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { handleAccountApi, toResponsePayload } from '../server/account-api.ts';
import { createDocument } from '../src/model.ts';
import { createApp, closeServer } from '../server/index.mjs';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';

async function fixture(t, baseURL = 'http://review.test') {
  const database = await createNodeDatabase({}, { file: ':memory:' });
  t.after(() => database.close()); await applyNodeMigrations(database);
  let otp;
  const email = `review-${crypto.randomUUID()}@studio.invalid`;
  const factory = createAuthFactory({ baseURL, secret: crypto.randomUUID() + crypto.randomUUID(), database, emailEnabled: true, githubEnabled: false, sender: { send: async data => { otp = data.otp; } } });
  const authRequest = (path, body) => factory.handler(new Request(baseURL + '/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseURL }, body: JSON.stringify(body) }));
  assert.equal((await authRequest('email-otp/send-verification-otp', { email, type: 'sign-in' })).status, 200);
  const login = await authRequest('sign-in/email-otp', { email, otp }); assert.equal(login.status, 200);
  const user = (await login.json()).user;
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const repository = createPageRepository(database.db, database.schema);
  const context = { repository, newPageId, newShareToken, capabilities: factory.capabilities, resolveUser: request => resolveSessionUser(factory.auth, request) };
  async function request(path, options = {}) {
    const response = await handleAccountApi(new Request('http://review.test' + path, { method: options.method ?? 'GET', headers: { Cookie: cookie, ...options.headers }, ...(options.body === undefined ? {} : { body: options.body }) }), context, path);
    return response ? toResponsePayload(response) : null;
  }
  return { repository, user, request, factory, context, cookie };
}

test('cross-origin form POST cannot publish a signed-in owner draft', async t => {
  const f = await fixture(t), page = await f.repository.create(f.user.id, createDocument(true), newPageId());
  const response = await f.request(`/api/account/pages/${page.id}/share`, { method: 'POST', headers: { Origin: 'http://evil.review.test', 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
  assert.equal(response.status, 403);
  assert.equal((await f.repository.findOwned(f.user.id, page.id)).shareToken, null, 'the rejected request must have no publication side effect');
});

test('opaque-origin preview scripts cannot mutate the account through an authenticated request', async t => {
  const f = await fixture(t), page = await f.repository.create(f.user.id, createDocument(true), newPageId());
  const response = await f.request(`/api/account/pages/${page.id}`, { method: 'DELETE', headers: { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(response.status, 403);
  assert.ok(await f.repository.findOwned(f.user.id, page.id));
});

test('account request size is limited in UTF-8 bytes before saving, including unknown fields', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/account/pages', { method: 'POST', headers: { Origin: 'http://review.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ page: createDocument(true), padding: '中'.repeat(200000) }) });
  assert.equal(response.status, 413);
  assert.deepEqual(await f.repository.list(f.user.id), []);
});

test('cloud page records expose the saved timestamp required by the editor persistence contract', async t => {
  const f = await fixture(t), page = await f.repository.create(f.user.id, createDocument(true), newPageId());
  const response = await f.request(`/api/account/pages/${page.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.savedAt, response.body.updatedAt);
  assert.ok(Number.isFinite(Date.parse(response.body.savedAt)));
});

test('Express accepts the configured HTTPS origin behind a TLS-terminating reverse proxy', async t => {
  const f = await fixture(t, 'https://review.test');
  const app = await createApp({ serveFrontend: false, production: true, accounts: { factory: f.factory, context: f.context } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => closeServer(server, app.locals.closeFrontend));
  // node:http preserves the reverse proxy's Host header; fetch rewrites it.
  const status = await new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path: '/api/account/preferences', method: 'PATCH',
      headers: { Host: 'review.test', Origin: 'https://review.test', Cookie: f.cookie, 'Content-Type': 'application/json' },
    }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
    request.on('error', reject);
    request.end(JSON.stringify({ version: 1, studioTheme: 'dark' }));
  });
  assert.equal(status, 200);
  assert.equal((await f.repository.getPreferences(f.user.id)).studioTheme, 'dark');
});

test('the page list does not silently hide older saved pages at an arbitrary cutoff', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 201; i++) await f.repository.create(f.user.id, { ...createDocument(true), name: `Saved ${i}` }, newPageId());
  const response = await f.request('/api/account/pages');
  assert.equal(response.status, 200);
  assert.equal(response.body.pages.length, 201);
});

test('inspector preference migration preserves existing appearance and applies only once', async t => {
  const database = await createNodeDatabase({}, { file: ':memory:' });
  t.after(() => database.close());
  const sqlite = database.db.$client;
  const target = 'sqlite-0005-inspector-preferences.sql';
  const index = JSON.parse(await readFile(new URL('../db/migrations-node/index.json', import.meta.url), 'utf8'));
  const previous = index.slice(0, index.indexOf(target)).filter(name => name.startsWith('sqlite-'));
  assert.equal(previous.length, 4);
  sqlite.exec('CREATE TABLE IF NOT EXISTS studio_migration (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const name of previous) {
    sqlite.exec(await readFile(new URL(`../db/migrations-node/${name}`, import.meta.url), 'utf8'));
    sqlite.prepare('INSERT INTO studio_migration (name, applied_at) VALUES (?, ?)').run(name, '2026-10-25T00:00:00.000Z');
  }
  const now = new Date().toISOString();
  sqlite.prepare('INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('owner', 'Owner', 'owner@migration.test', now, now);
  sqlite.prepare('INSERT INTO user_preference (user_id, studio_theme, updated_at) VALUES (?, ?, ?)').run('owner', 'dark', now);

  assert.deepEqual(await applyNodeMigrations(database), [target, 'sqlite-0006-data-credentials.sql', 'sqlite-0007-publish-versions.sql', 'sqlite-0008-media-library.sql']);
  const repository = createPageRepository(database.db, database.schema);
  assert.deepEqual(await repository.getPreferences('owner'), { version: 1, studioTheme: 'dark', inspectorDisclosures: {}, updatedAt: now });
  await repository.setPreferences('owner', { inspectorDisclosures: { 'component:hero:advanced': true } });
  assert.deepEqual((await repository.getPreferences('owner')).inspectorDisclosures, { 'component:hero:advanced': true });
  assert.equal((await repository.getPreferences('owner')).studioTheme, 'dark');
  assert.deepEqual(await applyNodeMigrations(database), []);
});

test('publish version migration backfills existing shares without changing snapshots or links', async t => {
  const database = await createNodeDatabase({}, { file: ':memory:' });
  t.after(() => database.close());
  const sqlite = database.db.$client;
  const index = JSON.parse(await readFile(new URL('../db/migrations-node/index.json', import.meta.url), 'utf8'));
  const previous = index.filter(name => name.startsWith('sqlite-') && name < 'sqlite-0007-');
  sqlite.exec('CREATE TABLE IF NOT EXISTS studio_migration (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const name of previous) {
    sqlite.exec(await readFile(new URL(`../db/migrations-node/${name}`, import.meta.url), 'utf8'));
    sqlite.prepare('INSERT INTO studio_migration (name, applied_at) VALUES (?, ?)').run(name, '2026-10-26T00:00:00.000Z');
  }
  const now = new Date().toISOString(), pageId = crypto.randomUUID();
  const snapshot = { version: 1, kind: 'site', id: crypto.randomUUID(), name: '公开快照', homePageId: 'home', pages: [{ id: 'home', name: '首页', path: '/', kind: 'page', layout: [], page: { ...createDocument(true), id: 'home', name: '首页' } }], sharedLayout: {} };
  sqlite.prepare('INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('owner', 'Owner', 'owner@publish-migration.test', now, now);
  sqlite.prepare('INSERT INTO studio_page (id, user_id, name, page, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(pageId, 'owner', '未发布草稿', JSON.stringify(createDocument(true)), now, now);
  sqlite.prepare('INSERT INTO studio_page_share (page_id, user_id, token, snapshot, published_at) VALUES (?, ?, ?, ?, ?)').run(pageId, 'owner', 'migration-token', JSON.stringify(snapshot), now);

  assert.deepEqual(await applyNodeMigrations(database), ['sqlite-0007-publish-versions.sql', 'sqlite-0008-media-library.sql']);
  const repository = createPageRepository(database.db, database.schema);
  const published = await repository.findPublished('migration-token');
  assert.equal(published.page.name, '公开快照');
  assert.equal(published.publishedVersion, 1);
  const version = await repository.findVersion('owner', pageId, 1);
  assert.equal(version.page.name, '公开快照');
  assert.equal(version.createdAt, now);
  assert.equal((await repository.findOwned('owner', pageId)).publishedVersion, 1);
  assert.deepEqual(await applyNodeMigrations(database), []);
  assert.equal(await repository.remove('owner', pageId), true);
  assert.deepEqual(await repository.listVersions('owner', pageId), []);
});
