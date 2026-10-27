import { createInteractionRuntime } from '../../../shared/interactions.mjs';
import type { Block } from '../../model';
import type { JsonValue, Variable } from './types';

export type ExpressionContext = {
  variables: Variable[];
  purpose: 'text' | 'value' | 'boolean' | 'url';
  expectedTypes?: string[];
  targetVariable?: string;
  event?: { type: 'click' | 'change'; blockId: string; value?: JsonValue };
};
export type ExpressionSuggestion = { source: string; type: string; value: unknown };
export const expressionTypeLabels: Record<string, string> = { string: '文本', number: '数字', boolean: '布尔值', object: '对象', array: '数组', null: '空值', undefined: '无值' };
const valueType = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
export function formatExpressionValue(value: unknown) {
  const text = value === undefined ? '无值' : typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value);
  return text.length > 160 ? text.slice(0, 157) + '…' : text;
}

export function expressionEvent(block: Block, variables: Variable[], type: 'click' | 'change'): ExpressionContext['event'] {
  if (type === 'click') return { type, blockId: block.id };
  if (block.type === 'chart') return { type, blockId: block.id, value: { category: '分类', series: '指标', value: 0 } };
  const checked = ['checkbox', 'switch'].includes(block.type);
  const textual = ['input', 'textarea', 'select'].includes(block.type);
  const fallback = checked ? block.props.checked ?? false : textual ? '' : block.props.value ?? (block.type === 'pagination' ? 1 : 0);
  const runtime = createInteractionRuntime({ blocks: [], variables });
  const value = runtime.read(block.bindings?.[checked ? 'checked' : 'value'], fallback);
  return { type, blockId: block.id, value: textual ? String(value) : checked ? Boolean(value) : Number(value) };
}

