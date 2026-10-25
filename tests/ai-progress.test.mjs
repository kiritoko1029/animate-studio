import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

const bundle = await build({
  stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {AiProgressPanel} from './src/components/ai/AiProgressPanel';const root=createRoot(document.getElementById('root'));window.renderProgress=props=>flushSync(()=>root.render(<MotionConfig reducedMotion="always"><AiProgressPanel {...props}/></MotionConfig>));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());`, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
});
function fixture(t) {
  const errors = [], console = new VirtualConsole();
  console.on('error', (...values) => errors.push(values.map(String).join(' ')));
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://progress.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console });
  const win = dom.window;
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win);
  win.HTMLElement.prototype.scrollTo = function ({ top }) { this.scrollTop = top; };
  win.eval(bundle.outputFiles[0].text);
  t.after(() => { win.unmount(); win.close(); assert.deepEqual(errors, []); });
  const progress = { phase: 'thinking', round: 1, startedAt: Date.now(), changes: 0, detail: '', reasoning: '' };
  const render = (patch = {}, running = true) => { Object.assign(progress, patch); win.renderProgress({ progress: { ...progress }, running, status: running ? 'running' : 'complete' }); };
  return { win, doc: win.document, render };
}

test('thinking preview follows new text, expands on demand and respects reading position', t => {
  const f = fixture(t); f.render({ reasoning: '先确定页面结构。' });
  const preview = f.doc.querySelector('.ai-reasoning-preview');
  const button = () => f.doc.querySelector('.ai-reasoning-toggle');
  let height = 400;
  Object.defineProperty(preview, 'scrollHeight', { get: () => height });
  f.render({ reasoning: '先确定页面结构。\n再安排主要行动按钮。' });
  assert.equal(preview.scrollTop, 400);
  assert.equal(button().getAttribute('aria-expanded'), 'false');
  assert.equal(f.doc.querySelector('.ai-reasoning-text').hidden, true);
  f.win.perform(() => button().click());
  const full = f.doc.querySelector('.ai-reasoning-text');
  assert.equal(full.hidden, false); assert.equal(button().getAttribute('aria-controls'), full.id);
  Object.defineProperty(full, 'scrollHeight', { get: () => height });
  Object.defineProperty(full, 'clientHeight', { value: 120 });
  f.render({ reasoning: full.textContent + '\n补充功能卡片。' });
  assert.equal(full.scrollTop, 400);
  full.scrollTop = 20; full.dispatchEvent(new f.win.Event('scroll', { bubbles: true }));
  height = 900; f.render({ reasoning: full.textContent + '\n检查导航目标。' });
  assert.equal(full.scrollTop, 20, 'a reader looking back is not dragged to the newest text');
  f.render({}, false);
  assert.equal(full.hidden, false, 'completion preserves the expanded state');
  f.win.perform(() => button().click());
  assert.equal(full.hidden, true);
  assert.equal(f.doc.querySelector('.ai-reasoning-preview').textContent.includes('检查导航目标'), true);
});

test('empty thinking has no placeholder card and a new task resets the compact preview', t => {
  const f = fixture(t); f.render();
  assert.equal(!!f.doc.querySelector('.ai-reasoning'), false);
  assert.match(f.doc.querySelector('.ai-progress-status').textContent, /正在思考/);
  assert.doesNotMatch(f.doc.body.textContent, /已推理约|接口不提供|模型尚未返回/);
  f.render({ reasoning: '安排内容。' }); f.win.perform(() => f.doc.querySelector('.ai-reasoning-toggle').click());
  f.render({ startedAt: Date.now() + 1000, reasoning: '调整版面。' });
  assert.equal(f.doc.querySelector('.ai-reasoning-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(f.doc.querySelector('.ai-reasoning-preview').textContent, '调整版面。');
});
