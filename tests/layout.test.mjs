import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBlock, insertBlockAfter, fillBlockWidth } from '../src/lib/layout.ts';
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

test('width fill uses the full inner canvas without changing vertical geometry or the original document', () => {
  for (const [width, padding] of [[1000, 0], [1000, 37], [3840, 80]]) {
    const source = page([block('target', { x: 200, y: 150, width: 240, height: 100 })], width);
    source.settings.padding = padding;
    freeze(source);
    assert.deepEqual(fillBlockWidth(source, 'target'), { x: padding, y: 150, width: width - padding * 2, height: 100 });
    assert.equal(source.blocks[0].frame.width, 240);
  }
});

test('width fill stops at the nearest neighbors across the entire vertical span and leaves them fixed', () => {
  const source = freeze(page([
    block('target', { x: 300, y: 200, width: 100, height: 100 }),
    block('left-far', { x: 0, y: 150, width: 100, height: 100 }),
    block('left-near', { x: 100, y: 299, width: 120, height: 100 }),
    block('right-near', { x: 800, y: 150, width: 100, height: 51 }),
    block('right-far', { x: 900, y: 200, width: 100, height: 100 }),
  ]));
  const before = JSON.stringify(source);
  const frame = fillBlockWidth(source, 'target');
  assert.deepEqual(frame, { x: 236, y: 200, width: 548, height: 100 });
  assert.equal(JSON.stringify(source), before);
  const filled = { ...source, blocks: source.blocks.map(item => item.id === 'target' ? { ...item, frame } : item) };
  assert.deepEqual(fillBlockWidth(filled, 'target'), frame, 'filling twice must not change the result');
});

test('components entirely above or below the target do not consume its available width', () => {
  const source = page([
    block('above', { x: 0, y: 0, width: 1000, height: 200 }),
    block('target', { x: 300, y: 200, width: 100, height: 100 }),
    block('below', { x: 0, y: 300, width: 1000, height: 200 }),
  ]);
  assert.deepEqual(fillBlockWidth(source, 'target'), { x: 0, y: 200, width: 1000, height: 100 });
});

test('width fill preserves tight and touching gaps instead of shrinking the selected component', () => {
  for (const gap of [0, 5, 10]) {
    const target = block('target', { x: 200, y: 100, width: 100, height: 100 });
    const source = page([
      block('left', { x: 0, y: 100, width: 200 - gap, height: 100 }), target,
      block('right', { x: 300 + gap, y: 100, width: 100, height: 100 }),
    ]);
    assert.deepEqual(fillBlockWidth(source, 'target'), target.frame);
  }
});

test('width fill rejects existing overlaps and missing components without mutating the page', () => {
  const source = freeze(page([
    block('target', { x: 200, y: 100, width: 200, height: 100 }),
    block('overlapping', { x: 300, y: 150, width: 200, height: 200 }),
  ]));
  const before = JSON.stringify(source);
  assert.throws(() => fillBlockWidth(source, 'target'), /重叠/);
  assert.throws(() => fillBlockWidth(source, 'missing'), /找不到/);
  assert.equal(JSON.stringify(source), before);
});

test('width fill remains available at the component count limit', () => {
  const source = page([block('target', { x: 200, y: 0, width: 100, height: 100 }),
    ...Array.from({ length: 199 }, (_, index) => block(`other-${index}`, { x: 0, y: 200, width: 40, height: 32 })),
  ]);
  assert.equal(fillBlockWidth(source, 'target').width, 1000);
});

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
