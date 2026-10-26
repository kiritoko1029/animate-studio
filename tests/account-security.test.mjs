import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createAuthFactory, resolveCapabilities } from '../server/auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { handleCloudAccountApi } from '../server/cloud-account-api.ts';

const RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
const uniqueEmail = name => `${name}-${RUN_ID}@example.test`;

/**
 * Security and degradation tests: cross-origin protection, capability
 * reporting without credentials, OTP expiry, guest availability, and the
 * Cloudflare worker handler wiring over a D1-shaped database.
 */

function page(name = '页面') {
  return { version: 1, name, settings: { background: '#ffffff', accent: '#408668', maxWidth: 1000, padding: 0 }, blocks: [] };
}

async function createFixture(t, { factoryOverrides = {}, production = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'studio-sec-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = await createNodeDatabase(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}, { file: join(dir, 'accounts.sqlite') });
  await applyNodeMigrations(database);
  t.after(() => database.close());
  const sent = [];
  const factory = createAuthFactory({
    baseURL: 'http://studio.test',
    secret: 'test-secret-0123456789abcdef-0123',
    database: { db: database.db, provider: database.provider, schema: database.schema },
    emailEnabled: true,
    githubEnabled: false,
    sender: { send: async data => { sent.push({ ...data }); } },
    ...factoryOverrides,
  });
  const repository = createPageRepository(database.db, database.schema, database.dialect);
  const accounts = {
    factory,
    context: {
      repository,
      newPageId: () => crypto.randomUUID(),
      newShareToken: () => crypto.randomUUID().replaceAll('-', '').slice(0, 22),
      capabilities: factory.capabilities,
      resolveUser: async request => {
        const session = await factory.auth.api.getSession({ headers: request.headers });
        return session?.user?.id ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
      },
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
    if (method !== 'GET' && method !== 'HEAD') headers.origin = origin ?? factory.baseURL;
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = response.status === 204 ? '' : await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }

  async function signIn(email) {
    sent.length = 0;
    await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email, type: 'sign-in' } });
    const response = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp: sent[0].otp } });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  }

  return { call, signIn, sent, base, database, repository };
}

test('cross-origin mutations to auth and account APIs are rejected', async t => {
  const { call, signIn } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('alice'));

  const evil = 'https://evil.example';
  const otpSend = await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: uniqueEmail('alice'), type: 'sign-in' }, origin: evil });
  assert.equal(otpSend.status, 403, 'foreign origin cannot trigger OTP sends');
  const createPage = await call('/api/account/pages', { method: 'POST', cookie, body: { page: page() }, origin: evil });
  assert.equal(createPage.status, 403, 'foreign origin cannot create pages');
  const patchPrefs = await call('/api/account/preferences', { method: 'PATCH', cookie, body: { version: 1, studioTheme: 'dark' }, origin: evil });
  assert.equal(patchPrefs.status, 403, 'foreign origin cannot change preferences');
  const patchDisclosures = await call('/api/account/preferences', { method: 'PATCH', cookie, body: { version: 1, inspectorDisclosures: { 'component:hero:advanced': true } }, origin: evil });
  assert.equal(patchDisclosures.status, 403, 'foreign origin cannot change disclosure preferences');
  assert.deepEqual((await call('/api/account/preferences', { cookie })).body.inspectorDisclosures, {});
});

