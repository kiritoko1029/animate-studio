import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument } from '../src/model.ts';
import { applyPageTheme, getTheme, pageThemeStyle } from '../src/lib/themes.ts';
import { AiOperationDecoder, applyAiOperation, buildAiContext, parseAiOperation } from '../src/lib/ai/protocol.ts';
import { newAiSession, readAiSessions, saveAiSessions, aiSessionsKey } from '../src/lib/ai/storage.ts';
import { defaultAiSettings, readAiSettings, saveAiSettings, aiSettingsKey } from '../src/lib/ai/config.ts';
import { validatePage } from '../server/validation.mjs';

const add = (seq = 1) => ({ v: 1, seq, op: 'add', id: 'hero-test', type: 'heading', props: { title: '标题 🌈' }, frame: { x: 32, y: 32, width: 400, height: 160 }, summary: '新增标题' });
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

test('AI uses the saved JSON shape when editor actions clear optional theme and component properties', () => {
  const page = createDocument(true);
  page.settings.customThemes = undefined;
  page.settings.theme = undefined;
  const result = applyAiOperation(page, add()).page;
  assert.doesNotThrow(() => validatePage(result));
  assert.equal(Object.hasOwn(result.settings, 'customThemes'), false);
  assert.equal(Object.hasOwn(page.settings, 'customThemes'), true, 'normalization must not mutate the editor or undo history');
  result.blocks[0].props = { ...result.blocks[0].props, theme: undefined, accent: undefined, background: undefined, color: undefined, radius: undefined };
  result.blocks[0].bindings = undefined;
  const updated = applyAiOperation(result, { v: 1, seq: 1, op: 'update', id: 'hero-test', props: { title: 'After manual edit' } }).page;
  assert.doesNotThrow(() => validatePage(updated));
  assert.equal(updated.blocks[0].props.title, 'After manual edit');
  assert.equal(Object.hasOwn(updated.blocks[0].props, 'theme'), false);
  assert.throws(() => applyAiOperation(updated, { v: 1, seq: 1, op: 'page', settings: { customThemes: null } }), /customThemes.*数组/);
  assert.throws(() => applyAiOperation(updated, { v: 1, seq: 1, op: 'page', settings: { customThemes: Array(31).fill({}) } }), /最多保存 30/);
});

test('NDJSON releases one complete component at a time and handles Unicode, split lines and duplicate retransmission', () => {
  const decoder = new AiOperationDecoder(), line = JSON.stringify(add());
  assert.deepEqual([...decoder.push(line.slice(0, 15))], []);
  assert.deepEqual([...decoder.push(line.slice(15))], []);
  assert.deepEqual([...decoder.push('\r\n')], [add()]);
  assert.deepEqual([...decoder.push(line + '\n')], []);
  assert.deepEqual([...decoder.push('{"v":1,"seq":2,"op":"done","summary":"完成"}')], []);
  assert.equal([...decoder.finish()][0].op, 'done');
});

test('a malformed later record does not prevent earlier valid records in the same chunk from being committed', () => {
  const decoder = new AiOperationDecoder(), operations = [];
  assert.throws(() => { for (const op of decoder.push(JSON.stringify(add()) + '\n{"v":1,"seq":2\n')) operations.push(op); }, /JSON/);
  assert.equal(operations.length, 1);
});

test('sequence gaps, conflicting duplicates, unsafe keys and unfinished final records are rejected', () => {
  assert.throws(() => [...new AiOperationDecoder().push(JSON.stringify(add(2)) + '\n')], /顺序/);
  const decoder = new AiOperationDecoder(); [...decoder.push(JSON.stringify(add()) + '\n')];
  assert.throws(() => [...decoder.push(JSON.stringify({ ...add(), summary: 'changed' }) + '\n')], /重复序号/);
  assert.throws(() => parseAiOperation('{"v":1,"seq":1,"op":"page","settings":{"__proto__":{"polluted":true}}}'), /不允许/);
  const partial = new AiOperationDecoder(); [...partial.push('{"v":1')]; assert.throws(() => [...partial.finish()], /JSON/);
  const truncated = new AiOperationDecoder(); [...truncated.push(JSON.stringify(add()) + '\n')]; assert.throws(() => [...truncated.finish()], /尚未完成/);
});