export function expressionSuggestions(context: ExpressionContext): ExpressionSuggestion[] {
  const result: ExpressionSuggestion[] = [];
  function add(source: string, value: unknown, depth = 0) {
    result.push({ source, value, type: valueType(value) });
    if (depth >= 3 || value === null || typeof value !== 'object') return;
    // Bound expansion of large user-provided objects; every top-level variable remains available.
    for (const [key, item] of Object.entries(value).slice(0, 12)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
      const suffix = Array.isArray(value) ? `[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
      if (result.length < 250) add(source + suffix, item, depth + 1);
    }
    if (Array.isArray(value)) result.push({ source: `${source}.length`, value: value.length, type: 'number' });
  }
  for (const variable of context.variables) add(`state.${variable.name}`, variable.initial);
  if (context.event) {
    if (context.event.type === 'change') add('event.value', context.event.value);
    add('event.type', context.event.type);
    add('event.blockId', context.event.blockId);
  }
  return result;
}

export function expressionCompletions(source: string, cursor: number, suggestions: ExpressionSuggestion[]) {
  const before = source.slice(0, cursor);
  // Ignore words inside string literals, including escaped quotes.
  let quote = '', escaped = false;
  for (const char of before) {
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (quote ? char === quote : char === '"' || char === "'") quote = quote ? '' : char;
  }
  if (quote) return null;
  const token = before.match(/[A-Za-z_$][\w$]*(?:\.[\w$]*|\[\d+\])*$/)?.[0];
  if (!token) return null;
  const matches = suggestions.filter(item => item.source.startsWith(token) && item.source !== token);
  if (!matches.length) return null;
  return { from: cursor - token.length, to: cursor + (source.slice(cursor).match(/^[\w$]*/)?.[0].length ?? 0), items: matches };
}

export function insertExpression(source: string, from: number, to: number, text: string) {
  return { source: source.slice(0, from) + text + source.slice(to), cursor: from + text.length };
}

export function expressionExamples(context: ExpressionContext) {
  const examples: { label: string; source: string }[] = [];
  const add = (label: string, source: string) => examples.push({ label, source });
  const variables = context.variables;
  const boolean = variables.find(v => v.type === 'boolean');
  const number = variables.find(v => v.type === 'number');
  const string = variables.find(v => v.type === 'string');
  const target = variables.find(v => v.name === context.targetVariable);
  if (context.purpose === 'boolean') {
    if (boolean) { add('开关开启时成立', `state.${boolean.name}`); add('开关关闭时成立', `!state.${boolean.name}`); }
    if (number) add('数字达到门槛', `state.${number.name} >= 50`);
    if (string) add('文字不为空', `state.${string.name} !== ""`);
    add('始终成立', 'true');
  } else if (context.purpose === 'url') {
    add('跳到页面内锚点', '"#details"');
    add('跳到站内页面', '"/about"');
    add('跳到外部网站', '"https://example.com"');
  } else if (context.purpose === 'text') {
    add('显示固定文字', '"你好"');
    if (string) { add('文字与变量拼接', `"你好，" + state.${string.name}`); add('为空时显示默认文字', `state.${string.name} || "访客"`); }
    if (number) add('数字后加单位', `state.${number.name} + "%"`);
    if (boolean) add('按条件显示两种文字', `state.${boolean.name} ? "已开启" : "未开启"`);
  } else {
    if (target) add('保留当前值', `state.${target.name}`);
    const numeric = target?.type === 'number' ? target : number;
    if (context.expectedTypes?.includes('number')) {
      if (numeric) add('在原值上加 1', `state.${numeric.name} + 1`);
      const other = variables.find(v => v.type === 'number' && v !== numeric);
      if (numeric && other) add('两个数字相乘', `state.${numeric.name} * state.${other.name}`);
      add('设置固定数字', '100');
    }
    if (context.expectedTypes?.includes('string')) add('设置固定文字', '"你好"');
  }
  if (context.event?.type === 'change') {
    const type = valueType(context.event.value);
    if (!context.expectedTypes || context.expectedTypes.includes(type)) add('使用这次输入的新值', 'event.value');
    else if (type === 'string' && context.expectedTypes.includes('number')) add('把输入的新值转为数字', '+event.value');
  }
  return examples;
}

export function inspectExpression(source: string, context: ExpressionContext) {
  const runtime = createInteractionRuntime({ variables: context.variables, blocks: [] });
  let tree: unknown;
  try { tree = runtime.validateExpression(source); }
  catch (error) {
    const original = error instanceof Error ? error.message : '表达式格式不正确';
    const name = context.variables.find(v => v.name === source.trim());
    const message = !source.trim() ? '先插入一个变量，或选择下方示例。'
      : name ? `读取变量要写 state.${name.name}。`
      : /[（）“”‘’]/.test(source) ? '请使用英文括号 () 和英文引号 "。'
      : /函数调用|赋值/.test(original) || /[\w.]\s*\(/.test(source) ? '这里不能调用函数或赋值；复杂计算请在事件动作中选择“执行脚本”。'
      : /仅支持/.test(original) || /[\u4e00-\u9fff]/.test(source) ? '文字要加英文引号，例如 "你好"；变量要写成 state.变量名。'
      : original === '属性名无效' ? '请在 state. 或 event. 后选择属性，补全变量名称。'
      : original === '表达式不完整' ? '还没写完：请补上运算符后面的值。'
      : original;
    return { valid: false, message, value: undefined, type: 'undefined' };
  }
  const warnings: string[] = [];
  function visit(node: unknown) {
    if (!Array.isArray(node)) return;
    if (node[0] === 'get' && node[1]?.[0] === 'root' && node[2]?.[0] === 'literal') {
      const root = node[1][1], key = String(node[2][1]);
      if (root === 'state' && !context.variables.some(v => v.name === key)) warnings.push(`找不到变量 ${key}，请检查拼写或在“数据与脚本”中添加。`);
      if (root === 'event' && context.event?.type === 'click' && key === 'value') warnings.push('点击事件没有 event.value；请读取页面变量，或使用“值变化时”事件。');
    }
    if (node[0] === 'root' && node[1] === 'event' && !context.event) warnings.push('属性绑定没有 event 数据；请使用 state.变量，或在事件动作中读取 event。');
    node.slice(1).forEach(visit);
  }
  visit(tree);
  try {
    const value = runtime.evaluate(source, context.event);
    const type = valueType(value);
    if (value === undefined) warnings.push('当前没有计算结果，请检查变量名、对象属性或数组索引。');
    else if (type === 'number' && !Number.isFinite(value)) warnings.push('计算结果不是有效数字，请检查是否除以 0 或把文字用于计算。');
    else if (context.expectedTypes && !context.expectedTypes.includes(type)) warnings.push(`这里需要${context.expectedTypes.map(t => expressionTypeLabels[t] ?? t).join('或')}，当前结果是${expressionTypeLabels[type] ?? type}。`);
    if (context.purpose === 'url' && (typeof value !== 'string' || !/^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(value) || /[\s\\\u0000-\u001f]/.test(value))) warnings.push('链接应以 https://、/、#、mailto: 或 tel: 开头，且不含空格。');
    return { valid: true, message: warnings[0] ?? '', value, type };
  } catch {
    return { valid: true, message: warnings[0] ?? '当前初始数据无法计算此表达式，请检查参与计算的值。', value: undefined, type: 'undefined' };
  }
}
