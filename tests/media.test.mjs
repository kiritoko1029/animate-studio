import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectMediaReferences, inspectImage, mediaReference, parseMediaReference } from '../shared/media.mjs';
import { validateSite } from '../server/validation.mjs';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { createNodeMediaStorage } from '../server/media-storage-node.ts';
import { createR2MediaStorage } from '../server/media-storage.ts';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
test('media references stay portable and image signatures reject disguised content', () => {
  const id = crypto.randomUUID(), document = createDocument(true);
  document.blocks = [{ id: 'image', type: 'image', props: { imageUrl: mediaReference(id), title: '', text: '', padding: 20 }, frame: { x: 0, y: 0, width: 400, height: 320 } }];
  const site = createSiteDocument(document);
  site.pages[0].seo = { imageUrl: mediaReference(id) };
  assert.deepEqual(collectMediaReferences(site), [id]);
  assert.equal(parseMediaReference(mediaReference(id)), id);
  assert.equal(validateSite(site).pages[0].page.blocks[0].props.imageUrl, mediaReference(id));
  assert.equal(inspectImage(png), 'image/png');
  assert.equal(inspectImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),), 'image/jpeg');
  assert.equal(inspectImage(new TextEncoder().encode('GIF89a00000000')), 'image/gif');
  assert.equal(inspectImage(new TextEncoder().encode('RIFF0000WEBP')), 'image/webp');
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('<svg onload=alert(1)>'), new TextEncoder().encode('<html>'), png.slice(0, 4)]) assert.throws(() => inspectImage(bytes), /图片|PNG/);
  assert.throws(() => inspectImage(new Uint8Array(5 * 1024 * 1024 + 1)), /5 MiB/);
});

test('Node media storage is persistent and rejects traversal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-media-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const storage = createNodeMediaStorage(directory);
  await storage.put('site/image', png, 'image/png');
  assert.deepEqual((await storage.get('site/image')).bytes, png);
  await assert.rejects(storage.put('site/image', png, 'image/png'));
  await assert.rejects(storage.get('../secret'), /对象键/);
  await storage.remove('site/image');
  assert.equal(await storage.get('site/image'), null);
});

test('R2 adapter uses the original bytes and conditional create semantics', async () => {
  const values = new Map();
  const bucket = {
    async put(key, bytes, options) { if (values.has(key)) throw new Error('precondition failed'); values.set(key, { bytes, options }); },
    async get(key) { const value = values.get(key); return value ? { arrayBuffer: async () => value.bytes.buffer.slice(0), httpMetadata: value.options.httpMetadata } : null; },
    async delete(key) { values.delete(key); },
  };
  const storage = createR2MediaStorage(bucket);
  await storage.put('site/image', png, 'image/png');
  assert.equal(values.get('site/image').options.onlyIf.etagDoesNotMatch, '*');
  await assert.rejects(storage.put('site/image', png, 'image/png'), /precondition/);
  const stored = await storage.get('site/image');
  assert.deepEqual(stored.bytes, png);
  assert.equal(stored.mime, 'image/png');
  await storage.remove('site/image');
  assert.equal(await storage.get('site/image'), null);
});
