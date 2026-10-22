import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBlock, createDocument, toFreeDocument } from '../src/model.ts';
import { componentScale, componentScaleBounds, scaleComponent } from '../src/lib/component-scale.ts';
import { alignFrame, clampFrame } from '../src/lib/canvas-bounds.ts';
import { duplicateSelection, selectionFrames } from '../src/lib/component-selection.ts';
import { validatePage } from '../server/validation.mjs';
import { createPageStore } from '../server/store.mjs';

test('overall scaling changes content and frame proportionally without changing content settings or history', () => {
  const page = createDocument(true);
  const block = { ...createBlock('githubStarsButton'), frame: { x: 80, y: 40, width: 280, height: 110 } };
  const before = structuredClone(block);
  assert.equal(componentScale(block), 100);
  const doubled = scaleComponent(block, page.settings, 200);
  assert.deepEqual(doubled.frame, { x: 80, y: 40, width: 560, height: 220 });
  assert.equal(doubled.props.contentScale, 200);
  assert.deepEqual(doubled.props, { ...block.props, contentScale: 200 });
  assert.deepEqual(block, before);
  const reset = scaleComponent(scaleComponent(doubled, page.settings, 150), page.settings, 100);
  assert.deepEqual(reset.frame, block.frame);
  assert.equal(componentScale(reset), 100);
  assert.equal(scaleComponent(block, page.settings, NaN), block);
  assert.equal(scaleComponent(block, page.settings, 100), block);
});

test('scaling respects page margins, minimum sizes and uniform proportions at the canvas edge', () => {
  const settings = { ...createDocument(true).settings, maxWidth: 1200, canvasHeight: 800, padding: 40 };
  const block = { ...createBlock('button'), frame: { x: 900, y: 640, width: 200, height: 100 } };
  const enlarged = scaleComponent(block, settings, 300);
  assert.deepEqual(enlarged.frame, { x: 560, y: 460, width: 600, height: 300 });
  assert.equal(enlarged.frame.width / enlarged.frame.height, 2);
  assert.deepEqual(componentScaleBounds(block, settings), { min: 32, max: 400 });
  const tiny = scaleComponent(block, settings, 1);
  assert.equal(tiny.props.contentScale, 32);
  assert.deepEqual(tiny.frame, { x: 900, y: 640, width: 64, height: 32 });
  const wide = { ...block, frame: { x: 40, y: 40, width: 1000, height: 85 } };
  const bounded = scaleComponent(wide, settings, 200);
  assert.equal(bounded.props.contentScale, 200);
  assert.equal(bounded.frame.width, 2000);
  assert.ok(Math.abs(bounded.frame.width / bounded.frame.height - 1000 / 85) < 1e-8);
});

test('full-page components reach 400% and preserve dimensions through reload, selection, duplication and reset', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'animate-studio-scale-overflow-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const page = createDocument(true);
  page.settings = { ...page.settings, maxWidth: 1200, canvasHeight: 800, padding: 40 };
  const original = { ...createBlock('card'), frame: { x: 40, y: 40, width: 1120, height: 720 } };
  assert.equal(componentScaleBounds(original, page.settings).max, 400);
  const enlarged = scaleComponent(original, page.settings, 400);
  assert.equal(componentScale(enlarged), 400);
  assert.deepEqual(enlarged.frame, { x: 40, y: 40, width: 4480, height: 2880 });
  page.blocks = [enlarged];
  const store = createPageStore({ dataDir });
  await store.save(page);
  const restored = toFreeDocument((await store.read()).page);
  assert.deepEqual(restored, page);
  assert.deepEqual(selectionFrames(restored.blocks, restored.settings)[enlarged.id], enlarged.frame);
  assert.deepEqual(duplicateSelection(restored, [enlarged.id]).page.blocks[1].frame, enlarged.frame);
  assert.deepEqual(clampFrame({ ...enlarged.frame, x: 50 }, page.settings, 400), enlarged.frame);
  for (const alignment of ['left', 'center', 'right']) assert.deepEqual(alignFrame(enlarged.frame, page.settings, alignment, 400), enlarged.frame);
  assert.deepEqual(scaleComponent(restored.blocks[0], restored.settings, 100).frame, original.frame);
  assert.equal(scaleComponent(original, page.settings, 500).props.contentScale, 400);
});

test('scaled dimension validation permits 4x frames while retaining unscaled limits', () => {
  const page = createDocument(true);
  page.settings = { ...page.settings, maxWidth: 3840, canvasHeight: 6000 };
  const original = { ...createBlock('card'), frame: { x: 0, y: 0, width: 3840, height: 3000 } };
  page.blocks = [scaleComponent(original, page.settings, 400)];
  assert.deepEqual(page.blocks[0].frame, { x: 0, y: 0, width: 15360, height: 12000 });
  assert.doesNotThrow(() => validatePage(page));
  assert.deepEqual(toFreeDocument(page), page);
  page.blocks[0].props.contentScale = 100;
  assert.throws(() => validatePage(page));
});

test('component scaling survives persistence and rejects unsupported percentages', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'animate-studio-scale-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const page = createDocument(true);
  page.blocks = [scaleComponent(createBlock('button'), page.settings, 200)];
  const store = createPageStore({ dataDir });
  await store.save(page);
  assert.deepEqual((await store.read()).page, page);
  for (const contentScale of [0, 24, 25.5, 401, Infinity, NaN, '200']) {
    const invalid = structuredClone(page);
    invalid.blocks[0].props.contentScale = contentScale;
    assert.throws(() => validatePage(invalid));
  }
  for (const contentScale of [25, 100, 200, 400]) {
    page.blocks[0].props.contentScale = contentScale;
    assert.doesNotThrow(() => validatePage(page));
  }
});
