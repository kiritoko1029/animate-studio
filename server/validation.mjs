import extendedComponents from '../shared/extended-components.json' with { type: 'json' };
import navbarIcons from '../shared/navbar-icons.json' with { type: 'json' };
import { validateInteractions } from '../shared/interaction-schema.mjs';
import { canvasLimits } from '../shared/canvas-sizes.mjs';
import { componentScaleLimits } from '../shared/component-scale.mjs';
import themes from '../shared/themes.json' with { type: 'json' };
import { validateAnimationSettings } from '../shared/animation-settings.mjs';
import { customComponentLimits, validateCustomBlockProps } from '../shared/custom-components.mjs';
import { validateSiteDocument } from '../shared/site-document.mjs';
import { readDataPath } from '../shared/data-sources.mjs';
import { validateResponsive } from '../src/lib/responsive.ts';
import { parseMediaReference } from '../shared/media.mjs';
const themeIds = Object.keys(themes);
const componentTypes = new Set(['navbar', 'hero', 'heading', 'text', 'button', 'card', 'image', 'input', 'accordion', 'tabs', 'switch', 'alert', 'badge', 'separator', 'footer', 'textarea', 'select', 'checkbox', 'radio', 'slider', 'avatar', 'progress', 'statistic', 'table', 'timeline', 'testimonial', 'pricing', 'breadcrumb', 'pagination', 'rating', 'repeater', 'form', 'chart', 'custom', ...Object.keys(extendedComponents)]);
const stringLimits = { title: 300, text: 10000, label: 300, url: 2048, imageUrl: 2048, items: 20000, variant: 300, name: 40, error: 500, successUrl: 2048, successText: 500, errorText: 500, categoryField: 500, filterField: 500, filterVariable: 40 };
export const numberLimits = { duration: [100, 30000], fontSize: [10, 96], padding: [0, 120], radius: [0, 80], value: [0, 100], max: [1, 100], contentScale: [componentScaleLimits.min, componentScaleLimits.max], innerRadius: [0, 80] };
const enumValues = { brandIcon: [...Object.keys(navbarIcons), 'none'], effect: ['none','auto-height','blur','click','effect','fade','highlight','magnetic','particles','scroll-fade','shine','slide','theme-toggler','tilt','zoom','spring','page-transition','cursor'], align: ['left', 'center', 'right'], animation: ['none', 'fade', 'slide', 'scale'], navigation: ['custom', 'site'], format: ['text', 'email', 'url', 'number'], chartType: ['line', 'area', 'column', 'bar', 'pie'] };
const dataPropKeys = ['sourceId', 'submitSourceId', 'dataFields', 'dataColumns', 'required', 'minLength', 'maxLength', 'chartColors', 'showLegend', 'showGrid', 'showTooltip', 'showValues'];
const itemTemplate = /\{\{\s*(item|index)((?:\.[A-Za-z_$][\w$]*|\[\d+\])*)\s*\}\}/g;
function itemMapping(value) {
  string(value, 500, '字段映射', false);
  if (/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$)/.test(value)) fail('字段路径不能访问原型属性');
  if (!value.includes('{{')) { readDataPath(null, value); return; }
  const remainder = value.replace(itemTemplate, '');
  if (remainder.includes('{{') || remainder.includes('}}')) fail('列表字段仅支持 {{item.field}} 和 {{index}}');
}
const colorPattern = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export class ValidationError extends Error {
  constructor(message, path) {
    super(message);
    if (path !== undefined) this.path = path;
  }
}

function fail(message, path) { throw new ValidationError(message, path); }

function record(value, allowedKeys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${path} 必须是普通对象`, path);
  }
  for (const key of Object.keys(value)) {
    if (forbiddenKeys.has(key) || !allowedKeys.includes(key)) fail(`${path} 包含不支持的属性`, `${path}.${key}`);
  }
}

function required(value, keys, path) {
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key} 不能为空`, `${path}.${key}`);
}

function string(value, max, path, allowEmpty = true) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) fail(`${path} 必须是长度不超过 ${max} 的${allowEmpty ? '' : '非空'}文本`, path);
}

