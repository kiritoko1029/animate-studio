import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAiSettings } from '../src/lib/ai/config.ts';
import { streamAi, providerBody, listAiModels } from '../src/lib/ai/client.ts';
import { AiContinuationError, AiOutputLimitError } from '../src/lib/ai/errors.ts';

const profile = provider => ({ ...defaultAiSettings().profiles[provider], apiKey: 'mock-secret', model: 'mock-model' });
function sse(events, chunkSize = 7) {
  const bytes = new TextEncoder().encode(events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) { if (offset >= bytes.length) return controller.close(); controller.enqueue(bytes.slice(offset, offset += chunkSize)); } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
async function collect(stream) { const result = []; for await (const event of stream) result.push(event); return result; }

test('Responses streams text across UTF-8 and SSE chunks and uses the requested reasoning without server-side storage', async () => {
  let request;
  const events = await collect(streamAi('openai', { ...profile('openai'), effort: 'high' }, { system: 'protocol', context: 'page' }, new AbortController().signal, async (url, init) => {
    request = { url, ...init, body: JSON.parse(init.body) };
    return sse([{ type: 'response.output_text.delta', delta: '标题🌈' }, { type: 'response.completed', response: { usage: { input_tokens: 12, output_tokens: 5 } } }], 1);
  }));
  assert.equal(request.url, 'https://api.openai.com/v1/responses'); assert.equal(request.body.store, false); assert.deepEqual(request.body.reasoning, { effort: 'high', summary: 'auto' });
  assert.equal(request.credentials, 'omit'); assert.equal(request.headers.Authorization, 'Bearer mock-secret');
  assert.deepEqual(events[0], { type: 'connected' }, 'response headers are reported before any model output');
  assert.equal(events[1].text, '标题🌈'); assert.deepEqual(events[2].usage, { input: 12, output: 5 }); assert.equal(events.at(-1).type, 'complete');
});

test('Messages separates public thinking deltas from page operations and ignores signatures and redacted blocks', async () => {
  const p = { ...profile('anthropic'), effort: 'max', thinking: 'adaptive' };
  assert.deepEqual(providerBody('anthropic', p, { system: 's', context: 'c' }).thinking, { type: 'adaptive' });
  assert.deepEqual(providerBody('anthropic', { ...p, thinking: 'budget', thinkingBudget: 2048 }, { system: 's', context: 'c' }).thinking, { type: 'enabled', budget_tokens: 2048 });
  const events = await collect(streamAi('anthropic', p, { system: 's', context: 'c' }, new AbortController().signal, async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.deepEqual(JSON.parse(init.body).output_config, { effort: 'max' });
    return sse([{ type: 'message_start', message: { usage: { input_tokens: 9 } } }, { type: 'content_block_start', content_block: { type: 'thinking', thinking: '' } }, { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '先安排页面层次。🌈' } }, { type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'opaque-signature' } }, { type: 'content_block_start', content_block: { type: 'redacted_thinking', data: 'opaque-redaction' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'JSON\n' } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }, { type: 'message_stop' }], 1);
  }));
  assert.equal(events.filter(event => event.type === 'thinking').map(event => event.text ?? '').join(''), '先安排页面层次。🌈');
  assert.ok(!JSON.stringify(events).includes('opaque-')); assert.equal(events.find(event => event.type === 'text').text, 'JSON\n'); assert.deepEqual(events.find(event => event.type === 'usage').usage, { input: 9, output: 4 });
});

test('Responses prefers public summaries and allows incompatible models to opt out of requesting them', async () => {
  assert.equal(providerBody('openai', { ...profile('openai'), reasoningSummary: false }, { system: '', context: '' }).reasoning, undefined);
  const events = await collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse([
    { type: 'response.reasoning_summary_part.added' }, { type: 'response.reasoning_summary_text.delta', delta: '安排主视觉与卡片。' },
    { type: 'response.reasoning_text.delta', delta: 'unexposed-raw-text' }, { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 2 } } },
  ])));
  assert.ok(events[1].newPart); assert.equal(events[2].text, '安排主视觉与卡片。'); assert.ok(!JSON.stringify(events).includes('unexposed-raw-text'));
});

test('truncated, failed and token-limited responses never report successful completion', async () => {
  for (const events of [[{ type: 'response.output_text.delta', delta: 'partial' }], [{ type: 'response.incomplete' }], [{ type: 'error', error: { message: 'Bad mock-secret request' } }]]) {
    await assert.rejects(collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse(events))), error => !error.message.includes('mock-secret'));
  }
  await assert.rejects(collect(streamAi('anthropic', profile('anthropic'), { system: '', context: '' }, new AbortController().signal, async () => sse([{ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, { type: 'message_stop' }]))), AiContinuationError);
});