test('operations preserve existing components and use strict page validation before applying changes', () => {
  const original = createDocument(true), before = JSON.stringify(original);
  const { page, change } = applyAiOperation(original, add());
  assert.equal(JSON.stringify(original), before);
  assert.equal(change.kind, 'add'); assert.equal(page.blocks[0].props.title, '标题 🌈');
  const updated = applyAiOperation(page, { v: 1, seq: 2, op: 'update', id: 'hero-test', props: { color: '#123456' }, summary: '调整颜色' }).page;
  assert.equal(updated.blocks[0].props.title, '标题 🌈'); assert.deepEqual(updated.blocks[0].frame, page.blocks[0].frame);
  assert.throws(() => applyAiOperation(page, add()), /重复添加/);
  // Invalid or unsafe props are dropped on their own; the rest of the record still applies.
  const lenient = applyAiOperation(page, { v: 1, seq: 2, op: 'update', id: 'hero-test', props: { unknown: true, url: 'javascript:alert(1)', title: 'Kept' } }).page.blocks[0];
  assert.equal(lenient.props.title, 'Kept'); assert.equal(Object.hasOwn(lenient.props, 'unknown'), false); assert.equal(lenient.props.url, undefined);
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 2, op: 'update', id: 'hero-test', props: { title: 'x' }, events: { click: [{ type: 'unknown' }] } }), /./, 'invalid structure outside props still fails');
  assert.deepEqual(applyAiOperation(page, { ...add(2), id: 'outside', frame: { x: 1800, y: 32, width: 400, height: 100 } }).page.blocks[1].frame, { x: 1520, y: 32, width: 400, height: 100 });
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 2, op: 'page', settings: { maxWidth: 320 } }), /边界/);
  assert.equal(applyAiOperation(page, { v: 1, seq: 2, op: 'remove', id: 'hero-test' }).page.blocks.length, 0);
});

test('AI page theme changes match workbench appearance and preserve explicit colors and independent block themes', () => {
  const page = applyAiOperation(createDocument(true), add()).page;
  page.blocks.push({ ...createBlock('card'), id: 'independent', props: { theme: 'warm-editorial', background: '#eeddaa', title: 'Keep my theme' } });
  const before = JSON.stringify(page);
  const result = applyAiOperation(page, { v: 1, seq: 1, op: 'page', settings: { theme: 'midnight' } });
  assert.deepEqual(result.page, applyPageTheme(page, 'midnight'));
  assert.equal(pageThemeStyle(result.page.settings).background, '#0d1626');
  assert.equal(result.page.settings.accent, '#64dcf4');
  assert.deepEqual(result.page.blocks[1], page.blocks[1]);
  assert.equal(JSON.stringify(page), before);
  const overridden = applyAiOperation(page, { v: 1, seq: 1, op: 'page', settings: { theme: 'midnight', background: '#112233', accent: '#ffaa44' } }).page;
  assert.equal(overridden.settings.background, '#112233'); assert.equal(overridden.settings.accent, '#ffaa44');
  const custom = { ...getTheme('midnight'), id: 'custom-night', name: '自定义夜色', canvas: '#123456' };
  const customResult = applyAiOperation(page, { v: 1, seq: 1, op: 'page', settings: { customThemes: [custom], theme: custom.id } }).page;
  assert.equal(customResult.settings.background, custom.canvas);
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 1, op: 'page', settings: { theme: 'unknown-theme' } }), /主题无效/);
});

