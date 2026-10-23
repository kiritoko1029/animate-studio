/**
 * Custom component contract shared by the editor, the server, the Cloudflare
 * worker and tests. A custom component is an author-written HTML / CSS /
 * JavaScript document that always runs inside a sandboxed iframe; these
 * validators only decide what may be stored. They never execute code.
 *
 * Plain JS (no imports) so it loads unchanged in the browser, Node and the
 * worker. Update `custom-components.d.mts` when exports change.
 */

export const customComponentLimits = Object.freeze({
  name: 60,
  description: 300,
  /** Characters per code panel (HTML, CSS and JavaScript are limited separately). */
  code: 30000,
  minWidth: 40,
  maxWidth: 1920,
  minHeight: 32,
  maxHeight: 1600,
  /** Custom component instances on one page (each is an iframe). */
  perPage: 40,
  /** Components saved in one account. */
  perAccount: 100,
  /** Components kept in one browser's local library. */
  perLibrary: 200,
});

/** Instance fields a component may expose; page instances edit them in the inspector. */
export const customFieldKeys = Object.freeze(['title', 'text', 'label', 'url', 'imageUrl']);
export const customFieldLimits = Object.freeze({ title: 300, text: 2000, label: 300, url: 2048, imageUrl: 2048 });
export const customFieldLabels = Object.freeze({ title: '标题', text: '正文', label: '标签', url: '链接地址', imageUrl: '图片地址' });

/** Block props a custom component instance may carry in a page document. */
export const customBlockPropKeys = Object.freeze(['custom', ...customFieldKeys, 'accent', 'background', 'color', 'radius', 'theme', 'animation', 'contentScale']);

/**
 * The only sandbox token custom component frames ever receive. Never add
 * `allow-same-origin`: together with `allow-scripts` it would let author code
 * remove the sandbox and reach the editor origin's cookies and storage.
 */
export const customComponentSandbox = 'allow-scripts';

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const sourceKinds = ['local', 'cloud'];

class CustomComponentError extends Error {}
function fail(message) { throw new CustomComponentError(message); }

function plain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function keys(value, allowed, required, path) {
  if (!plain(value)) fail(`${path} 必须是普通对象`);
  for (const key of Object.keys(value)) if (forbiddenKeys.has(key) || !allowed.includes(key)) fail(`${path} 包含不支持的属性 ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key} 不能为空`);
}

function text(value, max, path, { allowEmpty = true } = {}) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    fail(`${path} 必须是长度不超过 ${max} 的${allowEmpty ? '' : '非空'}文本`);
  }
}

function integer(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(`${path} 必须是 ${min}–${max} 之间的整数`);
}

/** Same rules as page links: relative paths, anchors, http(s); mailto/tel for links only. */
export function isSafeCustomUrl(value, image = false) {
  if (typeof value !== 'string') return false;
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

/** Validate one instance field value (default in a definition or override in a page). */
export function validateCustomFieldValue(key, value, path = `fields.${key}`) {
  if (!customFieldKeys.includes(key)) fail(`${path} 不是支持的实例字段`);
  text(value, customFieldLimits[key], path);
  if ((key === 'url' || key === 'imageUrl') && !isSafeCustomUrl(value, key === 'imageUrl')) fail(`${path} 必须是安全的链接`);
}

/**
 * Validate an author-editable component definition. Returns the value so
 * callers can chain it; throws an Error with a Chinese message otherwise.
 */
export function validateCustomComponentDefinition(value, path = 'component') {
  keys(value, ['name', 'description', 'html', 'css', 'js', 'fields', 'size'], ['name', 'html', 'css', 'js'], path);
  text(value.name, customComponentLimits.name, `${path}.name`, { allowEmpty: false });
  if (Object.hasOwn(value, 'description')) text(value.description, customComponentLimits.description, `${path}.description`);
  for (const panel of ['html', 'css', 'js']) {
    if (typeof value[panel] !== 'string' || value[panel].length > customComponentLimits.code) {
      fail(`${path}.${panel} 必须是不超过 ${customComponentLimits.code} 字符的代码`);
    }
  }
  if (Object.hasOwn(value, 'fields')) {
    keys(value.fields, customFieldKeys, [], `${path}.fields`);
    for (const [key, field] of Object.entries(value.fields)) validateCustomFieldValue(key, field, `${path}.fields.${key}`);
  }
  if (Object.hasOwn(value, 'size')) {
    keys(value.size, ['width', 'height'], ['width', 'height'], `${path}.size`);
    integer(value.size.width, customComponentLimits.minWidth, customComponentLimits.maxWidth, `${path}.size.width`);
    integer(value.size.height, customComponentLimits.minHeight, customComponentLimits.maxHeight, `${path}.size.height`);
  }
  return value;
}

/** A definition embedded in a page block, plus where it was copied from. */
export function validateCustomComponentSnapshot(value, path = 'block.props.custom') {
  if (!plain(value)) fail(`${path} 必须是普通对象`);
  const { source, ...definition } = value;
  if (Object.hasOwn(value, 'source')) {
    keys(source, ['kind', 'id', 'revision'], ['kind', 'id', 'revision'], `${path}.source`);
    if (!sourceKinds.includes(source.kind)) fail(`${path}.source.kind 无效`);
    if (typeof source.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(source.id)) fail(`${path}.source.id 无效`);
    integer(source.revision, 1, 1000000000, `${path}.source.revision`);
  }
  validateCustomComponentDefinition(definition, path);
  return value;
}

/** Page-level rules for a `custom` block's props, run by validatePage. */
export function validateCustomBlockProps(props, path = 'block.props') {
  if (!plain(props)) fail(`${path} 必须是普通对象`);
  for (const key of Object.keys(props)) if (forbiddenKeys.has(key) || !customBlockPropKeys.includes(key)) fail(`${path} 包含自定义组件不支持的属性 ${key}`);
  if (!Object.hasOwn(props, 'custom')) fail('自定义组件缺少组件定义');
  validateCustomComponentSnapshot(props.custom, `${path}.custom`);
  const declared = props.custom.fields ?? {};
  for (const key of customFieldKeys) {
    if (!Object.hasOwn(props, key)) continue;
    if (!Object.hasOwn(declared, key)) fail(`${path}.${key} 不是该组件声明的实例字段`);
    validateCustomFieldValue(key, props[key], `${path}.${key}`);
  }
}

/** Summary used by lists and errors, never the code itself. */
export function customComponentCodeSize(definition) {
  return ['html', 'css', 'js'].reduce((total, panel) => total + (typeof definition?.[panel] === 'string' ? definition[panel].length : 0), 0);
}
