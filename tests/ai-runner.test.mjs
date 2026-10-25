import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/model.ts';
import { AiRunner, aiMaxRequests } from '../src/lib/ai/runner.ts';
import { AiContinuationError, AiOutputLimitError } from '../src/lib/ai/errors.ts';
import { streamAi } from '../src/lib/ai/client.ts';
import { applyAiOperation } from '../src/lib/ai/protocol.ts';
import { newAiSession, readAiSessions, saveAiSessions } from '../src/lib/ai/storage.ts';
import { defaultAiSettings } from '../src/lib/ai/config.ts';

const profile = { ...defaultAiSettings().profiles.openai, apiKey: 'test-key', model: 'test-model' };
const add = (seq = 1, id = 'first') => ({ v: 1, seq, op: 'add', id, type: 'heading', props: { title: 'Generated' }, frame: { x: 24, y: id === 'first' ? 24 : 220, width: 400, height: 120 }, summary: 'Added heading' });
const done = seq => ({ v: 1, seq, op: 'done', summary: 'Complete' });
const text = (...ops) => ({ type: 'text', text: ops.map(op => JSON.stringify(op)).join('\n') + '\n' });
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };
function fixture(stream) {
  const f = { page: createDocument(true), owner: 'guest', selection: [], checkpoints: [], commits: [], locks: [], progress: [], session: null, failSave: false };
  f.session = newAiSession(f.page);
  f.runner = new AiRunner({ getPage: () => f.page, getOwner: () => f.owner, getSelection: () => f.selection, stream,
    checkpoint: (session, owner) => { if (f.failSave) throw new Error('Storage full'); f.checkpoints.push({ session: structuredClone(session), owner }); },
    commit: (page, change, runId) => { f.page = page; f.commits.push({ change, runId }); },
    onSession: (session, owner) => { if (owner === f.owner) f.session = session; },
    onRunning: value => f.locks.push(value), onProgress: value => { f.progress.push(value); f.onProgress?.(value); }, yieldFrame: async () => {},
  });
  f.start = (resume = false) => f.runner.start(f.session, 'openai', profile, 'Create a landing page', 'en', resume);
  return f;
}

test('complete operations checkpoint before commit and a whole response has one undo run id', async () => {
  const f = fixture(async function* () { yield text(add(), { v: 1, seq: 2, op: 'update', id: 'first', props: { title: 'Updated' }, summary: 'Updated title' }, done(3)); yield { type: 'usage', usage: { input: 20, output: 10 } }; yield { type: 'complete' }; });
  await f.start();
  assert.equal(f.page.blocks[0].props.title, 'Updated'); assert.equal(f.session.status, 'complete');
  assert.equal(f.commits.length, 2); assert.equal(new Set(f.commits.map(value => value.runId)).size, 1);
  assert.deepEqual(f.locks, [true, false]); assert.deepEqual(f.session.usage, { input: 20, output: 10 });
  assert.equal(f.checkpoints[1].session.page.blocks[0].props.title, 'Generated');
});

test('pause immediately unlocks, discards partial JSON and ignores a cancelled stream even after a new run begins', async () => {
  const firstApplied = deferred(), late = deferred(), resumed = deferred(); let requests = 0, resumedContext;
  const f = fixture(async function* (_provider, _profile, input) {
    if (++requests === 1) {
      yield text(add()); firstApplied.resolve();
      yield { type: 'text', text: '{"v":1,"seq":2,"op":"add"' };
      await late.promise;
      yield { type: 'text', text: ',"id":"late","type":"heading"}\n' }; yield { type: 'complete' };
    } else {
      resumedContext = JSON.parse(input.context);
      await resumed.promise;
      yield text(add(1, 'second'), done(2)); yield { type: 'complete' };
    }
  });
  const old = f.start(); await firstApplied.promise; f.runner.pause();
  assert.equal(f.runner.running, false); assert.equal(f.session.status, 'paused'); assert.equal(f.page.blocks.length, 1);
  f.page = { ...f.page, blocks: f.page.blocks.map(block => ({ ...block, props: { ...block.props, title: 'Manual edit' } })) };
  const current = f.start(true); late.resolve(); await old;
  assert.equal(f.runner.running, true, 'the old request cannot unlock the newer run');
  assert.equal(resumedContext.page.blocks[0].props.title, 'Manual edit'); assert.equal(resumedContext.resume, true);
  resumed.resolve(); await current;
  assert.equal(f.page.blocks.length, 2); assert.equal(f.page.blocks[0].props.title, 'Manual edit'); assert.equal(f.session.status, 'complete');
  assert.ok(!f.page.blocks.some(block => block.id === 'late'));
});

