import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createApp } from '../server/index.mjs';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createAuthFactory } from '../server/auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createComponentRepository } from '../db/component-repository.ts';
import { handleCloudAccountApi } from '../server/cloud-account-api.ts';
import * as sqliteSchema from '../db/schema.ts';
import { customComponentLimits } from '../shared/custom-components.mjs';
import { componentFolderLimits } from '../shared/component-folders.mjs';
import { componentTemplates } from '../src/lib/custom-components/templates.ts';

/**
 * Account component API against a real Better Auth instance with a captured
 * OTP sender, on a throwaway SQLite database (or PostgreSQL when
 * TEST_DATABASE_URL points at a disposable database), through the same
 * Express routing and session cookies production uses.
 */
const RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
const email = name => `${name}-${RUN_ID}@example.test`;
const component = (overrides = {}) => ({ ...structuredClone(componentTemplates[1].definition), ...overrides });

async function createFixture(t) {
  let database;
  if (process.env.TEST_DATABASE_URL) database = await createNodeDatabase({ DATABASE_URL: process.env.TEST_DATABASE_URL });
  else {
    const dir = await mkdtemp(join(tmpdir(), 'studio-components-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    database = await createNodeDatabase({}, { file: join(dir, 'accounts.sqlite') });
  }
  await applyNodeMigrations(database);
  assert.deepEqual(await applyNodeMigrations(database), [], 'migrations are idempotent');
  t.after(() => database.close());
  const sent = [];
  const factory = createAuthFactory({ baseURL: 'http://studio.test', secret: 'test-secret-0123456789abcdef-0123', database: { db: database.db, provider: database.provider, schema: database.schema }, emailEnabled: true, githubEnabled: false, sender: { send: async data => { sent.push({ ...data }); } } });
  const accounts = {
    factory,
    context: {
      repository: createPageRepository(database.db, database.schema, database.dialect),
      components: createComponentRepository(database.db, database.schema, database.dialect),
      newPageId: () => crypto.randomUUID(),
      newShareToken: () => crypto.randomUUID().replaceAll('-', ''),
      capabilities: factory.capabilities,
      resolveUser: request => factory.auth.api.getSession({ headers: request.headers }).then(session => session?.user?.id ? { id: session.user.id, email: session.user.email, name: session.user.name } : null),
    },
    allowLegacyPageApi: false,
    close: () => database.close(),
  };
  const app = await createApp({ serveFrontend: false, production: false, accounts });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, { method = 'GET', body, cookie, origin, raw, contentType } = {}) {
    const headers = {};
    if (body !== undefined || raw !== undefined) headers['Content-Type'] = contentType ?? 'application/json';
    if (method !== 'GET' && method !== 'HEAD') headers.origin = origin ?? 'http://studio.test';
    if (cookie) headers.cookie = cookie;
    const response = await fetch(base + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = response.status === 204 ? '' : await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, text };
  }
  async function signIn(address) {
    sent.length = 0;
    await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: address, type: 'sign-in' } });
    const response = await fetch(base + '/api/auth/sign-in/email-otp', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://studio.test' }, body: JSON.stringify({ email: address, otp: sent[0].otp }) });
    assert.equal(response.status, 200);
    const user = (await response.json()).user;
    return { cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '), user };
  }
  return { call, signIn, componentRepository: accounts.context.components };
}

