import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiOperation, applyAiOperation } from '../src/lib/ai/protocol.ts';
import { applySiteOperation, finishSite, runSiteAi, siteFromPlan, siteSummary, explainSite } from '../src/lib/ai/site-ai.ts';
import { createSiteDocument, createSitePage, createLayoutDocument } from '../shared/site-document.mjs';
import { createBlock, createDocument } from '../src/model.ts';
import { validateSite } from '../server/validation.mjs';

const record = (v, seq, op, extra) => JSON.stringify({ v, seq, op, ...extra });
function plan(site) {
  return { name: '图书工作台', summary: '后台导航、列表和详情', pages: [
    { id: site.homePageId, name: '工作台', path: '/', kind: 'page', layout: ['sidebar'] },
    { id: 'books', name: '馆藏管理', path: '/books', kind: 'page', layout: ['sidebar'] },
    { id: 'book-detail', name: '图书详情', path: '/books/:id', kind: 'detail', layout: ['sidebar'] },
  ], sharedLayout: ['sidebar'], deletes: [], dataSources: [{ id: 'books', name: '公开图书', kind: 'rest', mode: 'collection', url: 'https://api.example.com/books', method: 'GET', transport: 'direct' }] };
}
function booksPage() {
  const page = createDocument(true); page.id = 'books'; page.name = '馆藏管理';
  const block = createBlock('repeater'); block.frame = { x: 48, y: 48, width: 600, height: 820 }; block.props.dataFields.description.text = 'author'; page.blocks = [block]; return page;
}

test('AI accepts public read sources but never secrets, proxy configuration or writes', () => {
  const source = { id: 'books', name: '公开图书', kind: 'rest', mode: 'collection', url: 'https://api.example.com/books', method: 'GET', transport: 'direct' };
  assert.equal(parseAiOperation(record(1, 1, 'dataSource', { source })).source.id, 'books');
  for (const patch of [{ method: 'POST', body: { title: '{{form.title}}' } }, { credentialId: 'private' }, { transport: 'proxy' }, { headers: { Authorization: 'secret' } }]) {
    assert.throws(() => parseAiOperation(record(1, 1, 'dataSource', { source: { ...source, ...patch } })), /公开|凭据|写入/);
  }
  assert.throws(() => applyAiOperation(createDocument(true), { v: 1, seq: 1, op: 'dataSource', source }), /整站任务/);
  assert.throws(() => parseAiOperation(record(1, 1, 'sitePlan', { name: '后台', pages: [{ id: 'home', name: '首页', path: '/', kind: 'page', layout: [] }], sharedLayout: [], deletes: [], dataSources: [{ ...source, method: 'POST', body: {} }] })), /公开|写入/);
  const site = createSiteDocument(createDocument(true));
  site.dataSources = [{ ...source, credentialId: 'credential-private-id', transport: 'proxy' }];
  assert.ok(!JSON.stringify(siteSummary(site)).includes('credential-private-id'));
});

test('site AI creates a sidebar, public list and source atomically with deterministic output', async () => {
  const original = createSiteDocument(createDocument(true)), approved = plan(original);
  const draft = siteFromPlan(original, approved);
  const layout = createLayoutDocument('sidebar', original.pages[0].page.settings);
  const menu = createBlock('sidebar'); menu.props.navigation = 'site'; menu.frame = { x: 0, y: 0, width: 320, height: 820 }; layout.blocks = [menu];
  const withLayout = applySiteOperation(draft, approved, { v: 1, seq: 1, op: 'siteLayout', region: 'sidebar', page: layout });
  const withPage = applySiteOperation(withLayout, approved, { v: 1, seq: 2, op: 'sitePage', id: 'books', page: booksPage() });
  const withSource = applySiteOperation(withPage, approved, { v: 1, seq: 3, op: 'dataSource', source: approved.dataSources[0] });
  const finished = finishSite(withSource, approved);
  validateSite(finished);
  assert.equal(finished.sharedLayout.sidebar.blocks[0].props.navigation, 'site');
  assert.equal(finished.dataSources.length, 1);
  assert.equal(finished.pages.find(page => page.id === 'books').page.blocks[0].type, 'repeater');
  assert.equal(original.sharedLayout.sidebar, undefined, 'the original site is not modified');
  assert.throws(() => applySiteOperation(withPage, approved, { v: 1, seq: 4, op: 'dataSource', source: { ...approved.dataSources[0], id: 'unplanned' } }), /计划/);

  const calls = [], previews = [];
  const planResult = await runSiteAi({ site: original, task: '创建图书后台', phase: 'plan', provider: 'openai', profile: { baseUrl: 'https://ai.invalid', apiKey: 'not-a-real-key', model: 'deterministic', effort: 'low', maxOutputTokens: 1000, thinking: 'off', thinkingBudget: 0 }, signal: new AbortController().signal, stream: async function* () { calls.push('plan'); yield { type: 'text', text: record(1, 1, 'sitePlan', approved) + '\n' }; yield { type: 'complete' }; } });
  const result = await runSiteAi({ site: original, task: '创建图书后台', phase: 'generate', plan: planResult.plan, provider: 'openai', profile: { baseUrl: 'https://ai.invalid', apiKey: 'not-a-real-key', model: 'deterministic', effort: 'low', maxOutputTokens: 1000, thinking: 'off', thinkingBudget: 0 }, signal: new AbortController().signal, getSite: () => original, onDraft: site => previews.push(site), stream: async function* () {
    calls.push('generate');
    yield { type: 'text', text: [record(1, 1, 'siteLayout', { region: 'sidebar', page: layout }), record(1, 2, 'sitePage', { id: 'books', page: booksPage() }), record(1, 3, 'dataSource', { source: approved.dataSources[0] }), record(1, 4, 'done', { summary: '后台已生成；请在数据源中测试公开接口，发布前确认内容。' })].join('\n') + '\n' };
    yield { type: 'complete' };
  } });
  assert.equal(result.site.pages.length, 3); assert.equal(result.site.dataSources[0].method, 'GET');
  assert.ok(previews.length >= 3); assert.deepEqual(calls, ['plan', 'generate']);
  assert.match(explainSite(result.site), /侧栏/);
  assert.match(explainSite(result.site), /数据源/);
});