test('repeated invalid output is bounded and unexpected disconnections remain paused', async () => {
  let requests = 0;
  const f = fixture(async function* () { if (++requests === 1) yield text(add()); yield { type: 'text', text: '{invalid}\n' }; yield { type: 'complete' }; });
  await f.start(); assert.equal(f.page.blocks.length, 1); assert.equal(f.session.status, 'paused'); assert.match(f.session.error, /JSON/);
  assert.equal(requests, 3);
  const incomplete = fixture(async function* () { yield text(add(), done(2)); });
  await incomplete.start(); assert.equal(incomplete.session.status, 'paused'); assert.match(incomplete.session.error, /中断/);
});

test('one-component responses continue automatically until done while retaining one lock and undo group', async () => {
  let requests = 0; const contexts = [];
  const f = fixture(async function* (_provider, _profile, input) {
    contexts.push(JSON.parse(input.context)); ++requests;
    yield text(add(1, `block-${requests}`));
    if (requests === 4) yield text(done(2));
    yield { type: 'usage', usage: { input: 20, output: 10 } }; yield { type: 'complete' };
  });
  await f.start();
  assert.equal(requests, 4); assert.equal(f.page.blocks.length, 4); assert.equal(f.session.status, 'complete');
  assert.deepEqual(f.locks, [true, false]); assert.equal(new Set(f.commits.map(value => value.runId)).size, 1);
  assert.equal(new Set(f.commits.map(value => value.change.key)).size, 4);
  assert.equal(new Set(f.session.receipts.map(value => `${value.runId}:${value.seq}`)).size, 4);
  assert.deepEqual(contexts.map(value => value.page.blocks.length), [0, 1, 2, 3]); assert.ok(contexts.slice(1).every(value => value.resume));
  assert.deepEqual(f.session.usage, { input: 80, output: 40 }); assert.equal(f.session.messages.filter(value => value.role === 'user').length, 1);
});

test('token truncation and invalid component fields are repaired using the latest validated page', async () => {
  let requests = 0;
  const f = fixture(async function* (_provider, _profile, input) {
    const context = JSON.parse(input.context);
    if (++requests === 1) {
      yield text(add()); yield { type: 'text', text: '{"v":1,"seq":2' };
      yield { type: 'usage', usage: { input: 5, output: 1024 } };
      throw new AiContinuationError('Output limit');
    }
    assert.equal(context.page.blocks.length, 1);
    if (requests === 2) { assert.equal(context.lastError, 'Output limit'); yield text(add(1, 'first')); }
    else { assert.match(context.lastError, /重复添加/); yield text(add(1, 'second'), done(2)); }
    yield { type: 'complete' };
  });
  await f.start(); assert.equal(requests, 3); assert.equal(f.session.status, 'complete'); assert.equal(f.page.blocks.length, 2);
  assert.deepEqual(f.session.usage, { input: 5, output: 1024 });
});

test('automatic continuation stops on manual pause, no progress, the request cap and fatal provider errors', async () => {
  let requests = 0;
  const paused = fixture(async function* () { ++requests; yield text(add()); yield { type: 'complete' }; });
  paused.onProgress = value => { if (value.phase === 'continuing') paused.runner.pause(); };
  await paused.start(); assert.equal(requests, 1); assert.equal(paused.session.status, 'paused'); assert.deepEqual(paused.locks, [true, false]);
  requests = 0;
  const empty = fixture(async function* () { ++requests; yield { type: 'complete' }; });
  await empty.start(); assert.equal(requests, 2); assert.match(empty.session.error, /连续两轮/);
  requests = 0;
  const endless = fixture(async function* () { yield text(add(1, `b${++requests}`)); yield { type: 'complete' }; });
  await endless.start(); assert.equal(requests, aiMaxRequests); assert.match(endless.session.error, /自动续写上限/);
  for (const message of ['HTTP 401', 'HTTP 429', 'CORS', 'Provider refusal']) {
    requests = 0;
    const fatal = fixture(async function* () { ++requests; throw new Error(message); });
    await fatal.start(); assert.equal(requests, 1); assert.equal(fatal.session.error, message);
  }
});