test('invalid fields are removed without breaking jointly valid changes and the repair is observable', () => {
  const page = applyAiOperation(createDocument(true), { ...add(), id: 'progress', type: 'progress', props: { value: 80, max: 100 } }).page;
  const result = applyAiOperation(page, { v: 1, seq: 1, op: 'update', id: 'progress', props: { value: 40, max: 50, bogus: true, url: 'javascript:alert(1)' }, summary: '调整进度' });
  assert.deepEqual([result.page.blocks[0].props.value, result.page.blocks[0].props.max], [40, 50]);
  assert.equal(Object.hasOwn(result.page.blocks[0].props, 'bogus'), false);
  assert.equal(Object.hasOwn(result.page.blocks[0].props, 'url'), false);
  assert.equal(result.change.summary, '调整进度');
  assert.ok(result.warnings.some(warning => warning.includes('bogus') && warning.includes('url')));
  assert.doesNotThrow(() => validatePage(result.page));
  assert.deepEqual([page.blocks[0].props.value, page.blocks[0].props.max], [80, 100], 'the existing document remains unchanged');
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 1, op: 'update', id: 'progress', props: { max: 50, bogus: true } }), /当前值不能大于最大值/, 'a joint constraint cannot be repaired by guessing which valid field to discard');
  const noChange = applyAiOperation(page, { v: 1, seq: 1, op: 'update', id: 'progress', props: { bogus: true }, summary: 'Not actually changed' });
  assert.equal(noChange.change, null, 'discarding every requested field is not a successful page edit');
  assert.deepEqual(noChange.page, page); assert.ok(noChange.warnings[0].includes('bogus'));
});

test('browser configuration stays separate from owner-scoped checkpoints and interrupted sessions restore as paused', () => {
  const storage = memory(), settings = defaultAiSettings(); settings.profiles.openai.apiKey = 'test-only-secret';
  saveAiSettings(settings, storage); assert.equal(readAiSettings(storage).profiles.openai.apiKey, 'test-only-secret');
  const session = { ...newAiSession(createDocument(true)), status: 'running', task: 'Make a page', credentials: settings };
  saveAiSessions('account:one', [session], storage);
  assert.equal(readAiSessions('account:one', storage)[0].status, 'paused'); assert.deepEqual(readAiSessions('account:two', storage), []);
  assert.ok(!storage.getItem(aiSessionsKey('account:one')).includes('test-only-secret'));
  assert.notEqual(aiSettingsKey, aiSessionsKey('account:one'));
  assert.throws(() => saveAiSessions('guest', [session], { setItem() { throw new Error('quota'); } }), /浏览器无法保存/);
  assert.throws(() => readAiSessions('guest', { getItem: () => '{bad json' }));
});

test('resumption context contains latest state, a bounded conversation and completed changes without API secrets', () => {
  const page = applyAiOperation(createDocument(true), add()).page;
  const session = newAiSession(page); session.task = 'Finish the landing page'; session.summary = 'Hero complete'; session.error = 'Interrupted';
  session.messages = Array.from({ length: 30 }, (_, i) => ({ id: String(i), role: 'user', text: `task ${i}`, time: i }));
  session.receipts = [{ runId: 'old', seq: 1, op: 'add', blockId: 'hero-test', summary: 'Added hero' }];
  const { context, estimatedTokens } = buildAiContext(page, session, 'en', true), parsed = JSON.parse(context);
  assert.equal(parsed.resume, true); assert.equal(parsed.recentConversation.length, 10);
  assert.equal(parsed.page.blocks[0].props.title, '标题 🌈'); assert.equal(parsed.completedOperations[0].blockId, 'hero-test');
  assert.equal(parsed.lastError, 'Interrupted'); assert.ok(estimatedTokens > 0); assert.ok(!context.includes('apiKey'));
});

test('selection context keeps only unique current-page IDs and remains optional for continuation callers', () => {
  const page = applyAiOperation(createDocument(true), add()).page, session = newAiSession(page);
  const { context } = buildAiContext(page, session, 'zh-CN', false, ['hero-test', 'deleted', 'hero-test']);
  assert.deepEqual(JSON.parse(context).selectedBlockIds, ['hero-test']);
  assert.deepEqual(JSON.parse(buildAiContext(page, session, 'zh-CN', true).context).selectedBlockIds, []);
});

const customDefinition = () => ({ name: '交互卡片', html: '<button data-prop="label"></button>', css: 'button { color: var(--as-text); }', js: 'document.querySelector("button").addEventListener("click",()=>component.log("clicked"));', fields: { label: '查看详情' }, size: { width: 360, height: 220 } });
const component = (id = 'custom-card', definition = customDefinition()) => ({ v: 1, seq: 1, op: 'component', id, component: definition, summary: '创建组件' });

