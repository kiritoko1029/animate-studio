import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/model.ts';
import { createSiteDocument, createLayoutDocument, matchSiteRoute } from '../shared/site-document.mjs';
import { siteFromPlan, applySiteOperation, finishSite, runSiteAi, validateSitePlan, explainSite, writeSiteAiSession, readSiteAiSession, siteAiKey } from '../src/lib/ai/site-ai.ts';
import { defaultAiSettings } from '../src/lib/ai/config.ts';
import { AiOperationDecoder, parseAiOperation } from '../src/lib/ai/protocol.ts';

function fixture() {
  const site = createSiteDocument(createDocument(true));
  const plan = { name: '产品官网', summary: '首页、产品列表和详情，共用页头。', sharedLayout: ['header'], deletes: [], pages: [
    { id: site.homePageId, name: '首页', path: '/', kind: 'page', layout: ['header'] },
    { id: 'products', name: '产品列表', path: '/products', kind: 'page', layout: ['header'] },
    { id: 'product-detail', name: '产品详情', path: '/products/:id', kind: 'detail', layout: ['header'] },
  ] };
  return { site, plan };
}
function pageFor(spec, settings) {
  return { ...createDocument(true), id: spec.id, name: spec.name, settings: structuredClone(settings), blocks: [] };
}
function planOperation(plan) { return { v: 1, seq: 1, op: 'sitePlan', ...plan }; }
function streamRecords(records) {
  return async function* () {
    yield { type: 'connected' };
    const text = records.map((record, index) => JSON.stringify({ ...record, seq: index + 1 })).join('\n') + '\n';
    yield { type: 'text', text: text.slice(0, 31) };
    yield { type: 'text', text: text.slice(31) };
    yield { type: 'complete' };
  };
}
const profile = { ...defaultAiSettings().profiles.openai, apiKey: 'fixture-not-a-secret', model: 'fixture-model' };

test('site planning is read-only and enforces stable routes and deletion scope', () => {
  const { site, plan } = fixture();
  const original = structuredClone(site);
  const skeleton = siteFromPlan(site, plan);
  assert.equal(site.pages.length, 1);
  assert.deepEqual(site, original);
  assert.equal(skeleton.pages.length, 3);
  assert.equal(skeleton.homePageId, original.homePageId);
  assert.equal(skeleton.pages[0].layout.length, 0, 'a missing layout is not silently fabricated');
  assert.throws(() => finishSite(skeleton, plan), /引用无效/);
  assert.throws(() => validateSitePlan(site, { ...plan, deletes: [site.homePageId] }), /首页/);
  assert.throws(() => validateSitePlan(site, { ...plan, pages: plan.pages.slice(0, 2).map((entry, index) => index ? { ...entry, path: '/' } : entry) }), /路径/);
  assert.throws(() => applySiteOperation(skeleton, plan, { v: 1, seq: 1, op: 'sitePage', id: 'unapproved', page: pageFor({ id: 'unapproved', name: '计划外页面' }, site.pages[0].page.settings) }), /计划外/);
  assert.match(explainSite(site), /共有 1 个页面/);
});

test('AI plan requires confirmation and generated pages are staged until complete', async () => {
  const { site, plan } = fixture();
  const planning = await runSiteAi({ site, task: '做一个产品官网', provider: 'openai', profile, phase: 'plan', signal: new AbortController().signal, stream: streamRecords([{ v: 1, seq: 1, op: 'message', text: '先确认结构' }, planOperation(plan)]) });
  assert.equal(planning.site, null);
  assert.equal(planning.plan.pages.length, 3);
  assert.equal(site.pages.length, 1, 'planning does not mutate the editor site');
  const staged = [];
  const operations = plan.pages.slice(1).map((spec, index) => ({ v: 1, seq: index + 1, op: 'sitePage', id: spec.id, page: pageFor(spec, site.pages[0].page.settings), summary: `生成${spec.name}` }));
  const header = createLayoutDocument('header', site.pages[0].page.settings);
  operations.push({ v: 1, seq: 3, op: 'siteLayout', region: 'header', page: header }, { v: 1, seq: 4, op: 'done', summary: '整站已生成' });
  const result = await runSiteAi({ site, task: '做一个产品官网', plan: planning.plan, provider: 'openai', profile, phase: 'generate', signal: new AbortController().signal, stream: streamRecords(operations), onDraft: value => staged.push(value), getSite: () => site });
  assert.equal(staged.length, 3, 'each completed page/layout is checkpointed');
  assert.equal(result.site.pages.length, 3);
  assert.equal(result.site.pages[0].layout[0], 'header');
  assert.equal(matchSiteRoute(result.site, '/products/42').params.id, '42');
  assert.equal(site.sharedLayout.header, undefined, 'the caller commits the completed result, not intermediate drafts');
});