test('thinking summaries stream before any component without entering page checkpoints or later model context', async () => {
  let requests = 0;
  const f = fixture(async function* (_provider, _profile, input) {
    assert.ok(!input.context.includes('Thinking-only summary'));
    if (++requests === 1) { yield { type: 'thinking', newPart: true }; yield { type: 'thinking', text: 'Thinking-only summary' }; yield text(add()); }
    else yield text(done(1));
    yield { type: 'complete' };
  });
  await f.start();
  const thinking = f.progress.find(value => value.reasoning === 'Thinking-only summary');
  assert.equal(thinking.phase, 'thinking'); assert.equal(thinking.changes, 0);
  assert.ok(!JSON.stringify(f.checkpoints).includes('Thinking-only summary'));
});

test('public summaries replace only the current request fallback and preserve earlier rounds without persistence', async () => {
  let requests = 0;
  const f = fixture(async function* (_provider, _profile, input) {
    assert.ok(!input.context.includes('First round thoughts'));
    assert.ok(!input.context.includes('Second round draft'));
    assert.ok(!input.context.includes('Second round summary'));
    if (++requests === 1) {
      yield { type: 'thinking', text: 'First round thoughts', source: 'reasoning' };
      yield text(add());
    } else {
      yield { type: 'thinking', text: 'Second round draft', source: 'reasoning' };
      yield { type: 'thinking', newPart: true, source: 'summary' };
      yield { type: 'thinking', text: 'Second round summary', source: 'summary' };
      yield { type: 'thinking', text: 'Discard duplicate draft', source: 'reasoning' };
      yield { type: 'thinking', newPart: true, source: 'summary' };
      yield { type: 'thinking', text: 'Final summary part', source: 'summary' };
      yield text(done(1));
    }
    yield { type: 'complete' };
  });
  await f.start();
  assert.equal(requests, 2);
  assert.ok(f.progress.some(value => value.reasoning === 'First round thoughts\n\nSecond round draft'));
  assert.equal(f.progress.at(-1).reasoning, 'First round thoughts\n\nSecond round summary\n\nFinal summary part');
  assert.ok(!JSON.stringify(f.checkpoints).includes('round thoughts'));
  assert.ok(!JSON.stringify(f.checkpoints).includes('round summary'));
  assert.ok(!JSON.stringify(f.checkpoints).includes('round draft'));
});

test('display thinking remains bounded even for long compatible streams and later summary replacement', async () => {
  const f = fixture(async function* () {
    for (let i = 0; i < 8; i++) yield { type: 'thinking', text: 'a'.repeat(4000), source: 'reasoning' };
    yield { type: 'thinking', text: 'Concise summary', source: 'summary' };
    yield text(done(1)); yield { type: 'complete' };
  });
  await f.start();
  assert.ok(f.progress.every(value => value.reasoning.length <= 12000));
  assert.equal(f.progress.at(-1).reasoning, 'Concise summary');
  assert.ok(!JSON.stringify(f.checkpoints).includes('Concise summary'));
});

test('storage failure prevents the next component from being committed', async () => {
  const f = fixture(async function* () { yield text(add()); f.failSave = true; yield text(add(2, 'second')); yield { type: 'complete' }; });
  await f.start(); assert.equal(f.page.blocks.length, 1); assert.equal(f.session.status, 'paused'); assert.equal(f.session.error, 'Storage full'); assert.equal(f.runner.running, false);
});

test('invalid existing documents fail preflight before spending a model request', async () => {
  let requests = 0;
  const f = fixture(async function* () { ++requests; yield text(add(), done(2)); yield { type: 'complete' }; });
  f.page.settings.customThemes = null;
  await assert.rejects(f.start(), /customThemes.*数组/);
  assert.equal(requests, 0); assert.equal(f.runner.running, false); assert.deepEqual(f.locks, []);
});

test('account or page changes cannot apply late operations to another owner or document', async () => {
  const gate = deferred(), started = deferred();
  const f = fixture(async function* () { started.resolve(); await gate.promise; yield text(add(), done(2)); yield { type: 'complete' }; });
  const task = f.start(); await started.promise; f.owner = 'account:other'; f.page = createDocument(true); gate.resolve(); await task;
  assert.equal(f.page.blocks.length, 0); assert.equal(f.commits.length, 0);
  assert.ok(f.checkpoints.every(value => value.owner === 'guest'), 'a checkpoint never crosses account namespaces');
  assert.equal(f.runner.running, false);
});

const askOp = seq => ({ v: 1, seq, op: 'ask', text: 'Two choices first', questions: [{ id: 'style', title: 'Style', options: ['Minimal', 'Bold'] }, { id: 'screen', title: 'Screen', options: ['Desktop 1920', 'Mobile 390'] }] });

