import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createInteractionRuntime } from '../shared/interactions.mjs';
import { createDocument, toFreeDocument } from '../src/model.ts';
import { variableStorageKey } from '../src/lib/interactions/persistence.ts';
import { validatePage } from '../server/validation.mjs';

function fixture() {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const page = { ...createDocument(true), variables: [
    { name: 'text', type: 'string', initial: 'initial' },
    { name: 'count', type: 'number', initial: 1 },
    { name: 'checked', type: 'boolean', initial: true },
    { name: 'object', type: 'object', initial: {} },
    { name: 'array', type: 'array', initial: [] },
    { name: 'temporary', type: 'string', initial: '', persistent: false },
  ] };
  function runtime(config = page, options = {}, browser = { localStorage: storage }) {
    return vm.runInNewContext(`(${createInteractionRuntime.toString()})(config, options)`, {
      config, options: { storageKey: variableStorageKey(config), ...options }, window: browser,
    });
  }
  return { page, storage, values, runtime, key: variableStorageKey(page) };
}
const plainState = runtime => JSON.parse(JSON.stringify(runtime.getState()));

test('all variable types and falsy values survive reopening without modifying initial values', () => {
  const f = fixture(), first = f.runtime();
  first.activate();
  const updates = { text: '', count: 0, checked: false, object: { nested: [1, '你好', null] }, array: [false, { id: 2 }], temporary: 'session only' };
  for (const [name, value] of Object.entries(updates)) first.setState(name, value);
  first.dispose();
  const reopened = f.runtime();
  assert.equal(reopened.getState().text, 'initial', 'constructing a runtime must not access browser storage');
  reopened.activate();
  assert.deepEqual(plainState(reopened), { ...updates, temporary: '' });
  assert.equal(f.page.variables[0].initial, 'initial');
  assert.equal(JSON.parse(f.storage.getItem(f.key)).variables.temporary, undefined);
  assert.equal(plainState(f.runtime()).count, 1, 'expression/validation runtimes stay at the initial values');
});

test('page identity and preview/published scopes keep browser values separate', () => {
  const f = fixture(), first = f.runtime(); first.activate(); first.setState('count', 7);
  const renamed = f.runtime({ ...f.page, name: 'renamed', blocks: [{ id: 'added', type: 'text', props: {} }] });
  renamed.activate(); assert.equal(renamed.getState().count, 7);
  const other = f.runtime({ ...f.page, id: createDocument(true).id });
  other.activate(); assert.equal(other.getState().count, 1);
  const published = f.runtime(f.page, { storageKey: variableStorageKey(f.page, 'published') });
  published.activate(); assert.equal(published.getState().count, 1);
});

test('reset clears persisted state and disposed runtimes cannot overwrite it', () => {
  const f = fixture(), first = f.runtime(); first.activate(); first.setState('count', 8);
  first.reset(); assert.equal(f.storage.getItem(f.key), null);
  first.dispose(); first.setState('count', 9); first.reset();
  const next = f.runtime(); next.activate(); assert.equal(next.getState().count, 1);
  next.setState('count', 4); first.reset();
  const again = f.runtime(); again.activate(); assert.equal(again.getState().count, 4);
});

test('changed defaults/types, deleted variables and opt-outs discard only affected cache entries', () => {
  const f = fixture(), first = f.runtime(); first.activate();
  for (const [name, value] of Object.entries({ text: 'saved', count: 5, checked: false, object: { saved: true }, array: [1] })) first.setState(name, value);
  const nextPage = { ...f.page, variables: f.page.variables.filter(v => v.name !== 'object').map(v =>
    v.name === 'text' ? { ...v, initial: 'new default' } : v.name === 'count' ? { ...v, type: 'string', initial: '1' } : v.name === 'array' ? { ...v, persistent: false } : v) };
  const next = f.runtime(nextPage); next.activate();
  assert.deepEqual(plainState(next), { text: 'new default', count: '1', checked: false, array: [], temporary: '' });
  assert.deepEqual(Object.keys(JSON.parse(f.storage.getItem(f.key)).variables), ['checked']);
  const restored = f.runtime(f.page); restored.activate();
  assert.deepEqual(plainState(restored).array, [], 're-enabling persistence must not resurrect the discarded value');
});

