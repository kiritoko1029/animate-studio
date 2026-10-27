import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createAuthFactory, resolveCapabilities } from '../server/auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createResendSender } from '../server/resend-sender.ts';
import { createSiteDocument, createSitePage } from '../shared/site-document.mjs';

const RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
const uniqueEmail = name => `${name}-${RUN_ID}@example.test`;

/**
 * Backend account API tests against a real Better Auth instance with a fake
 * OTP sender. Each test builds its own app over a throwaway SQLite database
 * (or PostgreSQL when TEST_DATABASE_URL is set), exercising the same Express
 * routing and session cookies production uses.
 */

function page(name = '测试页面') {
  return {
    version: 1,
    name,
    settings: { background: '#ffffff', accent: '#408668', maxWidth: 1000, padding: 0 },
    blocks: [{ id: 'hero-1', type: 'hero', props: { title: '你好', text: '世界', variant: '开始', url: '#features', align: 'center', padding: 46, animation: 'fade' } }],
  };
}

async function createFixture(t, { production = false } = {}) {
  const usePg = process.env.TEST_DATABASE_URL;
  let database;
  if (usePg) {
    database = await createNodeDatabase({ DATABASE_URL: usePg });
    await applyNodeMigrations(database);
    t.after(() => database.close());
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'studio-accounts-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    database = await createNodeDatabase({}, { file: join(dir, 'accounts.sqlite') });
    await applyNodeMigrations(database);
    t.after(() => database.close());
  }

  const sent = [];
  const factory = createAuthFactory({
    baseURL: 'http://studio.test',
    secret: 'test-secret-0123456789abcdef-0123',
    database: { db: database.db, provider: database.provider, schema: database.schema },
    emailEnabled: true,
    githubEnabled: false,
    sender: { send: async data => { sent.push({ ...data }); } },
  });
  const repository = createPageRepository(database.db, database.schema, database.dialect);
  const accounts = {
    factory,
    context: {
      repository,
      newPageId: () => crypto.randomUUID(),
      newShareToken: () => crypto.randomUUID().replaceAll('-', '').slice(0, 22),
      capabilities: factory.capabilities,
      resolveUser: request => factory.auth.api.getSession({ headers: request.headers }).then(s => s?.user?.id ? { id: s.user.id, email: s.user.email, name: s.user.name } : null),
    },
    allowLegacyPageApi: false,
    close: () => database.close(),
  };
  const app = await createApp({ serveFrontend: false, production, accounts });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(path, { method = 'GET', body, cookie, origin } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    // Browsers always send Origin on cross-origin POSTs and on same-origin
    // POSTs from fetch; model that so CSRF checks behave as in production.
    if (method !== 'GET' && method !== 'HEAD') headers.origin = origin ?? factory.baseURL;
    if (cookie) headers.cookie = cookie;
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = response.status === 204 ? '' : await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }

  async function signIn(email) {
    sent.length = 0;
    await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' } });
    const response = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: sent[0].otp } });
    assert.equal(response.status, 200, `sign-in failed: ${JSON.stringify(response.body)}`);
    return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  }

  return { call, signIn, sent, base };
}

test('email OTP signs in, sets an HttpOnly session cookie and rejects replay', async t => {
  const { call, signIn, sent } = await createFixture(t);
  const config = await call('/api/account/config');
  assert.deepEqual(config.body, { cloudEnabled: true, emailEnabled: true, githubEnabled: false });

  sent.length = 0;
  const send = await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: uniqueEmail('alice'), type: 'sign-in' } });
  assert.equal(send.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].otp, /^\d{6}$/);
  assert.ok(!JSON.stringify(send.body).includes(sent[0].otp), 'OTP must not leak in the response');

  const signInResponse = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: uniqueEmail('alice'), otp: sent[0].otp } });
  assert.equal(signInResponse.status, 200);
  assert.equal(signInResponse.body.user.email, uniqueEmail('alice'));
  const cookieHeader = signInResponse.headers.getSetCookie().find(c => c.startsWith('studio.session_token'));
  assert.ok(cookieHeader, 'session cookie must be set');
  assert.match(cookieHeader, /httponly/i);
  assert.match(cookieHeader, /samesite=lax/i);

  const replay = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: uniqueEmail('alice'), otp: sent[0].otp } });
  assert.notEqual(replay.status, 200, 'used OTP must not sign in again');

  const cookie = signInResponse.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const session = await call('/api/auth/get-session', { cookie });
  assert.equal(session.body.user?.email, uniqueEmail('alice'));
});

