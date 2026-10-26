import test from 'node:test';
import assert from 'node:assert/strict';
import { createInteractionRuntime } from '../shared/interactions.mjs';
import { validatePage } from '../server/validation.mjs';
import { createInteractionDemo } from '../src/lib/interactions/demo.ts';

function fixture(options = {}) { const page = createInteractionDemo(); return { page, runtime: createInteractionRuntime(page, options) }; }

test('expressions support typed values, paths, short circuit, comparisons and conditions without arbitrary execution', () => {
  const { runtime } = fixture();
  assert.equal(runtime.evaluate('state.price * state.quantity'), 198);
  assert.equal(runtime.evaluate('state.agreed ? "yes" : "no"'), 'no');
  assert.equal(runtime.evaluate('state.name || "访客"'), '访客');
  assert.equal(runtime.evaluate('state["progress"] >= 30 && !state.agreed'), true);
  assert.equal(runtime.evaluate('(state.quantity + 3) * 2'), 10);
  assert.equal(runtime.evaluate('event.value', { value: 48 }), 48);
  for (const source of ['window.alert(1)', 'state.name = "x"', 'state.constructor.constructor("return window")()', 'fetch("/api/page")', 'state[']) assert.throws(() => runtime.evaluate(source));
  assert.equal(runtime.evaluate('state.constructor'), undefined);
  assert.equal(runtime.evaluate('state["__proto__"]'), undefined);
});

test('route context is read-only and back uses the containing preview history', async () => {
  const { page } = fixture();
  const button = page.blocks.find(block => block.props.label === '运行脚本，计算金额');
  button.events = { click: [{ type: 'back' }] };
  let count = 0;
  const runtime = createInteractionRuntime(page, { route: { id: '42' }, onBack: () => { count++; } });
  assert.equal(runtime.evaluate('route.id'), '42');
  assert.equal(runtime.evaluate('route.constructor'), undefined);
  validatePage(page);
  await runtime.dispatch(button.id, 'click');
  assert.equal(count, 1);
});

test('two-way values update before ordered conditional actions and notify', async () => {
  const messages = [], logs = [];
  const { page } = fixture();
  const slider = page.blocks.find(b => b.type === 'slider');
  slider.events = { change: [{ type: 'condition', expression: 'state.progress >= 50', then: [{ type: 'set', variable: 'name', expression: '"完成一半"' }, { type: 'notify', expression: 'state.name' }], else: [{ type: 'notify', expression: '"继续"' }] }] };
  const runtime = createInteractionRuntime(page, { onNotify: message => messages.push(message), onLog: e => logs.push(e) });
  await runtime.dispatch(slider.id, 'change', 80);
  assert.equal(runtime.getState().progress, 80);
  assert.equal(runtime.getState().name, '完成一半');
  assert.deepEqual(messages, ['完成一半']);
  assert.ok(logs.some(e => e.level === 'event') && logs.some(e => e.level === 'state'));
  const submit = page.blocks.find(b => b.props.label === '提交');
  await runtime.dispatch(submit.id, 'click');
  assert.equal(runtime.getState().submitted, false);
  const agreement = page.blocks.find(b => b.type === 'checkbox');
  await runtime.dispatch(agreement.id, 'change', true);
  await runtime.dispatch(submit.id, 'click');
  assert.equal(runtime.getState().submitted, true);
});

test('script actions await completion, validate writes atomically and preserve following action order', async () => {
  const { page } = fixture();
  const button = page.blocks.find(b => b.events?.click?.some(a => a.type === 'script'));
  button.events.click.push({ type: 'set', variable: 'name', expression: '"金额：" + state.total' });
  let finish;
  const runtime = createInteractionRuntime(page, { runScript: () => new Promise(resolve => { finish = resolve; }) });
  const pending = runtime.dispatch(button.id, 'click');
  assert.equal(runtime.getState().name, '');
  finish({ writes: [['total', 198]], logs: ['calculated'] });
  await pending;
  assert.equal(runtime.getState().total, 198);
  assert.equal(runtime.getState().name, '金额：198');
  const errors = [];
  const invalid = createInteractionRuntime(page, { onLog: e => errors.push(e), runScript: async () => ({ writes: [['total', 100], ['missing', 200]], logs: [] }) });
  await invalid.dispatch(button.id, 'click');
  assert.equal(invalid.getState().total, 0, 'a failed batch cannot partially write page data');
  assert.equal(invalid.getState().name, '');
  assert.ok(errors.some(e => e.level === 'error' && /missing/.test(e.message)));
});

test('reset and disposal discard stale async script results; separate runtimes stay isolated', async () => {
  const { page } = fixture();
  let finish;
  const runtime = createInteractionRuntime(page, { runScript: () => new Promise(resolve => { finish = resolve; }) });
  const second = createInteractionRuntime(page);
  runtime.setState('name', '修改后');
  assert.equal(second.getState().name, '');
  const pending = runtime.runScript('calculate-total');
  runtime.reset();
  finish({ writes: [['total', 198]], logs: [] });
  await pending;
  assert.equal(runtime.getState().total, 0);
  assert.equal(runtime.getState().name, '');
  const disposed = runtime.runScript('calculate-total');
  runtime.dispose(); finish({ writes: [['total', 198]], logs: [] }); await disposed;
  assert.equal(runtime.getState().total, 0);
});

test('validation accepts old documents and interaction configurations, rejects invalid references, values and executable bindings', () => {
  const page = createInteractionDemo();
  assert.deepEqual(validatePage(structuredClone(page)), page);
  for (const mutate of [
    p => { p.variables.push({ ...p.variables[0] }); },
    p => { p.variables[0].name = 'constructor'; },
    p => { p.variables[0].initial = 42; },
    p => { p.variables[1].initial = Infinity; },
    p => { p.variables[0] = { name: 'nested', type: 'object', initial: JSON.parse('{"__proto__":{}}') }; },
    p => { p.blocks[2].bindings.value.value = 'missing'; },
    p => { p.blocks[2].bindings.value = { kind: 'expression', value: 'window.alert(1)' }; },
    p => { p.blocks[2].events = { invalid: [] }; },
    p => { p.blocks[2].events = { click: [{ type: 'script', scriptId: 'missing' }] }; },
    p => { p.blocks[2].events = { click: [{ type: 'toggle', variable: 'name' }] }; },
  ]) { const copy = structuredClone(page); mutate(copy); assert.throws(() => validatePage(copy)); }
  const old = structuredClone(page); delete old.variables; delete old.scripts; old.blocks = old.blocks.map(({bindings, events, ...block}) => block);
  assert.doesNotThrow(() => validatePage(old));
});

test('variable references track bindings, bracket expressions and nested actions without matching configuration keys', async () => {
  const { variableIsUsed } = await import('../shared/interaction-schema.mjs');
  const page = createInteractionDemo();
  assert.equal(variableIsUsed(page, 'type'), false);
  assert.equal(variableIsUsed(page, 'progress'), true);
  assert.equal(variableIsUsed(page, 'total'), true);
  page.blocks[0].bindings = { title: { kind: 'expression', value: 'state["customer"]["name"]' } };
  assert.equal(variableIsUsed(page, 'customer'), true);
  assert.equal(variableIsUsed({ ...page, scripts: [], blocks: [page.blocks[0]] }, 'name'), false);
});