test('a question pauses the task for the user without continuation, and the answer resumes with the combined task', async () => {
  const contexts = [];
  const f = fixture(async function* (_provider, _profile, input) {
    contexts.push(JSON.parse(input.context));
    if (contexts.length === 1) { yield text({ v: 1, seq: 1, op: 'message', text: 'Planning' }, askOp(2)); yield { type: 'complete' }; return; }
    yield text(add(), done(2)); yield { type: 'complete' };
  });
  await f.start();
  assert.equal(contexts.length, 1, 'asking never triggers automatic continuation');
  assert.equal(f.session.status, 'waiting'); assert.deepEqual(f.locks, [true, false]); assert.equal(f.commits.length, 0);
  const question = f.session.messages.at(-1);
  assert.equal(question.role, 'assistant'); assert.equal(question.questions[1].options[1], 'Mobile 390');
  assert.equal(f.checkpoints.at(-1).session.status, 'waiting', 'the waiting state survives a reload');
  await f.runner.start(f.session, 'openai', profile, 'Create a landing page\n\nStyle: Minimal', 'en', false, 'Style: Minimal');
  assert.equal(contexts[1].task, 'Create a landing page\n\nStyle: Minimal');
  assert.deepEqual(contexts[1].recentConversation.at(-2).questions, question.questions);
  assert.equal(contexts[1].recentConversation.at(-1).text, 'Style: Minimal', 'the chat shows the answer, not the combined task');
  assert.equal(f.session.status, 'complete'); assert.equal(f.page.blocks.length, 1);
});

test('each run keeps restorable before and after versions that survive later edits', async () => {
  let requests = 0;
  const f = fixture(async function* () {
    if (++requests === 1) yield text(add(), done(2));
    else yield text({ v: 1, seq: 1, op: 'update', id: 'first', props: { title: `Run ${requests}` }, summary: 'Retitle' }, done(2));
    yield { type: 'complete' };
  });
  await f.start();
  assert.deepEqual(f.session.versions.map(value => value.kind), ['after'], 'an empty starting page needs no before copy');
  assert.equal(f.session.versions[0].page.blocks[0].props.title, 'Generated'); assert.equal(f.session.versions[0].label, 'Complete');
  await f.start();
  assert.deepEqual(f.session.versions.map(value => value.kind), ['after', 'after'], 'an unchanged starting page is not copied twice');
  f.page = { ...f.page, blocks: f.page.blocks.map(block => ({ ...block, props: { ...block.props, title: 'Manual' } })) };
  await f.start();
  assert.deepEqual(f.session.versions.map(value => value.kind), ['after', 'after', 'before', 'after']);
  assert.equal(f.session.versions[2].page.blocks[0].props.title, 'Manual', 'manual work before a run stays restorable');
  assert.ok(f.checkpoints.at(-1).session.versions.length === 4, 'versions are persisted with the checkpoint');
});

test('a paused or failed run snapshots its partial result, while a run without changes adds nothing', async () => {
  const applied = deferred();
  const paused = fixture(async function* (_provider, _profile, _input, signal) { yield text(add()); applied.resolve(); await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))); });
  const task = paused.start(); await applied.promise; paused.runner.pause(); await task;
  assert.equal(paused.session.status, 'paused'); assert.equal(paused.session.versions.at(-1).page.blocks.length, 1);
  const failed = fixture(async function* () { yield text(add()); throw new Error('HTTP 500'); });
  await failed.start(); assert.equal(failed.session.versions.at(-1).page.blocks.length, 1); assert.equal(failed.session.error, 'HTTP 500');
  const unchanged = fixture(async function* () { yield text(done(1)); yield { type: 'complete' }; });
  await unchanged.start(); assert.deepEqual(unchanged.session.versions, []);
});

test('the runner adopts the stored copy when checkpoints trim old snapshots', async () => {
  const f = fixture(async function* () { yield text(add(), done(2)); yield { type: 'complete' }; });
  const original = f.runner.options.checkpoint;
  f.runner.options.checkpoint = (session, owner) => { original(session, owner); return { ...session, versions: session.versions.slice(-1), task: session.task }; };
  f.session = { ...f.session, versions: [1, 2].map(i => ({ id: `old-${i}`, runId: `old-${i}`, kind: 'after', time: i, label: '', page: { ...f.page, name: `Old ${i}` } })) };
  await f.start();
  assert.ok(f.session.versions.length <= 2); assert.equal(f.session.versions.at(-1).page.blocks.length, 1);
});

