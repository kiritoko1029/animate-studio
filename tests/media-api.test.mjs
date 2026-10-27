import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createMediaRepository } from '../db/media-repository.ts';
import { createNodeMediaStorage } from '../server/media-storage-node.ts';
import { createD1Fixture } from './helpers/d1.mjs';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-media-api-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = await createNodeDatabase({}, { file: join(directory, 'accounts.sqlite') });
  t.after(() => database.close());
  await applyNodeMigrations(database);
  const now = new Date().toISOString(), insert = database.db.$client.prepare('INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)');
  for (const id of ['owner', 'other']) insert.run(id, id, `${id}@media.test`, now, now);
  const repository = createPageRepository(database.db, database.schema, database.dialect);
  const media = { repository: createMediaRepository(database.db, database.schema, database.dialect), storage: createNodeMediaStorage(join(directory, 'objects')), newId: () => crypto.randomUUID() };
  const id = crypto.randomUUID(), assetId = crypto.randomUUID();
  const page = createDocument(true);
  page.blocks = [{ id: 'picture', type: 'image', props: { imageUrl: `asset:${assetId}`, title: '媒体图片', text: '', padding: 20 }, frame: { x: 48, y: 48, width: 440, height: 340 } }];
  const site = createSiteDocument(page);
  site.pages[0].seo = { imageUrl: `asset:${assetId}` };
  const record = await repository.create('owner', site, id);
  let publishCount = 0;
  const accounts = {
    factory: { baseURL: 'http://studio.test' },
    context: {
      repository, media, canonicalOrigin: 'http://studio.test', capabilities: { cloudEnabled: true, emailEnabled: false, githubEnabled: false },
      newPageId: () => crypto.randomUUID(), newShareToken: () => `media-share-token-${String(++publishCount).padStart(10, '0')}`,
      resolveUser: async request => { const user = request.headers.get('x-test-user'); return user ? { id: user, email: `${user}@media.test`, name: user } : null; },
    },
    close: async () => {},
  };
  const app = await createApp({ serveFrontend: false, production: true, accounts });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, { method = 'GET', body, user = 'owner', mime, asset, json } = {}) {
    const headers = { origin: 'http://studio.test' };
    if (user) headers['x-test-user'] = user;
    if (mime) headers['content-type'] = mime;
    if (asset) headers['x-media-id'] = asset;
    if (json !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}${path}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : body });
    const contentType = response.headers.get('content-type') ?? '';
    return { status: response.status, headers: response.headers, body: contentType.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  }
  const upload = (assetId, name = '校园.png') => call(`/api/account/sites/${id}/media?name=${encodeURIComponent(name)}`, { method: 'POST', body: png, mime: 'image/png', asset: assetId });
  const publish = (saved, version = null) => call(`/api/account/pages/${id}/share`, { method: 'POST', json: { expectedRevision: saved, expectedPublishedVersion: version } });
  return { database, repository, media, record, site, id, assetId, call, upload, publish };
}

test('media upload, owner isolation, public snapshot and historical retention work end to end', async t => {
  const f = await fixture(t);
  const initial = await f.call(`/api/account/sites/${f.id}/media`);
  assert.equal(initial.status, 200, JSON.stringify(initial.body));
  assert.equal(initial.body.assets.length, 0);
  const uploaded = await f.upload(f.assetId);
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.name, '校园.png');
  assert.equal(uploaded.body.storageKey, undefined);
  assert.equal(uploaded.body.hash, undefined);
  const read = await f.call(`/api/account/sites/${f.id}/media/${f.assetId}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, png);
  assert.equal((await f.call(`/api/account/sites/${f.id}/media/${f.assetId}`, { user: 'other' })).status, 404);
  assert.equal((await f.call(`/api/account/sites/${f.id}/media`, { user: null })).status, 401);
  assert.equal((await f.call(`/api/shared/media-share-token-0000000001/media/${f.assetId}`, { user: null })).status, 404);
  assert.equal((await f.publish(f.record.savedAt)).status, 200);
  const token = 'media-share-token-0000000001';
  const shared = await f.call(`/api/shared/${token}/media/${f.assetId}`, { user: null });
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.body, png);
  const unused = crypto.randomUUID();
  await f.upload(unused, '未引用.png');
  assert.equal((await f.call(`/api/shared/${token}/media/${unused}`, { user: null })).status, 404, 'unpublished assets are not public merely because they belong to the site');
  assert.equal((await f.call(`/api/account/sites/${f.id}/media/${f.assetId}`, { method: 'DELETE' })).status, 409);
  assert.equal((await f.call(`/api/account/sites/${f.id}/media/${unused}`, { method: 'DELETE' })).body.retained, false);
  assert.equal(await f.media.storage.get(`${f.id}/${unused}`), null);
  assert.equal((await f.call(`/api/account/pages/${f.id}/share`, { method: 'DELETE' })).status, 204);
  assert.equal((await f.call(`/api/shared/${token}/media/${f.assetId}`, { user: null })).status, 404);
  assert.equal((await f.publish(f.record.savedAt)).status, 200);
  const reopened = 'media-share-token-0000000002';
  assert.equal((await f.call(`/api/shared/${reopened}/media/${f.assetId}`, { user: null })).status, 200);
  const next = structuredClone(f.site); next.pages[0].page.blocks[0].props.imageUrl = ''; next.pages[0].seo = {};
  const saved = await f.repository.saveSite('owner', f.id, next, f.record.savedAt);
  assert.equal(saved.status, 'saved');
  assert.equal((await f.publish(saved.record.savedAt, 2)).status, 200);
  const removed = await f.call(`/api/account/sites/${f.id}/media/${f.assetId}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.retained, true);
  assert.equal((await f.call(`/api/account/sites/${f.id}/media`)).body.assets.length, 0);
  assert.equal((await f.call(`/api/shared/${reopened}/media/${f.assetId}`, { user: null })).status, 404, 'a removed reference is no longer public in the current snapshot');
  const rolledBack = await f.repository.rollback('owner', f.id, reopened, 1, 3);
  assert.equal(rolledBack.status, 'published');
  assert.equal((await f.call(`/api/shared/${reopened}/media/${f.assetId}`, { user: null })).status, 200);
});