test('explicit component operations create and refine complete reusable snapshots without losing instance fields', () => {
  const empty = createDocument(true); empty.settings.padding = 24;
  const created = applyAiOperation(empty, component());
  assert.equal(empty.blocks.length, 0);
  assert.equal(created.change.kind, 'add'); assert.equal(created.page.blocks[0].type, 'custom');
  assert.deepEqual(created.page.blocks[0].frame, { x: 24, y: 24, width: 360, height: 220 });
  assert.equal(created.page.blocks[0].props.label, '查看详情');
  assert.deepEqual(created.page.blocks[0].props.custom, customDefinition());
  const block = created.page.blocks[0];
  block.props.label = '用户的按钮文案'; block.props.accent = '#123456';
  block.props.custom.source = { kind: 'local', id: 'saved-component', revision: 2 };
  const revised = applyAiOperation(created.page, { ...component(), component: { ...customDefinition(), css: 'button { color: red; }', fields: { label: '模型的新默认值', title: '标题' } }, frame: { x: 80 } });
  assert.equal(revised.change.kind, 'update'); assert.equal(revised.page.blocks.length, 1);
  assert.equal(revised.page.blocks[0].props.label, '用户的按钮文案'); assert.equal(revised.page.blocks[0].props.title, '标题');
  assert.equal(revised.page.blocks[0].props.accent, '#123456');
  assert.deepEqual(revised.page.blocks[0].props.custom.source, block.props.custom.source);
  assert.deepEqual(revised.page.blocks[0].frame, { x: 80, y: 24, width: 360, height: 220 });
  assert.doesNotThrow(() => validatePage(revised.page));
});

test('custom source is strict, cannot forge library metadata, and cannot replace builtin blocks', () => {
  const empty = createDocument(true);
  for (const definition of [
    { ...customDefinition(), js: null },
    { ...customDefinition(), source: { kind: 'cloud', id: 'forged', revision: 1 } },
    { ...customDefinition(), fields: { count: '1' } },
    { ...customDefinition(), unknown: true },
  ]) assert.throws(() => applyAiOperation(empty, component('bad', definition)));
  assert.throws(() => applyAiOperation(empty, { ...component(), frame: { x: 24 } }), /完整/);
  assert.throws(() => applyAiOperation(empty, { ...component(), frame: { x: 24, y: 24, width: 360, height: 220, extra: 1 } }), /不支持/);
  const page = applyAiOperation(empty, add()).page;
  assert.throws(() => applyAiOperation(page, component('hero-test')), /内置组件/);
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 1, op: 'update', id: 'hero-test', props: { custom: customDefinition() } }), /component 操作/);
});

test('component references require a resolved matching library snapshot and never trust model revisions', () => {
  const op = { v: 1, seq: 1, op: 'component', id: 'reused', componentRef: { kind: 'cloud', id: 'owned' } };
  const empty = createDocument(true), snapshot = { ...customDefinition(), source: { kind: 'cloud', id: 'owned', revision: 3 } };
  assert.throws(() => applyAiOperation(empty, op), /先读取/);
  assert.throws(() => applyAiOperation(empty, op, { ...snapshot, source: { kind: 'cloud', id: 'other', revision: 3 } }), /来源/);
  assert.throws(() => applyAiOperation(empty, { ...op, component: customDefinition() }, snapshot), /不能同时/);
  assert.throws(() => applyAiOperation(empty, { ...op, componentRef: { ...op.componentRef, revision: 100 } }, snapshot), /引用无效/);
  const created = applyAiOperation(empty, op, snapshot).page;
  assert.deepEqual(created.blocks[0].props.custom, snapshot);
  assert.equal(created.blocks[0].props.custom.source.revision, 3);
});