test('progress separates connecting, waiting for the model, thinking and output with per-request timings', async () => {
  const f = fixture(async function* () {
    yield { type: 'connected' }; yield { type: 'thinking' }; yield { type: 'thinking', text: 'Arrange title', source: 'reasoning' }; yield { type: 'thinking', text: ' then cards', source: 'reasoning' };
    yield text(add(), done(2)); yield { type: 'complete' };
  });
  await f.start();
  const phases = f.progress.map(value => value.phase);
  assert.deepEqual(phases.slice(0, 3), ['connecting', 'waiting', 'thinking']);
  const thinking = f.progress.findLast(value => value.phase === 'thinking');
  assert.equal(thinking.reasoning, 'Arrange title then cards');
  const output = f.progress.find(value => value.phase === 'generating');
  assert.ok(output.connectedAt >= output.requestedAt && output.firstOutputAt >= output.connectedAt);
  let requests = 0;
  const continued = fixture(async function* () { yield { type: 'connected' }; yield text(add(1, `b${++requests}`)); if (requests === 2) yield text(done(2)); yield { type: 'complete' }; });
  await continued.start();
  const resumed = continued.progress.find(value => value.phase === 'continuing');
  assert.equal(resumed.connectedAt, undefined); assert.equal(resumed.firstOutputAt, undefined);
});

test('an output limit reported after the terminal record does not start another request', async () => {
  let requests = 0;
  const f = fixture(async function* () { ++requests; yield text(add(), done(2)); yield { type: 'usage', usage: { input: 1, output: 2 } }; throw new AiOutputLimitError('Output limit'); });
  await f.start();
  assert.equal(requests, 1); assert.equal(f.session.status, 'complete'); assert.deepEqual(f.session.usage, { input: 1, output: 2 });
});

test('terminal records never turn following protocol errors into success before provider completion', async () => {
  for (const terminal of [done(1), askOp(1)]) {
    let requests = 0, providerCompletions = 0;
    const f = fixture(async function* () {
      ++requests;
      yield text(terminal, { v: 1, seq: 2, op: 'remove', id: 'missing' });
      ++providerCompletions;
      yield { type: 'complete' };
    });
    await f.start();
    assert.equal(requests, 2, 'invalid output uses the existing bounded correction policy');
    assert.equal(providerCompletions, 0);
    assert.equal(f.session.status, 'paused');
    assert.match(f.session.error, /操作顺序不连续/);
    assert.equal(f.commits.length, 0);
    assert.equal(f.session.messages.some(message => message.role === 'assistant'), false, 'an invalid terminal record must not publish a completion summary or question');
  }
});

test('terminal summaries wait for provider completion and a complete final line survives the output limit', async () => {
  const received = deferred(), finish = deferred();
  const f = fixture(async function* () {
    yield text(done(1)); received.resolve();
    await finish.promise;
    yield { type: 'complete' };
  });
  const running = f.start(); await received.promise;
  assert.equal(f.session.status, 'running');
  assert.equal(f.session.messages.some(message => message.text === 'Complete'), false);
  finish.resolve(); await running;
  assert.equal(f.session.status, 'complete'); assert.equal(f.session.messages.at(-1).text, 'Complete');
  const limited = fixture(async function* () {
    yield { type: 'text', text: JSON.stringify(done(1)) };
    throw new AiOutputLimitError('Output limit');
  });
  await limited.start();
  assert.equal(limited.session.status, 'complete');
  assert.equal(limited.session.messages.at(-1).text, 'Complete');
});

test('an output limit cannot hide malformed buffered content after a terminal record', async () => {
  let requests = 0;
  const f = fixture(async function* () {
    ++requests;
    yield text(done(1));
    yield { type: 'text', text: '{invalid trailing record' };
    throw new AiOutputLimitError('Output limit');
  });
  await f.start();
  assert.equal(requests, 2); assert.equal(f.session.status, 'paused'); assert.match(f.session.error, /JSON/);
});

test('a provider refusal is shown with usage after one request and never automatically continued', async () => {
  let requests = 0, cancelled = false;
  const f = fixture((provider, profile, input, signal) => streamAi(provider, profile, input, signal, async () => {
    ++requests;
    return new Response(new ReadableStream({
      start(controller) {
        const events = [
          { type: 'response.refusal.delta', delta: 'Cannot fulfill this request.' },
          { type: 'response.refusal.done', refusal: 'Cannot fulfill this request.' },
          { type: 'response.completed', response: { usage: { input_tokens: 100, output_tokens: 10 } } },
        ];
        controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')));
      },
      cancel() { cancelled = true; },
    }));
  }));
  await f.start();
  assert.equal(requests, 1); assert.equal(cancelled, true); assert.equal(f.session.status, 'paused');
  assert.equal(f.session.error, 'AI 拒绝了本次请求：Cannot fulfill this request.');
  assert.deepEqual(f.session.usage, { input: 100, output: 10 }); assert.deepEqual(f.locks, [true, false]);
});

