import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument, toFreeDocument } from '../src/model.ts';
import { alignFrame, canvasBounds, clampFrame } from '../src/lib/canvas-bounds.ts';
import { placeBlock, insertBlockAfter } from '../src/lib/layout.ts';
import { validatePage } from '../server/validation.mjs';

function page(width=500, height=320, padding=37) {
  const page=createDocument(true);
  page.settings={...page.settings,maxWidth:width,canvasHeight:height,padding};
  return page;
}
function assertInside(doc) {
  const bounds=canvasBounds(doc.settings);
  for(const {frame} of doc.blocks) {
    assert.ok(frame.x>=bounds.left && frame.y>=bounds.top);
    assert.ok(frame.x+frame.width<=bounds.right && frame.y+frame.height<=bounds.bottom);
  }
  assert.doesNotThrow(()=>validatePage(doc));
}

test('click placement and edge drops respect non-grid margins and fit wide components',()=>{
  const doc=page();
  const header=placeBlock(doc,createBlock('navbar'));
  assert.deepEqual(header.block.frame,{x:37,y:37,width:426,height:85});
  for(const preferred of [{x:-100,y:-100},{x:9999,y:9999}]) {
    const result=placeBlock(doc,createBlock('button'),preferred);
    assertInside(result.page);
    assert.equal(result.block.frame.x,preferred.x<0?37:223);
    assert.equal(result.block.frame.y,preferred.y<0?37:183);
    assert.equal(result.expanded,false);
  }
  assertInside(header.page);
});

test('automatic canvas growth retains the bottom margin and existing frames',()=>{
  let doc=page(320);
  for(let i=0;i<8;i++) {
    const next=placeBlock(doc,createBlock('button'));
    assert.deepEqual(next.page.blocks.slice(0,-1),doc.blocks);
    assertInside(next.page);
    doc=next.page;
  }
  assert.ok(doc.settings.canvasHeight>320);
});

test('insertion keeps side and bottom margins while moving lower components as a group',()=>{
  const doc=page(320,320,40);
  const anchor={...createBlock('button'),frame:{x:40,y:40,width:240,height:100}};
  const lower={...createBlock('button'),frame:{x:40,y:156,width:240,height:100}};
  doc.blocks=[anchor,lower];
  const result=insertBlockAfter(doc,createBlock('navbar'),anchor.id);
  assert.equal(result.block.frame.x,40);
  assert.equal(result.block.frame.width,240);
  assert.deepEqual(result.page.blocks[0],anchor);
  assert.ok(result.page.blocks[2].frame.y>lower.frame.y);
  assertInside(result.page);
});

test('maximum canvas height includes the margin rather than allowing components into it',()=>{
  const doc=page(320,6000,37);
  doc.blocks=[{...createBlock('card'),frame:{x:37,y:37,width:246,height:3000}},
    {...createBlock('card'),frame:{x:37,y:3037,width:246,height:2926}}];
  assert.throws(()=>placeBlock(doc,createBlock('button')),/画布已满/);
  assert.throws(()=>insertBlockAfter(doc,createBlock('button'),doc.blocks[0].id),/6000/);
});

test('frame changes, duplication offsets and oversize frames remain inside all four margins',()=>{
  const doc=page(320,320,120);
  assert.deepEqual(clampFrame({x:-1,y:-2,width:500,height:900},doc.settings),{x:120,y:120,width:80,height:80});
  assert.deepEqual(clampFrame({x:500,y:600,width:40,height:32},doc.settings),{x:160,y:168,width:40,height:32});
});

test('alignment uses the content edges and preserves vertical position, size and the source frame',()=>{
  const doc=page(501,800,37),frame=Object.freeze({x:80,y:200,width:240,height:100});
  for(const [alignment,x] of [['left',37],['center',130.5],['right',224]]) {
    assert.deepEqual(alignFrame(frame,doc.settings,alignment),{...frame,x});
  }
  assert.equal(frame.x,80);
});

test('import migration honors margins and remains stable on reload',()=>{
  const doc=page();
  doc.blocks=[{...createBlock('navbar'),frame:{x:0,y:0,width:500,height:85}},createBlock('button')];
  const migrated=toFreeDocument(doc);
  assertInside(migrated);
  assert.deepEqual(toFreeDocument(migrated),migrated);
  const noMargins=page(500,320,0);
  noMargins.blocks=[{...createBlock('button'),frame:{x:0,y:0,width:240,height:100}}];
  assert.deepEqual(toFreeDocument(noMargins),noMargins);
});
