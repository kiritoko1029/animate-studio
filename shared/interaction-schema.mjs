import { createInteractionRuntime } from './interactions.mjs';
export const bindingLabels = { title: '标题', text: '文字 / 描述', label: '标签', value: '当前值', checked: '选中状态', visible: '显示条件', disabled: '禁用条件' };
export const valueTypes = ['input', 'textarea', 'select', 'radio', 'slider', 'tabs', 'accordion', 'pagination', 'rating', 'combobox', 'inputOtp', 'toggleGroup', 'questionnaire', 'motionGrid', 'countingNumber', 'scrollingNumber', 'slidingNumber'];
export function bindingKeys(block) {
  return [...['title', 'text', 'label'].filter(key => block.props[key] !== undefined), ...(valueTypes.includes(block.type) || block.type === 'progress' ? ['value'] : []), ...(['checkbox', 'switch', 'toggle', 'iconButton', 'collapsible', 'sidebar'].includes(block.type) ? ['checked'] : []), 'visible', 'disabled'];
}
export function bindingVariableTypes(block, key) {
  if (['visible', 'disabled', 'checked'].includes(key)) return ['boolean'];
  if (key === 'value' && (block.type === 'toggleGroup' && block.props.motion?.['ToggleGroup.type'] === 'multiple' || block.type === 'accordion' && block.props.motion?.['Accordion.type'] === 'multiple' || block.type === 'combobox' && block.props.motion?.['Combobox.multiple'] === true || block.type === 'slider' && (Array.isArray(block.props.motion?.['Slider.value']) || Array.isArray(block.props.motion?.['Slider.defaultValue'])))) return ['array'];
  if (key === 'value') return block.type === 'input' ? ['string', 'number'] : ['textarea', 'select', 'combobox', 'inputOtp'].includes(block.type) ? ['string'] : ['number'];
  return ['string', 'number', 'boolean', 'object', 'array'];
}
export function eventNames(type) { return ['click', ...(valueTypes.includes(type) || ['chart', 'checkbox', 'switch', 'toggle', 'iconButton', 'collapsible', 'sidebar'].includes(type) ? ['change'] : [])]; }
export function validateInteractions(page) {
  const fail = message => { throw new Error(message); };
  const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const keys = (value, allowed, required = allowed) => {
    if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('联动配置字段无效');
  };
  const text = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('联动配置文字无效'); };
  const variables = page.variables ?? [], scripts = page.scripts ?? [];
  if (!Array.isArray(variables) || variables.length > 50 || !Array.isArray(scripts) || scripts.length > 30) fail('最多 50 个变量、30 个脚本');
  const names = new Set(), ids = new Set();
  for (const v of variables) {
    keys(v, ['name', 'type', 'initial', 'persistent'], ['name', 'type', 'initial']);
    if (Object.hasOwn(v, 'persistent') && typeof v.persistent !== 'boolean') fail('变量持久化设置必须为布尔值');
    if (typeof v.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(v.name) || ['constructor', 'prototype', '__proto__'].includes(v.name) || names.has(v.name)) fail('变量名须为唯一的英文名称，以字母开头');
    names.add(v.name);
    if (!['string', 'number', 'boolean', 'object', 'array'].includes(v.type)) fail('变量类型无效');
  }
  const runtime = createInteractionRuntime({ variables, scripts, blocks: [] });
  for (const v of variables) runtime.setState(v.name, v.initial);
  for (const script of scripts) {
    keys(script, ['id', 'name', 'code']); text(script.id, 100); text(script.name, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(script.id) || ids.has(script.id)) fail('脚本 ID 无效或重复');
    ids.add(script.id);
    if (typeof script.code !== 'string' || script.code.length > 20000) fail('脚本最多 20000 字符');
  }
  let count = 0;
  const expression = value => { text(value, 1000); runtime.validateExpression(value); };
  function actions(list, depth = 0) {
    if (!Array.isArray(list) || list.length > 20 || depth > 4) fail('动作最多 20 项，条件最多嵌套 4 层');
    for (const action of list) {
      if (++count > 1000 || !plain(action)) fail('页面动作数量过多或格式无效');
      switch (action.type) {
        case 'set': keys(action, ['type', 'variable', 'expression']); expression(action.expression); if (!names.has(action.variable)) fail('动作引用的变量不存在'); break;
        case 'toggle': keys(action, ['type', 'variable']); if (!variables.some(v => v.name === action.variable && v.type === 'boolean')) fail('切换动作需要布尔变量'); break;
        case 'notify': case 'navigate': keys(action, ['type', 'expression']); expression(action.expression); break;
        case 'reset': case 'back': keys(action, ['type']); break;
        case 'script': keys(action, ['type', 'scriptId']); if (!ids.has(action.scriptId)) fail('动作引用的脚本不存在'); break;
        case 'condition': keys(action, ['type', 'expression', 'then', 'else']); expression(action.expression); actions(action.then, depth + 1); actions(action.else, depth + 1); break;
        default: fail('不支持的动作类型');
      }
    }
  }
  for (const block of page.blocks) {
    if (block.props.filterVariable && !variables.some(variable => variable.name === block.props.filterVariable && variable.type === 'string')) fail('图表筛选需要已定义的文本变量');
    if (block.bindings !== undefined) {
      keys(block.bindings, bindingKeys(block), []);
      for (const [key, binding] of Object.entries(block.bindings)) {
        keys(binding, ['kind', 'value']);
        if (binding.kind === 'variable') {
          const variable = variables.find(v => v.name === binding.value);
          if (!variable) fail('绑定引用的变量不存在');
          if (!bindingVariableTypes(block, key).includes(variable.type)) fail(`${bindingLabels[key]}需要 ${bindingVariableTypes(block, key).join(' / ')} 类型变量`);
        } else if (binding.kind === 'expression') expression(binding.value);
        else fail('不支持的绑定类型');
      }
    }
    if (block.events !== undefined) { keys(block.events, eventNames(block.type), []); for (const list of Object.values(block.events)) actions(list); }
  }
}

/** Expressions expose exact references; scripts are conservatively scanned for names or dynamic access. */
export function variableIsUsed(page, name) {
  const parser = createInteractionRuntime({ blocks: [] });
  function expressionUses(source) {
    function visit(node) {
      if (!Array.isArray(node)) return false;
      if (node[0] === 'root') return node[1] === 'state';
      if (node[0] === 'get' && node[1]?.[0] === 'root' && node[1][1] === 'state') return node[2]?.[0] === 'literal' ? String(node[2][1]) === name : true;
      return node.slice(1).some(child => Array.isArray(child) && visit(child));
    }
    try { return visit(parser.validateExpression(source)); } catch { return true; }
  }
  function actionUses(action) {
    return action.variable === name || typeof action.expression === 'string' && expressionUses(action.expression) || action.type === 'condition' && [...action.then, ...action.else].some(actionUses);
  }
  const inBlocks = page.blocks.some(block => block.props.filterVariable === name || Object.values(block.bindings || {}).some(binding => binding.kind === 'variable' ? binding.value === name : expressionUses(binding.value)) || Object.values(block.events || {}).some(actions => actions.some(actionUses)));
  const inScripts = (page.scripts || []).some(script => new RegExp(`\\b${name}\\b`).test(script.code) || /ctx\.state\s*\[\s*[A-Za-z_$]/.test(script.code));
  return inBlocks || inScripts;
}
