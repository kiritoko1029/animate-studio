import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { CompletionContext, nextSnippetField } from '@codemirror/autocomplete';
import { javascript, javascriptLanguage, scopeCompletionSource } from '@codemirror/lang-javascript';
import { scriptCompletionSource, scriptExamples, scriptGlobals } from '../src/lib/interactions/script-assistance.ts';

const variables = [{ name: 'name', type: 'string', initial: 'Ada' }, { name: 'profile', type: 'object', initial: { email: 'ada@example.test' } }];
const scriptGlobalCompletionSource = scopeCompletionSource(scriptGlobals);
function complete(doc, values = variables) {
  const source = scriptCompletionSource(() => values);
  const state = EditorState.create({ doc, extensions: [javascript(), javascriptLanguage.data.of({ autocomplete: source }), javascriptLanguage.data.of({ autocomplete: scriptGlobalCompletionSource })] });
  return { context: new CompletionContext(state, doc.length, true), source, state };
}

test('script completion follows ctx members, current variables, nested values and quoted variable arguments', () => {
  for (const [doc, labels] of [
    ['ctx.', ['state', 'event', 'setState', 'log', 'notify', 'fetch', 'fetchJSON', 'sleep']],
    ['ctx.state.', ['name', 'profile']],
    ['ctx.state.profile.', ['email']],
    ['ctx.event.', ['value', 'type', 'blockId']],
    ['ctx.setState("na', ['name', 'profile']],
    ["ctx.state['na", ['name', 'profile']],
  ]) {
    const { context, source } = complete(doc);
    const result = source(context);
    assert.deepEqual(result.options.map(option => option.label), labels);
    assert.equal(doc.slice(result.from), doc.endsWith('na') ? 'na' : '');
  }
  const changed = complete('ctx.state.', [{ name: 'fresh', type: 'number', initial: 1 }]);
  assert.deepEqual(changed.source(changed.context).options.map(o => o.label), ['fresh']);
  for (const doc of ['// ctx.', '// ctx.setState("', 'const text = "ctx.', 'unrelated.']) {
    const { source, context } = complete(doc);
    assert.equal(source(context), null);
  }
});

test('timer names complete while typing and include callback snippets and execution guidance', () => {
  for (const [prefix, label] of [['setI', 'setInterval'], ['setT', 'setTimeout'], ['clearI', 'clearInterval'], ['clearT', 'clearTimeout']]) {
    const { source, state } = complete(prefix);
    const result = source(new CompletionContext(state, prefix.length, false));
    const option = result.options.find(item => item.label === label);
    assert.equal(result.from, 0);
    assert.equal(typeof option.apply, 'function');
    assert.match(option.detail, /^\(/);
    assert.ok(option.info);
    if (label.startsWith('set')) assert.match(option.info, /await/);
    if (label === 'setInterval') assert.match(option.info, /15 秒/);
  }
});

test('accepting timer snippets preserves the numeric delay and Tab selects the next argument', () => {
  for (const name of ['setInterval', 'setTimeout']) {
    const { state, context, source } = complete(name);
    const option = source(context).options.find(item => item.label === name);
    const editor = { state, dispatch: transaction => { editor.state = transaction.state; } };
    option.apply(editor, option, 0, name.length);
    assert.match(editor.state.doc.toString(), /}, 1000\)$/);
    const selected = () => editor.state.sliceDoc(editor.state.selection.main.from, editor.state.selection.main.to);
    assert.match(selected(), /^\/\//, 'the callback body is selected first');
    assert.equal(nextSnippetField(editor), true);
    assert.equal(selected(), '1000', 'the delay must remain editable and must not be parsed as an empty tab stop');
    assert.doesNotThrow(() => new Function(editor.state.doc.toString()));
  }
  const { state, context, source } = complete('ctx.sl');
  const option = source(context).options.find(item => item.label === 'sleep');
  const editor = { state, dispatch: transaction => { editor.state = transaction.state; } };
  option.apply(editor, option, 4, state.doc.length);
  assert.equal(editor.state.doc.toString(), 'ctx.sleep(500)');
});

test('common Worker globals and members coexist with JavaScript locals without suggesting host DOM APIs', async () => {
  const { context, state } = complete('const parsedValue = 1;\npar');
  const results = await Promise.all(state.languageDataAt('autocomplete', context.pos).map(source => source(context)));
  const labels = new Set(results.flatMap(result => result?.options.map(option => option.label) ?? []));
  for (const name of ['parsedValue', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'RegExp', 'Map', 'Set', 'AbortController', 'structuredClone']) assert.ok(labels.has(name), name);
  for (const name of ['window', 'document', 'localStorage']) assert.equal(labels.has(name), false, name);
  for (const [doc, name] of [['Math.', 'round'], ['JSON.', 'parse'], ['console.', 'log'], ['Promise.', 'all']]) {
    const { context } = complete(doc);
    assert.ok(scriptGlobalCompletionSource(context).options.some(option => option.label === name), doc);
  }
  for (const doc of ['// setI', '"setI', 'ctx.state.']) {
    const { context } = complete(doc);
    assert.equal(scriptGlobalCompletionSource(context), null);
  }
});

test('custom functions coexist with JavaScript local variable completion and provide usable snippets', async () => {
  const { context, state } = complete('const customerName = "Ada";\ncustomer');
  const results = await Promise.all(state.languageDataAt('autocomplete', context.pos).map(source => source(context)));
  assert.ok(results.some(result => result?.options.some(option => option.label === 'customerName')));
  const builtins = complete('ctx.fetch');
  const option = builtins.source(builtins.context).options.find(option => option.label === 'fetchJSON');
  assert.equal(typeof option.apply, 'function');
  assert.match(option.info, /HTTP/);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const example of scriptExamples(variables)) assert.doesNotThrow(() => new AsyncFunction('ctx', 'fetch', example.code));
  assert.equal(scriptExamples([]).find(example => example.label === '修改变量').disabled, true);
});