test('component context includes current source for refinement and bounded metadata for library reuse', () => {
  const page = applyAiOperation(createDocument(true), component()).page;
  const metadata = { ref: { kind: 'local', id: 'from-library', hidden: 'private' }, name: '库组件', description: '可以复用', fields: { label: '操作' }, size: { width: 240, height: 160 }, js: 'do not leak unrelated source', apiKey: 'never include' };
  const context = JSON.parse(buildAiContext(page, newAiSession(page, 'component'), 'zh-CN', false, ['custom-card'], { mode: 'component', components: [metadata] }).context);
  assert.equal(context.mode, 'component');
  assert.equal(context.page.blocks[0].props.custom.js, customDefinition().js);
  assert.deepEqual(context.availableComponents, [{ ref: { kind: 'local', id: 'from-library' }, name: '库组件', description: '可以复用', fields: { label: '操作' }, size: { width: 240, height: 160 } }]);
  assert.equal(JSON.stringify(context).includes('never include'), false);
  assert.equal(JSON.stringify(context).includes('do not leak unrelated source'), false);
});

const ask = (seq = 1, questions = [{ id: 'style', title: '视觉风格', options: ['极简留白', '科技深色'] }, { id: 'sections', title: '页面区块', options: ['功能', '价格', '问答'], multiple: true }]) => ({ v: 1, seq, op: 'ask', text: '开始前确认两个细节：', questions });

test('ask is a terminal record with validated choices that never changes the page', () => {
  const decoder = new AiOperationDecoder();
  const [message, question] = [...decoder.push(JSON.stringify({ v: 1, seq: 1, op: 'message', text: '先确认方向。' }) + '\n' + JSON.stringify(ask(2)) + '\n')];
  assert.equal(message.op, 'message'); assert.equal(question.op, 'ask'); assert.equal(decoder.terminal, 'ask');
  assert.deepEqual([...decoder.finish()], [], 'an ask ends the response without requiring done');
  assert.throws(() => [...decoder.push(JSON.stringify(add(3)) + '\n')], /顺序/, 'nothing may follow the terminal record');
  const page = createDocument(true), result = applyAiOperation(page, ask());
  assert.equal(result.change, null); assert.equal(JSON.stringify(result.page), JSON.stringify(page));
  for (const questions of [[], Array(5).fill({ id: 'a', title: 'T', options: ['x', 'y'] }), [{ id: 'a', title: 'T', options: ['only'] }], [{ id: 'a', title: 'T', options: ['x', 'x'] }],
    [{ id: 'a', title: 'T', options: ['x', 1] }], [{ id: 'a', title: 'T', options: ['x', 'y'], extra: true }], [{ id: 'bad id', title: 'T', options: ['x', 'y'] }],
    [{ id: 'a', title: 'T', options: ['x', 'y'] }, { id: 'a', title: 'U', options: ['x', 'y'] }], [{ id: 'a', title: 'T', options: ['x', 'y'], multiple: 'yes' }]]) {
    assert.throws(() => parseAiOperation(JSON.stringify(ask(1, questions))), /提问/);
  }
  assert.throws(() => parseAiOperation(JSON.stringify({ ...ask(), props: {} })), /不支持的字段/);
  const decoderDone = new AiOperationDecoder(); [...decoderDone.push('{"v":1,"seq":1,"op":"done","summary":"完成"}\n')];
  assert.equal(decoderDone.terminal, 'done');
});

test('questions reach the next request as conversation and the system prompt explains when to ask and how canvases scale', () => {
  const session = newAiSession(createDocument(true)); session.task = '做一个产品页';
  session.messages = [{ id: 'q', role: 'assistant', text: '开始前确认：', questions: ask().questions, time: 1 }, { id: 'a', role: 'user', text: '视觉风格：极简留白', time: 2 }];
  const { system, context } = buildAiContext(session.page, session, 'zh-CN', false), parsed = JSON.parse(context);
  assert.deepEqual(parsed.recentConversation[0].questions, ask().questions);
  assert.equal(parsed.recentConversation[1].questions, undefined);
  assert.match(system, /"op":"ask"/); assert.match(system, /exactly one terminal record/); assert.match(system, /mobile 390/);
});