test('damaged, wrong-type and unsafe cached values fall back without discarding valid variables', () => {
  const f = fixture();
  for (const raw of ['{broken', 'null', '[]', '{"version":99,"variables":{}}']) {
    f.storage.setItem(f.key, raw);
    const runtime = f.runtime(); assert.doesNotThrow(() => runtime.activate());
    assert.equal(runtime.getState().count, 1);
  }
  const first = f.runtime(); first.activate(); first.setState('count', 8); first.setState('text', 'valid'); first.setState('object', {});
  const record = JSON.parse(f.storage.getItem(f.key));
  record.variables.count.value = 'wrong type';
  record.variables.object.value = JSON.parse('{"__proto__":{"bad":true}}');
  f.storage.setItem(f.key, JSON.stringify(record));
  const next = f.runtime(); next.activate();
  assert.equal(next.getState().text, 'valid'); assert.equal(next.getState().count, 1);
  assert.deepEqual(plainState(next).object, {});
});

test('unavailable storage and quota errors preserve interactive state with a single diagnostic', () => {
  for (const browser of [
    { get localStorage() { throw new Error('SecurityError'); } },
    { localStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} } },
  ]) {
    const f = fixture(), logs = [], states = [];
    const runtime = f.runtime(f.page, { onLog: entry => logs.push(entry), onState: state => states.push(state) }, browser);
    assert.doesNotThrow(() => { runtime.activate(); runtime.setState('count', 2); runtime.setState('count', 3); });
    assert.equal(runtime.getState().count, 3); assert.equal(states.at(-1).count, 3);
    assert.equal(logs.filter(entry => entry.level === 'warning').length, 1);
  }
});

test('independent previews merge writes without replacing other saved variables', () => {
  const f = fixture(), one = f.runtime(), two = f.runtime(); one.activate(); two.activate();
  one.setState('text', 'first'); two.setState('count', 9);
  const next = f.runtime(); next.activate();
  assert.equal(next.getState().text, 'first'); assert.equal(next.getState().count, 9);
});

test('bound controls, actions and successful scripts persist; rejected scripts cannot partially persist', async () => {
  const f = fixture();
  f.page.blocks = [{ id: 'input', type: 'input', bindings: { value: { kind: 'variable', value: 'text' } }, events: { change: [{ type: 'set', variable: 'count', expression: 'state.count + 1' }] } }];
  f.page.scripts = [{ id: 'script', name: 'script', code: '' }];
  const runtime = f.runtime(f.page, { runScript: async () => ({ writes: [['checked', false], ['object', { done: true }]], logs: [] }) });
  runtime.activate(); await runtime.dispatch('input', 'change', 'typed'); await runtime.runScript('script');
  const bad = f.runtime(f.page, { runScript: async () => ({ writes: [['count', 100], ['missing', 0]], logs: [] }) });
  bad.activate(); await assert.rejects(bad.runScript('script'), /missing/);
  const next = f.runtime(); next.activate();
  assert.equal(next.getState().text, 'typed'); assert.equal(next.getState().count, 2);
  assert.equal(next.getState().checked, false); assert.deepEqual(plainState(next).object, { done: true });
});

test('page and variable persistence metadata round-trip while legacy documents remain valid', () => {
  const f = fixture();
  assert.deepEqual(validatePage(JSON.parse(JSON.stringify(f.page))), f.page);
  const legacy = structuredClone(f.page); delete legacy.id;
  assert.doesNotThrow(() => validatePage(legacy));
  const migrated = toFreeDocument(legacy);
  assert.ok(migrated.id); assert.equal(toFreeDocument(migrated).id, migrated.id);
  assert.notEqual(createDocument(true).id, createDocument(true).id);
  for (const id of ['', 2, '../page']) assert.throws(() => validatePage({ ...f.page, id }));
  for (const persistent of ['true', null, 1]) assert.throws(() => validatePage({ ...f.page, variables: [{ ...f.page.variables[0], persistent }] }));
});