test('compatible thinking text is coalesced and its short tail is flushed before page output and completion', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const events = await collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse([
    { type: 'response.output_item.added', item: { type: 'reasoning' } },
    { type: 'response.reasoning_text.delta', delta: '先安排标题。' },
    { type: 'response.reasoning_text.delta', delta: '然后布局卡片。' },
    { type: 'response.reasoning_text.delta', delta: '检查间距。' },
    { type: 'response.output_text.delta', delta: 'JSON\n' },
    { type: 'response.reasoning_text.delta', delta: '补齐导航。' },
    { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 20 } } },
  ])));
  const thinking = events.filter(event => event.type === 'thinking' && event.text);
  assert.deepEqual(thinking.map(event => event.text), ['先安排标题。', '然后布局卡片。检查间距。', '补齐导航。']);
  assert.ok(thinking.every(event => event.source === 'reasoning'));
  assert.ok(events.indexOf(thinking[1]) < events.findIndex(event => event.type === 'text'));
  assert.ok(events.indexOf(thinking[2]) < events.findIndex(event => event.type === 'usage'));
});

test('a later summary replaces the compatible source and discards buffered duplicates, never opaque fields', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const events = await collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse([
    { type: 'response.reasoning_text.delta', delta: '兼容内容' },
    { type: 'response.reasoning_text.delta', delta: '待合并内容' },
    { type: 'response.reasoning_summary_part.added' },
    { type: 'response.reasoning_summary_text.delta', delta: ' ' },
    { type: 'response.reasoning_summary_text.delta', delta: '明确的摘要' },
    { type: 'response.reasoning_text.delta', delta: '重复的兼容内容' },
    { type: 'response.output_item.done', item: { type: 'reasoning', encrypted_content: 'opaque-encrypted' } },
    { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } },
  ])));
  const texts = events.filter(event => event.type === 'thinking' && event.text);
  assert.deepEqual(texts, [{ type: 'thinking', text: '兼容内容', source: 'reasoning' }, { type: 'thinking', text: ' 明确的摘要', source: 'summary' }]);
  assert.ok(!JSON.stringify(events).includes('opaque-encrypted'));
  const short = await collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse([
    { type: 'response.reasoning_text.delta', delta: '短内容' }, { type: 'response.completed', response: {} },
  ])));
  assert.equal(short.find(event => event.type === 'thinking').text, '短内容');
});

test('output limits preserve usage for automatic continuation; refusals and context limits never trigger retries', async () => {
  for (const provider of ['openai', 'anthropic']) {
    const events = provider === 'openai'
      ? [{ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 11, output_tokens: 12 } } }]
      : [{ type: 'message_start', message: { usage: { input_tokens: 11 } } }, { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 12 } }, { type: 'message_stop' }];
    const received = [];
    await assert.rejects(async () => { for await (const event of streamAi(provider, profile(provider), { system: '', context: '' }, new AbortController().signal, async () => sse(events))) received.push(event); }, AiOutputLimitError);
    assert.deepEqual(received, [{ type: 'connected' }, { type: 'usage', usage: { input: 11, output: 12 } }]);
  }
  for (const reason of ['refusal', 'model_context_window_exceeded', 'tool_use', 'pause_turn']) {
    await assert.rejects(collect(streamAi('anthropic', profile('anthropic'), { system: '', context: '' }, new AbortController().signal, async () => sse([{ type: 'message_delta', delta: { stop_reason: reason } }]))), error => !(error instanceof AiContinuationError));
  }
  await assert.rejects(collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } }]))), error => !(error instanceof AiContinuationError));
});

test('Responses refusals preserve their reason and terminal usage without reporting completion', async () => {
  const refusal = 'Cannot fulfill this request for mock-secret';
  const usage = { input_tokens: 11, output_tokens: 12 };
  for (const events of [
    [{ type: 'response.refusal.delta', delta: 'Cannot fulfill ' }, { type: 'response.refusal.delta', delta: 'this request for mock-secret' }, { type: 'response.completed', response: { usage } }],
    [{ type: 'response.refusal.delta', delta: 'Partial' }, { type: 'response.refusal.done', refusal }, { type: 'response.completed', response: { usage } }],
    [{ type: 'response.completed', response: { usage, output: [{ type: 'message', content: [{ type: 'refusal', refusal }] }] } }],
    [{ type: 'response.refusal.done', refusal }, { type: 'response.incomplete', response: { usage, incomplete_details: { reason: 'content_filter' } } }],
  ]) {
    const received = [];
    await assert.rejects(async () => {
      for await (const event of streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse(events, 1))) received.push(event);
    }, error => !(error instanceof AiContinuationError) && error.message === 'AI 拒绝了本次请求：Cannot fulfill this request for [API key]');
    assert.deepEqual(received, [{ type: 'connected' }, { type: 'usage', usage: { input: 11, output: 12 } }]);
  }
});

