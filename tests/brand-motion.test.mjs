import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createBrandMotion } from '../src/lib/brand-motion.ts';
import { installMatchMedia } from './helpers/media-query.mjs';

function fixture(t, reducedMotion = false) {
  const dom = new JSDOM('<svg><g></g></svg>', { pretendToBeVisual: true });
  const win = dom.window, element = win.document.querySelector('g');
  installMatchMedia(win, { reducedMotion });
  const preference = win.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = [], running = new Set();
  let pose = 'none', hidden = false;
  win.getComputedStyle = () => ({ transform: pose });
  Object.defineProperty(win.document, 'visibilityState', { get: () => hidden ? 'hidden' : 'visible' });
  element.animate = (frames, options) => {
    const animation = {
      frames, options, playState: 'running', onfinish: null,
      cancel() { running.delete(this); this.playState = 'idle'; },
      pause() { this.playState = 'paused'; },
      play() { this.playState = 'running'; },
      finish() { this.playState = 'finished'; this.onfinish?.(); },
    };
    running.add(animation); animations.push(animation); return animation;
  };
  const motion = createBrandMotion(element);
  t.after(() => { motion.dispose(); win.close(); });
  return {
    motion, animations, running,
    pose(value) { pose = value; },
    reduce(value) { preference.matches = value; preference.dispatchEvent(new win.Event('change')); },
    hide(value) { hidden = value; win.document.dispatchEvent(new win.Event('visibilitychange')); },
  };
}

test('loading owns one loop, ignores hover, and settles from the visible pose on completion', t => {
  const f = fixture(t); f.motion.setPhase('loading');
  assert.equal(f.running.size, 1); assert.equal(f.animations[0].options.iterations, Infinity);
  f.motion.hover(); f.motion.leave(); f.motion.setPhase('loading');
  assert.equal(f.animations.length, 1);
  const visible = 'matrix(1, 0, 0, 1, 0, -2.4)'; f.pose(visible); f.motion.setPhase('ready');
  assert.equal(f.animations[0].playState, 'idle'); assert.equal(f.running.size, 1);
  assert.equal(f.animations[1].frames[0].transform, visible);
  f.animations[1].finish(); assert.equal(f.running.size, 0);
  f.motion.setPhase('ready'); assert.equal(f.animations.length, 2, 'rerenders do not replay completion');
});

test('pointer exit and reentry retarget the current pose without stacking animations', t => {
  const f = fixture(t); f.motion.setPhase('idle'); f.motion.hover();
  const first = f.animations[0], visible = 'matrix(.707, .707, -.707, .707, 0, -4)';
  f.pose(visible); f.motion.leave();
  assert.equal(f.animations[1].frames[0].transform, visible);
  assert.equal(first.playState, 'idle'); assert.equal(f.running.size, 1);
  first.onfinish(); assert.equal(f.running.size, 1, 'a stale completion cannot cancel newer motion');
  f.pose('matrix(.9, .4, -.4, .9, 0, -1)'); f.motion.hover();
  assert.equal(f.running.size, 1); assert.equal(f.animations[2].frames[0].transform, 'matrix(.9, .4, -.4, .9, 0, -1)');
  f.animations[2].finish(); assert.equal(f.running.size, 0, 'hover plays once and releases its animation');
});

test('reduced motion suppresses every animation and reacts immediately to preference changes', t => {
  const f = fixture(t, true); f.motion.setPhase('loading'); f.motion.hover();
  assert.equal(f.animations.length, 0);
  f.reduce(false); assert.equal(f.running.size, 1);
  f.reduce(true); assert.equal(f.running.size, 0);
  f.motion.setPhase('ready'); f.motion.hover(); assert.equal(f.animations.length, 1);
  f.reduce(false); assert.equal(f.running.size, 0, 'changing preferences does not replay completion');
});

test('hidden tabs pause; error/idle and disposal stop work and detach observers', t => {
  const f = fixture(t); f.motion.setPhase('loading'); const loop = f.animations[0];
  f.hide(true); assert.equal(loop.playState, 'paused');
  f.hide(false); assert.equal(loop.playState, 'running');
  f.motion.setPhase('idle'); assert.equal(f.running.size, 0);
  f.motion.setPhase('loading'); f.motion.dispose();
  assert.equal(f.running.size, 0);
  const count = f.animations.length;
  f.reduce(true); f.reduce(false); f.hide(true); f.hide(false); f.motion.hover(); f.motion.setPhase('loading');
  assert.equal(f.animations.length, count);
});
