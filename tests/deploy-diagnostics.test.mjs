import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const diagnostics = new URL('../scripts/cloudflare-deploy-diagnostics.mjs', import.meta.url).href;

function runFixture(source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
    timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test('Cloudflare diagnostics expose sanitized API errors without consuming the response', () => {
  const { stdout, stderr } = runFixture(`
    globalThis.fetch = async () => new Response(JSON.stringify({
      success: false,
      errors: [{ code: 10021, message: 'Worker validation failed; api_token="local-test-secret"' }],
    }), { status: 400 });
    await import(${JSON.stringify(diagnostics)});
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/example/workers/workers/animate-studio/versions', { method: 'POST' });
    const body = await response.json();
    console.log(JSON.stringify({ status: response.status, success: body.success }));
  `);
  assert.equal(stdout.trim(), '{"status":400,"success":false}');
  assert.match(stderr, /Worker validation failed/);
  assert.match(stderr, /api_token=\[redacted\]/);
  assert.doesNotMatch(stderr, /local-test-secret/);
});

test('Cloudflare diagnostics leave successful non-JSON responses untouched', () => {
  const { stdout, stderr } = runFixture(`
    globalThis.fetch = async () => new Response('ready', { status: 200 });
    await import(${JSON.stringify(diagnostics)});
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/example/workers/scripts/animate-studio');
    console.log(await response.text());
  `);
  assert.equal(stdout.trim(), 'ready');
  assert.equal(stderr, '');
});
