import { renderPublicRobots, renderSeoHead, renderSitemap, resolveSeo } from '../shared/seo.mjs';
import type { createPageRepository } from '../db/page-repository.ts';

type Repository = Pick<ReturnType<typeof createPageRepository>, 'findPublished'>;
export type PublicPageRoute = { token: string; path: string; resource: 'html' | 'robots' | 'sitemap' };
export function matchPublicPagePath(pathname: string): PublicPageRoute | null {
  const match = pathname.match(/^\/p\/([A-Za-z0-9_-]{16,64})(\/.*)?$/);
  if (!match) return null;
  const suffix = match[2] ?? '/';
  if (suffix === '/robots.txt' || suffix === '/sitemap.xml') return { token: match[1], path: '/', resource: suffix === '/robots.txt' ? 'robots' : 'sitemap' };
  return { token: match[1], path: suffix, resource: 'html' };
}
export function injectPublicMetadata(html: string, seo: ReturnType<typeof resolveSeo>): string {
  const clean = html.replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title\s*>/gi, '').replace(/<meta\s+(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '').replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  const head = renderSeoHead(seo);
  return /<\/head\s*>/i.test(clean) ? clean.replace(/<\/head\s*>/i, `    ${head}\n  </head>`) : `${head}\n${clean}`;
}
const headers = (type: string, seo?: ReturnType<typeof resolveSeo>) => ({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(seo ? { 'X-Robots-Tag': seo.robots } : {}) });
export async function handlePublicPage(request: Request, repository: Repository, html?: string): Promise<Response | null> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('不支持此请求方法。', { status: 405, headers: headers('text/plain; charset=utf-8') });
  const url = new URL(request.url), route = matchPublicPagePath(url.pathname);
  if (!route) return null;
  const published = await repository.findPublished(route.token);
  if (!published) {
    if (route.resource !== 'html' || html === undefined) return new Response('分享链接不存在或已失效。', { status: 404, headers: headers('text/plain; charset=utf-8') });
    return new Response(injectPublicMetadata(html, { title: '页面不可用', description: '', robots: 'noindex,nofollow', noIndex: true, notFound: true, siteName: 'Animate Studio', type: 'website' }), { status: 404, headers: headers('text/html; charset=utf-8') });
  }
  const options = { origin: url.origin, basePath: `/p/${route.token}`, publishedAt: published.publishedAt };
  if (route.resource === 'robots') return new Response(renderPublicRobots(published.page, options), { headers: headers('text/plain; charset=utf-8') });
  if (route.resource === 'sitemap') return new Response(renderSitemap(published.page, options), { headers: headers('application/xml; charset=utf-8') });
  if (html === undefined) return null;
  const seo = resolveSeo(published.page, route.path, { ...options, resolveAsset: id => `/api/shared/${route.token}/media/${id}` });
  return new Response(injectPublicMetadata(html, seo), { status: seo.notFound ? 404 : 200, headers: headers('text/html; charset=utf-8', seo) });
}