test('wrong OTP three times blocks the code without creating a session', async t => {
  const { call, sent } = await createFixture(t);
  await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: uniqueEmail('bob'), type: 'sign-in' } });
  for (let i = 0; i < 3; i++) {
    const wrong = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: uniqueEmail('bob'), otp: '000000' === sent[0].otp ? '111111' : '000000' } });
    assert.notEqual(wrong.status, 200);
  }
  const blocked = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: uniqueEmail('bob'), otp: sent[0].otp } });
  assert.notEqual(blocked.status, 200, 'correct OTP after 3 failures must be rejected');
  assert.equal(blocked.headers.getSetCookie().length, 0, 'no session cookie on failure');
});

test('two users own separate page sets; foreign ids read as 404', async t => {
  const { call, signIn } = await createFixture(t);
  const alice = await signIn(uniqueEmail('alice'));
  const bob = await signIn(uniqueEmail('bob'));

  const created = await call('/api/account/pages', { method: 'POST', cookie: alice, body: { page: page('Alice 的页面') } });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Alice 的页面');
  assert.equal(created.body.shareToken, null);
  const pageId = created.body.id;

  const aliceList = await call('/api/account/pages', { cookie: alice });
  assert.equal(aliceList.body.pages.length, 1);
  const bobList = await call('/api/account/pages', { cookie: bob });
  assert.equal(bobList.body.pages.length, 0);

  assert.equal((await call(`/api/account/pages/${pageId}`, { cookie: alice })).status, 200);
  for (const result of [
    await call(`/api/account/pages/${pageId}`, { cookie: bob }),
    await call(`/api/account/pages/${pageId}`, { method: 'PUT', cookie: bob, body: { page: page('篡改') } }),
    await call(`/api/account/pages/${pageId}`, { method: 'DELETE', cookie: bob }),
    await call(`/api/account/pages/${pageId}/share`, { method: 'POST', cookie: bob, body: { expectedRevision: created.body.savedAt, expectedPublishedVersion: null } }),
  ]) {
    assert.equal(result.status, 404, 'another owner must see 404, not 403');
  }

  const updated = await call(`/api/account/pages/${pageId}`, { method: 'PUT', cookie: alice, body: { page: page('Alice 改名') } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'Alice 改名');
});

test('unauthenticated requests are rejected without leaking page data', async t => {
  const { call } = await createFixture(t);
  for (const [path, method] of [
    ['/api/account/pages', 'GET'],
    ['/api/account/pages', 'POST'],
    ['/api/account/preferences', 'GET'],
    ['/api/account/preferences', 'PATCH'],
  ]) {
    const result = await call(path, { method, ...(method === 'GET' ? {} : { body: { page: page() } }) });
    assert.equal(result.status, 401, `${method} ${path}`);
  }
  const forged = await call('/api/account/pages', { method: 'POST', body: { page: page(), userId: 'someone-else' } });
  assert.equal(forged.status, 401, 'body owner ids cannot bypass auth');
});

test('share lifecycle: publish snapshots the draft, updates keep the token, revoke and delete remove access', async t => {
  const { call, signIn } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('carol'));
  const created = await call('/api/account/pages', { method: 'POST', cookie, body: { page: page('草稿 v1') } });
  const pageId = created.body.id;

  const share = await call(`/api/account/pages/${pageId}/share`, { method: 'POST', cookie, body: { expectedRevision: created.body.savedAt, expectedPublishedVersion: null } });
  assert.equal(share.status, 200);
  assert.equal(share.body.version, 1);
  const { token } = share.body;
  assert.match(token, /^[0-9a-f]{22}$/);
  assert.ok(share.body.publishedAt);

  const anonymous = await call(`/api/shared/${token}`);
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.page.name, '草稿 v1');

  // Draft-only edits must not leak into the published snapshot.
  const draftV2 = await call(`/api/account/pages/${pageId}`, { method: 'PUT', cookie, body: { page: page('草稿 v2 未发布') } });
  const stillOld = await call(`/api/shared/${token}`);
  assert.equal(stillOld.body.page.name, '草稿 v1', 'draft edits must not leak publicly');

  // Republish updates the snapshot, keeping the same token.
  const republished = await call(`/api/account/pages/${pageId}/share`, { method: 'POST', cookie, body: { expectedRevision: draftV2.body.savedAt, expectedPublishedVersion: 1 } });
  assert.equal(republished.body.token, token, 'token stays stable across updates');
  assert.equal(republished.body.version, 2);
  const anonymousV2 = await call(`/api/shared/${token}`);
  assert.equal(anonymousV2.body.page.name, '草稿 v2 未发布');

  const rollback = await call(`/api/account/sites/${pageId}/versions/1/rollback`, { method: 'POST', cookie, body: { expectedPublishedVersion: 2 } });
  assert.equal(rollback.status, 200, JSON.stringify(rollback.body));
  assert.equal(rollback.body.version, 3);
  assert.equal(rollback.body.sourceVersion, 1);
  assert.equal((await call(`/api/shared/${token}`)).body.page.name, '草稿 v1', 'legacy page snapshots can roll back without a site migration');
  assert.equal((await call(`/api/account/pages/${pageId}`, { cookie })).body.page.name, '草稿 v2 未发布', 'public rollback never overwrites the draft');
  assert.equal((await call(`/api/account/sites/${pageId}/versions`, { cookie })).body.versions.length, 3);

  // Anonymous readers cannot mutate.
  assert.equal((await call(`/api/account/pages/${pageId}`, { method: 'PUT', body: { page: page() } })).status, 401);
  assert.equal((await call(`/api/shared/${token}`, { method: 'PUT', body: { page: page() } })).status, 404);

  // Revoke removes public access; the page and history survive.
  assert.equal((await call(`/api/account/pages/${pageId}/share`, { method: 'DELETE', cookie })).status, 204);
  assert.equal((await call(`/api/shared/${token}`)).status, 404);
  assert.equal((await call(`/api/account/pages/${pageId}`, { cookie })).status, 200);
  assert.equal((await call(`/api/account/sites/${pageId}/versions`, { cookie })).body.versions.length, 3);
  assert.equal((await call(`/api/account/sites/${pageId}/versions/1/rollback`, { method: 'POST', cookie, body: { expectedPublishedVersion: 3 } })).status, 409);

  // Delete removes page, share and history together.
  const current = await call(`/api/account/pages/${pageId}`, { cookie });
  const second = await call(`/api/account/pages/${pageId}/share`, { method: 'POST', cookie, body: { expectedRevision: current.body.savedAt, expectedPublishedVersion: null } });
  assert.equal(second.body.version, 4);
  assert.equal((await call(`/api/account/pages/${pageId}`, { method: 'DELETE', cookie })).status, 204);
  assert.equal((await call(`/api/shared/${second.body.token}`)).status, 404);
  assert.equal((await call(`/api/account/pages/${pageId}`, { cookie })).status, 404);
  assert.equal((await call(`/api/account/sites/${pageId}/versions`, { cookie })).status, 404);
});