test('sessions keep restorable versions, questions and the waiting state, and storage pressure trims old versions before checkpoints', () => {
  const storage = memory(), page = applyAiOperation(createDocument(true), add()).page;
  const version = (id, time, source = page) => ({ id, runId: id, kind: 'after', time, label: 'Generated', page: source });
  const current = { ...newAiSession(page), status: 'waiting', messages: [{ id: 'q', role: 'assistant', text: '', questions: ask().questions, time: 1 }], versions: [version('current-old', 1), version('current-new', 5)] };
  const other = { ...newAiSession({ ...createDocument(true), name: 'Other' }), versions: [version('other-old', 2), version('other-new', 3)] };
  saveAiSessions('guest', [current, other], storage);
  const [restored] = readAiSessions('guest', storage);
  assert.equal(restored.status, 'waiting'); assert.deepEqual(restored.messages[0].questions, ask().questions);
  assert.deepEqual(restored.versions.map(value => value.id), ['current-old', 'current-new']);
  const legacy = memory(); legacy.setItem(aiSessionsKey('guest'), JSON.stringify([{ ...newAiSession(page), versions: undefined }]));
  assert.deepEqual(readAiSessions('guest', legacy)[0].versions, [], 'records saved before versions existed stay readable');
  const tampered = memory(); tampered.setItem(aiSessionsKey('guest'), JSON.stringify([{ ...current, versions: [{ ...version('x', 1), page: { ...page, blocks: [{ id: 'bad' }] } }] }]));
  assert.deepEqual(readAiSessions('guest', tampered), []);
  const badQuestion = memory(); badQuestion.setItem(aiSessionsKey('guest'), JSON.stringify([{ ...current, messages: [{ id: 'q', role: 'assistant', text: '', questions: [{ id: 'a', title: 'T', options: ['one'] }], time: 1 }] }]));
  assert.deepEqual(readAiSessions('guest', badQuestion), []);
  // A quota that only fits two snapshots drops the other page's versions first, then the oldest of the page being saved.
  let writes = 0;
  const limited = { setItem(_key, value) { writes++; if ((value.match(/"kind":"after"/g) ?? []).length > 2) throw new Error('quota'); } };
  const saved = saveAiSessions('guest', [current, other], limited);
  assert.deepEqual(saved.flatMap(session => session.versions.map(value => value.id)), ['current-old', 'current-new']);
  assert.ok(writes <= 4, 'trimming removes snapshots in batches');
  const tight = { setItem(_key, value) { if (value.includes('"kind"')) throw new Error('quota'); } };
  assert.deepEqual(saveAiSessions('guest', [current, other], tight).flatMap(session => session.versions), [], 'versions are expendable');
  assert.throws(() => saveAiSessions('guest', [current], { setItem() { throw new Error('quota'); } }), /浏览器无法保存/);
});

test('version snapshots skip pages that are already saved and keep a bounded history', async () => {
  const { withAiVersion, aiMaxVersions } = await import('../src/lib/ai/storage.ts');
  const page = applyAiOperation(createDocument(true), add()).page;
  let session = withAiVersion(newAiSession(page), { runId: 'one', kind: 'after', time: 1, label: 'x'.repeat(400), page });
  assert.equal(session.versions.length, 1); assert.equal(session.versions[0].id, 'one:after'); assert.equal(session.versions[0].label.length, 300);
  assert.equal(withAiVersion(session, { runId: 'two', kind: 'before', time: 2, label: 'Same page', page: structuredClone(page) }), session);
  for (let i = 0; i < aiMaxVersions + 3; i++) session = withAiVersion(session, { runId: `r${i}`, kind: 'after', time: 10 + i, label: '', page: { ...page, name: `Page ${i}` } });
  assert.equal(session.versions.length, aiMaxVersions); assert.equal(session.versions.at(-1).page.name, `Page ${aiMaxVersions + 2}`);
});

