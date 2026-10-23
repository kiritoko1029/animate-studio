import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createDocument } from '../src/model.ts';

const bundle = await build({ entryPoints: ['src/lib/guest-draft.ts'], bundle: true, write: false, format: 'iife', globalName: 'Drafts', define: { 'import.meta.env.VITE_STUDIO_CLOUD': 'true' }, footer: { js: 'window.Drafts=Drafts;' } });
function fixture(t, fetch) {
  const dom = new JSDOM('', { url: 'https://studio.test', runScripts: 'dangerously' });
  t.after(() => dom.window.close());
  Object.assign(dom.window, { Headers, AbortSignal, fetch }); dom.window.eval(bundle.outputFiles[0].text);
  return dom.window;
}
test('guest draft restores after a reload without depending on authentication or cloud availability', async t => {
  const win = fixture(t, () => { throw new Error('offline'); });
  assert.equal((await win.Drafts.readGuestDraft()).page, null);
  const page = createDocument(true); page.name = '我的浏览器草稿';
  const saved = win.Drafts.writeGuestDraft(page);
  win.eval(bundle.outputFiles[0].text);
  assert.deepEqual(JSON.parse(JSON.stringify(await win.Drafts.readGuestDraft())), JSON.parse(JSON.stringify(saved)));
});
test('legacy anonymous workspace migrates on read, using its existing browser identity', async t => {
  const page = createDocument(true), calls = [];
  const win = fixture(t, async (path, options) => { calls.push({ path, options }); return Response.json({ page, savedAt: '2026-10-23T00:00:00Z' }); });
  win.localStorage.setItem('animate-studio-cloud-workspace', 'existing-browser-key');
  const record = await win.Drafts.readGuestDraft();
  assert.deepEqual(JSON.parse(JSON.stringify(record.page)), page);
  assert.equal(calls[0].options.headers.get('x-studio-workspace'), 'existing-browser-key');
  win.Drafts.writeGuestDraft(record.page);
  await win.Drafts.readGuestDraft();
  assert.equal(calls.length, 1, 'a saved browser draft does not keep reading the legacy remote record');
});
test('corrupt browser draft is retained and never replaced with a legacy or blank page', async t => {
  let fetched = false;
  const win = fixture(t, async () => { fetched = true; return Response.json({ page: null }); });
  win.localStorage.setItem(win.Drafts.guestDraftKey, '{broken');
  await assert.rejects(win.Drafts.readGuestDraft(), /原草稿尚未覆盖/);
  assert.equal(win.localStorage.getItem(win.Drafts.guestDraftKey), '{broken');
  assert.equal(fetched, false);
});
test('storage write failure remains observable so the editor can retain edits and offer export', t => {
  const win = fixture(t, async () => Response.json({ page: null }));
  win.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => win.Drafts.writeGuestDraft(createDocument(true)), /导出页面 JSON/);
});
