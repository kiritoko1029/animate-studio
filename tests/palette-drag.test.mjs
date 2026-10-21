import test from 'node:test';
import assert from 'node:assert/strict';
import { palettePointer, paletteDropPointer, canvasDropPosition, pointInViewport } from '../src/lib/palette-drag.ts';
import { placeBlock, insertBlockAfter } from '../src/lib/layout.ts';
import { createBlock, createDocument, defaultFrame } from '../src/model.ts';
import { prepareBlockForPage } from '../src/lib/themes.ts';

test('drag placement follows the pointer across canvas zoom and pan, independent of the palette card size', () => {
  const pointer = palettePointer({ clientX: 40, clientY: 90 }, { x: 480, y: 250 }, { left: 500, top: 300, width: 120, height: 80 });
  assert.deepEqual(pointer, { x: 520, y: 340 });
  assert.deepEqual(canvasDropPosition(pointer, { left: 200, top: 100 }, .5, 400), { x: 440, y: 456 });
  assert.deepEqual(canvasDropPosition(pointer, { left: -120, top: -300 }, 2, 400), { x: 120, y: 296 });
  assert.deepEqual(palettePointer({}, { x: 1, y: 2 }, { left: 400, top: 200, width: 100, height: 60 }), { x: 450, y: 230 });
  assert.equal(palettePointer({}, { x: 0, y: 0 }, null), null);
  assert.equal(pointInViewport(pointer, { left: 300, top: 150, width: 400, height: 300 }), true);
  assert.equal(pointInViewport(pointer, { left: 600, top: 150, width: 400, height: 300 }), false);
});

test('dropping from a scrolled palette uses the viewport pointer instead of the scroll-adjusted drag rectangle', () => {
  // Leaving a palette scrolled down 720px shifts the DnD translation upward.
  const translated = { left: 665, top: -314, width: 90, height: 88 };
  const collisions = [{ id: 'canvas', data: { pointerCoordinates: { x: 710, y: 450 } } }];
  const point = paletteDropPointer(collisions, translated);
  assert.deepEqual(point, { x: 710, y: 450 });
  assert.equal(pointInViewport(point, { left: 255, top: 236, width: 756, height: 399 }), true);
  assert.deepEqual(canvasDropPosition(point, { left: 350, top: 276 }, .3, 360), { x: 1020, y: 556 });
  assert.equal(paletteDropPointer([], translated), null, 'releasing outside the canvas cancels placement');
  assert.equal(paletteDropPointer(null, translated), null);
  assert.deepEqual(paletteDropPointer([{ id: 'canvas' }], { left: 600, top: 400, width: 100, height: 60 }), { x: 650, y: 430 }, 'keyboard placement follows its translated rectangle');
});

test('placement on release preserves the previous document and commits the themed component', () => {
  const page = createDocument(); page.settings.theme = 'tech-blue';
  const before = structuredClone(page);
  const candidate = prepareBlockForPage(createBlock('card'), page.settings);
  const result = placeBlock(page, candidate, { x: 200, y: 400 });
  assert.deepEqual(page, before, 'placement must preserve the previous document for undo');
  assert.equal(result.block.id, candidate.id);
  assert.equal(result.block.props.background, undefined, 'preview inherits the selected page theme');
  assert.equal(result.block.frame.width, defaultFrame('card', page.settings.maxWidth).width);
  assert.deepEqual(result.page.blocks.find(block => block.id === candidate.id), result.block);
  const inserted = insertBlockAfter(page, candidate, page.blocks[1].id);
  assert.deepEqual(page, before);
  assert.deepEqual(inserted.page.blocks.find(block => block.id === candidate.id), inserted.block);
  assert.ok(inserted.page.blocks.some(block => block.id !== candidate.id && block.frame.y !== page.blocks.find(item => item.id === block.id).frame.y), 'committed insertion includes shifted neighbours');
});