function number(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${path} 必须在 ${min}–${max} 之间`, path);
}

function color(value, path) {
  if (typeof value !== 'string' || !colorPattern.test(value)) fail(`${path} 必须为十六进制颜色`, path);
}

function validateCustomThemes(value) {
  if (!Array.isArray(value)) fail('page.settings.customThemes 必须是数组');
  if (value.length > 30) fail('最多保存 30 套自定义主题');
  const ids = new Set(themeIds);
  const names = new Set();
  const keys = ['id', ...Object.keys(themes.nature)];
  for (const theme of value) {
    record(theme, keys, 'customTheme');
    required(theme, keys, 'customTheme');
    if (typeof theme.id !== 'string' || !/^custom-[a-zA-Z0-9_-]{1,80}$/.test(theme.id) || ids.has(theme.id)) fail('自定义主题 id 必须有效且唯一');
    ids.add(theme.id);
    string(theme.name, 40, 'customTheme.name', false);
    const name = theme.name.trim().toLocaleLowerCase();
    if (names.has(name)) fail('自定义主题名称不能重复');
    names.add(name);
    string(theme.description, 120, 'customTheme.description');
    for (const key of ['accent', 'canvas', 'surface', 'panel', 'text', 'muted', 'border']) color(theme[key], `customTheme.${key}`);
    number(theme.radius, 0, 80, 'customTheme.radius');
    number(theme.controlRadius, 0, 80, 'customTheme.controlRadius');
    if (!['light', 'dark'].includes(theme.scheme)) fail('自定义主题明暗模式无效');
    for (const key of ['shadow', 'headingFont']) {
      if (!Object.values(themes).some(preset => preset[key] === theme[key])) fail(`customTheme.${key} 的选项无效`);
    }
  }
  return ids;
}

function safeUrl(value, image = false) {
  if (value === '') return true;
  if (/[\s\\\u0000-\u001f\u007f]/u.test(value) || /%(?:00|0a|0d)/i.test(value)) return false;
  if (image && parseMediaReference(value)) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (!image && value.startsWith('#')) return true;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return /^https?:\/\//i.test(value) && Boolean(parsed.hostname);
    return !image && ['mailto:', 'tel:'].includes(parsed.protocol) && parsed.pathname.length > 0;
  } catch { return false; }
}

export function validatePage(page) {
  record(page, ['version', 'name', 'id', 'settings', 'blocks', 'variables', 'scripts'], 'page');
  required(page, ['version', 'name', 'settings', 'blocks'], 'page');
  if (page.version !== 1) fail('仅支持版本 1 的页面');
  if (Object.hasOwn(page, 'id') && (typeof page.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(page.id))) fail('页面 id 无效');
  string(page.name, 120, 'page.name', false);
  record(page.settings, ['background', 'accent', 'maxWidth', 'padding', 'layout', 'canvasHeight', 'theme', 'customThemes', 'responsive'], 'page.settings');
  required(page.settings, ['background', 'accent', 'maxWidth', 'padding'], 'page.settings');
  const validThemes = Object.hasOwn(page.settings, 'customThemes') ? validateCustomThemes(page.settings.customThemes) : new Set(themeIds);
  if (Object.hasOwn(page.settings, 'theme') && !validThemes.has(page.settings.theme)) fail('page.settings.theme 的主题无效');
  color(page.settings.background, 'page.settings.background');
  color(page.settings.accent, 'page.settings.accent');
  number(page.settings.maxWidth, canvasLimits.minWidth, canvasLimits.maxWidth, 'page.settings.maxWidth');
  number(page.settings.padding, 0, 120, 'page.settings.padding');
  if (Object.hasOwn(page.settings, 'layout') && !['flow', 'free'].includes(page.settings.layout)) fail('page.settings.layout 的选项无效');
  if (Object.hasOwn(page.settings, 'canvasHeight')) number(page.settings.canvasHeight, canvasLimits.minHeight, canvasLimits.maxHeight, 'page.settings.canvasHeight');
  if (!Array.isArray(page.blocks) || page.blocks.length > 200) fail('页面最多包含 200 个组件');
  const ids = new Set();
  let customBlocks = 0;
  for (const block of page.blocks) {
    record(block, ['id', 'type', 'props', 'frame', 'children', 'bindings', 'events'], 'block');
    required(block, ['id', 'type', 'props'], 'block');
    if (typeof block.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(block.id) || ids.has(block.id)) fail('组件 id 必须有效且唯一');
    ids.add(block.id);
    if (!componentTypes.has(block.type)) fail('不支持的组件类型');
    if (Object.hasOwn(block, 'frame')) {
      const frameScale = typeof block.props?.contentScale === 'number' && Number.isFinite(block.props.contentScale)
        ? Math.max(1, Math.min(componentScaleLimits.max, block.props.contentScale) / 100) : 1;
      record(block.frame, ['x', 'y', 'width', 'height'], 'block.frame');
      required(block.frame, ['x', 'y', 'width', 'height'], 'block.frame');
      number(block.frame.x, 0, canvasLimits.maxWidth, 'block.frame.x');
      number(block.frame.y, 0, canvasLimits.maxHeight, 'block.frame.y');
      number(block.frame.width, 40, canvasLimits.maxWidth * frameScale, 'block.frame.width');
      number(block.frame.height, 32, 3000 * frameScale, 'block.frame.height');
    }
    if (block.type === 'custom') {
      // Custom components carry their own definition; only the instance fields and
      // wrapper appearance are page props. The code is validated, never executed.
      if (++customBlocks > customComponentLimits.perPage) fail(`页面最多包含 ${customComponentLimits.perPage} 个自定义组件`);
      try { validateCustomBlockProps(block.props); } catch (error) { fail(error.message); }
    } else record(block.props, [...Object.keys(stringLimits), ...Object.keys(numberLimits), ...Object.keys(enumValues), ...dataPropKeys, 'background', 'color', 'accent', 'checked', 'theme', 'motion', 'effectOptions'], 'block.props');
    for (const [key, value] of Object.entries(block.props)) {
      if (key === 'custom') continue;
      if (Object.hasOwn(stringLimits, key)) {
        string(value, stringLimits[key], `block.props.${key}`);
        if ((key === 'categoryField' || key === 'filterField') && value) itemMapping(value);
      }
      else if (Object.hasOwn(numberLimits, key)) number(value, ...((key === 'value' && ['countingNumber','scrollingNumber','slidingNumber','githubStars','githubStarsButton'].includes(block.type)) ? [0, 1000000000] : numberLimits[key]), `block.props.${key}`);
      else if (key === 'motion' || key === 'effectOptions') {
        try { validateAnimationSettings(key === 'motion' ? block.type : `effect:${block.props.effect}`, value); } catch (error) { fail(error.message, `block.props.${key}`); }
      } else if (key === 'theme') {
        if (!validThemes.has(value)) fail('block.props.theme 的主题无效', 'block.props.theme');
      } else if (Object.hasOwn(enumValues, key)) {
        if (!enumValues[key].includes(value)) fail(`block.props.${key} 的选项无效`, `block.props.${key}`);
      } else if (key === 'checked' || key === 'required' || ['showLegend', 'showGrid', 'showTooltip', 'showValues'].includes(key)) {
        if (typeof value !== 'boolean') fail(`block.props.${key} 必须为布尔值`, `block.props.${key}`);
      } else if (key === 'sourceId' || key === 'submitSourceId') {
        if (typeof value !== 'string' || value && !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value)) fail(`block.props.${key} 的数据源引用无效`);
      } else if (key === 'minLength' || key === 'maxLength') {
        number(value, 0, 10000, `block.props.${key}`); if (!Number.isInteger(value)) fail('字段长度必须是整数');
      } else if (key === 'dataFields') {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 12) fail('字段映射必须是最多 12 个子组件的对象');
        for (const [childId, fields] of Object.entries(value)) {
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(childId) || !block.children?.some(child => child.id === childId)) fail('字段映射的子组件不存在');
          record(fields, ['title', 'text', 'label', 'url', 'imageUrl'], '字段映射');
          Object.values(fields).forEach(itemMapping);
        }
      } else if (key === 'dataColumns') {
        if (!Array.isArray(value) || value.length > (block.type === 'chart' ? 4 : 12)) fail(block.type === 'chart' ? '图表最多包含 4 个指标' : '数据表格最多包含 12 列');
        const columns = new Set();
        for (const column of value) {
          record(column, ['key', 'label', 'path', ...(block.type === 'chart' ? ['aggregate'] : [])], '数据列');
          if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(column.key) || columns.has(column.key)) fail('数据列 id 无效或重复'); columns.add(column.key);
          string(column.label, 80, '数据列标题', false); itemMapping(column.path);
          if (column.aggregate !== undefined && !['sum', 'count', 'avg', 'min', 'max'].includes(column.aggregate)) fail('图表聚合方式无效');
        }
      } else if (key === 'chartColors') {
        if (!Array.isArray(value) || value.length > 8) fail('图表最多配置 8 种系列颜色');
        value.forEach((item, index) => color(item, `block.props.chartColors.${index}`));
      } else color(value, `block.props.${key}`);
      if ((key === 'url' || key === 'imageUrl') && !safeUrl(value, key === 'imageUrl')) fail(`block.props.${key} 必须是安全的链接`, `block.props.${key}`);
      if (key === 'successUrl' && value && !/^\/(?!\/)/.test(value) && !value.startsWith('#/')) fail('成功跳转必须是站内路径');
    }
    const { value, max } = block.props;
    if (block.props.contentScale !== undefined && !Number.isInteger(block.props.contentScale)) fail('组件整体缩放必须为整数百分比', 'block.props.contentScale');
    if (['slider', 'progress', 'pagination'].includes(block.type) && value !== undefined && value > (max ?? (block.type === 'pagination' ? 5 : 100))) fail('组件当前值不能大于最大值');
    if (block.type === 'inputOtp' && max !== undefined && (!Number.isInteger(max) || max > 12)) fail('验证码位数必须是 1–12 的整数', 'block.props.max');
    if (block.type === 'rating' && value !== undefined && (!Number.isInteger(value) || value > 5)) fail('评分必须是 0–5 的整数', 'block.props.value');
    if (block.type === 'pagination') {
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) fail('初始页码必须是正整数', 'block.props.value');
      if (max !== undefined && !Number.isInteger(max)) fail('总页数必须是正整数', 'block.props.max');
    }
    if (block.children !== undefined) {
      if (!['repeater', 'form'].includes(block.type)) fail('只有动态列表和表单可以包含子组件');
      if (!Array.isArray(block.children) || block.children.length > 12) fail('子组件最多包含 12 项');
      if (block.type === 'form' && block.children.some(child => !['input', 'textarea', 'select', 'checkbox', 'button'].includes(child.type))) fail('表单仅支持输入、选择、复选框和提交按钮');
      if (block.type === 'repeater' && block.children.some(child => ['form', 'repeater', 'custom'].includes(child.type))) fail('列表子组件不能嵌套列表、表单或自定义组件');
      if (block.type === 'form') {
        const names = new Set();
        for (const child of block.children) if (child.type !== 'button') {
          if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(child.props.name ?? '')) fail('表单字段 name 必须以字母开头且唯一');
          if (names.has(child.props.name)) fail('表单字段 name 不能重复'); names.add(child.props.name);
          if ((child.props.minLength ?? 0) > (child.props.maxLength ?? 10000)) fail('字段最小长度不能大于最大长度');
        }
      }
      validatePage({ ...page, settings: { ...page.settings, responsive: undefined }, blocks: block.children });
    }
  }
  try { validateInteractions(page); } catch (error) { fail(error.message); }
  try { validateResponsive(page); } catch (error) { fail(error.message); }
  return page;
}

export function validateSite(site) {
  return validateSiteDocument(site, validatePage);
}

export function validateSaveRequest(body) {
  record(body, ['page'], '请求');
  required(body, ['page'], '请求');
  return validatePage(body.page);
}
