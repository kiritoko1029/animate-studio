import test from 'node:test';
import assert from 'node:assert/strict';
import { elementSize, localPointer } from '../src/lib/element-geometry.ts';
import { scrollingNumberOptions } from '../src/lib/number-display.ts';
import { scrollPercentage } from '../src/lib/scroll-progress.ts';

test('canvas backgrounds keep local resolution and pointer coordinates at every editor zoom', () => {
  for (const scale of [.05, .25, .8, 1, 2, 4]) {
    const element = { clientWidth:600, clientHeight:360, getBoundingClientRect:()=>({left:50,top:75,width:600*scale,height:360*scale}) };
    assert.deepEqual(elementSize(element),{width:600,height:360});
    assert.deepEqual(localPointer(element,50+150*scale,75+270*scale),{x:150,y:270});
  }
  assert.deepEqual(localPointer({clientWidth:0,clientHeight:0,getBoundingClientRect:()=>({left:0,top:0,width:0,height:0})},10,20),{x:0,y:0});
});

test('rolling numbers keep a bounded list even at the largest supported value and fit their glyphs', () => {
  for (const value of [0,1,86,101,1234567,1000000000]) {
    for (const fontSize of [12,44,120]) {
      const {step,itemsSize}=scrollingNumberOptions(value,fontSize);
      assert.ok(Math.ceil(value/step)+1<=102, `${value} must not allocate a row per integer`);
      assert.ok(itemsSize>=fontSize*1.3);
      // The upstream list starts at the target, so a non-divisible step still lands on it.
      const range=Array.from({length:Math.floor(value/step)+1},(_,i)=>value-i*step);
      assert.equal(range[0],value);
    }
  }
});

test('scroll progress follows the visible page and stays at zero when there is no scrollable distance', () => {
  assert.equal(scrollPercentage(0,1000,1000),0);
  assert.equal(scrollPercentage(200,500,1000),0);
  assert.equal(scrollPercentage(500,2000,1000),50);
  assert.equal(scrollPercentage(-20,2000,1000),0);
  assert.equal(scrollPercentage(1500,2000,1000),100);
  // The same camera position at 25% and 100% zoom gives the same percentage.
  assert.equal(scrollPercentage(125,500,250),scrollPercentage(500,2000,1000));
});