test('automatic continuations retain the original user selection when generated blocks become selected', async () => {
  const contexts = [];
  const f = fixture(async function* (_provider, _profile, input) {
    contexts.push(JSON.parse(input.context));
    if (contexts.length === 1) { yield text(add(1, 'second')); f.selection = ['second']; }
    else yield text(done(1));
    yield { type: 'complete' };
  });
  f.page = applyAiOperation(f.page, add()).page; f.selection = ['first', 'missing', 'first'];
  await f.start();
  assert.equal(f.session.status, 'complete');
  assert.deepEqual(contexts.map(context => context.selectedBlockIds), [['first'], ['first']]);
});

test('manual resume and persisted checkpoints retain task selection while a new task uses the current selection', async () => {
  const applied = deferred(), finishOld = deferred(), contexts = [];
  const f = fixture(async function* (_provider, _profile, input) {
    contexts.push(JSON.parse(input.context));
    if (contexts.length === 1) { yield text(add(1, 'second')); applied.resolve(); await finishOld.promise; }
    else { yield text(done(1)); yield { type: 'complete' }; }
  });
  f.page = applyAiOperation(f.page, add()).page; f.session = newAiSession(f.page); f.selection = ['first'];
  const initial = f.start(); await applied.promise;
  f.selection = ['second']; f.runner.pause(); finishOld.resolve(); await initial;
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveAiSessions('guest', [f.session], storage); f.session = readAiSessions('guest', storage)[0];
  assert.deepEqual(f.session.selectedBlockIds, ['first']);
  await f.start(true);
  assert.deepEqual(contexts.at(-1).selectedBlockIds, ['first']);
  await f.start();
  assert.deepEqual(contexts.at(-1).selectedBlockIds, ['second']);
});

test('dropped property warnings reach both the chat checkpoint and the next model context', async () => {
  let requests = 0;
  const f = fixture(async function* (_provider, _profile, input) {
    if (++requests === 1) {
      yield text({ ...add(), type: 'progress', props: { value: 80, max: 100 } }, { v: 1, seq: 2, op: 'update', id: 'first', props: { value: 40, max: 50, bogus: true }, summary: 'Set progress to 40/50' });
    } else {
      const context = JSON.parse(input.context);
      assert.ok(context.recentConversation.some(message => message.role === 'assistant' && message.text.includes('bogus')));
      yield text(done(1));
    }
    yield { type: 'complete' };
  });
  await f.start();
  assert.equal(requests, 2); assert.equal(f.page.blocks[0].props.value, 40); assert.equal(f.page.blocks[0].props.max, 50);
  assert.ok(f.checkpoints.some(({ session }) => session.messages.some(message => message.text.includes('bogus'))));
});

const customDefinition = { name: '计数卡片', html: '<button data-prop="label"></button>', css: 'button { color: var(--as-text); }', js: 'let count=0;document.querySelector("button").addEventListener("click",()=>component.log(++count));', fields: { label: '计数' }, size: { width: 320, height: 180 } };
const componentOp = (seq = 1) => ({ v: 1, seq, op: 'component', id: 'counter', component: structuredClone(customDefinition), summary: '创建计数卡片' });

test('custom definitions checkpoint before library persistence and source metadata checkpoints before the canvas commit', async () => {
  const order = [];
  const f = fixture(async function* () { yield text(componentOp(), done(2)); yield { type: 'complete' }; });
  const checkpoint = f.runner.options.checkpoint, commit = f.runner.options.commit;
  f.runner.options.checkpoint = (session, owner) => {
    if (session.status === 'running' && session.page.blocks.length) order.push(session.page.blocks[0].props.custom.source ? 'linked-checkpoint' : 'definition-checkpoint');
    return checkpoint(session, owner);
  };
  f.runner.options.prepareCustom = (page, before, op) => {
    assert.equal(op.op, 'component'); assert.equal(before.blocks.length, 0); assert.equal(f.page.blocks.length, 0);
    assert.equal(f.checkpoints.at(-1).session.page.blocks[0].props.custom.js, customDefinition.js);
    order.push('library');
    return { ...page, blocks: page.blocks.map(block => ({ ...block, props: { ...block.props, custom: { ...block.props.custom, source: { kind: 'local', id: 'library-counter', revision: 1 } } } })) };
  };
  f.runner.options.commit = (page, change, id) => {
    assert.equal(f.checkpoints.at(-1).session.page.blocks[0].props.custom.source.id, 'library-counter');
    order.push('canvas'); commit(page, change, id);
  };
  await f.start();
  assert.deepEqual(order.slice(0, 4), ['definition-checkpoint', 'library', 'linked-checkpoint', 'canvas']);
  assert.equal(f.session.status, 'complete'); assert.equal(f.commits.length, 1); assert.equal(f.session.receipts.length, 1);
  assert.equal(f.page.blocks[0].props.custom.source.id, 'library-counter');
});

