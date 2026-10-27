import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';
import { mediaReference } from '../shared/media.mjs';
import { applySiteOperation, explainSite, runSiteAi, siteFromPlan, validateSitePlan } from '../src/lib/ai/site-ai.ts';
import { parseAiOperation } from '../src/lib/ai/protocol.ts';
import { defaultAiSettings } from '../src/lib/ai/config.ts';

const profile = { ...defaultAiSettings().profiles.openai, apiKey: 'fixture-only', model: 'fixture-model' };
const stream = records => async function* () { yield { type: 'connected' }; yield { type: 'text', text: records.map((record, index) => JSON.stringify({ ...record, seq: index + 1 })).join('\n') + '\n' }; yield { type: 'complete' }; };
const fields = [{ key: 'title', label: '标题', type: 'text' }, { key: 'cover', label: '封面', type: 'image' }];
function fixture() {
  const reference = mediaReference(crypto.randomUUID()), site = createSiteDocument(createDocument(true));
  site.pages[0].page.blocks = [{ id: 'approved', type: 'image', props: { imageUrl: reference }, frame: { x: 48, y: 48, width: 440, height: 340 } }];
  const existing = { id: 'private', name: '用户已有集合', kind: 'collection', mode: 'collection', fields, records: [{ id: 'secret', values: { title: 'PRIVATE-EXISTING-RECORD', cover: reference } }] };
  const generated = { id: 'articles', name: '示例文章', kind: 'collection', mode: 'collection', fields, records: [{ id: 'example', values: { title: '示例文章，请替换', cover: reference } }], pageSize: 5 };
  const detail = { ...generated, id: 'article', mode: 'single', detailField: 'id', detailParameter: 'id' };
  site.dataSources = [existing];
  const plan = { name: '文章站点', summary: '生成明确标记的示例集合', pages: [{ id: site.homePageId, name: site.pages[0].name, path: '/', kind: 'page', layout: [] }], sharedLayout: [], deletes: [], dataSources: [existing, generated, detail] };
  return { site, plan, existing, generated, detail, reference };
}

test('AI collection protocol retains schema and detail matching but rejects fabricated images', () => {
  const { site, plan, generated, detail } = fixture();
  validateSitePlan(site, plan);
  assert.equal(parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'dataSource', source: generated })).source.kind, 'collection');
  assert.equal(detail.mode, 'single');
  assert.throws(() => validateSitePlan(site, { ...plan, dataSources: [{ ...generated, records: [{ id: 'fake', values: { title: '伪造', cover: mediaReference(crypto.randomUUID()) } }] }] }), /不能新增或伪造媒体素材/);
  assert.throws(() => parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'dataSource', source: { ...generated, headers: { Authorization: 'secret' } } })), /不能配置凭据/);
  assert.match(explainSite({ ...site, dataSources: [generated] }), /内容集合/);
});

test('AI prompts omit existing records and generate only approved example collections through the real protocol', async () => {
  const { site, plan, generated } = fixture();
  let planningPrompt;
  const planning = await runSiteAi({ site, plan: undefined, task: '制作文章站点', provider: 'openai', profile, phase: 'plan', signal: new AbortController().signal, stream: (...args) => { planningPrompt = args[2]; return stream([{ v: 1, seq: 1, op: 'sitePlan', ...plan }])(...args); } });
  assert.equal(planning.site, null);
  assert.doesNotMatch(planningPrompt.context, /PRIVATE-EXISTING-RECORD/);
  assert.match(planningPrompt.system, /kind:"collection"/);
  assert.match(planningPrompt.system, /Missing detail records are errors/);
  const skeleton = siteFromPlan(site, planning.plan);
  const original = JSON.stringify(site);
  let prompt;
  const result = await runSiteAi({ site, plan: planning.plan, draft: skeleton, task: '生成文章集合', provider: 'openai', profile, phase: 'generate', signal: new AbortController().signal, stream: (...args) => { prompt = args[2]; return stream([{ v: 1, seq: 1, op: 'dataSource', source: generated }, { v: 1, seq: 2, op: 'done' }])(...args); }, getSite: () => site });
  assert.doesNotMatch(prompt.context, /PRIVATE-EXISTING-RECORD/);
  const sent = JSON.parse(prompt.context);
  assert.equal(sent.site.dataSources[0].fields.length, 2);
  assert.equal(sent.site.dataSources[0].records, undefined);
  assert.equal(sent.site.dataSources[0].items, undefined);
  assert.equal(result.site.dataSources.find(source => source.id === 'private').records[0].values.title, 'PRIVATE-EXISTING-RECORD');
  assert.match(result.site.dataSources.find(source => source.id === 'articles').records[0].values.title, /示例/);
  assert.equal(JSON.stringify(site), original, 'completion is committed by the caller');
  assert.throws(() => applySiteOperation(skeleton, { ...plan, dataSources: [] }, { v: 1, seq: 1, op: 'dataSource', source: generated }), /未包含在已确认的计划/);
});