test('paused generation preserves the last checkpoint and refuses stale application', async () => {
  const { site, plan } = fixture();
  const skeleton = siteFromPlan(site, plan);
  const incomplete = [{ v: 1, seq: 1, op: 'sitePage', id: 'products', page: pageFor(plan.pages[1], site.pages[0].page.settings) }];
  await assert.rejects(runSiteAi({ site, plan, draft: skeleton, task: '建站', provider: 'openai', profile, phase: 'generate', signal: new AbortController().signal, stream: streamRecords(incomplete) }), /尚未完成/);
  const records = plan.pages.slice(1).map((spec, index) => ({ v: 1, seq: index + 1, op: 'sitePage', id: spec.id, page: pageFor(spec, site.pages[0].page.settings) }));
  records.push({ v: 1, seq: 3, op: 'siteLayout', region: 'header', page: createLayoutDocument('header', site.pages[0].page.settings) }, { v: 1, seq: 4, op: 'done' });
  const changed = structuredClone(site); changed.name = '用户后来修改的名称';
  await assert.rejects(runSiteAi({ site, plan, task: '建站', provider: 'openai', profile, phase: 'generate', signal: new AbortController().signal, stream: streamRecords(records), getSite: () => changed }), /已发生变化/);
});

test('site checkpoints validate both snapshots and retain damaged source data', () => {
  const { site, plan } = fixture(), values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  writeSiteAiSession({ version: 1, owner: 'guest', siteId: site.id, task: '建站', status: 'paused', plan, before: site, draft: site, messages: ['已保留'], updatedAt: Date.now() }, storage);
  assert.equal(readSiteAiSession('guest', site.id, storage).plan.pages.length, 3);
  assert.equal(readSiteAiSession('other', site.id, storage), null);
  values.set(siteAiKey('guest', site.id), '{"version":1,"broken":true');
  assert.throws(() => readSiteAiSession('guest', site.id, storage), /原记录尚未覆盖/);
  assert.equal(values.get(siteAiKey('guest', site.id)), '{"version":1,"broken":true');
});

test('site protocol validates full pages and terminal plan records', () => {
  const { site, plan } = fixture();
  assert.throws(() => parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'sitePage', id: 'products', page: { id: 'products', blocks: [] } })), /page/);
  const decoder = new AiOperationDecoder();
  const operations = [...decoder.push(JSON.stringify(planOperation(plan)) + '\n')];
  assert.equal(operations[0].op, 'sitePlan');
  assert.equal(decoder.terminal, 'sitePlan');
  assert.equal([...decoder.finish()].length, 0);
  assert.throws(() => applySiteOperation(siteFromPlan(site, plan), plan, { v: 1, seq: 1, op: 'add', id: 'not-allowed' }), /只接受/);
});

