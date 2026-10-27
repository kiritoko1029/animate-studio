import { isSeoImage } from './seo.mjs';

export const collectionLimits = { fields: 20, records: 500 };
const fieldTypes = ['text', 'longText', 'number', 'boolean', 'url', 'image'];
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const fail = message => { throw new Error(message); };
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function record(value, keys, label) {
  if (!plain(value) || Object.keys(value).some(key => forbidden.has(key) || !keys.includes(key))) fail(`${label} 包含不支持的属性`);
}
function text(value, max, label, empty = false) { if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`${label} 无效`); }
function safeLink(value, image) {
  if (value === '') return true;
  if (typeof value !== 'string' || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (image) return isSeoImage(value);
  if (value.startsWith('#') || value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url = new URL(value); return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol); } catch { return false; }
}
export function validateCollectionSource(source) {
  if (!Array.isArray(source.fields) || source.fields.length < 1 || source.fields.length > collectionLimits.fields) fail(`内容集合需要 1–${collectionLimits.fields} 个字段`);
  if (!Array.isArray(source.records) || source.records.length > collectionLimits.records) fail(`内容集合最多包含 ${collectionLimits.records} 条记录`);
  if (['items', 'url', 'method', 'headers', 'query', 'body', 'responsePath', 'transport', 'credentialId', 'timeoutMs'].some(key => source[key] !== undefined)) fail('内容集合不需要接口地址、请求头、凭据或响应路径');
  const fields = new Set(), ids = new Set();
  for (const field of source.fields) {
    record(field, ['key', 'label', 'type'], '集合字段');
    if (typeof field.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(field.key) || forbidden.has(field.key) || fields.has(field.key)) fail('集合字段 key 必须以字母开头且不能重复');
    fields.add(field.key); text(field.label, 80, '字段显示名称');
    if (!fieldTypes.includes(field.type)) fail('集合字段类型无效');
  }
  if (source.detailField !== undefined && source.detailField !== 'id' && !fields.has(source.detailField)) fail('详情匹配字段必须是记录 id 或已有字段');
  if (source.detailParameter !== undefined && (typeof source.detailParameter !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(source.detailParameter))) fail('详情路由参数无效');
  for (const item of source.records) {
    record(item, ['id', 'values'], '内容记录');
    text(item.id, 100, '记录 id');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(item.id)) fail('记录 id 必须以字母或数字开头，且仅包含字母、数字、下划线或连字符');
    if (ids.has(item.id)) fail('记录 id 不能重复'); ids.add(item.id);
    record(item.values, [...fields], '记录内容');
    for (const field of source.fields) {
      const value = item.values[field.key];
      if (value === undefined) continue;
      if (['text', 'longText'].includes(field.type)) text(value, 10000, `记录.${field.key}`, true);
      if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) fail(`记录.${field.key} 必须是有限数字`);
      if (field.type === 'boolean' && typeof value !== 'boolean') fail(`记录.${field.key} 必须是布尔值`);
      if (['url', 'image'].includes(field.type) && !safeLink(value, field.type === 'image')) fail(`记录.${field.key} 必须是安全的链接或站点素材`);
    }
  }
  return source;
}
export function prepareCollection(source, context = {}) {
  if (source.mode === 'collection') return { value: source.records.map(item => ({ id: item.id, ...item.values })) };
  const parameter = source.detailParameter ?? 'id', field = source.detailField ?? 'id', expected = context.route?.[parameter];
  const item = expected === undefined || expected === null ? undefined : source.records.find(item => String(field === 'id' ? item.id : item.values[field]) === String(expected));
  return { value: item ? { id: item.id, ...item.values } : null };
}
export function collectionFields(source) {
  return source.fields.map(field => ({ path: field.key, type: field.type === 'number' ? 'number' : field.type === 'boolean' ? 'boolean' : 'string', sample: field.type === 'number' ? 0 : field.type === 'boolean' ? false : '' }));
}