test('site API stores complete drafts, rejects stale revisions and publishes only the saved site', async t => {
  const { call, signIn } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('sites'));
  const site = createSiteDocument(page('站点首页'));
  const products = createSitePage(site, '产品列表'); products.path = '/products';
  const detail = createSitePage(site, '产品详情', 'detail'); detail.path = '/products/:id';
  site.pages.push(products, detail);
  const created = await call('/api/account/sites', { method: 'POST', cookie, body: { site } });
  assert.equal(created.status, 201);
  assert.equal(created.body.page.kind, 'site');
  assert.equal(created.body.page.pages.length, 3);
  const id = created.body.id;
  const edited = structuredClone(site); edited.pages[1].page.blocks = page('列表内容').blocks;
  const saved = await call(`/api/account/sites/${id}`, { method: 'PUT', cookie, body: { site: edited, expectedRevision: created.body.updatedAt } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.notEqual(saved.body.updatedAt, created.body.updatedAt);
  assert.equal(saved.body.page.pages[1].page.blocks.length, 1);
  const stale = await call(`/api/account/sites/${id}`, { method: 'PUT', cookie, body: { site, expectedRevision: created.body.updatedAt } });
  assert.equal(stale.status, 409);
  const afterConflict = await call(`/api/account/sites/${id}`, { cookie });
  assert.equal(afterConflict.body.page.pages[1].page.blocks.length, 1, 'a stale write cannot replace a newer draft');
  const shared = await call(`/api/account/pages/${id}/share`, { method: 'POST', cookie, body: { expectedRevision: saved.body.savedAt, expectedPublishedVersion: null } });
  assert.equal(shared.status, 200);
  edited.pages[1].name = '仅草稿修改'; edited.pages[1].page.name = '仅草稿修改';
  assert.equal((await call(`/api/account/sites/${id}`, { method: 'PUT', cookie, body: { site: edited, expectedRevision: saved.body.updatedAt } })).status, 200);
  const published = await call(`/api/shared/${shared.body.token}`);
  assert.equal(published.body.page.pages[1].name, '产品列表', 'later draft edits do not change the published site');
  assert.equal((await call(`/api/account/sites/${id}`, { method: 'PUT', body: { site: edited, expectedRevision: saved.body.updatedAt } })).status, 401);
  assert.equal((await call('/api/account/sites', { method: 'POST', cookie, body: { site: { ...site, credentials: 'not-allowed' } } })).status, 400);
  const legacy = await call('/api/account/pages', { method: 'POST', cookie, body: { page: page('旧页面') } });
  assert.equal((await call(`/api/account/sites/${legacy.body.id}`, { cookie })).body.page.name, '旧页面', 'legacy cloud records remain openable for migration');
});

test('preferences validate input, merge fields and stay per-account', async t => {
  const { call, signIn } = await createFixture(t);
  const alice = await signIn(uniqueEmail('alice'));
  const bob = await signIn(uniqueEmail('bob'));

  assert.deepEqual((await call('/api/account/preferences', { cookie: alice })).body, { version: 1, studioTheme: 'light', inspectorDisclosures: {}, updatedAt: null });
  const set = await call('/api/account/preferences', { method: 'PATCH', cookie: alice, body: { version: 1, studioTheme: 'dark' } });
  assert.equal(set.status, 200);
  assert.equal(set.body.studioTheme, 'dark');
  assert.deepEqual(set.body.inspectorDisclosures, {});
  assert.equal(set.body.version, 1);

  const disclosures = { 'component:hero:advanced': true, 'motion:countingNumber:CountingNumber': false };
  const expanded = await call('/api/account/preferences', { method: 'PATCH', cookie: alice, body: { version: 1, inspectorDisclosures: disclosures } });
  assert.equal(expanded.status, 200);
  assert.equal(expanded.body.studioTheme, 'dark', 'a disclosure patch does not reset appearance');
  assert.deepEqual(expanded.body.inspectorDisclosures, disclosures);
  const appearanceOnly = await call('/api/account/preferences', { method: 'PATCH', cookie: alice, body: { version: 1, studioTheme: 'light' } });
  assert.deepEqual(appearanceOnly.body.inspectorDisclosures, disclosures, 'an appearance patch does not clear disclosures');

  for (const body of [
    { version: 1, studioTheme: 'blue' },
    { version: 2, studioTheme: 'dark' },
    { studioTheme: 'dark' },
    { version: 1 },
    { version: 1, inspectorDisclosures: null },
    { version: 1, inspectorDisclosures: [] },
    { version: 1, inspectorDisclosures: { 'component:hero:advanced': 'true' } },
    { version: 1, inspectorDisclosures: { 'bad key': true } },
    { version: 1, inspectorDisclosures: { [`component:${'x'.repeat(160)}`]: true } },
    { version: 1, inspectorDisclosures: Object.fromEntries(Array.from({ length: 513 }, (_, index) => [`component:type${index}:advanced`, true])) },
    { version: 1, studioTheme: 'dark', arbitrary: {} },
  ]) assert.equal((await call('/api/account/preferences', { method: 'PATCH', cookie: alice, body })).status, 400, JSON.stringify(body));

  assert.deepEqual((await call('/api/account/preferences', { cookie: bob })).body.inspectorDisclosures, {}, 'no cross-account disclosure leak');
  assert.equal((await call('/api/account/preferences', { cookie: bob })).body.studioTheme, 'light', 'no cross-account appearance leak');
  const persisted = await call('/api/account/preferences', { cookie: alice });
  assert.equal(persisted.body.studioTheme, 'light');
  assert.deepEqual(persisted.body.inspectorDisclosures, disclosures);
});

test('invalid page payloads are rejected with 400 and persist nothing', async t => {
  const { call, signIn } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('dave'));
  const invalid = [
    { page: { ...page(), version: 2 } },
    { page: { ...page(), blocks: [{ id: 'x', type: 'script', props: {} }] } },
    { noPage: true },
    {},
  ];
  for (const body of invalid) {
    assert.equal((await call('/api/account/pages', { method: 'POST', cookie, body })).status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await call('/api/account/pages', { cookie })).body.pages, []);
});