test('generation context removes credential references, request headers, queries and static values', async () => {
  const original = createSiteDocument(createDocument(true));
  original.dataSources = [{ id: 'privateBooks', name: '图书', kind: 'rest', mode: 'collection', url: 'https://api.example.com/books?filter=design', method: 'GET', transport: 'proxy', credentialId: 'credential-private-id', headers: { 'X-Private': 'not-for-model' }, query: { filter: 'design' } }];
  const approved = { name: original.name, summary: '保留配置', pages: [{ id: original.homePageId, name: original.pages[0].name, path: '/', kind: 'page', layout: [] }], sharedLayout: [], deletes: [] };
  let context;
  const result = await runSiteAi({ site: original, phase: 'generate', plan: approved, task: '保留现有数据源', provider: 'openai', profile: { baseUrl: 'https://ai.invalid', apiKey: 'not-a-real-key', model: 'deterministic', effort: 'low', maxOutputTokens: 1000, thinking: 'off', thinkingBudget: 0 }, signal: new AbortController().signal, stream: async function* (_provider, _profile, request) {
    context = request.context;
    yield { type: 'text', text: record(1, 1, 'sitePage', { id: original.homePageId, page: original.pages[0].page }) + '\n' + record(1, 2, 'done', { summary: '保留原配置' }) + '\n' };
    yield { type: 'complete' };
  } });
  assert.ok(!context.includes('not-for-model'));
  assert.ok(!context.includes('credential-private-id'));
  assert.ok(!context.includes('filter=design'));
  assert.ok(!context.includes('X-Private'));
  assert.equal(result.site.dataSources[0].credentialId, 'credential-private-id', 'only the AI context is sanitized');
});

test('site AI creates a validated chart dashboard using the planned source and preserves mappings', async () => {
  const original = createSiteDocument(createDocument(true)), approved = plan(original);
  const dashboard = createDocument(true); dashboard.id = 'books'; dashboard.name = '馆藏管理';
  const chart = createBlock('chart');
  chart.props = { ...chart.props, sourceId: 'books', categoryField: 'genre', chartType: 'column', filterField: 'genre', filterVariable: 'genreFilter', dataColumns: [{ key: 'count', label: '图书数量', path: 'id', aggregate: 'count' }] };
  chart.frame = { x: 48, y: 48, width: 720, height: 440 };
  dashboard.blocks = [chart];
  dashboard.variables = [{ name: 'genreFilter', type: 'string', initial: '', persistent: false }];
  const layout = createLayoutDocument('sidebar', original.pages[0].page.settings);
  const previews = [];
  const result = await runSiteAi({ site: original, phase: 'generate', plan: approved, task: '把图书数据做成看板', provider: 'openai', profile: { baseUrl: 'https://ai.invalid', apiKey: 'not-a-real-key', model: 'deterministic', effort: 'low', maxOutputTokens: 1200, thinking: 'off', thinkingBudget: 0 }, signal: new AbortController().signal, getSite: () => original, onDraft: site => previews.push(site), stream: async function* () {
    yield { type: 'text', text: [record(1, 1, 'siteLayout', { region: 'sidebar', page: layout }), record(1, 2, 'sitePage', { id: 'books', page: dashboard }), record(1, 3, 'dataSource', { source: approved.dataSources[0] }), record(1, 4, 'done', { summary: '已生成使用当前页数据的看板，请连接公开接口后核对字段。' })].join('\n') + '\n' };
    yield { type: 'complete' };
  } });
  const generated = result.site.pages.find(page => page.id === 'books').page.blocks.find(block => block.type === 'chart');
  assert.equal(generated.props.sourceId, result.site.dataSources[0].id);
  assert.equal(generated.props.categoryField, 'genre');
  assert.equal(generated.props.filterVariable, 'genreFilter');
  assert.equal(generated.props.chartType, 'column');
  assert.deepEqual(generated.props.dataColumns, [{ key: 'count', label: '图书数量', path: 'id', aggregate: 'count' }]);
  assert.equal(result.site.pages[0].page.blocks.some(block => block.type === 'chart'), false, 'unrelated pages are unchanged');
  assert.ok(previews.length >= 3);
  validateSite(result.site);
  const changed = { ...generated, props: { ...generated.props, chartType: 'pie' } };
  assert.deepEqual(changed.props.dataColumns, generated.props.dataColumns, 'switching type does not remap fields');
});
