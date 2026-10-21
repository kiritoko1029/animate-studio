import extendedComponents from '../shared/extended-components.json' with { type: 'json' };
import navbarIcons from '../shared/navbar-icons.json' with { type: 'json' };
import { validateInteractions } from '../shared/interaction-schema.mjs';
import { canvasLimits } from '../shared/canvas-sizes.mjs';
import themes from '../shared/themes.json' with { type: 'json' };
import { validateAnimationSettings } from '../shared/animation-settings.mjs';
const themeIds = Object.keys(themes);
const componentTypes = new Set(['navbar', 'hero', 'heading', 'text', 'button', 'card', 'image', 'input', 'accordion', 'tabs', 'switch', 'alert', 'badge', 'separator', 'footer', 'textarea', 'select', 'checkbox', 'radio', 'slider', 'avatar', 'progress', 'statistic', 'table', 'timeline', 'testimonial', 'pricing', 'breadcrumb', 'pagination', 'rating', ...Object.keys(extendedComponents)]);
const stringLimits = { title: 300, text: 10000, label: 300, url: 2048, imageUrl: 2048, items: 20000, variant: 300 };
const numberLimits = { duration: [100, 30000], fontSize: [10, 96], padding: [0, 120], radius: [0, 80], value: [0, 100], max: [1, 100] };
const enumValues = { brandIcon: [...Object.keys(navbarIcons), 'none'], effect: ['none','auto-height','blur','click','effect','fade','highlight','magnetic','particles','scroll-fade','shine','slide','theme-toggler','tilt','zoom','spring','page-transition','cursor'], align: ['left', 'center', 'right'], animation: ['none', 'fade', 'slide', 'scale'] };
const colorPattern = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

export class ValidationError extends Error {}

function fail(message) { throw new ValidationError(message); }

function record(value, allowedKeys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${path} 必须是普通对象`);
  }
  for (const key of Object.keys(value)) {
    if (forbiddenKeys.has(key) || !allowedKeys.includes(key)) fail(`${path} 包含不支持的属性`);
  }
}

function required(value, keys, path) {
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key} 不能为空`);
}

function string(value, max, path, allowEmpty = true) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) fail(`${path} 必须是长度不超过 ${max} 的${allowEmpty ? '' : '非空'}文本`);
}

function number(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${path} 必须在 ${min}–${max} 之间`);
}

function color(value, path) {
  if (typeof value !== 'string' || !colorPattern.test(value)) fail(`${path} 必须为十六进制颜色`);
}

function validateCustomThemes(value) {
  if (!Array.isArray(value) || value.length > 30) fail('最多保存 30 套自定义主题');
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
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (!image && value.startsWith('#')) return true;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return /^https?:\/\//i.test(value) && Boolean(parsed.hostname);
    return !image && ['mailto:', 'tel:'].includes(parsed.protocol) && parsed.pathname.length > 0;
  } catch { return false; }
}

export function validatePage(page) {
  record(page, ['version', 'name', 'settings', 'blocks', 'variables', 'scripts'], 'page');
  required(page, ['version', 'name', 'settings', 'blocks'], 'page');
  if (page.version !== 1) fail('仅支持版本 1 的页面');
  string(page.name, 120, 'page.name', false);
  record(page.settings, ['background', 'accent', 'maxWidth', 'padding', 'layout', 'canvasHeight', 'theme', 'customThemes'], 'page.settings');
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
  for (const block of page.blocks) {
    record(block, ['id', 'type', 'props', 'frame', 'bindings', 'events'], 'block');
    required(block, ['id', 'type', 'props'], 'block');
    if (typeof block.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(block.id) || ids.has(block.id)) fail('组件 id 必须有效且唯一');
    ids.add(block.id);
    if (!componentTypes.has(block.type)) fail('不支持的组件类型');
    if (Object.hasOwn(block, 'frame')) {
      record(block.frame, ['x', 'y', 'width', 'height'], 'block.frame');
      required(block.frame, ['x', 'y', 'width', 'height'], 'block.frame');
      number(block.frame.x, 0, canvasLimits.maxWidth, 'block.frame.x');
      number(block.frame.y, 0, canvasLimits.maxHeight, 'block.frame.y');
      number(block.frame.width, 40, canvasLimits.maxWidth, 'block.frame.width');
      number(block.frame.height, 32, 3000, 'block.frame.height');
    }
    record(block.props, [...Object.keys(stringLimits), ...Object.keys(numberLimits), ...Object.keys(enumValues), 'background', 'color', 'accent', 'checked', 'theme', 'motion', 'effectOptions'], 'block.props');
    for (const [key, value] of Object.entries(block.props)) {
      if (Object.hasOwn(stringLimits, key)) string(value, stringLimits[key], `block.props.${key}`);
      else if (Object.hasOwn(numberLimits, key)) number(value, ...((key === 'value' && ['countingNumber','scrollingNumber','slidingNumber','githubStars','githubStarsButton'].includes(block.type)) ? [0, 1000000000] : numberLimits[key]), `block.props.${key}`);
      else if (key === 'motion' || key === 'effectOptions') {
        try { validateAnimationSettings(key === 'motion' ? block.type : `effect:${block.props.effect}`, value); } catch (error) { fail(error.message); }
      } else if (key === 'theme') {
        if (!validThemes.has(value)) fail('block.props.theme 的主题无效');
      } else if (Object.hasOwn(enumValues, key)) {
        if (!enumValues[key].includes(value)) fail(`block.props.${key} 的选项无效`);
      } else if (key === 'checked') {
        if (typeof value !== 'boolean') fail('block.props.checked 必须为布尔值');
      } else color(value, `block.props.${key}`);
      if ((key === 'url' || key === 'imageUrl') && !safeUrl(value, key === 'imageUrl')) fail(`block.props.${key} 必须是安全的链接`);
    }
    const { value, max } = block.props;
    if (['slider', 'progress', 'pagination'].includes(block.type) && value !== undefined && value > (max ?? (block.type === 'pagination' ? 5 : 100))) fail('组件当前值不能大于最大值');
    if (block.type === 'inputOtp' && max !== undefined && (!Number.isInteger(max) || max > 12)) fail('验证码位数必须是 1–12 的整数');
    if (block.type === 'rating' && value !== undefined && (!Number.isInteger(value) || value > 5)) fail('评分必须是 0–5 的整数');
    if (block.type === 'pagination') {
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) fail('初始页码必须是正整数');
      if (max !== undefined && !Number.isInteger(max)) fail('总页数必须是正整数');
    }
  }
  try { validateInteractions(page); } catch (error) { fail(error.message); }
  return page;
}

export function validateSaveRequest(body) {
  record(body, ['page'], '请求');
  required(body, ['page'], '请求');
  return validatePage(body.page);
}
