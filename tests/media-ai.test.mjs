import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { mediaReference } from '../shared/media.mjs';
import { applyAiOperation } from '../src/lib/ai/protocol.ts';
import { applySiteOperation, siteFromPlan, validateSitePlan } from '../src/lib/ai/site-ai.ts';

const assetId = crypto.randomUUID(), reference = mediaReference(assetId);
function image(id, url) { return { ...createBlock('image'), id, props: { ...createBlock('image').props, imageUrl: url }, frame: { x: 48, y: 48, width: 440, height: 340 } }; }
function site() { const value = createSiteDocument(createDocument(true)); value.pages[0].seo = { imageUrl: reference }; return value; }
function plan(value) { return { name: value.name, summary: '复用现有媒体', sharedLayout: [], deletes: [], pages: [{ id: value.homePageId, name: value.pages[0].name, path: '/', kind: 'page', seo: { imageUrl: reference }, layout: [] }] }; }

test('single-page AI can reuse existing assets but cannot fabricate uploads', () => {
  const page = createDocument(true); page.blocks = [image('existing', reference)];
  const allowed = applyAiOperation(page, { v: 1, seq: 1, op: 'add', id: 'second', type: 'image', props: { imageUrl: reference }, frame: { x: 540, y: 48, width: 440, height: 340 } });
  assert.equal(allowed.page.blocks.at(-1).props.imageUrl, reference);
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 1, op: 'add', id: 'fabricated', type: 'image', props: { imageUrl: mediaReference(crypto.randomUUID()) }, frame: { x: 540, y: 48, width: 440, height: 340 } }), /不能新增或伪造媒体素材/);
});

test('site AI preserves approved existing media and rejects new asset references', () => {
  const value = site(), approved = plan(value);
  assert.equal(validateSitePlan(value, approved).pages[0].seo.imageUrl, reference);
  assert.throws(() => validateSitePlan(value, { ...approved, pages: [{ ...approved.pages[0], seo: { imageUrl: mediaReference(crypto.randomUUID()) } }] }), /不能新增或伪造媒体素材/);
  const next = applySiteOperation(siteFromPlan(value, approved), approved, { v: 1, seq: 1, op: 'sitePage', id: value.homePageId, page: { ...value.pages[0].page, blocks: [image('picture', reference)] } });
  assert.equal(next.pages[0].page.blocks[0].props.imageUrl, reference);
  assert.throws(() => applySiteOperation(siteFromPlan(value, approved), approved, { v: 1, seq: 1, op: 'sitePage', id: value.homePageId, page: { ...value.pages[0].page, blocks: [image('picture', mediaReference(crypto.randomUUID()))] } }), /不能新增或伪造媒体素材/);
});