test('media input limits, missing uploads and site deletion cleanup are explicit', async t => {
  const f = await fixture(t);
  assert.equal((await f.call(`/api/account/sites/${f.id}/media`, { method: 'POST', body: new TextEncoder().encode('<svg onload=alert(1)>'), mime: 'image/svg+xml' })).status, 415);
  assert.equal((await f.call(`/api/account/sites/${f.id}/media`, { method: 'POST', body: new TextEncoder().encode('<html>'), mime: 'image/png' })).status, 415);
  assert.equal((await f.call(`/api/account/sites/${f.id}/media`, { method: 'POST', body: new Uint8Array(5 * 1024 * 1024 + 1), mime: 'image/png' })).status, 413);
  assert.equal((await f.publish(f.record.savedAt)).status, 409, 'a referenced asset must exist before publishing');
  await f.upload(f.assetId);
  assert.equal((await f.call(`/api/account/pages/${f.id}`, { method: 'DELETE' })).status, 204);
  assert.equal(await f.media.storage.get(`${f.id}/${f.assetId}`), null, 'site deletion also removes the object');
});

test('SQLite and D1 enforce media quotas and shared ownership', async t => {
  const f = await fixture(t);
  const { repository, media, id } = f;
  const create = size => ({ id: crypto.randomUUID(), name: '配额', mime: 'image/png', size, hash: crypto.randomUUID(), storageKey: `${id}/${crypto.randomUUID()}` });
  const full = await media.repository.create('owner', id, create(50 * 1024 * 1024));
  assert.equal(full.status, 'created');
  const extra = await media.repository.create('owner', id, create(1));
  assert.equal(extra.status, 'limit');
  const otherSite = await repository.create('owner', createSiteDocument(createDocument(true)), crypto.randomUUID());
  for (let index = 0; index < 99; index++) assert.equal((await media.repository.create('owner', otherSite.id, create(1))).status, 'created');
  const concurrent = await Promise.all([media.repository.create('owner', otherSite.id, create(1)), media.repository.create('owner', otherSite.id, create(1))]);
  assert.deepEqual(concurrent.map(item => item.status).sort(), ['created', 'limit']);
  const d1 = createD1Fixture(f.database.db.$client);
  const d1Repository = createMediaRepository(d1.db, d1.schema);
  const d1Pages = createPageRepository(d1.db, d1.schema);
  const d1Site = createSiteDocument(createDocument(true));
  const d1Record = await d1Pages.create('owner', d1Site, crypto.randomUUID());
  await d1Pages.publish('owner', d1Record.id, 'd1-media-share-token', { expectedRevision: d1Record.savedAt, expectedPublishedVersion: null });
  const d1Asset = await d1Repository.create('owner', d1Record.id, create(10));
  assert.equal(d1Asset.status, 'created');
  assert.equal((await d1Repository.findShared('d1-media-share-token', d1Asset.asset.id))?.id, d1Asset.asset.id);
  assert.equal((await d1Repository.findShared('media-share-token-0000000001', d1Asset.asset.id)), null, 'another token cannot read the asset');
});