test('account components require sign-in and support explicit create, read, update and delete', async t => {
  const { call, signIn } = await createFixture(t);
  assert.equal((await call('/api/account/components')).status, 401, 'guests cannot list account components');
  assert.equal((await call('/api/account/components', { method: 'POST', body: { component: component() } })).status, 401);
  const { cookie } = await signIn(email('owner'));
  assert.deepEqual((await call('/api/account/components', { cookie })).body, { components: [] }, 'signing in uploads nothing');

  const created = await call('/api/account/components', { method: 'POST', cookie, body: { component: component() } });
  assert.equal(created.status, 201);
  assert.equal(created.body.revision, 1);
  assert.deepEqual(created.body.component, component());
  assert.equal(created.body.shareToken, null);
  const { id } = created.body;

  const list = await call('/api/account/components', { cookie });
  assert.equal(list.body.components.length, 1);
  assert.equal(list.body.components[0].name, component().name);
  assert.equal('component' in list.body.components[0], false, 'lists carry summaries, not code');

  const updated = await call(`/api/account/components/${id}`, { method: 'PUT', cookie, body: { component: component({ name: '改名后的按钮', js: 'console.log(2);' }), baseRevision: 1 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.revision, 2);
  const stale = await call(`/api/account/components/${id}`, { method: 'PUT', cookie, body: { component: component({ name: '旧标签页的修改' }), baseRevision: 1 } });
  assert.equal(stale.status, 409, 'a save based on an old revision is a conflict, not an overwrite');
  assert.equal(stale.body.revision, 2);
  assert.equal((await call(`/api/account/components/${id}`, { cookie })).body.component.name, '改名后的按钮');

  assert.equal((await call(`/api/account/components/${id}`, { method: 'DELETE', cookie })).status, 204);
  assert.equal((await call(`/api/account/components/${id}`, { cookie })).status, 404);
  assert.equal((await call(`/api/account/components/${id}`, { method: 'DELETE', cookie })).status, 404);
});

test('another account cannot read, change, share or delete a component', async t => {
  const { call, signIn } = await createFixture(t);
  const alice = await signIn(email('alice')), bob = await signIn(email('bob'));
  const { body: { id } } = await call('/api/account/components', { method: 'POST', cookie: alice.cookie, body: { component: component({ name: 'Alice 的组件' }) } });
  assert.deepEqual((await call('/api/account/components', { cookie: bob.cookie })).body, { components: [] });
  assert.equal((await call(`/api/account/components/${id}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await call(`/api/account/components/${id}`, { method: 'PUT', cookie: bob.cookie, body: { component: component({ name: '被篡改' }), baseRevision: 1 } })).status, 404);
  assert.equal((await call(`/api/account/components/${id}/share`, { method: 'POST', cookie: bob.cookie, body: {} })).status, 404);
  assert.equal((await call(`/api/account/components/${id}/share`, { method: 'DELETE', cookie: bob.cookie })).status, 404);
  assert.equal((await call(`/api/account/components/${id}`, { method: 'DELETE', cookie: bob.cookie })).status, 404);
  const intact = await call(`/api/account/components/${id}`, { cookie: alice.cookie });
  assert.equal(intact.body.component.name, 'Alice 的组件');
  assert.equal(intact.body.revision, 1);
  assert.equal(intact.body.shareToken, null);
});

test('sharing publishes a snapshot that only explicit updates change, and revocation or deletion ends the link', async t => {
  const { call, signIn } = await createFixture(t);
  const { cookie, user } = await signIn(email('author'));
  const { body: created } = await call('/api/account/components', { method: 'POST', cookie, body: { component: component({ name: '分享版本一' }) } });
  const shared = await call(`/api/account/components/${created.id}/share`, { method: 'POST', cookie, body: {} });
  assert.equal(shared.status, 200);
  assert.match(shared.body.token, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(shared.body.revision, 1);
  const token = shared.body.token;

  const view = await call(`/api/shared/components/${token}`);
  assert.equal(view.status, 200);
  assert.deepEqual(Object.keys(view.body).sort(), ['component', 'publishedAt', 'revision']);
  assert.equal(view.body.component.name, '分享版本一');
  for (const secret of [user.id, user.email, created.id]) assert.ok(!view.text.includes(secret), 'public responses never expose the owner or private ids');

  await call(`/api/account/components/${created.id}`, { method: 'PUT', cookie, body: { component: component({ name: '草稿版本二' }), baseRevision: 1 } });
  assert.equal((await call(`/api/shared/components/${token}`)).body.component.name, '分享版本一', 'later saves do not change the published snapshot');
  const summary = (await call('/api/account/components', { cookie })).body.components[0];
  assert.deepEqual([summary.revision, summary.sharedRevision, summary.shareToken], [2, 1, token]);

  const republished = await call(`/api/account/components/${created.id}/share`, { method: 'POST', cookie, body: {} });
  assert.equal(republished.body.token, token, 'updating the share keeps its link');
  assert.equal(republished.body.revision, 2);
  assert.equal((await call(`/api/shared/components/${token}`)).body.component.name, '草稿版本二');

  assert.equal((await call(`/api/account/components/${created.id}/share`, { method: 'DELETE', cookie })).status, 204);
  assert.equal((await call(`/api/shared/components/${token}`)).status, 404, 'closing the share ends the old link');
  const again = await call(`/api/account/components/${created.id}/share`, { method: 'POST', cookie, body: {} });
  assert.notEqual(again.body.token, token, 'sharing again issues a new link');
  assert.equal((await call(`/api/shared/components/${token}`)).status, 404);

  assert.equal((await call(`/api/account/components/${created.id}`, { method: 'DELETE', cookie })).status, 204);
  assert.equal((await call(`/api/shared/components/${again.body.token}`)).status, 404, 'deleting the component removes its share');
  assert.equal((await call('/api/shared/components/not-a-valid-token!')).status, 404);
  assert.equal((await call(`/api/shared/components/${again.body.token}`, { method: 'POST', body: {} })).status, 404, 'the public endpoint is read-only');
});

test('malformed, hostile and oversized component requests are rejected without side effects', async t => {
  const { call, signIn } = await createFixture(t);
  const { cookie } = await signIn(email('validator'));
  const post = (options) => call('/api/account/components', { method: 'POST', cookie, ...options });
  const cases = [
    [{ raw: '{broken' }, 400],
    [{ raw: 'component', contentType: 'text/plain' }, 415],
    [{ body: { component: component(), owner: 'x' } }, 400],
    [{ body: { component: { ...component(), userId: 'someone-else' } } }, 400],
    [{ raw: '{"component":{"name":"x","html":"","css":"","js":"","__proto__":{"admin":true}}}' }, 400],
    [{ body: { component: component({ js: 'x'.repeat(customComponentLimits.code + 1) }) } }, 400],
    [{ body: { component: component({ fields: { url: 'javascript:alert(1)' } }) } }, 400],
    [{ body: { component: component({ name: '   ' }) } }, 400],
    [{ body: [component()] }, 400],
    [{ body: { component: component(), padding: '中'.repeat(200000) } }, 413],
    [{ body: { component: component() }, origin: 'https://evil.example' }, 403],
  ];
  for (const [options, status] of cases) assert.equal((await post(options)).status, status, JSON.stringify(options).slice(0, 80));
  assert.deepEqual((await call('/api/account/components', { cookie })).body, { components: [] });

  const { body: { id } } = await post({ body: { component: component() } });
  for (const body of [{ component: component() }, { component: component(), baseRevision: 0 }, { component: component(), baseRevision: '1' }, { component: component(), baseRevision: 1, extra: true }]) {
    assert.equal((await call(`/api/account/components/${id}`, { method: 'PUT', cookie, body })).status, 400);
  }
  assert.equal((await call('/api/account/components/not-a-uuid', { cookie })).status, 404);
  assert.equal((await call(`/api/account/components/${id}/share`, { method: 'POST', cookie, body: {}, origin: 'null' })).status, 403);
  assert.equal((await call(`/api/account/components/${id}`, { cookie })).body.shareToken, null);
});

test('each account has a component limit', async t => {
  const { call, signIn } = await createFixture(t);
  const { cookie } = await signIn(email('collector'));
  for (let index = 0; index < customComponentLimits.perAccount; index++) {
    assert.equal((await call('/api/account/components', { method: 'POST', cookie, body: { component: component({ name: `组件 ${index}` }) } })).status, 201);
  }
  const over = await call('/api/account/components', { method: 'POST', cookie, body: { component: component({ name: '超出上限' }) } });
  assert.equal(over.status, 409);
  assert.match(over.body.error, /最多保存 100 个组件/);
});

test('component folders persist grouping without changing code revisions or published snapshots', async t => {
  const { call, signIn } = await createFixture(t), { cookie } = await signIn(email('folders'));
  assert.deepEqual((await call('/api/account/component-folders', { cookie })).body, { folders: [] });
  const createdFolder = await call('/api/account/component-folders', { method: 'POST', cookie, body: { name: '  数据展示  ' } });
  assert.equal(createdFolder.status, 201);
  const folder = createdFolder.body;
  assert.equal(folder.name, '数据展示');
  assert.equal((await call('/api/account/component-folders', { cookie })).body.folders[0].id, folder.id);
  const created = await call('/api/account/components', { method: 'POST', cookie, body: { component: component(), folderId: folder.id } });
  assert.equal(created.status, 201); assert.equal(created.body.folderId, folder.id);
  const id = created.body.id;
  const shared = await call(`/api/account/components/${id}/share`, { method: 'POST', cookie, body: {} });
  assert.equal(shared.status, 200);
  const renamed = await call(`/api/account/component-folders/${folder.id}`, { method: 'PATCH', cookie, body: { name: '图表' } });
  assert.equal(renamed.body.name, '图表'); assert.equal(renamed.body.createdAt, folder.createdAt);
  const moved = await call(`/api/account/components/${id}/folder`, { method: 'PATCH', cookie, body: { folderId: null } });
  assert.equal(moved.body.folderId, null); assert.equal(moved.body.revision, 1);
  assert.equal(moved.body.sharedRevision, 1); assert.equal(moved.body.shareToken, shared.body.token);
  const regrouped = await call(`/api/account/components/${id}/folder`, { method: 'PATCH', cookie, body: { folderId: folder.id } });
  assert.equal(regrouped.body.folderId, folder.id); assert.equal(regrouped.body.revision, 1);
  const edited = await call(`/api/account/components/${id}`, { method: 'PUT', cookie, body: { component: component({ name: '新名称' }), baseRevision: 1 } });
  assert.equal(edited.body.folderId, folder.id); assert.equal(edited.body.revision, 2);
  assert.equal((await call(`/api/account/component-folders/${folder.id}`, { method: 'DELETE', cookie })).status, 204);
  const kept = await call(`/api/account/components/${id}`, { cookie });
  assert.equal(kept.body.folderId, null); assert.equal(kept.body.revision, 2); assert.equal(kept.body.component.name, '新名称');
  assert.equal((await call(`/api/shared/components/${shared.body.token}`)).body.component.name, component().name);
  assert.deepEqual((await call('/api/account/component-folders', { cookie })).body, { folders: [] });
});

test('component folders enforce account ownership, valid names and a bounded unique list', async t => {
  const { call, signIn } = await createFixture(t);
  assert.equal((await call('/api/account/component-folders')).status, 401);
  const alice = await signIn(email('folder-alice')), bob = await signIn(email('folder-bob'));
  const cookie = alice.cookie;
  const post = body => call('/api/account/component-folders', { method: 'POST', cookie, body });
  for (const body of [{ name: '' }, { name: '  ' }, { name: 'x'.repeat(61) }, { name: 1 }, { name: 'x', userId: 'foreign' }, [], {}]) assert.equal((await post(body)).status, 400);
  const folder = (await post({ name: '私有文件夹' })).body;
  assert.equal((await post({ name: ' 私有文件夹 ' })).status, 409);
  assert.deepEqual((await call('/api/account/component-folders', { cookie: bob.cookie })).body, { folders: [] });
  for (const method of ['PATCH', 'DELETE']) assert.equal((await call(`/api/account/component-folders/${folder.id}`, { method, cookie: bob.cookie, ...(method === 'PATCH' ? { body: { name: '篡改' } } : {}) })).status, 404);
  const bobComponent = (await call('/api/account/components', { method: 'POST', cookie: bob.cookie, body: { component: component() } })).body;
  assert.equal(bobComponent.folderId, null);
  assert.equal((await call(`/api/account/components/${bobComponent.id}/folder`, { method: 'PATCH', cookie: bob.cookie, body: { folderId: folder.id } })).status, 404);
  assert.equal((await call(`/api/account/components/${bobComponent.id}/folder`, { method: 'PATCH', cookie, body: { folderId: folder.id } })).status, 404);
  assert.equal((await call('/api/account/components', { method: 'POST', cookie: bob.cookie, body: { component: component(), folderId: folder.id } })).status, 404);
  for (const folderId of [true, 1, {}, 'not-a-uuid']) assert.equal((await call(`/api/account/components/${bobComponent.id}/folder`, { method: 'PATCH', cookie: bob.cookie, body: { folderId } })).status, 400);
  assert.equal((await call(`/api/account/components/${bobComponent.id}/folder`, { method: 'PATCH', cookie: bob.cookie, body: { folderId: null, extra: true } })).status, 400);
  assert.equal((await call('/api/account/component-folders', { method: 'POST', cookie, body: { name: '跨站' }, origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('/api/account/component-folders', { method: 'POST', cookie: bob.cookie, body: { name: '私有文件夹' } })).status, 201, 'names are unique per account');
  const other = (await post({ name: '另一分组' })).body;
  assert.equal((await call(`/api/account/component-folders/${other.id}`, { method: 'PATCH', cookie, body: { name: '私有文件夹' } })).status, 409);
  for (let i = 2; i < componentFolderLimits.perLibrary; i++) assert.equal((await post({ name: `分组 ${i}` })).status, 201);
  assert.equal((await post({ name: '超额分组' })).status, 409);
  assert.equal((await call('/api/account/component-folders', { cookie })).body.folders.length, 50);
});

test('the Node folder migration preserves existing ungrouped components and applies SET NULL on deletion', async t => {
  const sqlite = new Database(':memory:'); t.after(() => sqlite.close()); sqlite.pragma('foreign_keys = ON');
  for (const file of ['sqlite-0001-accounts.sql', 'sqlite-0002-components.sql']) sqlite.exec(await readFile(`db/migrations-node/${file}`, 'utf8'));
  sqlite.prepare('INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)').run('owner', 'Owner', 'migration@example.test', 'now', 'now');
  sqlite.prepare('INSERT INTO studio_component (id,user_id,name,definition,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('legacy', 'owner', '旧组件', JSON.stringify(component()), 'now', 'now');
  sqlite.exec(await readFile('db/migrations-node/sqlite-0003-component-folders.sql', 'utf8'));
  assert.equal(sqlite.prepare('SELECT folder_id FROM studio_component WHERE id=?').get('legacy').folder_id, null);
  sqlite.prepare('INSERT INTO studio_component_folder (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)').run('folder', 'owner', 'Folder', 'now', 'now');
  sqlite.prepare('UPDATE studio_component SET folder_id=? WHERE id=?').run('folder', 'legacy');
  sqlite.prepare('DELETE FROM studio_component_folder WHERE id=?').run('folder');
  assert.equal(sqlite.prepare('SELECT folder_id FROM studio_component WHERE id=?').get('legacy').folder_id, null);
  // The new constraint is a separate migration so a development database that
  // already applied 0003 receives it too, without rewriting any saved rows.
  const insert = sqlite.prepare('INSERT INTO studio_component_folder (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)');
  for (let index = 0; index < 49; index++) insert.run(`f${index}`, 'owner', `分组 ${index}`, 'now', 'now');
  sqlite.exec(await readFile('db/migrations-node/sqlite-0004-component-folder-limit.sql', 'utf8'));
  insert.run('f49', 'owner', '最后一个', 'now', 'now');
  assert.throws(() => insert.run('f50', 'owner', '超出限制', 'now', 'now'), /studio_component_folder_limit/);
  assert.equal(sqlite.prepare('SELECT count(*) AS total FROM studio_component_folder').get().total, 50);
  assert.equal(sqlite.prepare('SELECT name FROM studio_component WHERE id=?').get('legacy').name, '旧组件');
});

test('concurrent folder creates cannot exceed the account limit', async t => {
  const { call, signIn, componentRepository } = await createFixture(t);
  const { cookie, user } = await signIn(email('folder-race'));
  for (let index = 0; index < 49; index++) await componentRepository.createFolder(user.id, `已有分组 ${index}`, crypto.randomUUID());
  // Both calls can observe 49 at the application precheck; the database must
  // reject one of their writes instead of allowing the library to reach 51.
  const results = await Promise.all([
    componentRepository.createFolder(user.id, '并发分组 A', crypto.randomUUID()),
    componentRepository.createFolder(user.id, '并发分组 B', crypto.randomUUID()),
  ]);
  assert.equal(results.filter(result => 'folder' in result).length, 1);
  assert.deepEqual(results.filter(result => 'error' in result), [{ error: 'limit' }]);
  assert.equal((await call('/api/account/component-folders', { cookie })).body.folders.length, 50);
});

/** A D1 binding backed by better-sqlite3: the same surface drizzle-orm/d1 uses. */
function d1(sqlite) {
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    async all() { const prepared = sqlite.prepare(sql); return { results: prepared.reader ? prepared.all(...params) : (prepared.run(...params), []), success: true, meta: {} }; },
    async raw() { const prepared = sqlite.prepare(sql); if (!prepared.reader) { prepared.run(...params); return []; } return prepared.raw(true).all(...params); },
    async run() { const prepared = sqlite.prepare(sql); if (prepared.reader) return { results: prepared.all(...params), success: true, meta: {} }; const info = prepared.run(...params); return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } }; },
    async first(column) { const row = sqlite.prepare(sql).get(...params); return column ? row?.[column] ?? null : row ?? null; },
  });
  return { prepare: sql => statement(sql), batch: list => Promise.all(list.map(item => item.all())), async exec(sql) { sqlite.exec(sql); return { count: 1, duration: 0 }; } };
}

test('Cloudflare worker serves the component API on the generated D1 migrations', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-d1-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sqlite = new Database(join(dir, 'd1.sqlite'));
  t.after(() => sqlite.close());
  sqlite.pragma('foreign_keys = ON');
  // Apply exactly what Void applies to D1: the journal's SQL files, in order.
  const journal = JSON.parse(await readFile('db/migrations/meta/_journal.json', 'utf8'));
  for (const entry of journal.entries) for (const statement of (await readFile(`db/migrations/${entry.tag}.sql`, 'utf8')).split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);

  const secret = 'worker-secret-0123456789abcdef-0123', baseURL = 'http://worker.test';
  const sent = [];
  // Sessions are created through the Node auth stack on the same database; the
  // worker only has to validate them, as it would for a browser cookie.
  const signer = createAuthFactory({ baseURL, secret, database: { db: drizzle(sqlite, { schema: sqliteSchema }), provider: 'sqlite', schema: sqliteSchema }, emailEnabled: true, githubEnabled: false, sender: { send: async data => { sent.push(data); } } });
  async function signIn(address) {
    sent.length = 0;
    const post = (path, body) => signer.handler(new Request(`${baseURL}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseURL }, body: JSON.stringify(body) }));
    await post('email-otp/send-verification-otp', { email: address, type: 'sign-in' });
    const response = await post('sign-in/email-otp', { email: address, otp: sent[0].otp });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  }
  const env = { DB: d1(sqlite), BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: baseURL };
  const worker = async (path, { method = 'GET', body, cookie } = {}) => {
    const headers = { Origin: baseURL };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const response = await handleCloudAccountApi(new Request(baseURL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const text = response.status === 204 ? '' : await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  const alice = await signIn(email('d1-alice')), bob = await signIn(email('d1-bob'));
  assert.equal((await worker('/api/account/components')).status, 401);
  const created = await worker('/api/account/components', { method: 'POST', cookie: alice, body: { component: component({ name: 'D1 组件' }) } });
  assert.equal(created.status, 201);
  assert.equal(created.body.folderId, null);
  const folder = await worker('/api/account/component-folders', { method: 'POST', cookie: alice, body: { name: 'D1 分组' } });
  assert.equal(folder.status, 201);
  assert.equal((await worker(`/api/account/components/${created.body.id}/folder`, { method: 'PATCH', cookie: alice, body: { folderId: folder.body.id } })).body.revision, 1);
  assert.equal((await worker(`/api/account/component-folders/${folder.body.id}`, { method: 'DELETE', cookie: bob })).status, 404);
  assert.equal((await worker(`/api/account/component-folders/${folder.body.id}`, { method: 'DELETE', cookie: alice })).status, 204);
  assert.equal((await worker(`/api/account/components/${created.body.id}`, { cookie: alice })).body.folderId, null, 'generated D1 SQL must retain the SET NULL deletion action');
  assert.equal((await worker(`/api/account/components/${created.body.id}`, { cookie: bob })).status, 404);
  assert.equal((await worker(`/api/account/components/${created.body.id}`, { method: 'PUT', cookie: alice, body: { component: component({ name: 'D1 组件 v2' }), baseRevision: 1 } })).body.revision, 2);
  const share = await worker(`/api/account/components/${created.body.id}/share`, { method: 'POST', cookie: alice, body: {} });
  assert.equal(share.status, 200);
  assert.equal((await worker(`/api/shared/components/${share.body.token}`)).body.component.name, 'D1 组件 v2');
  assert.equal((await worker(`/api/account/components/${created.body.id}`, { method: 'DELETE', cookie: alice })).status, 204);
  assert.equal((await worker(`/api/shared/components/${share.body.token}`)).status, 404, 'D1 cascades the share with the component');
  assert.deepEqual((await worker('/api/account/components', { cookie: alice })).body, { components: [] });
  for (let index = 0; index < 49; index++) assert.equal((await worker('/api/account/component-folders', { method: 'POST', cookie: alice, body: { name: `已有分组 ${index}` } })).status, 201);
  const raced = await Promise.all(['并发 A', '并发 B'].map(name => worker('/api/account/component-folders', { method: 'POST', cookie: alice, body: { name } })));
  assert.deepEqual(raced.map(result => result.status).sort(), [201, 409], 'the generated D1 trigger enforces the same concurrent limit');
  assert.equal((await worker('/api/account/component-folders', { cookie: alice })).body.folders.length, 50);
});
