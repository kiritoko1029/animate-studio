import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createAuthFactory } from '../server/auth-factory.ts';

async function fixture(t, { verified = true } = {}) {
  const database = await createNodeDatabase({}, { file: ':memory:' });
  t.after(() => database.close()); await applyNodeMigrations(database);
  const base = 'http://oauth.studio.test', email = 'github-qa@studio.invalid';
  let otp;
  const factory = createAuthFactory({ baseURL: base, secret: crypto.randomUUID() + crypto.randomUUID(), database,
    emailEnabled: true, githubEnabled: true, githubClientId: 'test-client-id', githubClientSecret: 'test-client-secret', sender: { send: async data => { otp = data.otp; } },
  });
  const network = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    network.push(url);
    if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'local-mock-access-token', token_type: 'bearer', scope: 'read:user,user:email' });
    if (url === 'https://api.github.com/user') return Response.json({ id: 424242, login: 'studio-qa', name: 'GitHub Test', avatar_url: null, email: null });
    if (url === 'https://api.github.com/user/emails') return Response.json([{ email, primary: true, verified, visibility: 'private' }]);
    throw new Error(`Unexpected provider request: ${url}`);
  });
  const cookie = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const post = (path, body) => factory.handler(new Request(base + '/api/auth/' + path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  async function begin() {
    const response = await post('sign-in/social', { provider: 'github', callbackURL: base + '/?page=restored-page' });
    assert.equal(response.status, 200);
    const payload = await response.json(), url = new URL(payload.url);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.searchParams.get('client_id'), 'test-client-id');
    assert.equal(url.searchParams.get('redirect_uri'), base + '/api/auth/callback/github');
    assert.ok(url.searchParams.get('state'));
    return { state: url.searchParams.get('state'), cookie: cookie(response) };
  }
  const callback = flow => factory.handler(new Request(`${base}/api/auth/callback/github?code=local-test-code&state=${encodeURIComponent(flow.state)}`, { headers: { Cookie: flow.cookie } }));
  return { factory, base, email, begin, callback, cookie, post, network, otp: () => otp };
}

test('GitHub authorization and callback create a persistent session using the verified private email', async t => {
  const f = await fixture(t), flow = await f.begin(), response = await f.callback(flow);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), f.base + '/?page=restored-page');
  const sessionResponse = await f.factory.handler(new Request(f.base + '/api/auth/get-session', { headers: { Cookie: f.cookie(response) } }));
  const session = await sessionResponse.json();
  assert.equal(session.user.email, f.email);
  assert.equal(session.user.emailVerified, true);
  assert.deepEqual(f.network.sort(), ['https://api.github.com/user', 'https://api.github.com/user/emails', 'https://github.com/login/oauth/access_token'].sort());
});

test('invalid OAuth state is rejected before contacting GitHub or creating a session', async t => {
  const f = await fixture(t), flow = await f.begin();
  const response = await f.callback({ ...flow, state: 'wrong-state' });
  assert.equal(response.status, 302);
  assert.notEqual(response.headers.get('location'), f.base + '/?page=restored-page');
  assert.doesNotMatch(f.cookie(response), /studio\.session_token=/);
  assert.deepEqual(f.network, []);
});

test('unverified GitHub email cannot take over an existing verified email account', async t => {
  const f = await fixture(t, { verified: false });
  await f.post('email-otp/send-verification-otp', { email: f.email, type: 'sign-in' });
  const emailLogin = await f.post('sign-in/email-otp', { email: f.email, otp: f.otp() });
  assert.equal(emailLogin.status, 200);
  const response = await f.callback(await f.begin());
  assert.equal(response.status, 302);
  assert.doesNotMatch(f.cookie(response), /studio\.session_token=/);
  assert.notEqual(response.headers.get('location'), f.base + '/?page=restored-page');
});

test('authentication never expands its trusted origins based on an incoming request URL', async t => {
  const f = await fixture(t);
  const handler = f.factory.perRequestHandler ?? f.factory.handler;
  const response = await handler(new Request('http://untrusted.studio.test/api/auth/sign-in/social', {
    method: 'POST', headers: { Origin: 'http://untrusted.studio.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'github', callbackURL: 'http://untrusted.studio.test/collect' }),
  }));
  assert.ok([400, 403].includes(response.status), `unexpected auth acceptance: ${response.status}`);
});
