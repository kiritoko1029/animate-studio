import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

for (const mode of ['cloudflare', 'production']) {
  test(`${mode}: page requests preserve browser identity and request options`, async t => {
    const dom = new JSDOM('', { url: 'https://studio.test', runScripts: 'dangerously' });
    t.after(() => dom.window.close());
    const calls = [];
    dom.window.Headers = Headers;
    dom.window.fetch = async (path, options) => { calls.push({ path, ...options }); return { ok: true }; };
    const { outputFiles } = await build({
      entryPoints: ['src/lib/page-api.ts'], bundle: true, write: false, format: 'iife', globalName: 'PageApi',
      define: { 'import.meta.env.MODE': JSON.stringify(mode) },
      footer: { js: 'window.PageApi = PageApi;' },
    });
    dom.window.eval(outputFiles[0].text);
    await dom.window.PageApi.fetchPageApi('/api/page');
    const savedKey = dom.window.localStorage.getItem('animate-studio-cloud-workspace');
    await dom.window.PageApi.fetchPageApi('/api/page', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(calls[1].method, 'PUT');
    assert.equal(calls[1].body, '{}');
    assert.equal(calls[1].headers.get('content-type'), 'application/json');
    // Reload the module to model a page refresh, keeping the browser's storage.
    dom.window.eval(outputFiles[0].text);
    await dom.window.PageApi.fetchPageApi('/api/page');
    for (const call of calls) assert.equal(call.headers.get('x-studio-workspace'), savedKey);
    if (mode === 'cloudflare') {
      assert.match(savedKey, /^[0-9a-f-]{36}$/);
      dom.window.localStorage.clear();
      await dom.window.PageApi.fetchPageApi('/api/page');
      assert.notEqual(calls.at(-1).headers.get('x-studio-workspace'), savedKey);
    } else assert.equal(savedKey, null);
  });
}