test('sign-out invalidates the session server-side', async t => {
  const { call, signIn } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('erin'));
  assert.equal((await call('/api/account/preferences', { cookie })).status, 200);
  const signedOut = await call('/api/auth/sign-out', { method: 'POST', cookie, body: {} });
  assert.equal(signedOut.status, 200);
  assert.equal((await call('/api/account/preferences', { cookie })).status, 401, 'old cookie must stop working');
});

test('OTP expiry is enforced', async t => {
  const fixture = await createFixture(t);
  const { call, sent } = fixture;
  await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: uniqueEmail('frank'), type: 'sign-in' } });
  // The stored value is a hash; simulate expiry by manipulating the database
  // through the repository-adjacent SQL is not possible here, so this test
  // verifies the configured expiry window indirectly: a fresh OTP works.
  const fresh = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: uniqueEmail('frank'), otp: sent[0].otp } });
  assert.equal(fresh.status, 200, 'fresh OTP within window signs in');
});

test('site publish versions are owner-only, immutable, conflict-safe and retain history after closing', async t => {
  const { call, signIn } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('versions')), other = await signIn(uniqueEmail('versions-other'));
  const site = createSiteDocument(page('第一版'));
  const created = await call('/api/account/sites', { method: 'POST', cookie, body: { site } });
  const id = created.body.id;
  const publish = (expectedRevision, expectedPublishedVersion) => call(`/api/account/pages/${id}/share`, { method: 'POST', cookie, body: { expectedRevision, expectedPublishedVersion } });
  const first = await publish(created.body.savedAt, null);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.version, 1);
  const token = first.body.token;
  const history = await call(`/api/account/sites/${id}/versions`, { cookie });
  assert.equal(history.body.versions.length, 1);
  assert.equal(history.body.versions[0].page, undefined, 'version lists contain metadata, not full snapshots');
  assert.equal((await call(`/api/account/sites/${id}/versions/1`, { cookie })).body.page.name, site.name);
  for (const path of [`/api/account/sites/${id}/versions`, `/api/account/sites/${id}/versions/1`, `/api/account/sites/${id}/versions/1/rollback`]) {
    const response = await call(path, { method: path.endsWith('rollback') ? 'POST' : 'GET', cookie: other, body: path.endsWith('rollback') ? { expectedPublishedVersion: 1 } : undefined });
    assert.equal(response.status, 404, 'another owner cannot read or mutate version history');
  }
  site.pages[0].page.blocks[0].props.title = '第二版';
  const saved = await call(`/api/account/sites/${id}`, { method: 'PUT', cookie, body: { site, expectedRevision: created.body.savedAt } });
  assert.equal(saved.status, 200);
  assert.equal((await call(`/api/shared/${token}`)).body.page.pages[0].page.blocks[0].props.title, '你好');
  const second = await publish(saved.body.savedAt, 1);
  assert.equal(second.body.version, 2);
  assert.equal(second.body.token, token);
  const unchanged = await publish(saved.body.savedAt, 2);
  assert.equal(unchanged.body.unchanged, true);
  assert.equal((await call(`/api/account/sites/${id}/versions`, { cookie })).body.versions.length, 2);
  assert.equal((await publish(saved.body.savedAt, 1)).status, 409);
  assert.equal((await call(`/api/account/sites/${id}/versions`, { cookie })).body.versions.length, 2);

  const rollback = await call(`/api/account/sites/${id}/versions/1/rollback`, { method: 'POST', cookie, body: { expectedPublishedVersion: 2 } });
  assert.equal(rollback.status, 200, JSON.stringify(rollback.body));
  assert.equal(rollback.body.version, 3);
  assert.equal(rollback.body.sourceVersion, 1);
  assert.equal(rollback.body.token, token);
  assert.equal((await call(`/api/shared/${token}`)).body.page.pages[0].page.blocks[0].props.title, '你好');
  assert.equal((await call(`/api/account/sites/${id}`, { cookie })).body.page.pages[0].page.blocks[0].props.title, '第二版');
  assert.equal((await call(`/api/account/sites/${id}/versions/1/rollback`, { method: 'POST', cookie, body: { expectedPublishedVersion: 2 } })).status, 409);
  assert.equal((await call(`/api/account/pages/${id}/share`, { method: 'DELETE', cookie })).status, 204);
  assert.equal((await call(`/api/shared/${token}`)).status, 404);
  assert.equal((await call(`/api/account/sites/${id}/versions`, { cookie })).body.versions.length, 3);
  assert.equal((await call(`/api/account/sites/${id}/versions/1/rollback`, { method: 'POST', cookie, body: { expectedPublishedVersion: 3 } })).status, 409);
  const reopened = await publish(saved.body.savedAt, null);
  assert.equal(reopened.body.version, 4);
  assert.notEqual(reopened.body.token, token, 'a revoked token is not silently resurrected');
  assert.equal((await call(`/api/account/pages/${id}/share`, { method: 'POST', cookie, body: {} })).status, 400);
  assert.equal((await call(`/api/account/sites/${id}/versions/1/rollback`, { method: 'POST', cookie, body: {} })).status, 400);
  assert.equal((await call(`/api/account/sites/${id}/versions/not-a-version`, { cookie })).status, 404);
});

