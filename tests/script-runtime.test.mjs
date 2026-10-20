import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createInteractionRuntime } from '../shared/interactions.mjs';

// Execute the production factory, iframe bridge and Worker source in separate realms.
// Browser tests additionally cover actual CSP, CORS and Worker termination.
function harness(t, code, fetch = async () => Response.json({ value: 42 })) {
  const timers = new Map(), frames = new Set(), workers = new Set(), blobs = new Map(), listeners = new Set();
  const logs = [], notices = [];
  const schedule = (callback, ms) => { const id = {}; timers.set(id, { callback, ms }); return id; };
  const unschedule = id => timers.delete(id);
  const window = { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) };
  const document = {
    baseURI: 'https://app.example.test/project/page.html',
    createElement() {
      let bridgeReceive;
      const ownedWorkers = new Set();
      const parent = { postMessage: data => queueMicrotask(() => { if (frames.has(frame)) for (const listener of listeners) listener({ source: frame.contentWindow, data }); }) };
      const frame = {
        setAttribute(name, value) { this[name] = value; },
        contentWindow: { postMessage: data => queueMicrotask(() => { if (frames.has(frame)) bridgeReceive({ source: parent, data }); }) },
        remove() { frames.delete(frame); for (const worker of ownedWorkers) worker.terminate(); },
      };
      frame.start = () => {
        const script = frame.srcdoc.match(/<script>([\s\S]*)<\/script>/)[1];
        class Worker {
          constructor(url) {
            workers.add(this); ownedWorkers.add(this); this.ownedTimers = new Set();
            this.self = { fetch, postMessage: data => queueMicrotask(() => { if (!this.terminated) this.onmessage({ data }); }) };
            vm.runInNewContext(blobs.get(url), {
              self: this.self, URL, AbortController, SyntaxError,
              setTimeout: (fn, ms) => { const id = schedule(fn, ms); this.ownedTimers.add(id); return id; }, clearTimeout: unschedule,
            });
          }
          postMessage(data) { this.self.onmessage({ data }); }
          terminate() { this.terminated = true; workers.delete(this); for (const id of this.ownedTimers) unschedule(id); }
        }
        const urls = { createObjectURL: blob => { const url = `blob:${blobs.size}`; blobs.set(url, blob.parts.join('')); return url; }, revokeObjectURL: url => blobs.delete(url) };
        vm.runInNewContext(script, { parent, Worker, URL: urls, Blob: class { constructor(parts) { this.parts = parts; } }, addEventListener: (_, fn) => { bridgeReceive = fn; } });
      };
      return frame;
    },
    body: { append(frame) { frames.add(frame); frame.start(); } },
  };
  const config = { variables: [{ name: 'result', type: 'number', initial: 0 }], scripts: [{ id: 'test', name: '测试脚本', code }], blocks: [] };
  const runtime = vm.runInNewContext(`(${createInteractionRuntime.toString()})(config, options)`, {
    config, options: { onNotify: value => notices.push(value), onLog: entry => logs.push(entry) }, document, window,
    crypto: { randomUUID: () => 'isolated-test-token' }, setTimeout: schedule, clearTimeout: unschedule,
  });
  t.after(() => runtime.dispose());
  return { runtime, frames, workers, timers, logs, notices,
    fire(ms) { const entries = [...timers].filter(([, timer]) => timer.ms === ms); assert.ok(entries.length, `expected a ${ms} ms deadline`); for (const [id, timer] of entries) { timers.delete(id); timer.callback(); } },
    clean() { assert.equal(frames.size, 0); assert.equal(workers.size, 0); assert.equal(timers.size, 0); assert.equal(listeners.size, 0); },
  };
}

test('real script context supports JSON GET, POST, fetch aliases, relative URLs and committed notices', async t => {
  const calls = [];
  const h = harness(t, `
    const data = await ctx.fetchJSON('/api/value');
    const response = await fetch('next', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    ctx.setState('result', (await response.json()).value);
    const native = await ctx.fetch('https://api.example.test/text');
    ctx.log(await native.text());
    ctx.notify('请求成功');
  `, async (url, options) => { calls.push({ url, options }); return Response.json({ value: 42 }); });
  await h.runtime.runScript('test');
  assert.deepEqual(calls.map(call => call.url), ['https://app.example.test/api/value', 'https://app.example.test/project/next', 'https://api.example.test/text']);
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { value: 42 });
  assert.equal(h.runtime.getState().result, 42);
  assert.deepEqual(h.notices, ['请求成功']);
  assert.ok(h.logs.some(entry => entry.message.includes('"value":42')));
  h.clean();
});

test('HTTP/JSON/network errors reject without committing partial writes or notifications', async t => {
  for (const [fetch, message] of [
    [async () => new Response('missing', { status: 404 }), /HTTP 404/],
    [async () => new Response('not json'), /有效的 JSON/],
    [async () => { throw new TypeError('Failed to fetch'); }, /CORS/],
  ]) {
    const h = harness(t, 'ctx.setState("result", 1); ctx.notify("不可显示"); await ctx.fetchJSON("/api/value");', fetch);
    await assert.rejects(h.runtime.runScript('test'), message);
    assert.equal(h.runtime.getState().result, 0);
    assert.deepEqual(h.notices, []);
    h.clean();
  }
  const h = harness(t, 'const data = await ctx.fetchJSON("/empty"); ctx.setState("result", data === null ? 1 : 0);', async () => new Response(null, { status: 204 }));
  await h.runtime.runScript('test'); assert.equal(h.runtime.getState().result, 1); h.clean();
});

test('request timeout aborts the request; reset/dispose and execution deadline discard pending results', async t => {
  for (const mode of ['timeout', 'reset', 'dispose', 'deadline']) {
    let started, finish;
    const ready = new Promise(resolve => { started = resolve; });
    let signal;
    const h = harness(t, 'const data = await ctx.fetchJSON("/slow", { timeout: 30 }); ctx.setState("result", data.value); ctx.notify("晚到的结果");', (_url, options) => {
      signal = options.signal; started();
      return new Promise((resolve, reject) => { finish = resolve; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
    });
    const pending = h.runtime.runScript('test');
    const rejected = assert.rejects(pending, mode === 'timeout' ? /30 毫秒/ : mode === 'deadline' ? /15 秒/ : /已取消/);
    await ready;
    if (mode === 'timeout') { h.fire(30); assert.equal(signal.aborted, true); }
    else if (mode === 'deadline') h.fire(15000);
    else h.runtime[mode]();
    await rejected;
    finish(Response.json({ value: 99 }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.runtime.getState().result, 0);
    assert.deepEqual(h.notices, []);
    h.clean();
  }
});

test('sleep is awaited and non-HTTP request schemes are rejected', async t => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const h = harness(t, 'await ctx.fetchJSON("/start"); await ctx.sleep(50); ctx.setState("result", 3);', async () => { entered(); return Response.json({}); });
  const pending = h.runtime.runScript('test');
  await ready; await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.runtime.getState().result, 0);
  h.fire(50); await pending; assert.equal(h.runtime.getState().result, 3); h.clean();
  const invalid = harness(t, 'await fetch("file:///private/data");');
  await assert.rejects(invalid.runtime.runScript('test'), /HTTP 或 HTTPS/); invalid.clean();
});