test('model discovery supports paginated Anthropic lists and compatible OpenAI base URLs', async () => {
  const urls = [];
  const ids = await listAiModels('anthropic', profile('anthropic'), new AbortController().signal, async url => { urls.push(String(url)); return Response.json(urls.length === 1 ? { data: [{ id: 'model-b' }], has_more: true, last_id: 'model-b' } : { data: [{ id: 'model-a' }], has_more: false }); });
  assert.deepEqual(ids, ['model-a', 'model-b']); assert.ok(urls[1].includes('after_id=model-b'));
  assert.deepEqual(await listAiModels('openai', { ...profile('openai'), baseUrl: 'https://example.com/api/v1/responses' }, new AbortController().signal, async url => { assert.equal(String(url), 'https://example.com/api/v1/models'); return Response.json({ data: [{ id: 'custom-model' }] }); }), ['custom-model']);
});

test('pause cancels the underlying response reader and rejects late stream chunks', async () => {
  const controller = new AbortController(); let cancelled = false, enqueue;
  const response = new Response(new ReadableStream({ start(c) { enqueue = c; }, cancel() { cancelled = true; } }));
  const run = collect(streamAi('openai', profile('openai'), { system: '', context: '' }, controller.signal, async () => response));
  await Promise.resolve(); await Promise.resolve(); controller.abort();
  await assert.rejects(run, error => error.name === 'AbortError'); assert.equal(cancelled, true);
});

test('terminal provider events complete and release a stream even when the gateway keeps the connection open', { timeout: 1000 }, async t => {
  const controller = new AbortController(); t.after(() => controller.abort());
  let cancelled = false;
  const body = new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":2}}}\n\n')); }, cancel() { cancelled = true; } });
  const events = await collect(streamAi('openai', profile('openai'), { system: '', context: '' }, controller.signal, async () => new Response(body)));
  assert.equal(events.at(-1).type, 'complete'); assert.equal(cancelled, true);
});

test('long responses beyond the previous 4 MB and 1 MB frame limits stream completely', async () => {
  const part = 'x'.repeat(1_500_000);
  const events = await collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => sse([
    ...Array.from({ length: 3 }, () => ({ type: 'response.output_text.delta', delta: part })),
    { type: 'response.completed', response: { output: [{ content: [{ text: part.repeat(3) }] }], usage: { input_tokens: 1, output_tokens: 2 } } },
  ], 64 * 1024)));
  assert.equal(events.filter(event => event.type === 'text').reduce((length, event) => length + event.text.length, 0), 4_500_000);
  assert.equal(events.at(-1).type, 'complete');
});

test('a silent endpoint is stopped by the idle limit before and after headers, and long streams by the total limit', async () => {
  const limits = { idleMs: 40, totalMs: 5000 };
  const hang = async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  await assert.rejects(collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, hang, limits)), /超过 0 秒没有返回数据/);
  let cancelled = false;
  const quiet = async () => new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n')); }, cancel() { cancelled = true; } }));
  const received = [];
  await assert.rejects(async () => { for await (const event of streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, quiet, limits)) received.push(event); }, /没有返回数据/);
  assert.deepEqual(received, [{ type: 'connected' }]); assert.equal(cancelled, true);
  // Heartbeats keep the idle timer alive, so only the total limit can end this stream.
  let timer;
  const chatty = async () => new Response(new ReadableStream({ start(stream) { timer = setInterval(() => stream.enqueue(new TextEncoder().encode(': ping\n\n')), 10); }, cancel() { clearInterval(timer); } }));
  await assert.rejects(collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, chatty, { idleMs: 40, totalMs: 120 })), /单次请求超过/);
  clearInterval(timer);
});

test('gateway error objects without an event type stop the request with their message', async () => {
  for (const provider of ['openai', 'anthropic']) {
    await assert.rejects(collect(streamAi(provider, profile(provider), { system: '', context: '' }, new AbortController().signal, async () => new Response('data: {"error":{"message":"quota exhausted for mock-secret"}}\n\n'))), error => /quota exhausted/.test(error.message) && !error.message.includes('mock-secret'));
  }
  await assert.rejects(collect(streamAi('openai', profile('openai'), { system: '', context: '' }, new AbortController().signal, async () => new Response('data: {"error":"rate limited"}\n\n'))), /rate limited/);
});
