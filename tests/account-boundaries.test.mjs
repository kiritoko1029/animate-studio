import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDatabase, applyNodeMigrations, newPageId, newShareToken } from '../server/node-database.ts';
import { createAuthFactory, resolveSessionUser } from '../server/auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { handleAccountApi, toResponsePayload } from '../server/account-api.ts';
import { createDocument } from '../src/model.ts';
import { createApp, closeServer } from '../server/index.mjs';
import { request as httpRequest } from 'node:http';

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
