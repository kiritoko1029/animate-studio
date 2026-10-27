import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { StudioDocument } from '../model';
import { composeSitePage, matchSiteRoute, normalizeSitePath, toSiteDocument } from '../../shared/site-document.mjs';
import { SiteNavigationContext, type SiteNavigation } from '../lib/site-navigation';
import { PageRenderer } from './PageRenderer';
import { StudioButton } from './StudioUI';
import { t } from '../i18n';
import './site-preview.css';

type Props = { document: StudioDocument; mode?: 'editor' | 'share' | 'export'; basePath?: string; initialPath?: string; persistenceScope?: string; replayKey?: number; toolbar?: boolean; dataPageId?: string };
export function SitePreview({ document, mode = 'editor', basePath = '', initialPath, persistenceScope = 'preview', replayKey = 0, toolbar = false, dataPageId }: Props) {
  const site = useMemo(() => toSiteDocument(document), [document]);
  const container = useRef<HTMLDivElement>(null), pathRef = useRef('/');
  const history = useRef({ past: [] as string[], future: [] as string[] });
  const browserPath = useCallback(() => {
    if (mode === 'export' && window.location.hash.startsWith('#/')) return window.location.hash.slice(1);
    if (mode === 'share') return window.location.pathname.slice(basePath.length) || '/';
    return initialPath ?? '/';
  }, [mode, basePath, initialPath]);
  const [path, setPath] = useState(browserPath); pathRef.current = path;
  useEffect(() => { if (mode === 'editor' && initialPath) { setPath(initialPath); history.current = { past: [], future: [] }; } }, [initialPath, mode]);
  const routePath = useCallback((raw: string) => {
    const path = raw.startsWith('#/') ? raw.slice(1) : raw;
    return mode === 'share' && (path === basePath || path.startsWith(`${basePath}/`)) ? path.slice(basePath.length) || '/' : path;
  }, [mode, basePath]);
  const go = useCallback((raw: string, push = true) => {
    let next: string;
    try { next = normalizeSitePath(routePath(raw)); } catch { return; }
    if (push && next !== pathRef.current) history.current = { past: [...history.current.past.slice(-49), pathRef.current], future: [] };
    pathRef.current = next; setPath(next);
    if (mode === 'share') window.history.pushState({}, '', `${basePath}${next}`);
    if (mode === 'export') window.location.hash = next;
  }, [mode, basePath, routePath]);
  const back = useCallback(() => {
    if (mode !== 'editor') { window.history.back(); return; }
    const previous = history.current.past.at(-1); if (!previous) return;
    history.current.past.pop(); history.current.future.unshift(pathRef.current); go(previous, false);
  }, [mode, go]);
  const forward = () => {
    const next = history.current.future[0]; if (!next) return;
    history.current.future.shift(); history.current.past.push(pathRef.current); go(next, false);
  };
  useEffect(() => {
    const change = () => { const next = browserPath(); pathRef.current = next; setPath(next); };
    window.addEventListener(mode === 'export' ? 'hashchange' : 'popstate', change);
    return () => window.removeEventListener(mode === 'export' ? 'hashchange' : 'popstate', change);
  }, [browserPath, mode]);
  const match = useMemo(() => matchSiteRoute(site, path), [site, path]), entry = match?.entry ?? site.pages.find(item => item.kind === 'notFound');
  const composed = useMemo(() => entry ? composeSitePage(site, entry) : null, [site, entry]);
  const navigation = useMemo<SiteNavigation>(() => ({
    navigate: raw => { if (!/^\/(?!\/)/.test(raw) && !raw.startsWith('#/')) return false; go(raw); return true; },
    href: raw => {
      try { const route = normalizeSitePath(routePath(raw)); return mode === 'export' ? `#${route}` : mode === 'share' ? `${basePath}${route}` : route; } catch { return raw; }
    },
    isCurrent: raw => {
      const target = matchSiteRoute(site, routePath(raw));
      return !!target && (target.entry.id === entry?.id || target.entry.path !== '/' && path.startsWith(`${target.entry.path}/`));
    },
    back, params: match?.params ?? {},
    siteName: site.name, pages: site.pages, currentPageId: entry?.id, currentPath: path,
    route: entry ? { path, pageId: entry.id, pattern: entry.path, params: match?.params ?? {} } : undefined,
  }), [site, match, entry?.id, go, back, mode, basePath, routePath]);
  useEffect(() => {
    if (mode === 'editor') return;
    const title = window.document.title; window.document.title = `${entry?.name ?? '404'} · ${site.name}`;
    return () => { window.document.title = title; };
  }, [entry?.name, site.name, mode]);
  useEffect(() => {
    const surface = container.current;
    if (!surface) return;
    surface.scrollTo({ top: 0 });
    if (mode !== 'editor') window.scrollTo({ top: 0 });
  }, [entry?.id, path, mode]);
  return <SiteNavigationContext.Provider value={navigation}><div className="site-preview" ref={container} data-site-route={path} data-site-page={entry?.id ?? 'not-found'}>
    {toolbar && <nav className="site-preview-toolbar" aria-label={t('站点预览导航')}><StudioButton aria-label={t('返回上一页')} disabled={mode === 'editor' && !history.current.past.length} onClick={back}><ArrowLeft size={14}/></StudioButton><StudioButton aria-label={t('前进一页')} disabled={mode !== 'editor' || !history.current.future.length} onClick={forward}><ArrowRight size={14}/></StudioButton><select aria-label={t('站点页面')} value={entry?.path ?? path} onChange={event => go(event.target.value.replace(/:[A-Za-z][A-Za-z0-9_]*/g, 'example'))}>{site.pages.map(item => <option key={item.id} value={item.path}>{item.name} · {item.path}</option>)}</select></nav>}
    {composed && entry ? <PageRenderer key={entry.id} document={composed} persistenceScope={'kind' in document ? `${persistenceScope}:${entry.id}` : persistenceScope} replayKey={replayKey} route={match?.params ?? {}} dataSources={site.dataSources ?? []} dataAccess={{ scope: mode, pageId: dataPageId }}/> : <main className="site-not-found"><h1>404</h1><p>{t('没有找到这个页面。请检查链接，或返回首页。')}</p><StudioButton className="primary-button" onClick={() => go('/')}>{t('返回首页')}</StudioButton></main>}
  </div></SiteNavigationContext.Provider>;
}
