import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createAutosave } from '../src/lib/autosave.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test('undo to saved A during an in-flight B writes A after B completes', async () => {
  const requests = [];
  const states = [];
  const autosave = createAutosave({
    initialSaved: { name: 'A' },
    delay: 5,
    onState: state => states.push(state),
    write: value => { const request = { value, ...deferred() }; requests.push(request); return request.promise; },
  });
  autosave.schedule({ name: 'B' });
  const flushed = autosave.flush();
  await Promise.resolve();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].value, { name: 'B' });
  autosave.schedule({ name: 'A' });
  assert.equal(autosave.isDirty(), true, 'an older in-flight write can still replace saved A');
  assert.equal(requests.length, 1, 'only one request may be in flight');
  requests[0].resolve();
  await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].value, { name: 'A' });
  requests[1].resolve();
  await flushed;
  assert.equal(autosave.isDirty(), false);
  assert.equal(states.at(-1), 'saved');
  autosave.dispose();
});

test('rapid edits debounce into one latest snapshot and do not keep caller mutations', async () => {
  const writes = [];
  const autosave = createAutosave({ delay: 5, onState: () => {}, write: async value => { writes.push(value); } });
  const document = { name: 'latest', nested: { value: 3 } };
  autosave.schedule({ name: 'one' });
  autosave.schedule({ name: 'two' });
  autosave.schedule(document);
  document.nested.value = 99;
  await delay(25);
  assert.deepEqual(writes, [{ name: 'latest', nested: { value: 3 } }]);
  assert.equal(autosave.isDirty(), false);
  autosave.dispose();
});

test('edits during a request coalesce to the latest desired document', async () => {
  const first = deferred();
  const writes = [];
  let active = 0;
  let maxActive = 0;
  const autosave = createAutosave({ initialSaved: 'A', onState: () => {}, write: async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    writes.push(value);
    if (value === 'B') await first.promise;
    active -= 1;
  } });
  autosave.schedule('B');
  const flushed = autosave.flush();
  await Promise.resolve();
  autosave.schedule('C');
  autosave.schedule('D');
  first.resolve();
  await flushed;
  assert.deepEqual(writes, ['B', 'D']);
  assert.equal(maxActive, 1);
  assert.equal(autosave.isDirty(), false);
  autosave.dispose();
});

test('a failed save preserves the draft and a later flush retries it', async () => {
  const failure = new Error('simulated network failure');
  const writes = [];
  const states = [];
  const autosave = createAutosave({ initialSaved: 'A', onState: (state, error) => states.push({ state, error }), write: async value => {
    writes.push(value);
    if (writes.length === 1) throw failure;
  } });
  autosave.schedule('B');
  await autosave.flush();
  assert.equal(autosave.isDirty(), true);
  assert.deepEqual(states.at(-1), { state: 'error', error: failure });
  await autosave.flush();
  assert.deepEqual(writes, ['B', 'B']);
  assert.equal(autosave.isDirty(), false);
  assert.equal(states.at(-1).state, 'saved');
  autosave.dispose();
});

test('failure after undo remains dirty because the server may have committed the rejected request', async () => {
  const pending = deferred();
  const writes = [];
  const autosave = createAutosave({ initialSaved: 'A', onState: () => {}, write: value => {
    writes.push(value);
    return writes.length === 1 ? pending.promise : Promise.resolve();
  } });
  autosave.schedule('B');
  const flushed = autosave.flush();
  await Promise.resolve();
  autosave.schedule('A');
  pending.reject(new Error('response lost'));
  await flushed;
  assert.equal(autosave.isDirty(), true);
  await autosave.flush();
  assert.deepEqual(writes, ['B', 'A']);
  assert.equal(autosave.isDirty(), false);
  autosave.dispose();
});

test('undo before debounce completes skips an unnecessary write', async () => {
  const writes = [];
  const autosave = createAutosave({ initialSaved: 'A', delay: 5, onState: () => {}, write: async value => { writes.push(value); } });
  autosave.schedule('B');
  autosave.schedule('A');
  await delay(20);
  assert.deepEqual(writes, []);
  assert.equal(autosave.isDirty(), false);
  autosave.dispose();
});

test('dispose cancels a pending debounce and ignores future schedules and flushes', async () => {
  const writes = [];
  const states = [];
  const autosave = createAutosave({ delay: 5, onState: state => states.push(state), write: async value => { writes.push(value); } });
  autosave.schedule('B');
  autosave.dispose();
  autosave.schedule('C');
  await autosave.flush();
  await delay(20);
  assert.deepEqual(writes, []);
  assert.deepEqual(states, ['pending']);
});

test('dispose during a request suppresses callbacks and does not start the queued draft', async () => {
  const pending = deferred();
  const writes = [];
  const states = [];
  const autosave = createAutosave({ onState: state => states.push(state), write: value => { writes.push(value); return pending.promise; } });
  autosave.schedule('A');
  const flushed = autosave.flush();
  await Promise.resolve();
  autosave.schedule('B');
  autosave.dispose();
  const statesBeforeCompletion = [...states];
  pending.resolve();
  await flushed;
  assert.deepEqual(writes, ['A']);
  assert.deepEqual(states, statesBeforeCompletion);
});
