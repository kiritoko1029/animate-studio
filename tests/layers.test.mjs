import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument } from '../src/model.ts';
import { moveBlockLayer } from '../src/lib/layers.ts';

test('layer operations move exactly one component without changing geometry or the previous document', () => {
  const page = createDocument(true);
  page.blocks = ['background', 'title', 'button', 'badge'].map(id => ({ ...createBlock('text'), id, frame: { x: 40, y: 40, width: 300, height: 100 } }));
  const before = structuredClone(page);
  for (const [action, order] of [
    ['lower', ['title', 'background', 'button', 'badge']],
    ['raise', ['background', 'button', 'title', 'badge']],
    ['top', ['background', 'button', 'badge', 'title']],
    ['bottom', ['title', 'background', 'button', 'badge']],
  ]) {
    const next = moveBlockLayer(page, 'title', action);
    assert.deepEqual(next.blocks.map(block => block.id), order);
    assert.equal(next.settings, page.settings);
    for (const block of next.blocks) assert.equal(block, page.blocks.find(original => original.id === block.id));
    assert.deepEqual(page, before, 'undo retains the unchanged prior document');
  }
});

test('top and bottom boundaries and missing components do not create history entries', () => {
  const page = { ...createDocument(true), blocks: [{ ...createBlock('text'), id: 'bottom' }, { ...createBlock('text'), id: 'top' }] };
  for (const [id, action] of [['bottom', 'bottom'], ['bottom', 'lower'], ['top', 'top'], ['top', 'raise'], ['missing', 'top']]) {
    assert.equal(moveBlockLayer(page, id, action), page);
  }
  assert.equal(moveBlockLayer(createDocument(true), 'missing', 'lower').blocks.length, 0);
});