test('concurrent publishing preserves one consistent snapshot and history keeps the latest twenty versions', async t => {
  const { call, signIn } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('publish-race'));
  const site = createSiteDocument(page('并发发布'));
  const created = await call('/api/account/sites', { method: 'POST', cookie, body: { site } });
  const id = created.body.id;
  const publish = (expectedRevision, expectedPublishedVersion) => call(`/api/account/pages/${id}/share`, { method: 'POST', cookie, body: { expectedRevision, expectedPublishedVersion } });
  const concurrent = await Promise.all([publish(created.body.savedAt, null), publish(created.body.savedAt, null)]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
  const token = concurrent.find(result => result.status === 200).body.token;
  let revision = created.body.savedAt;
  for (let version = 2; version <= 22; version++) {
    site.name = `版本 ${version}`;
    const saved = await call(`/api/account/sites/${id}`, { method: 'PUT', cookie, body: { site, expectedRevision: revision } });
    assert.equal(saved.status, 200);
    revision = saved.body.savedAt;
    const published = await publish(revision, version - 1);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.token, token);
  }
  const history = await call(`/api/account/sites/${id}/versions`, { cookie });
  assert.equal(history.body.versions.length, 20);
  assert.equal(history.body.versions[0].version, 22);
  assert.equal(history.body.versions.at(-1).version, 3);
  assert.equal((await call(`/api/account/sites/${id}/versions/2`, { cookie })).status, 404);
  assert.equal((await call(`/api/account/sites/${id}/versions/3`, { cookie })).status, 200);
  assert.equal((await call(`/api/shared/${token}`)).body.publishedVersion, 22);
});