test('near misses are repaired instead of costing a new request: numbers, alpha colors, button fills, margins and canvas height', () => {
  const page = createDocument(true); page.settings.padding = 24; page.settings.maxWidth = 1440; page.settings.canvasHeight = 1080;
  const { page: added, change, warnings } = applyAiOperation(page, { v: 1, seq: 1, op: 'add', id: 'cta', type: 'button', props: { label: '开始', fontSize: 120, radius: 999, contentScale: 132.6, background: '#111111cc', color: '#FFFF' }, frame: { x: 0, y: 1200, width: 1600, height: 80 }, summary: '新增按钮' });
  const block = added.blocks[0];
  assert.deepEqual([block.props.fontSize, block.props.radius, block.props.contentScale], [96, 80, 133]);
  assert.equal(block.props.accent, '#111111', 'a button background becomes its fill'); assert.equal(block.props.background, undefined);
  assert.equal(block.props.color, '#FFF');
  assert.deepEqual(block.frame, { x: 24, y: 1200, width: 1392, height: 80 }); assert.deepEqual(change.frame, block.frame);
  assert.equal(added.settings.canvasHeight, 1304, 'the canvas grows below a block instead of failing');
  assert.ok(warnings.some(warning => warning.includes('fontSize') && warning.includes('accent')));
  assert.ok(warnings.some(warning => warning.includes('位置或尺寸')));
  assert.ok(warnings.some(warning => warning.includes('加高画布')));
  const kept = applyAiOperation(added, { v: 1, seq: 2, op: 'add', id: 'cta-2', type: 'button', props: { label: 'B', background: '#222222', accent: '#00aa66' }, frame: { x: 24, y: 24, width: 200, height: 80 } }).page.blocks[1];
  assert.equal(kept.props.accent, '#00aa66'); assert.equal(kept.props.background, undefined);
  const card = applyAiOperation(added, { v: 1, seq: 2, op: 'add', id: 'card', type: 'card', props: { background: '#f5f5f5' }, frame: { x: 24, y: 24, width: 400, height: 260 } }).page.blocks[1];
  assert.equal(card.props.background, '#f5f5f5', 'panels keep their background');
  const painted = { ...added, blocks: [{ ...added.blocks[0], props: { ...added.blocks[0].props, background: '#111111' } }] };
  const cleared = applyAiOperation(painted, { v: 1, seq: 2, op: 'update', id: 'cta', props: { background: null, accent: '#3f8f66' } }).page.blocks[0];
  assert.equal(Object.hasOwn(cleared.props, 'background'), false, 'null clears a prop the model cannot otherwise remove'); assert.equal(cleared.props.accent, '#3f8f66');
  const shrunk = applyAiOperation(added, { v: 1, seq: 2, op: 'page', settings: { canvasHeight: 600 } }).page;
  assert.equal(shrunk.settings.canvasHeight, 1304, 'the canvas never shrinks below existing blocks');
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 1, op: 'add', id: 'deep', type: 'text', frame: { x: 24, y: 5990, width: 300, height: 100 } }), /边界/);
});

test('fences and stray sentences around records are skipped, malformed records are not', () => {
  const decoder = new AiOperationDecoder();
  const ops = [...decoder.push('```ndjson\nHere is the page:\n' + JSON.stringify(add()) + '\n```\n')];
  assert.deepEqual(ops, [add()]);
  assert.throws(() => [...decoder.push('{"v":1,"seq":2,"op":\n')], /JSON/);
});

test('the system prompt explains each component, its natural size and how styling props paint', async () => {
  const { aiSystemPrompt } = await import('../src/lib/ai/protocol.ts');
  const { catalog, frameSizes } = await import('../src/model.ts');
  for (const item of catalog) assert.ok(aiSystemPrompt.includes(`\n${item.type} ${frameSizes[item.type].width}x${frameSizes[item.type].height}: `), item.type);
  assert.match(aiSystemPrompt, /background paints the block's WHOLE frame/); assert.match(aiSystemPrompt, /130-180 at 1920 wide/);
  // New pages are 1080p in the editor; the model keeps that preset unless the user asks otherwise.
  assert.match(aiSystemPrompt, /1080p preset \(maxWidth 1920, canvasHeight 1080\)/); assert.match(aiSystemPrompt, /keep the current maxWidth and canvasHeight/);
  const example = JSON.parse(aiSystemPrompt.split('\n').find(line => line.includes('"op":"page"')));
  assert.equal(example.settings.maxWidth, undefined, 'the example does not teach resizing the canvas'); assert.equal(example.settings.canvasHeight, undefined);
  assert.match(aiSystemPrompt, /button 240x100: .*fill=accent/); assert.doesNotMatch(aiSystemPrompt, /官方属性/, 'editor-only hints stay out of the prompt');
});
