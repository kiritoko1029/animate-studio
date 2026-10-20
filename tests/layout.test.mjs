import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBlock, insertBlockAfter } from '../src/lib/layout.ts';
import { defaultFrame } from '../src/model.ts';

function block(id, frame, type = 'button') { return { id, type, props: { label: id }, ...(frame ? { frame } : {}) }; }
function page(blocks = [], width = 1000, height = 800) {
  return { version: 1, name: '布局测试', settings: { background: '#fff', accent: '#408668', maxWidth: width, padding: 0, layout: 'free', canvasHeight: height }, blocks };
}
function conflict(a, b) {
  return a.x < b.x + b.width + 16 && a.x + a.width + 16 > b.x && a.y < b.y + b.height + 16 && a.y + a.height + 16 > b.y;
}
function freeze(value) {
  Object.freeze(value);
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return value;
}

test('adding uses component default dimensions and preserves the input document', () => {
  const source = freeze(page());
  const candidate = freeze(block('new'));
  const placed = placeBlock(source, candidate);
  assert.deepEqual(placed.block.frame, { x: 0, y: 0, width: defaultFrame('button', 1000).width, height: defaultFrame('button', 1000).height });
  assert.equal(source.blocks.length, 0);
  assert.equal(candidate.frame, undefined);
  assert.deepEqual(placed.page.blocks[0], placed.block);
  assert.equal(placed.expanded, false);
});

test('a preferred position stays nearby but avoids existing components with a 16px gap', () => {
  const existing = block('existing', { x: 0, y: 0, width: 240, height: 100 });
  const source = freeze(page([existing]));
  const placed = placeBlock(source, block('new'), { x: 0, y: 0 });
  assert.deepEqual(placed.block.frame, { x: 0, y: 120, width: 240, height: 100 });
  assert.equal(conflict(placed.block.frame, existing.frame), false);
  assert.deepEqual(placed.page.blocks[0], existing);
});

test('adding to a page with adjacent columns leaves every old position and size unchanged', () => {
  const source = freeze(page([
    block('left', { x: 0, y: 0, width: 400, height: 260 }),
    block('right', { x: 416, y: 0, width: 400, height: 260 }),
  ]));
  const placed = placeBlock(source, block('new'), { x: 16, y: 16 });
  assert.deepEqual(placed.page.blocks.slice(0, 2), source.blocks);
  for (const existing of source.blocks) assert.equal(conflict(placed.block.frame, existing.frame), false);
  assert.equal(placed.block.frame.y, 280);
});

test('finding room grows the canvas instead of shifting a full-width existing block', () => {
  const source = freeze(page([block('existing', { x: 0, y: 0, width: 320, height: 320 })], 320, 320));
  const placed = placeBlock(source, block('new'));
  assert.deepEqual(placed.page.blocks[0], source.blocks[0]);
  assert.equal(placed.block.frame.y, 336);
  assert.equal(placed.page.settings.canvasHeight, 440);
  assert.equal(placed.expanded, true);
});

test('repeated additions find collision-free slots without moving previously added components', () => {
  let current = page([], 600, 320);
  for (let index = 0; index < 15; index += 1) {
    const previous = structuredClone(current);
    const placed = placeBlock(current, block(`block-${index}`));
    assert.deepEqual(placed.page.blocks.slice(0, index), previous.blocks);
    for (const existing of previous.blocks) assert.equal(conflict(placed.block.frame, existing.frame), false);
    current = placed.page;
  }
  assert.ok(current.settings.canvasHeight > 320);
  assert.ok(current.settings.canvasHeight <= 6000);
});

test('a completely full canvas rejects an addition without changing anything', () => {
  const source = freeze(page([
    block('top', { x: 0, y: 0, width: 320, height: 3000 }),
    block('bottom', { x: 0, y: 3000, width: 320, height: 3000 }),
  ], 320, 6000));
  const original = JSON.stringify(source);
  assert.throws(() => placeBlock(source, block('new')), /画布已满/);
  assert.equal(JSON.stringify(source), original);
});

test('inserting after a component shifts lower components together and preserves same-row components', () => {
  const source = freeze(page([
    block('anchor', { x: 16, y: 0, width: 300, height: 100 }),
    block('side', { x: 500, y: 0, width: 200, height: 100 }),
    block('lower-left', { x: 16, y: 116, width: 300, height: 100 }),
    block('lower-right', { x: 500, y: 300, width: 200, height: 100 }),
  ]));
  const placed = insertBlockAfter(source, block('inserted'), 'anchor');
  assert.deepEqual(placed.block.frame, { x: 16, y: 116, width: 240, height: 100 });
  assert.deepEqual(placed.page.blocks.map(item => item.id), ['anchor', 'inserted', 'side', 'lower-left', 'lower-right']);
  const byId = Object.fromEntries(placed.page.blocks.map(item => [item.id, item]));
  assert.deepEqual(byId.anchor, source.blocks[0]);
  assert.deepEqual(byId.side, source.blocks[1]);
  assert.equal(byId['lower-left'].frame.y, 232);
  assert.equal(byId['lower-right'].frame.y, 416);
  assert.equal(byId['lower-right'].frame.y - byId['lower-left'].frame.y, 184);
  assert.equal(conflict(placed.block.frame, byId['lower-left'].frame), false);
});

test('inserting into touching rows adds a shared offset to retain the gap', () => {
  const source = freeze(page([
    block('anchor', { x: 0, y: 0, width: 240, height: 100 }),
    block('lower', { x: 0, y: 100, width: 240, height: 100 }),
  ], 320, 320));
  const placed = insertBlockAfter(source, block('new'), 'anchor');
  assert.equal(placed.page.blocks[2].frame.y, 232);
  assert.equal(placed.page.settings.canvasHeight, 336);
  assert.equal(placed.expanded, true);
  assert.equal(conflict(placed.block.frame, placed.page.blocks[2].frame), false);
});

test('inserting rejects a crossing column rather than moving it or overlapping it', () => {
  const source = freeze(page([
    block('anchor', { x: 0, y: 0, width: 100, height: 100 }),
    block('crossing', { x: 150, y: 0, width: 100, height: 400 }),
  ]));
  const original = JSON.stringify(source);
  assert.throws(() => insertBlockAfter(source, block('new'), 'anchor'), /同排或跨行组件冲突/);
  assert.equal(JSON.stringify(source), original);
});

test('insertion never truncates lower blocks at the maximum height', () => {
  const source = freeze(page([
    block('anchor', { x: 0, y: 0, width: 240, height: 100 }),
    block('last', { x: 0, y: 5800, width: 240, height: 200 }),
  ], 320, 6000));
  const original = JSON.stringify(source);
  assert.throws(() => insertBlockAfter(source, block('new'), 'anchor'), /超出 6000 px/);
  assert.equal(JSON.stringify(source), original);
});

test('inserting clamps a wider new component to the canvas and preserves the anchor', () => {
  const source = freeze(page([block('anchor', { x: 280, y: 0, width: 40, height: 100 })], 320, 320));
  const placed = insertBlockAfter(source, block('new'), 'anchor');
  assert.equal(placed.block.frame.x, 80);
  assert.equal(placed.block.frame.width, 240);
  assert.deepEqual(placed.page.blocks[0], source.blocks[0]);
});