test('capabilities report disabled when credentials are absent and guests still work', async t => {
  assert.deepEqual(resolveCapabilities({}), { cloudEnabled: false, emailEnabled: false, githubEnabled: false });
  assert.deepEqual(resolveCapabilities({ RESEND_API_KEY: 'k' }), { cloudEnabled: false, emailEnabled: false, githubEnabled: false });
  assert.deepEqual(resolveCapabilities({ RESEND_API_KEY: 'k', RESEND_FROM: 'a@b.c' }), { cloudEnabled: true, emailEnabled: true, githubEnabled: false });
  assert.deepEqual(resolveCapabilities({ AUTH_GITHUB_CLIENT_ID: 'id', AUTH_GITHUB_CLIENT_SECRET: 's' }), { cloudEnabled: true, emailEnabled: false, githubEnabled: true });

  const fixture = await createFixture(t, { factoryOverrides: { emailEnabled: false, sender: undefined } });
  const config = await fixture.call('/api/account/config');
  assert.deepEqual(config.body, { cloudEnabled: false, emailEnabled: false, githubEnabled: false });

  // The guest editor endpoints keep working with accounts disabled.
  const health = await fixture.call('/api/health');
  assert.equal(health.status, 200);
  const validate = await fixture.call('/api/validate', { method: 'POST', body: { page: page('访客') } });
  assert.equal(validate.status, 200);
  assert.equal(validate.body.page.name, '访客');
});

test('OTP expires after the configured window and cannot sign in afterwards', async t => {
  const { call, sent, database } = await createFixture(t);
  await call('/api/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: uniqueEmail('slow'), type: 'sign-in' } });

  // Rewind the stored verification's expiry into the past, the way elapsed
  // time would. The value column stores a hash, so only expires_at moves.
  const identifier = `%${uniqueEmail('slow')}%`;
  if (database.provider === 'sqlite') {
    const sqlite = (database.db).$client;
    sqlite.prepare('UPDATE verification SET expires_at = ? WHERE identifier LIKE ?').run('2000-01-01T00:00:00.000Z', identifier);
  } else {
    await database.db.$client.query('UPDATE verification SET expires_at = $1 WHERE identifier LIKE $2', ['2000-01-01', identifier]);
  }

  const expired = await call('/api/auth/sign-in/email-otp', { method: 'POST', body: { email: uniqueEmail('slow'), otp: sent[0].otp } });
  assert.notEqual(expired.status, 200, 'expired OTP must be rejected');
  assert.equal(expired.headers.getSetCookie().length, 0);
});

test('legacy guest /api/page works in development and is blocked in production', async t => {
  const dev = await createFixture(t, { factoryOverrides: { emailEnabled: false, sender: undefined } });
  assert.equal((await dev.call('/api/page')).status, 200);
  assert.equal((await dev.call('/api/page', { method: 'PUT', body: { page: page() } })).status, 200);

  const prod = await createFixture(t, { production: true, factoryOverrides: { emailEnabled: false, sender: undefined } });
  assert.equal((await prod.call('/api/page')).status, 404, 'production must not serve the shared file');
  assert.equal((await prod.call('/api/page', { method: 'PUT', body: { page: page() } })).status, 404);
  // Account endpoints keep their precise errors.
  assert.equal((await prod.call('/api/account/pages')).status, 401);
});

test('request body limits and malformed JSON return client errors', async t => {
  const { call, signIn, base } = await createFixture(t);
  const cookie = await signIn(uniqueEmail('alice'));
  const huge = { page: { ...page(), name: 'x'.repeat(600000) } };
  assert.equal((await call('/api/account/pages', { method: 'POST', cookie, body: huge })).status, 413);
  const malformed = await fetch(base + '/api/account/pages', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://studio.test', cookie }, body: '{broken' });
  assert.equal(malformed.status, 400);
  const wrongType = await fetch(base + '/api/account/pages', { method: 'POST', headers: { 'Content-Type': 'text/plain', origin: 'http://studio.test', cookie }, body: 'x' });
  assert.ok([400, 415].includes(wrongType.status), 'non-JSON content type rejected');
});

test('Cloudflare unavailable account configuration fails with explicit JSON responses', async () => {
  for (const env of [{}, { DB: {} }]) {
    const response = await handleCloudAccountApi(new Request('http://worker.test/api/account/pages'), env);
    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('unknown API paths still return JSON 404 through the Express stack', async t => {
  const { base } = await createFixture(t, { factoryOverrides: { emailEnabled: false, sender: undefined } });
  const response = await fetch(base + '/api/does-not-exist');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
});