test('a failed custom library save preserves a recoverable definition without committing a half-saved canvas', async () => {
  let requests = 0;
  const f = fixture(async function* () { requests++; yield text(componentOp(), done(2)); yield { type: 'complete' }; });
  f.runner.options.prepareCustom = () => { throw new Error('Library full'); };
  await f.start();
  assert.equal(requests, 1); assert.equal(f.page.blocks.length, 0); assert.equal(f.commits.length, 0);
  assert.equal(f.session.status, 'paused'); assert.equal(f.session.error, 'Library full');
  assert.equal(f.session.page.blocks[0].props.custom.js, customDefinition.js);
  assert.equal(f.session.versions.at(-1).page.blocks[0].props.custom.js, customDefinition.js);
});

test('a failed source checkpoint can recover the saved definition and retry library persistence idempotently', async () => {
  const f = fixture(async function* () { yield text(componentOp(), done(2)); yield { type: 'complete' }; });
  let saved = null, writes = 0, failSource = true;
  f.runner.options.prepareCustom = page => {
    if (!saved) { saved = { kind: 'local', id: 'stable-library-id', revision: 1 }; writes++; }
    return { ...page, blocks: page.blocks.map(block => ({ ...block, props: { ...block.props, custom: { ...block.props.custom, source: saved } } })) };
  };
  const original = f.runner.options.checkpoint;
  f.runner.options.checkpoint = (session, owner) => {
    if (failSource && session.page.blocks[0]?.props.custom.source) throw new Error('Source checkpoint full');
    return original(session, owner);
  };
  await f.start();
  assert.equal(writes, 1); assert.equal(f.page.blocks.length, 0); assert.equal(f.session.page.blocks[0].props.custom.source, undefined);
  assert.equal(f.session.error, 'Source checkpoint full');
  f.page = f.session.page; failSource = false;
  await f.start(true);
  assert.equal(writes, 1); assert.equal(f.session.status, 'complete'); assert.equal(f.page.blocks[0].props.custom.source.id, saved.id);
  assert.equal(f.commits.length, 1, 'source-only recovery still updates the canvas metadata');
});

test('library references resolve owned snapshots without saving a second component, and cancelled lookups cannot commit', async () => {
  const ref = { kind: 'cloud', id: 'owned-counter' }, snapshot = { ...customDefinition, source: { ...ref, revision: 4 } };
  const op = { v: 1, seq: 1, op: 'component', id: 'reused-counter', componentRef: ref };
  const f = fixture(async function* () { yield text(op, done(2)); yield { type: 'complete' }; });
  f.runner.options.resolveComponent = async received => { assert.deepEqual(received, ref); return snapshot; };
  f.runner.options.prepareCustom = () => { assert.fail('reusing a library component must not save a duplicate'); };
  await f.start();
  assert.deepEqual(f.page.blocks[0].props.custom.source, snapshot.source);
  for (const interrupt of ['pause', 'owner', 'mode']) {
    const called = deferred(), release = deferred();
    const late = fixture(async function* () { yield text(op, done(2)); yield { type: 'complete' }; });
    let mode = 'page'; late.runner.options.getMode = () => mode;
    late.runner.options.resolveComponent = async () => { called.resolve(); await release.promise; return snapshot; };
    const task = late.start(); await called.promise;
    if (interrupt === 'pause') late.runner.pause();
    else if (interrupt === 'owner') late.owner = 'account:other';
    else mode = 'component';
    release.resolve(); await task;
    assert.equal(late.commits.length, 0, `late ${interrupt} resolution cannot modify the canvas`);
    assert.equal(late.checkpoints.some(item => item.session.page.blocks.length > 0), false);
  }
});

