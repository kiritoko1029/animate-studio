import { createDocument, toFreeDocument } from '../src/model.ts';
import { pageAtWidth } from '../src/lib/responsive.ts';
import { validateDataSources } from './data-sources.mjs';
import { validateSeo } from './seo.mjs';

export const siteLimits = { pages: 24, bytes: 2 * 1024 * 1024 };
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const forbiddenKeys = ['__proto__', 'prototype', 'constructor'];
const fail = message => { throw new Error(message); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function record(value, keys, label) {
  if (!plain(value)) fail(`${label} 必须是普通对象`);
  for (const key of Object.keys(value)) if (forbiddenKeys.includes(key) || !keys.includes(key)) fail(`${label} 包含不支持的属性`);
}
function text(value, max, label, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`${label} 无效`);
}
export function isSiteDocument(value) { return !!value && typeof value === 'object' && !Array.isArray(value) && value.version === 1 && value.kind === 'site'; }
export function normalizeSitePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\?#\u0000-\u0020\u007f]/u.test(value)) fail('站内路径必须以 / 开头，且不能包含空格、查询或片段');
  const path = value.length > 1 ? value.replace(/\/+$/, '') : value;
  if (path.length > 160 || path.includes('//')) fail('站内路径无效');
  const names = new Set();
  for (const part of path === '/' ? [] : path.slice(1).split('/')) {
    if (!part || part === '.' || part === '..') fail('站内路径包含无效片段');
    if (part.startsWith(':')) {
      if (!/^:[A-Za-z][A-Za-z0-9_]{0,39}$/.test(part) || names.has(part)) fail('动态路由参数无效或重复');
      names.add(part);
    } else {
      try { decodeURIComponent(part); } catch { fail('站内路径编码无效'); }
      if (!/^[A-Za-z0-9._~!$&'()*+,;=@%-]+$/.test(part)) fail('站内路径仅支持 URL 安全字符');
    }
  }
  return path;
}
export function createSiteDocument(page = createDocument(true), name = page.name) {
  const document = toFreeDocument(page);
  return { version: 1, kind: 'site', id: crypto.randomUUID(), name, homePageId: document.id,
    pages: [{ id: document.id, name: document.name, path: '/', kind: 'page', page: document, layout: [] }], sharedLayout: {} };
}
export function toSiteDocument(document) {
  if (isSiteDocument(document)) return document;
  const page = JSON.parse(JSON.stringify(document));
  if (!plain(page) || !Array.isArray(page.blocks) || !plain(page.settings)) fail('页面文档格式不正确');
  return createSiteDocument(page);
}
export function createLayoutDocument(region, settings) {
  return { version: 1, id: `shared-${region}`, name: region === 'header' ? '共享页头' : region === 'footer' ? '共享页脚' : '共享侧栏',
    settings: { ...settings, ...(region === 'sidebar' ? { maxWidth: 320, canvasHeight: 1080 } : { canvasHeight: 320 }), customThemes: structuredClone(settings.customThemes ?? []), padding: 0, layout: 'free' }, blocks: [] };
}
export function createSitePage(site, name = '新页面', kind = 'page') {
  if (site.pages.length >= siteLimits.pages) fail(`每个站点最多包含 ${siteLimits.pages} 个页面`);
  const page = createDocument(true); page.name = name;
  const first = site.pages[0].page;
  page.settings = { ...first.settings, customThemes: structuredClone(first.settings.customThemes ?? []) };
  let index = site.pages.length + 1, path = kind === 'notFound' ? '/404' : kind === 'detail' ? '/details/:id' : `/page-${index}`;
  while (site.pages.some(entry => entry.path === path)) path = `/page-${++index}`;
  return { id: page.id, name, path, kind, page, layout: [...(site.pages.find(entry => entry.id === site.homePageId)?.layout ?? [])] };
}
export function getActiveDocument(site, target) {
  if (target === 'header' || target === 'footer' || target === 'sidebar') return site.sharedLayout[target] ?? null;
  return site.pages.find(entry => entry.id === target)?.page ?? null;
}
export function replaceActiveDocument(site, target, page) {
  if (target === 'header' || target === 'footer' || target === 'sidebar') {
    if (!site.sharedLayout[target]) fail('共享布局不存在');
    return { ...site, sharedLayout: { ...site.sharedLayout, [target]: page } };
  }
  if (!site.pages.some(entry => entry.id === target)) fail('目标页面不存在');
  return { ...site, pages: site.pages.map(entry => entry.id === target ? { ...entry, name: page.name, page } : entry) };
}
export function updateSitePage(site, id, patch) {
  return { ...site, pages: site.pages.map(entry => entry.id === id ? { ...entry, ...patch, page: patch.name === undefined ? entry.page : { ...entry.page, name: patch.name } } : entry) };
}
export function duplicateSitePage(site, id) {
  const source = site.pages.find(entry => entry.id === id);
  if (!source) fail('要复制的页面不存在');
  const copy = createSitePage(site, `${source.name} 副本`, source.kind === 'notFound' ? 'page' : source.kind);
  copy.page = { ...structuredClone(source.page), id: copy.id, name: copy.name };
  copy.layout = [...source.layout]; copy.group = source.group; copy.seo = structuredClone(source.seo);
  const index = site.pages.indexOf(source);
  return { site: { ...site, pages: [...site.pages.slice(0, index + 1), copy, ...site.pages.slice(index + 1)] }, id: copy.id };
}
export function moveSitePage(site, id, direction) {
  const index = site.pages.findIndex(entry => entry.id === id), next = index + direction;
  if (index < 0 || next < 0 || next >= site.pages.length) return site;
  const pages = [...site.pages]; [pages[index], pages[next]] = [pages[next], pages[index]];
  return { ...site, pages };
}
export function reorderSitePage(site, id, beforeId) {
  if (id === beforeId) return site;
  const source = site.pages.find(entry => entry.id === id);
  if (!source) return site;
  const pages = site.pages.filter(entry => entry.id !== id);
  const index = beforeId ? pages.findIndex(entry => entry.id === beforeId) : pages.length;
  pages.splice(index < 0 ? pages.length : index, 0, source);
  return { ...site, pages };
}
export function setSiteHomePage(site, id) {
  const next = site.pages.find(entry => entry.id === id), previous = site.pages.find(entry => entry.id === site.homePageId);
  if (!next || next.kind === 'notFound') fail('404 页面不能设为首页');
  if (!previous || id === previous.id) return site;
  const oldPath = next.path === '/' ? `/page-${site.pages.indexOf(next) + 1}` : next.path;
  return { ...site, homePageId: id, pages: site.pages.map(entry => entry.id === id ? { ...entry, path: '/' } : entry.id === previous.id ? { ...entry, path: oldPath } : entry) };
}
export function inspectSiteLinks(site) {
  const links = [];
  const documents = [...site.pages.map(entry => ({ pageId: entry.id, page: entry.page })), ...Object.entries(site.sharedLayout).map(([region, page]) => ({ pageId: `shared-${region}`, page }))];
  for (const { pageId, page } of documents) for (const block of page.blocks) {
    if (block.props.url?.startsWith('/')) links.push({ pageId, blockId: block.id, url: block.props.url });
    if (['navbar', 'breadcrumb'].includes(block.type)) for (const row of (block.props.items ?? '').split(/[,，\n]/)) {
      const url = row.split('|')[1]?.trim(); if (url?.startsWith('/')) links.push({ pageId, blockId: block.id, url });
    }
    for (const actions of Object.values(block.events ?? {})) {
      const visit = action => {
        if (action.type === 'navigate') {
          try { const url = JSON.parse(action.expression); if (typeof url === 'string' && url.startsWith('/')) links.push({ pageId, blockId: block.id, url }); } catch { /* Dynamic expressions are checked at runtime. */ }
        }
        if (action.type === 'condition') { action.then.forEach(visit); action.else.forEach(visit); }
      };
      actions.forEach(visit);
    }
  }
  return links.map(link => ({ ...link, missing: !matchSiteRoute(site, link.url) }));
}
export function removeSitePage(site, id) {
  if (id === site.homePageId || site.pages.length <= 1) fail('首页或最后一个页面不能删除');
  const target = site.pages.find(entry => entry.id === id); if (!target) return site;
  const clean = page => ({ ...page, blocks: page.blocks.map(block => {
    const props = { ...block.props };
    if (props.url === target.path) props.url = '#';
    if (['navbar', 'breadcrumb'].includes(block.type) && props.items) props.items = props.items.split(/([,，\n])/).map(part => part.endsWith(`|${target.path}`) ? `${part.slice(0, -target.path.length)}#` : part).join('');
    const visit = action => action.type === 'navigate' && action.expression === JSON.stringify(target.path) ? { ...action, expression: '"#"' } : action.type === 'condition' ? { ...action, then: action.then.map(visit), else: action.else.map(visit) } : action;
    return { ...block, props, ...(block.events ? { events: Object.fromEntries(Object.entries(block.events).map(([event, actions]) => [event, actions.map(visit)])) } : {}) };
  }) });
  return { ...site, pages: site.pages.filter(entry => entry.id !== id).map(entry => ({ ...entry, page: clean(entry.page) })), sharedLayout: Object.fromEntries(Object.entries(site.sharedLayout).map(([key, page]) => [key, clean(page)])) };
}
export function matchSiteRoute(site, rawPath) {
  let path;
  try { path = normalizeSitePath(rawPath?.startsWith('#/') ? rawPath.slice(1) : rawPath); } catch { return null; }
  const candidates = site.pages.filter(entry => entry.kind !== 'notFound').sort((a, b) => Number(b.path === '/') - Number(a.path === '/'));
  for (const entry of candidates) {
    if (entry.path === path) return { entry, params: {}, path };
    const expected = entry.path.split('/'), actual = path.split('/');
    if (expected.length !== actual.length || !expected.some(part => part.startsWith(':'))) continue;
    const params = {}; let matches = true;
    for (let index = 1; index < expected.length; index++) {
      if (expected[index].startsWith(':')) {
        try { params[expected[index].slice(1)] = decodeURIComponent(actual[index]); } catch { matches = false; break; }
      } else if (expected[index] !== actual[index]) { matches = false; break; }
    }
    if (matches) return { entry, params, path };
  }
  return null;
}
function prefixScripts(page, prefix) {
  const rename = action => action.type === 'script' ? { ...action, scriptId: `${prefix}${action.scriptId}` } : action.type === 'condition' ? { ...action, then: action.then.map(rename), else: action.else.map(rename) } : action;
  return { ...page, scripts: (page.scripts ?? []).map(script => ({ ...script, id: `${prefix}${script.id}` })), blocks: page.blocks.map(block => ({ ...block, events: block.events ? Object.fromEntries(Object.entries(block.events).map(([event, actions]) => [event, actions.map(rename)])) : undefined })) };
}
export function composeSitePage(site, entry, containerWidth) {
  const bodyPage = toFreeDocument(pageAtWidth(entry.page, containerWidth));
  const regions = entry.layout.map(region => [region, site.sharedLayout[region] ? toFreeDocument(pageAtWidth(site.sharedLayout[region], containerWidth)) : null]).filter(([, page]) => page);
  const headerHeight = regions.find(([region]) => region === 'header')?.[1].settings.canvasHeight ?? 0;
  const footerHeight = regions.find(([region]) => region === 'footer')?.[1].settings.canvasHeight ?? 0;
  const sidebarWidth = regions.find(([region]) => region === 'sidebar')?.[1].settings.maxWidth ?? 0;
  const stackedSidebar = !!sidebarWidth && bodyPage.settings.maxWidth - sidebarWidth < 320;
  const sidebarHeight = stackedSidebar ? regions.find(([region]) => region === 'sidebar')[1].settings.canvasHeight ?? 1080 : 0;
  if (sidebarWidth && !stackedSidebar && bodyPage.blocks.some(block => block.frame && block.frame.x + block.frame.width + sidebarWidth > bodyPage.settings.maxWidth - bodyPage.settings.padding)) fail('正文与共享侧栏超出页面宽度，请调整布局或组件位置');
  const bodyHeight = bodyPage.settings.canvasHeight ?? 1400, bodyOffsetY = headerHeight + sidebarHeight;
  const height = bodyOffsetY + bodyHeight + footerHeight;
  if (height > 6000) fail('页面与共享布局合并后的画布不能超过 6000 px');
  const documents = [{ page: bodyPage, offsetX: stackedSidebar ? 0 : sidebarWidth, offsetY: bodyOffsetY, prefix: '' }, ...regions.map(([region, page]) => ({ page: prefixScripts(page, `${region}-`), offsetX: 0, offsetY: region === 'header' ? 0 : region === 'sidebar' ? headerHeight : bodyOffsetY + bodyHeight, prefix: `${region}-` }))];
  const blocks = documents.flatMap(({ page, offsetX, offsetY, prefix }) => page.blocks.map(block => ({ ...block, id: `${prefix}${block.id}`, frame: block.frame ? { ...block.frame, x: block.frame.x + offsetX, y: block.frame.y + offsetY } : undefined })));
  const variables = [...bodyPage.variables ?? []], scripts = [...bodyPage.scripts ?? []];
  const names = new Set(variables.map(variable => variable.name));
  for (const [, page] of regions) for (const variable of page.variables ?? []) {
    if (names.has(variable.name)) fail('页面与共享布局使用了同名变量，请重命名后再组合');
    names.add(variable.name); variables.push(variable);
  }
  for (const { page } of documents.slice(1)) scripts.push(...page.scripts);
  return { ...bodyPage, settings: { ...bodyPage.settings, canvasHeight: height, responsive: undefined }, blocks, variables, scripts };
}
export function validateSiteDocument(site, validatePage) {
  record(site, ['version', 'kind', 'id', 'name', 'homePageId', 'pages', 'sharedLayout', 'dataSources'], 'site');
  if (site.version !== 1 || site.kind !== 'site') fail('仅支持版本 1 的站点');
  if (site.dataSources !== undefined) validateDataSources(site.dataSources);
  text(site.id, 100, 'site.id'); if (!idPattern.test(site.id)) fail('站点 id 无效');
  text(site.name, 120, 'site.name');
  if (!Array.isArray(site.pages) || site.pages.length < 1 || site.pages.length > siteLimits.pages) fail(`站点必须包含 1–${siteLimits.pages} 个页面`);
  record(site.sharedLayout, ['header', 'footer', 'sidebar'], 'site.sharedLayout');
  const ids = new Set(), paths = new Set(); let notFound = 0;
  for (const entry of site.pages) {
    record(entry, ['id', 'name', 'path', 'kind', 'group', 'seo', 'page', 'layout'], 'site.pages');
    text(entry.id, 100, 'sitePage.id'); text(entry.name, 120, 'sitePage.name');
    if (!idPattern.test(entry.id) || ids.has(entry.id)) fail('站点页面 id 无效或重复'); ids.add(entry.id);
    if (!['page', 'detail', 'notFound'].includes(entry.kind)) fail('页面类型无效');
    if (entry.group !== undefined) text(entry.group, 40, 'sitePage.group', true);
    if (entry.seo !== undefined) validateSeo(entry.seo);
    const path = normalizeSitePath(entry.path); if (paths.has(path)) fail('站内路径不能重复'); paths.add(path);
    if (entry.kind === 'notFound' && ++notFound > 1) fail('站点最多有一个 404 页面');
    if (entry.id === site.homePageId && path !== '/') fail('首页路径必须为 /');
    if (path === '/' && entry.id !== site.homePageId) fail('只有首页可以使用 / 路径');
    if (!Array.isArray(entry.layout) || new Set(entry.layout).size !== entry.layout.length || entry.layout.some(region => !['header', 'footer', 'sidebar'].includes(region) || !site.sharedLayout[region])) fail('页面共享布局引用无效');
    validatePage(entry.page);
    if (entry.page.id !== entry.id || entry.page.name !== entry.name) fail('页面记录与内容 id、名称必须一致');
    composeSitePage(site, entry);
  }
  if (!ids.has(site.homePageId)) fail('站点首页不存在');
  if (site.pages.find(entry => entry.id === site.homePageId)?.kind === 'notFound') fail('404 页面不能设为首页');
  for (const region of ['header', 'footer', 'sidebar']) if (site.sharedLayout[region] !== undefined) {
    const page = site.sharedLayout[region]; validatePage(page);
    if (page.id !== `shared-${region}` || page.settings.layout !== 'free') fail('共享布局标识或画布无效');
    if (region === 'sidebar' && (page.settings.maxWidth < 320 || page.settings.maxWidth > 640)) fail('共享侧栏宽度必须在 320–640 px 之间');
    if (region !== 'sidebar' && (page.settings.canvasHeight ?? 320) > 1000) fail('共享布局高度不能超过 1000 px');
  }
  if (new TextEncoder().encode(JSON.stringify(site)).byteLength > siteLimits.bytes) fail('站点数据不能超过 2 MiB');
  return site;
}
