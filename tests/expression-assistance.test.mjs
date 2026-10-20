import test from 'node:test';
import assert from 'node:assert/strict';
import { expressionCompletions, expressionEvent, expressionExamples, expressionSuggestions, formatExpressionValue, insertExpression, inspectExpression } from '../src/lib/interactions/expression-assistance.ts';
import { createInteractionDemo } from '../src/lib/interactions/demo.ts';

const page = createInteractionDemo();
const context = { variables: page.variables, purpose: 'text' };

test('completions insert at the cursor, retain surrounding expressions and ignore quoted text', () => {
  const suggestions = expressionSuggestions(context);
  const source = '"你好，" + state.name + "！"';
  const cursor = source.indexOf('state.name') + 'state.na'.length;
  const match = expressionCompletions(source, cursor, suggestions);
  assert.equal(match.items[0].source, 'state.name');
  assert.equal(insertExpression(source, match.from, match.to, match.items[0].source).source, source);
  assert.equal(expressionCompletions('"state.na', 9, suggestions), null);
  assert.equal(expressionCompletions('"escaped \\" state.na', 19, suggestions), null);
  const initial = expressionCompletions('state.', 6, suggestions);
  assert.equal(initial.items.length, page.variables.length);
  assert.equal(insertExpression('100 + 20', 6, 8, 'state.price').source, '100 + state.price');
});

test('suggestions include bounded nested fields and arrays but only actual event data', () => {
  const nested = { variables: [{ name: 'order', type: 'object', initial: { price: 99, rows: [{ name: 'A' }], 'display-name': '订单' } }], purpose: 'text' };
  const sources = expressionSuggestions(nested).map(s => s.source);
  assert.ok(sources.includes('state.order.rows[0].name'));
  assert.ok(sources.includes('state.order.rows.length'));
  assert.ok(sources.includes('state.order["display-name"]'));
  for (const suggestion of expressionSuggestions(nested)) {
    const result = inspectExpression(suggestion.source, nested);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, suggestion.value);
  }
  assert.ok(!expressionSuggestions(context).some(s => s.source.startsWith('event')));
  const click = { ...context, event: { type: 'click', blockId: 'button' } };
  assert.ok(!expressionSuggestions(click).some(s => s.source === 'event.value'));
  const change = { ...click, event: { ...click.event, type: 'change', value: false } };
  assert.ok(expressionSuggestions(change).some(s => s.source === 'event.value' && s.type === 'boolean'));
});

test('preview diagnoses syntax, missing references, types, invalid numbers and unavailable event values', () => {
  assert.equal(inspectExpression('state.price * state.quantity', context).value, 198);
  assert.match(inspectExpression('name', context).message, /state.name/);
  assert.equal(inspectExpression('state.price +', context).valid, false);
  assert.match(inspectExpression('你好', context).message, /文字要加英文引号/);
  assert.match(inspectExpression('Number(state.price)', context).message, /执行脚本/);
  assert.match(inspectExpression('state["missing"] || "默认值"', context).message, /找不到变量 missing/);
  assert.equal(inspectExpression('"state.missing"', context).message, '');
  assert.match(inspectExpression('1 / 0', context).message, /有效数字/);
  assert.equal(formatExpressionValue(Infinity), 'Infinity');
  assert.match(inspectExpression('"false"', { ...context, expectedTypes: ['boolean'] }).message, /需要布尔值/);
  assert.match(inspectExpression('event.value', context).message, /属性绑定没有 event/);
  assert.match(inspectExpression('event.value', { ...context, event: { type: 'click', blockId: 'button' } }).message, /点击事件没有/);
  assert.match(inspectExpression('"javascript:alert(1)"', { ...context, purpose: 'url' }).message, /链接应以/);
  // Initial-data diagnostics must not block expressions that become valid after user interaction.
  assert.equal(inspectExpression('state.name / 2', context).valid, true);
  assert.deepEqual(page.variables.find(v => v.name === 'price').initial, 99);
});

test('recommended examples use real variables and evaluate with the restricted runtime', () => {
  const contexts = [context, { ...context, purpose: 'boolean', expectedTypes: ['boolean'] }, { ...context, purpose: 'value', expectedTypes: ['number'], targetVariable: 'quantity' }, { ...context, purpose: 'url' }, { ...context, purpose: 'value', expectedTypes: ['object'], targetVariable: 'order', variables: [{ name: 'order', type: 'object', initial: {} }] }, { ...context, variables: [] }, { ...context, variables: [], purpose: 'boolean' }, { ...context, purpose: 'value', expectedTypes: ['number'], event: { type: 'change', blockId: 'input', value: '4' } }];
  for (const config of contexts) {
    const examples = expressionExamples(config);
    assert.ok(examples.length > 0);
    for (const example of examples) {
      const result = inspectExpression(example.source, config);
      assert.equal(result.valid, true, example.source);
      assert.equal(result.message, '', example.source);
    }
  }
  const input = page.blocks.find(b => b.type === 'input');
  const slider = page.blocks.find(b => b.type === 'slider');
  assert.equal(expressionEvent(input, page.variables, 'change').value, '');
  assert.equal(expressionEvent(slider, page.variables, 'change').value, 30);
  assert.equal('value' in expressionEvent(slider, page.variables, 'click'), false);
});
