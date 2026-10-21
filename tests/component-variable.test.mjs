import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument, componentTypes } from '../src/model.ts';
import { createComponentVariable, preferredBindingKey, suggestComponentVariable } from '../src/lib/interactions/component-variable.ts';
import { bindingKeys, validateInteractions } from '../shared/interaction-schema.mjs';
import { createInteractionRuntime } from '../shared/interactions.mjs';

test('every component offers valid variable defaults for each supported property', () => {
  for (const type of componentTypes) {
    const block = createBlock(type), page = { ...createDocument(), blocks: [block] };
    assert.ok(bindingKeys(block).includes(preferredBindingKey(block)), type);
    for (const key of bindingKeys(block)) {
      const variable = suggestComponentVariable(page, block, key);
      assert.doesNotThrow(() => validateInteractions(createComponentVariable(page, block.id, key, variable)), `${type}.${key}`);
    }
  }
});

test('suggestions preserve text, numeric and boolean values and generate unique names', () => {
  const page = createDocument();
  const slider = createBlock('slider');
  assert.deepEqual(suggestComponentVariable(page, slider, preferredBindingKey(slider)), { name: 'slider_value', type: 'number', initial: 60 });
  const checkbox = createBlock('checkbox'); checkbox.props.checked = true;
  assert.deepEqual(suggestComponentVariable(page, checkbox, preferredBindingKey(checkbox)), { name: 'checkbox_checked', type: 'boolean', initial: true });
  const input = createBlock('input');
  assert.equal(suggestComponentVariable(page, input, 'value').initial, '', 'placeholder is not an input value');
  assert.equal(suggestComponentVariable(page, input, 'visible').initial, true);
  assert.equal(suggestComponentVariable(page, input, 'disabled').initial, false);
  const card = createBlock('card');
  page.variables = [{ name: 'card_title', type: 'string', initial: '旧标题' }, { name: 'card_title_2', type: 'string', initial: '' }];
  card.bindings = { title: { kind: 'variable', value: 'card_title' } };
  assert.deepEqual(suggestComponentVariable(page, card, 'title'), { name: 'card_title_3', type: 'string', initial: '旧标题' });
  card.bindings.title = { kind: 'expression', value: 'state.card_title + "！"' };
  assert.equal(suggestComponentVariable(page, card, 'title').initial, '旧标题！');
});

test('creating a variable is atomic, retains other bindings and drives two-way runtime updates', async () => {
  const slider = createBlock('slider');
  slider.bindings = { visible: { kind: 'expression', value: 'true' } };
  const page = { ...createDocument(), blocks: [slider] }, before = structuredClone(page);
  const variable = suggestComponentVariable(page, slider, 'value');
  const next = createComponentVariable(page, slider.id, 'value', variable);
  assert.deepEqual(page, before, 'the undo snapshot stays untouched');
  assert.equal(next.variables.length, 1);
  assert.deepEqual(next.blocks[0].bindings, { ...slider.bindings, value: { kind: 'variable', value: 'slider_value' } });
  const runtime = createInteractionRuntime(next);
  assert.equal(runtime.read(next.blocks[0].bindings.value, 0), 60);
  await runtime.dispatch(slider.id, 'change', 84);
  assert.equal(runtime.getState().slider_value, 84);
});

test('invalid creation never changes the page and replacing a binding preserves the old variable', () => {
  const block = createBlock('switch'), page = { ...createDocument(), blocks: [block], variables: [{ name: 'enabled', type: 'boolean', initial: true }] };
  block.bindings = { checked: { kind: 'variable', value: 'enabled' } };
  const before = structuredClone(page), variable = suggestComponentVariable(page, block, 'checked');
  const reject = (fn, pattern) => { assert.throws(fn, pattern); assert.deepEqual(page, before); };
  for (const name of ['enabled', 'constructor', 'prototype', '中文', '1name', 'a'.repeat(41)]) reject(() => createComponentVariable(page, block.id, 'checked', { ...variable, name }), /变量名/);
  reject(() => createComponentVariable(page, 'missing', 'checked', variable), /不存在/);
  reject(() => createComponentVariable(page, block.id, 'value', variable), /不支持/);
  reject(() => createComponentVariable(page, block.id, 'checked', { ...variable, type: 'number', initial: 1 }), /不匹配/);
  reject(() => createComponentVariable(page, block.id, 'checked', { ...variable, initial: 'true' }), /布尔|boolean/);
  const full = { ...page, variables: Array.from({ length: 50 }, (_, i) => ({ name: `flag${i}`, type: 'boolean', initial: false })) };
  assert.throws(() => createComponentVariable(full, block.id, 'checked', variable), /50/);
  const next = createComponentVariable(page, block.id, 'checked', variable);
  assert.deepEqual(next.variables[0], page.variables[0]);
  assert.equal(next.blocks[0].bindings.checked.value, variable.name);
});
