import { useCallback, type MouseEvent } from 'react';
import { safeUrl } from '../model';
import { findPageAnchor } from './page-anchors';
import { useSiteNavigation, type SiteNavigation } from './site-navigation';

export function navigate(event: MouseEvent<HTMLElement>, rawUrl?: string, site?: SiteNavigation | null) {
  event.preventDefault();
  const url = safeUrl(rawUrl);
  if (site?.navigate(url)) return;
  if (url.startsWith('#')) {
    const surface = event.currentTarget.closest('.page-surface');
    const target = findPageAnchor(surface, url);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    return;
  }
  if (/^(mailto:|tel:)/i.test(url)) window.location.assign(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function usePageLinks() {
  const site = useSiteNavigation();
  const go = useCallback((event: MouseEvent<HTMLElement>, url?: string) => navigate(event, url, site), [site]);
  const href = useCallback((raw?: string) => { const url = safeUrl(raw); return site?.href(url) ?? url; }, [site]);
  return { navigate: go, safeUrl: href, isCurrent: site?.isCurrent ?? (() => false) };
}
