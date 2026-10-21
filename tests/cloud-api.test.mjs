import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleCloudApi } from '../server/cloud-api.mjs';
import { createDocument } from '../src/model.ts';
import { canvasPresets } from '../shared/canvas-sizes.mjs';

function fixture() {
  const records = new Map();
  const getStore = workspace => ({
    async read() { return records.get(workspace) ?? { page: null, savedAt: null }; },
    async save(page) {
      const record = { page: structuredClone(page), savedAt: new Date().toISOString() };
      records.set(workspace, record);
      return record;
    },
  });
  const request = (path, { workspace, body, method = 'GET', headers, raw } = {}) => handleCloudApi(new Request(`https://studio.test${path}`, {
    method,
    headers: { ...(workspace ? { 'X-Studio-Workspace': workspace } : {}), ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(body) }),
  }), getStore);
  return { request, records };
}

test('cloud API accepts and restores every canvas size preset', async () => {
  const { request } = fixture(), workspace = randomUUID();
  for (const { width, height } of canvasPresets) {
    const page = createDocument(true);
    page.settings = { ...page.settings, maxWidth: width, canvasHeight: height };
    assert.equal((await request('/api/page', { method: 'PUT', workspace, body: { page } })).status, 200);
    assert.deepEqual((await (await request('/api/page', { workspace })).json()).page, page);
  }
});

test('cloud API isolates browser workspaces and returns saved data without caching', async () => {
  const { request } = fixture();
  const first = randomUUID(), second = randomUUID();
  const page = createDocument();
  assert.deepEqual(await (await request('/api/page', { workspace: first })).json(), { page: null, savedAt: null });
  const saved = await request('/api/page', { method: 'PUT', workspace: first, body: { page } });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal(saved.headers.get('x-content-type-options'), 'nosniff');
  const record = await saved.json();
  assert.deepEqual(record.page, page);
  assert.ok(Number.isFinite(Date.parse(record.savedAt)));
  assert.deepEqual(await (await request('/api/page', { workspace: first })).json(), record);
  assert.deepEqual(await (await request('/api/page', { workspace: second })).json(), { page: null, savedAt: null });
});

test('validation and failed cloud writes never overwrite the saved document', async () => {
  const { request, records } = fixture();
  const workspace = randomUUID(), page = createDocument();
  await request('/api/page', { method: 'PUT', workspace, body: { page } });
  const previous = records.get(workspace);
  const next = { ...page, name: '导入预览' };
  const validated = await request('/api/validate', { method: 'POST', body: { page: next } });
  assert.equal(validated.status, 200);
  assert.deepEqual(await validated.json(), { page: next });
  assert.equal(records.get(workspace), previous);
  for (const body of [{ page: { ...page, name: 42 } }, {}, []]) {
    assert.equal((await request('/api/page', { method: 'PUT', workspace, body })).status, 400);
    assert.equal(records.get(workspace), previous);
  }
  assert.equal((await request('/api/page', { method: 'PUT', workspace, raw: '{' })).status, 400);
  assert.equal((await request('/api/page', { method: 'PUT', workspace, body: { page }, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal(records.get(workspace), previous);
});

test('cloud API rejects missing workspace, cross-origin requests, unknown paths and methods', async () => {
  const { request, records } = fixture();
  for (const workspace of [undefined, 'global', '../../page', '00000000-0000-0000-0000-000000000000']) {
    assert.equal((await request('/api/page', { workspace })).status, 400);
  }
  for (const headers of [{ Origin: 'https://other.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await request('/api/page', { workspace: randomUUID(), headers })).status, 403);
  }
  assert.equal((await request('/api/other')).status, 404);
  const method = await request('/api/page', { method: 'DELETE', workspace: randomUUID() });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET, PUT');
  assert.deepEqual(await (await request('/api/health')).json(), { status: 'ok' });
  assert.equal(records.size, 0);
});

test('cloud body limit counts streamed UTF-8 bytes even without Content-Length', async () => {
  const { request, records } = fixture();
  const response = await request('/api/page', { method: 'PUT', workspace: randomUUID(), raw: JSON.stringify({ value: '中'.repeat(180000) }) });
  assert.equal(response.status, 413);
  assert.equal(records.size, 0);
  let cancelled = false, accessedStore = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(300000)); },
    cancel() { cancelled = true; },
  });
  const streamed = await handleCloudApi(new Request('https://studio.test/api/page', {
    method: 'PUT', body: stream, duplex: 'half', headers: { 'Content-Type': 'application/json', 'X-Studio-Workspace': randomUUID() },
  }), () => { accessedStore = true; });
  assert.equal(streamed.status, 413);
  assert.equal(cancelled, true);
  assert.equal(accessedStore, false);
});

test('cloud persistence errors return JSON without exposing infrastructure details', async () => {
  const brokenStore = () => ({ read() { throw new Error('private infrastructure details'); }, save() { throw new Error('private infrastructure details'); } });
  for (const method of ['GET', 'PUT']) {
    const response = await handleCloudApi(new Request('https://studio.test/api/page', {
      method, headers: { 'X-Studio-Workspace': randomUUID(), 'Content-Type': 'application/json' },
      ...(method === 'PUT' ? { body: JSON.stringify({ page: createDocument() }) } : {}),
    }), brokenStore);
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await response.text(), /private infrastructure details/);
  }
});