test('component mode is persisted and scoped to custom drafts while exposing a stable reusable catalog to each round', async () => {
  const contexts = [], catalog = [{ ref: { kind: 'local', id: 'saved' }, name: '已有组件' }];
  const f = fixture(async function* (_provider, _profile, input) {
    contexts.push(JSON.parse(input.context));
    if (contexts.length === 1) { yield text(componentOp()); catalog[0].name = '后来改名'; }
    else yield text(done(1));
    yield { type: 'complete' };
  });
  f.runner.options.getMode = () => 'component'; f.runner.options.getComponents = () => catalog;
  await f.start();
  assert.equal(f.session.mode, 'component'); assert.equal(f.session.status, 'complete');
  assert.deepEqual(contexts.map(value => value.mode), ['component', 'component']);
  assert.deepEqual(contexts.map(value => value.availableComponents[0].name), ['已有组件', '已有组件']);
  for (const illegal of [add(), { v: 1, seq: 1, op: 'data', variables: [] }]) {
    const blocked = fixture(async function* () { yield text(illegal, done(2)); yield { type: 'complete' }; });
    blocked.runner.options.getMode = () => 'component';
    await blocked.start();
    assert.equal(blocked.page.blocks.length, 0); assert.equal(blocked.commits.length, 0);
    assert.equal(blocked.session.status, 'paused'); assert.match(blocked.session.error, /组件创作只能/);
  }
  const wrongPage = fixture(async function* () { assert.fail('an ordinary page must fail before paying for component mode'); });
  wrongPage.page = applyAiOperation(wrongPage.page, add()).page; wrongPage.runner.options.getMode = () => 'component';
  await assert.rejects(wrongPage.start(), /独立的自定义组件草稿/);
});

test('component mode rejects instance-only fields, styles, bindings and events while page mode retains them', async () => {
  const patches = [
    { props: { label: '开始' } },
    { props: { accent: '#123456' } },
    { props: {} },
    { bindings: { visible: { kind: 'expression', value: 'true' } } },
    { events: { click: [{ type: 'notify', expression: '"已点击"' }] } },
  ];
  for (const patch of patches) {
    const op = { v: 1, seq: 1, op: 'update', id: 'counter', frame: { x: 80 }, ...patch };
    const blocked = fixture(async function* () { yield text(op, done(2)); yield { type: 'complete' }; });
    blocked.page = applyAiOperation(blocked.page, componentOp()).page;
    blocked.session = newAiSession(blocked.page, 'component'); blocked.runner.options.getMode = () => 'component';
    const original = JSON.stringify(blocked.page);
    await blocked.start();
    assert.equal(blocked.session.status, 'paused'); assert.match(blocked.session.error, /完整组件定义/);
    assert.equal(JSON.stringify(blocked.page), original); assert.equal(blocked.commits.length, 0);
    const page = fixture(async function* () { yield text(op, done(2)); yield { type: 'complete' }; });
    page.page = applyAiOperation(page.page, componentOp()).page; page.session = newAiSession(page.page);
    await page.start();
    assert.equal(page.session.status, 'complete'); assert.equal(page.page.blocks[0].frame.x, 80);
    for (const key of ['props', 'bindings', 'events']) if (patch[key]) assert.deepEqual(Object.fromEntries(Object.keys(patch[key]).map(field => [field, page.page.blocks[0][key][field]])), patch[key]);
  }
});

test('component correction updates reusable defaults and preview together while frame-only preview updates remain allowed', async () => {
  let requests = 0;
  const revised = { ...componentOp(), component: { ...customDefinition, fields: { label: '开始' } } };
  const f = fixture(async function* (_provider, _profile, input) {
    if (++requests === 1) yield text({ v: 1, seq: 1, op: 'update', id: 'counter', props: { label: '开始' } });
    else {
      assert.match(JSON.parse(input.context).lastError, /完整组件定义/);
      yield text(revised, { v: 1, seq: 2, op: 'update', id: 'counter', frame: { x: 80, width: 400 } }, done(3));
    }
    yield { type: 'complete' };
  });
  f.page = applyAiOperation(f.page, componentOp()).page; f.session = newAiSession(f.page, 'component'); f.runner.options.getMode = () => 'component';
  await f.start();
  assert.equal(requests, 2); assert.equal(f.session.status, 'complete');
  assert.equal(f.page.blocks[0].props.custom.fields.label, '开始'); assert.equal(f.page.blocks[0].props.label, '开始');
  assert.equal(f.page.blocks[0].frame.x, 80); assert.equal(f.page.blocks[0].frame.width, 400);
  const page = fixture(async function* () { yield text(revised, done(2)); yield { type: 'complete' }; });
  page.page = applyAiOperation(page.page, componentOp()).page; page.page.blocks[0].props.label = '独立页面文案'; page.session = newAiSession(page.page);
  await page.start();
  assert.equal(page.page.blocks[0].props.label, '独立页面文案', 'page instances retain their authored overrides');
  assert.equal(page.page.blocks[0].props.custom.fields.label, '开始');
});
