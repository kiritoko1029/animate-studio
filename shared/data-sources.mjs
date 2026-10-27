import { prepareCollection, validateCollectionSource } from './collections.mjs';

export const dataSourceLimits = { perSite: 20, responseBytes: 1024 * 1024, timeoutMs: 15000, pageSize: 100, items: 500 };
const roots = ['route', 'state', 'form'];
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const templatePattern = /\{\{\s*(route|state|form)((?:\.[A-Za-z_$][\w$]*|\[\d+\])+)\s*\}\}/g;
const fail = message => { throw new Error(message); };
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function record(value, keys, label) {
  if (!plain(value)) fail(`${label} 必须是普通对象`);
  for (const key of Object.keys(value)) if (forbidden.has(key) || !keys.includes(key)) fail(`${label} 包含不支持的属性`);
}
function text(value, max, label, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`${label} 无效`);
}
function checkTemplate(value) {
  text(value, 50000, '数据模板', true);
  let match, count = 0;
  while ((match = templatePattern.exec(value))) {
    if (++count > 50) fail('一个字段最多使用 50 个数据占位符');
    if (!roots.includes(match[1])) fail('数据占位符仅支持 route、state 和 form');
  }
  templatePattern.lastIndex = 0;
  if (value.replace(templatePattern, '').includes('{{') || value.replace(templatePattern, '').includes('}}')) fail('数据占位符格式无效，请使用 {{route.id}} 这样的格式');
}
export function checkDataTemplate(value) { checkTemplate(value); return value; }
function checkMap(value, label, query = false) {
  if (value === undefined) return;
  if (!plain(value) || Object.keys(value).length > 20) fail(`${label} 最多包含 20 项`);
  for (const [key, item] of Object.entries(value)) {
    text(key, 100, `${label} 名称`);
    if (forbidden.has(key)) fail(`${label} 名称无效`);
    text(item, 2000, `${label}.${key}`, true);
    checkTemplate(item);
    if (/[\u0000-\u0020\u007f\\]/u.test(key)) fail(`${label} 名称无效`);
    if (!query && (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key) || /(?:token|secret|password|credential|authorization|api[-_]?key|cookie)/i.test(key))) fail('认证信息请使用服务端凭据，不能保存在页面或请求头中');
    if (query && /(?:token|secret|password|credential|authorization|api[-_]?key)/i.test(key)) fail('密钥或令牌不能保存在 URL 查询中，请使用服务端凭据');
  }
}
function checkJson(value, depth = 0) {
  if (depth > 20) fail('静态数据嵌套不能超过 20 层');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('数据不能包含非有限数字'); return; }
  if (Array.isArray(value)) { if (value.length > dataSourceLimits.items) fail(`静态数据最多包含 ${dataSourceLimits.items} 项`); value.forEach(item => checkJson(item, depth + 1)); return; }
  if (!plain(value)) fail('数据必须是 JSON 对象或数组');
  for (const [key, item] of Object.entries(value)) { if (forbidden.has(key)) fail('数据包含不安全的字段名'); checkJson(item, depth + 1); }
}
export function readDataPath(value, path = '') {
  if (!path) return value;
  if (path.length > 300) fail('响应路径最长 300 字符');
  const parts = path.match(/(?:^|\.)([A-Za-z_$][\w$]*)|\[(\d+)\]/g);
  if (!parts || parts.join('') !== path) fail('响应路径无效，例如 data.items 或 items[0]');
  let current = value;
  for (const part of parts) {
    const key = part.startsWith('[') ? part.slice(1, -1) : part.replace(/^\./, '');
    if (forbidden.has(key) || current == null || !Object.hasOwn(Object(current), key)) return undefined;
    current = current[key];
  }
  return current;
}
function resolveTemplate(source, context, url = false) {
  checkTemplate(source);
  const get = match => {
    const path = match.slice(2, -2).trim();
    const value = readDataPath(context, path);
    if (value === undefined || value === null || typeof value === 'object' && url) throw new Error(`缺少数据参数：${path}`);
    return url ? encodeURIComponent(String(value)) : value;
  };
  const exact = source.match(/^\{\{\s*(?:route|state|form)(?:\.[A-Za-z_$][\w$]*|\[\d+\])+\s*\}\}$/);
  if (exact && !url) return get(exact[0]);
  return source.replace(templatePattern, match => String(get(match)));
}
export function resolveDataTemplate(source, context, url = false) {
  if (typeof source !== 'string') fail('数据模板必须是文本');
  return resolveTemplate(source, context ?? {}, url);
}
export function resolveDataValue(value, context, url = false) {
  if (typeof value === 'string') return resolveTemplate(value, context, url);
  if (Array.isArray(value)) return value.map(item => resolveDataValue(item, context, url));
  if (plain(value)) {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (forbidden.has(key)) fail('请求体包含不安全的字段名');
      output[key] = resolveDataValue(item, context, url);
    }
    return output;
  }
  return value;
}
export function prepareDataSource(source, context = {}) {
  if (source.kind === 'static') return { value: readDataPath(source.items ?? [], source.responsePath) };
  if (source.kind === 'collection') return prepareCollection(source, context);
  const url = resolveTemplate(source.url, context, true);
  if (!/^(?:https?:\/\/|\/(?!\/))/.test(url) || /[\u0000-\u0020\u007f\\]/u.test(url)) fail('请求地址无效');
  const parsed = new URL(url, 'https://studio.invalid');
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) fail('请求地址必须使用 HTTP(S)，且不能包含用户信息或片段');
  for (const [key, value] of Object.entries(source.query ?? {})) parsed.searchParams.set(key, resolveTemplate(value, context, true));
  return { url: url.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.href, method: source.method ?? 'GET', headers: resolveDataValue(source.headers ?? {}, context), body: source.body === undefined ? undefined : resolveDataValue(source.body, context) };
}
export function normalizeDataValue(source, value) {
  if (source.kind === 'collection' && source.mode === 'single' && value === null) fail('没有找到匹配的内容记录，请检查链接或新建内容。');
  checkJson(value);
  if (source.mode === 'collection' && !Array.isArray(value)) fail(`数据源「${source.name}」应返回数组，请检查响应路径`);
  if (source.mode === 'single' && !plain(value)) fail(`数据源「${source.name}」应返回对象，请检查响应路径`);
  return value;
}
export function validateDataSource(source) {
  record(source, ['id', 'name', 'kind', 'mode', 'items', 'url', 'method', 'headers', 'query', 'body', 'responsePath', 'timeoutMs', 'pageSize', 'transport', 'credentialId', 'fields', 'records', 'detailField', 'detailParameter'], 'dataSource');
  if (!idPattern.test(source.id)) fail('数据源 id 必须以字母开头，且最长 40 字符');
  text(source.name, 80, 'dataSource.name');
  if (!['static', 'rest', 'collection'].includes(source.kind)) fail('数据源类型无效');
  if (!['collection', 'single'].includes(source.mode)) fail('数据源返回类型无效');
  if (source.responsePath !== undefined) { text(source.responsePath, 300, 'dataSource.responsePath', true); readDataPath(null, source.responsePath); }
  if (source.timeoutMs !== undefined && (!Number.isInteger(source.timeoutMs) || source.timeoutMs < 100 || source.timeoutMs > dataSourceLimits.timeoutMs)) fail('请求超时必须在 100–15000 毫秒之间');
  if (source.pageSize !== undefined && (!Number.isInteger(source.pageSize) || source.pageSize < 1 || source.pageSize > dataSourceLimits.pageSize)) fail('每页条数必须在 1–100 之间');
  if (source.transport !== undefined && !['direct', 'proxy'].includes(source.transport)) fail('数据请求方式无效');
  if (source.kind === 'static') {
    if (source.url !== undefined || source.method !== undefined && source.method !== 'GET' || source.body !== undefined || source.headers !== undefined || source.query !== undefined || source.transport === 'proxy' || source.credentialId !== undefined) fail('静态数据不需要请求地址、请求头或凭据');
    checkJson(source.items ?? []);
    normalizeDataValue(source, readDataPath(source.items ?? [], source.responsePath));
  } else if (source.kind === 'collection') {
    validateCollectionSource(source);
  } else {
    if (source.items !== undefined) fail('REST 数据源不能同时包含静态数据');
    text(source.url, 2048, 'dataSource.url');
    checkTemplate(source.url);
    const sample = source.url.replace(templatePattern, 'example');
    if (!/^(?:https?:\/\/|\/(?!\/))/.test(sample) || /[\u0000-\u0020\u007f\\]/u.test(sample)) fail('请求地址无效');
    const parsed = new URL(sample, 'https://studio.invalid');
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) fail('请求地址必须使用 HTTP(S)，且不能包含用户信息或片段');
    for (const key of parsed.searchParams.keys()) if (/(?:token|secret|password|credential|authorization|api[-_]?key)/i.test(key)) fail('密钥或令牌不能保存在 URL 查询中，请使用服务端凭据');
    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(source.method ?? 'GET')) fail('请求方法仅支持 GET、POST、PUT 或 PATCH');
    if (source.method === 'GET' && source.body !== undefined) fail('GET 请求不能携带请求体');
    checkMap(source.headers, '请求头'); checkMap(source.query, '查询参数', true);
    if (source.body !== undefined) {
      if (!plain(source.body) || JSON.stringify(source.body).length > 50000) fail('请求体必须是小于 50000 字符的对象');
      checkJson(source.body);
      const visit = value => { if (typeof value === 'string') checkTemplate(value); else if (Array.isArray(value)) value.forEach(visit); else if (plain(value)) Object.values(value).forEach(visit); };
      visit(source.body);
    }
    if (source.transport === 'direct' && source.credentialId !== undefined) fail('凭据需要配合受控代理使用');
    if (source.credentialId !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(source.credentialId)) fail('凭据引用无效');
  }
  return source;
}
export function validateDataSources(sources) {
  if (!Array.isArray(sources) || sources.length > dataSourceLimits.perSite) fail(`每个站点最多包含 ${dataSourceLimits.perSite} 个数据源`);
  const ids = new Set();
  for (const source of sources) { validateDataSource(source); if (ids.has(source.id)) fail('数据源 id 不能重复'); ids.add(source.id); }
  return sources;
}
export function inferDataFields(value, prefix = '', depth = 0) {
  const fields = [];
  if (depth > 4 || fields.length >= 60) return fields;
  const walk = (item, path, level) => {
    if (fields.length >= 60 || level > 4) return;
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) { if (path) fields.push({ path, type: item === null ? 'null' : typeof item, sample: item }); return; }
    if (Array.isArray(item)) { if (item.length) walk(item[0], `${path}[0]`, level + 1); return; }
    if (plain(item)) for (const [key, child] of Object.entries(item)) if (!forbidden.has(key)) walk(child, path ? `${path}.${key}` : key, level + 1);
  };
  walk(value, prefix, depth);
  return fields;
}
