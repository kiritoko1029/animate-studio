import { matchSiteRoute, normalizeSitePath, toSiteDocument } from './site-document.mjs';

const fail = message => { throw new Error(message); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const assetPattern = /^asset:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
export const escapeSeoText = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function isSeoImage(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(value) || /%(?:00|0a|0d)/i.test(value)) return false;
  if (!value) return true;
  if (assetPattern.test(value)) return true;
  if (value.startsWith('/')) return !value.startsWith('//');
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && /^https?:\/\//i.test(value) && !!url.hostname; } catch { return false; }
}
export function validateSeo(value) {
  if (!plain(value) || Object.keys(value).some(key => !['title', 'description', 'imageUrl', 'noIndex'].includes(key))) fail('SEO 设置包含不支持的属性');
  if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 120)) fail('SEO 标题最长 120 个字符');
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 300)) fail('SEO 描述最长 300 个字符');
  if (value.imageUrl !== undefined && !isSeoImage(value.imageUrl)) fail('SEO 分享图片必须是安全的图片地址或站点素材');
  if (value.noIndex !== undefined && typeof value.noIndex !== 'boolean') fail('SEO 收录设置必须为布尔值');
  return value;
}
function text(value, max = 160) {
  const result = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return result.length > max ? `${result.slice(0, max - 1)}…` : result;
}
function fallbackDescription(entry) {
  for (const block of entry.page.blocks) {
    if (block.type === 'hero' && text(block.props.text)) return text(block.props.text);
    if (block.type === 'text' && text(block.props.text)) return text(block.props.text);
  }
  for (const block of entry.page.blocks) {
    const value = text(block.props.title || block.props.text);
    if (value) return value;
  }
  return '';
}
function publicBase(options) {
  if (!options.origin) return null;
  const origin = new URL(options.origin).origin;
  const basePath = options.basePath ?? '';
  if (basePath && (!basePath.startsWith('/') || basePath.startsWith('//'))) fail('公开路径前缀无效');
  return `${origin}${basePath}`.replace(/\/$/, '');
}
function imageUrl(value, options) {
  if (!value) return undefined;
  const asset = typeof value === 'string' ? value.match(assetPattern) : null;
  if (asset) value = options.resolveAsset?.(asset[1]);
  if (!value) return undefined;
  try { return options.origin ? new URL(value, `${options.origin}/`).href : value; } catch { return undefined; }
}
export function resolveSeo(document, rawPath = '/', options = {}) {
  const site = toSiteDocument(document);
  let path = null;
  try { path = normalizeSitePath(rawPath); } catch { /* Unknown or malformed public routes are not indexable. */ }
  const match = path === null ? null : matchSiteRoute(site, path);
  const entry = match?.entry ?? site.pages.find(item => item.kind === 'notFound');
  const base = publicBase(options);
  const canonical = base && path && options.canonical !== false ? `${base}${path === '/' ? '' : path}` : undefined;
  if (!entry) return { title: '页面不存在', description: '', robots: 'noindex,nofollow', noIndex: true, notFound: true, canonical, siteName: site.name, type: 'website' };
  const custom = entry.seo ?? {};
  const title = text(custom.title, 120) || (entry.id === site.homePageId ? text(site.name, 120) : text(`${entry.name} · ${site.name}`, 120));
  const description = text(custom.description, 300) || fallbackDescription(entry);
  const noIndex = !match || entry.kind !== 'page' || custom.noIndex === true;
  return { title, description, imageUrl: imageUrl(custom.imageUrl, options), canonical, robots: noIndex ? 'noindex,nofollow' : 'index,follow', noIndex, notFound: !match, siteName: site.name, type: 'website' };
}
export function seoMetaEntries(seo) {
  const entries = [{ key: 'name:description', name: 'description', content: seo.description ?? '' }, { key: 'name:robots', name: 'robots', content: seo.robots }];
  for (const [property, content] of [['og:title', seo.title], ['og:description', seo.description ?? ''], ['og:type', seo.type], ['og:site_name', seo.siteName], ['og:url', seo.canonical], ['og:image', seo.imageUrl], ['twitter:card', seo.imageUrl ? 'summary_large_image' : 'summary'], ['twitter:title', seo.title], ['twitter:description', seo.description ?? ''], ['twitter:image', seo.imageUrl]]) {
    if (content) entries.push({ key: `${property.startsWith('og:') ? 'property' : 'name'}:${property}`, ...(property.startsWith('og:') ? { property } : { name: property }), content });
  }
  return entries;
}
export function renderSeoHead(seo) {
  const tags = [`<title>${escapeSeoText(seo.title)}</title>`];
  for (const entry of seoMetaEntries(seo)) {
    const attribute = entry.property ? `property="${entry.property}"` : `name="${entry.name}"`;
    tags.push(`<meta ${attribute} content="${escapeSeoText(entry.content)}" />`);
  }
  if (seo.canonical) tags.push(`<link rel="canonical" href="${escapeSeoText(seo.canonical)}" />`);
  return tags.join('\n    ');
}
export function sitemapEntries(document, options = {}) {
  const site = toSiteDocument(document), base = publicBase(options);
  if (!base) fail('站点地图需要公开访问地址');
  return site.pages.filter(entry => entry.kind === 'page' && !entry.path.includes(':') && !entry.seo?.noIndex).map(entry => ({ url: `${base}${entry.path === '/' ? '' : entry.path}`, ...(options.publishedAt ? { lastmod: options.publishedAt } : {}) }));
}
export function renderSitemap(site, options = {}) {
  const rows = sitemapEntries(site, options).map(entry => `  <url><loc>${escapeSeoText(entry.url)}</loc>${entry.lastmod ? `<lastmod>${escapeSeoText(entry.lastmod)}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>`;
}
export function renderPublicRobots(site, options = {}) {
  const base = publicBase(options);
  if (!base) fail('robots.txt 需要公开访问地址');
  const basePath = options.basePath ?? '';
  const lines = ['User-agent: *', `Allow: ${basePath || '/'}`, ...(basePath ? [`Allow: ${basePath}/`] : [])];
  if (sitemapEntries(site, options).length) lines.push(`Sitemap: ${base}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}
