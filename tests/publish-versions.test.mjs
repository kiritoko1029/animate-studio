import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { createD1Fixture } from './helpers/d1.mjs';

async function fixture(t, failAt = -1) {
  const database = await createNodeDatabase({}, { file: ':memory:' });
  t.after(() => database.close());
  await applyNodeMigrations(database);
  const now = new Date().toISOString();
  database.db.$client.prepare('INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)').run('owner', 'Owner', 'owner@d1.test', now, now);
  const { db, schema } = createD1Fixture(database.db.$client, { failAt });
  const repository = createPageRepository(db, schema);
  const site = createSiteDocument(createDocument(true));
  const record = await repository.create('owner', site, crypto.randomUUID());
  return { repository, site, record, id: record.id, database };
}

test('D1 batch publishes, updates and rolls back immutable versions', async t => {
  const { repository, site, record, id } = await fixture(t);
  const first = await repository.publish('owner', id, 'd1-token', { expectedRevision: record.savedAt, expectedPublishedVersion: null });
  assert.equal(first.status, 'published', JSON.stringify(first));
  assert.equal(first.result.version, 1);
  site.name = 'D1 第二版';
  const saved = await repository.saveSite('owner', id, site, record.savedAt);
  const second = await repository.publish('owner', id, 'd1-token', { expectedRevision: saved.record.savedAt, expectedPublishedVersion: 1 });
  assert.equal(second.status, 'published', JSON.stringify(second));
  assert.equal(second.result.version, 2);
  const rolledBack = await repository.rollback('owner', id, 'd1-token', 1, 2);
  assert.equal(rolledBack.status, 'published', JSON.stringify(rolledBack));
  assert.equal(rolledBack.result.version, 3);
  assert.equal(rolledBack.result.sourceVersion, 1);
  assert.equal((await repository.findPublished('d1-token')).page.name, record.page.name);
  assert.equal((await repository.findOwned('owner', id)).page.name, 'D1 第二版');
  assert.deepEqual((await repository.listVersions('owner', id)).map(version => version.version), [3, 2, 1]);
});

test('D1 batch failure and stale revision cannot leave a partial publication', async t => {
  const initial = await fixture(t);
  const first = await initial.repository.publish('owner', initial.id, 'd1-token', { expectedRevision: initial.record.savedAt, expectedPublishedVersion: null });
  assert.equal(first.status, 'published');
  initial.site.name = '不应部分发布';
  const saved = await initial.repository.saveSite('owner', initial.id, initial.site, initial.record.savedAt);
  const { db, schema } = createD1Fixture(initial.database.db.$client, { failAt: 1 });
  const failing = { repository: createPageRepository(db, schema) };
  await assert.rejects(failing.repository.publish('owner', initial.id, 'd1-token', { expectedRevision: saved.record.savedAt, expectedPublishedVersion: 1 }), /injected D1 batch failure/);
  assert.equal((await initial.repository.findPublished('d1-token')).publishedVersion, 1);
  assert.equal((await initial.repository.listVersions('owner', initial.id)).length, 1);
  const stale = await initial.repository.publish('owner', initial.id, 'd1-token', { expectedRevision: '2000-01-01T00:00:00.000Z', expectedPublishedVersion: 1 });
  assert.equal(stale.status, 'conflict');
  assert.equal((await initial.repository.findPublished('d1-token')).publishedVersion, 1);
  assert.equal((await initial.repository.listVersions('owner', initial.id)).length, 1);
});

test('D1 concurrent publication cannot allocate duplicate versions', async t => {
  const { repository, record, id } = await fixture(t);
  const results = await Promise.all([
    repository.publish('owner', id, 'd1-token', { expectedRevision: record.savedAt, expectedPublishedVersion: null }),
    repository.publish('owner', id, 'd1-token', { expectedRevision: record.savedAt, expectedPublishedVersion: null }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), ['conflict', 'published']);
  assert.equal((await repository.listVersions('owner', id)).length, 1);
  assert.equal((await repository.findPublished('d1-token')).publishedVersion, 1);
});

test('D1 publish-version migration allows only the reviewed additive schema and backfill', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../db/migrations/20261027040735_same_tomorrow_man.sql', import.meta.url), 'utf8');
  assert.match(sql, /^-- void:allow-destructive/);
  assert.match(sql, /CREATE TABLE `studio_page_version`/);
  assert.match(sql, /ALTER TABLE `studio_page_share` ADD `active_version`/);
  assert.match(sql, /SELECT `page_id` \|\| ':1'/);
  assert.doesNotMatch(sql, /\bDROP\s+(?:TABLE|TRIGGER|INDEX)\b/i);
});