test('site generation normalizes model canvas heights before strict page validation', async () => {
  const { site, plan: basePlan } = fixture();
  const plan = { ...basePlan, sharedLayout: ['header', 'footer'], pages: basePlan.pages.map(entry => ({ ...entry, layout: ['header', 'footer'] })) };
  const header = createLayoutDocument('header', site.pages[0].page.settings);
  header.settings.canvasHeight = 160;
  const footer = createLayoutDocument('footer', site.pages[0].page.settings);
  footer.settings.canvasHeight = 240;
  const originalHeader = structuredClone(header), originalFooter = structuredClone(footer);
  const records = plan.pages.slice(1).map((spec, index) => ({
    v: 1, seq: index + 1, op: 'sitePage', id: spec.id,
    page: pageFor(spec, { ...site.pages[0].page.settings, canvasHeight: index === 0 ? '1480' : null }),
  }));
  records.push(
    { v: 1, seq: 3, op: 'siteLayout', region: 'header', page: header },
    { v: 1, seq: 4, op: 'siteLayout', region: 'footer', page: footer },
    { v: 1, seq: 5, op: 'done' },
  );
  let prompt;
  const result = await runSiteAi({ site, plan, task: '生成完整大学站点', provider: 'openai', profile, phase: 'generate', signal: new AbortController().signal, stream: (...args) => { prompt = args[2]; return streamRecords(records)(...args); }, getSite: () => site });
  assert.match(prompt.system, /header\/footer 320–1000 px/);
  assert.match(prompt.system, /composed page stays within 6000 px/);
  assert.equal(result.site.sharedLayout.header.settings.canvasHeight, 320);
  assert.equal(result.site.sharedLayout.footer.settings.canvasHeight, 320);
  assert.equal(result.site.pages.find(entry => entry.id === 'products').page.settings.canvasHeight, 1480);
  assert.equal(result.site.pages.find(entry => entry.id === 'product-detail').page.settings.canvasHeight, 1080);
  assert.deepEqual(header, originalHeader, 'normalization must not mutate model input');
  assert.deepEqual(footer, originalFooter);
  assert.equal(site.sharedLayout.header, undefined, 'only the completed result is committed');
});

test('AI canvas normalization preserves content space and enforces page and layout limits', () => {
  const { site, plan } = fixture();
  const header = createLayoutDocument('header', site.pages[0].page.settings);
  header.settings.canvasHeight = 160;
  header.settings.padding = 48;
  header.blocks = [{ id: 'title', type: 'text', props: { text: '校名与导航' }, frame: { x: 48, y: 200, width: 480, height: 288 } }];
  const normalized = applySiteOperation(siteFromPlan(site, plan), plan, { v: 1, seq: 1, op: 'siteLayout', region: 'header', page: header });
  assert.equal(normalized.sharedLayout.header.settings.canvasHeight, 536, 'content and bottom padding cannot be clipped by the minimum canvas height');
  assert.equal(header.settings.canvasHeight, 160);

  const tooTall = createLayoutDocument('header', site.pages[0].page.settings);
  tooTall.blocks = [{ id: 'title', type: 'text', props: { text: '过高的页头' }, frame: { x: 0, y: 960, width: 480, height: 80 } }];
  assert.throws(() => parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'siteLayout', region: 'header', page: tooTall })), /共享页头.*1000/);

  const oversized = pageFor(plan.pages[1], { ...site.pages[0].page.settings, canvasHeight: 7000 });
  const clamped = applySiteOperation(siteFromPlan(site, plan), plan, { v: 1, seq: 1, op: 'sitePage', id: 'products', page: oversized });
  assert.equal(clamped.pages.find(entry => entry.id === 'products').page.settings.canvasHeight, 6000);

  const contentOverflow = pageFor(plan.pages[1], { ...site.pages[0].page.settings, padding: 48, canvasHeight: 1080 });
  contentOverflow.blocks = [{ id: 'content', type: 'text', props: { text: '需要拆页的内容' }, frame: { x: 48, y: 5800, width: 600, height: 200 } }];
  assert.throws(() => applySiteOperation(siteFromPlan(site, plan), plan, { v: 1, seq: 1, op: 'sitePage', id: 'products', page: contentOverflow }), /减少区块或拆分为多页/);
  assert.throws(() => parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'sitePage', id: 'products', page: { id: 'products', blocks: [] } })), /page/, 'malformed pages retain a clear validation error');
});
