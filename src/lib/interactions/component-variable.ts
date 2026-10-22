import { bindingKeys, bindingVariableTypes, validateInteractions } from '../../../shared/interaction-schema.mjs';
import { createInteractionRuntime } from '../../../shared/interactions.mjs';
import type { Block, PageDocument } from '../../model';
import type { Bindings, JsonValue, Variable } from './types';

export type BindingKey = keyof Bindings;
export const variableDefaults: Record<Variable['type'], JsonValue> = { string: '', number: 0, boolean: false, object: {}, array: [] };

export function preferredBindingKey(block: Block): BindingKey {
  const keys = bindingKeys(block);
  return (['value', 'checked', 'title', 'label', 'text', 'visible'] as const).find(key => keys.includes(key))!;
}

function fixedValue(block: Block, key: BindingKey): JsonValue {
  if (key === 'visible') return true;
  if (key === 'disabled') return false;
  if (key === 'checked') return block.props.checked ?? block.type === 'sidebar';
  if (key !== 'value') return block.props[key] ?? '';
  if (bindingVariableTypes(block,key)[0] === 'array') return block.type === 'slider' ? (block.props.motion?.['Slider.value'] ?? block.props.motion?.['Slider.defaultValue'] ?? []) as JsonValue : [];
  if (bindingVariableTypes(block, key).includes('string')) return '';
  if (block.type === 'motionGrid') return -1;
  if (block.type === 'accordion') return block.props.items?.trim() ? 0 : -1;
  if (['radio', 'tabs', 'questionnaire'].includes(block.type)) return 0;
  const defaults: Record<string, number> = { slider: 60, progress: 72, rating: 4, pagination: 1 };
  const value = block.props.value ?? defaults[block.type] ?? 0;
  if (['slider', 'progress', 'rating', 'pagination'].includes(block.type)) {
    const max = block.type === 'rating' ? 5 : Math.max(1, block.props.max ?? (block.type === 'pagination' ? 5 : 100));
    return Math.min(max, Math.max(block.type === 'pagination' ? 1 : 0, ['rating', 'pagination'].includes(block.type) ? Math.round(value) : value));
  }
  return value;
}

export function suggestComponentVariable(page: PageDocument, block: Block, key: BindingKey): Variable {
  const base = `${block.type}_${key}`;
  let name = base, suffix = 2;
  while (page.variables?.some(variable => variable.name === name)) name = `${base}_${suffix++}`;
  const fallback = fixedValue(block, key);
  const value: JsonValue = createInteractionRuntime({ variables: page.variables, blocks: [] }).read(block.bindings?.[key], fallback);
  const type = (Array.isArray(value) ? 'array' : value === null ? 'object' : typeof value) as Variable['type'];
  if (Object.hasOwn(variableDefaults, type) && bindingVariableTypes(block, key).includes(type) && (typeof value !== 'number' || Number.isFinite(value)) && value !== null) {
    return { name, type, initial: value };
  }
  return { name, type: (Array.isArray(fallback) ? 'array' : typeof fallback) as Variable['type'], initial: fallback };
}

/** Create and bind in one document update so undo never leaves a dangling reference. */
export function createComponentVariable(page: PageDocument, blockId: string, key: BindingKey, variable: Variable): PageDocument {
  const block = page.blocks.find(item => item.id === blockId);
  if (!block) throw new Error('组件已不存在，请重新选择组件。');
  if (!bindingKeys(block).includes(key)) throw new Error('此组件不支持绑定该属性。');
  if ((page.variables?.length ?? 0) >= 50) throw new Error('每个页面最多支持 50 个变量。');
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(variable.name) || ['constructor', 'prototype'].includes(variable.name)) throw new Error('变量名须以英文字母开头，只能包含字母、数字和下划线，最长 40 字符。');
  if (page.variables?.some(item => item.name === variable.name)) throw new Error('变量名已存在，请换一个名称。');
  if (!bindingVariableTypes(block, key).includes(variable.type)) throw new Error('变量类型与目标属性不匹配。');
  const next: PageDocument = {
    ...page,
    variables: [...page.variables ?? [], variable],
    blocks: page.blocks.map(item => item.id === blockId ? { ...item, bindings: { ...item.bindings, [key]: { kind: 'variable', value: variable.name } } } : item),
  };
  validateInteractions(next);
  return next;
}
