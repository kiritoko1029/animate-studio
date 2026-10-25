import { safeUrl } from '../../model.ts';
import { findPageAnchor } from '../page-anchors.ts';

/**
 * Open a link requested by a component frame with the same rules as page
 * links. Unsafe or malformed URLs (javascript:, data:, protocol-relative…)
 * are ignored. Fragment links never reach the host: they scroll inside the
 * component document.
 */
export function openComponentLink(raw: string, from: Element | null): boolean {
  const url = safeUrl(raw);
  if (url === '#' || url.startsWith('#')) {
    if (!raw.startsWith('#') || raw.length < 2) return false;
    const surface = from?.closest('.page-surface');
    const target = findPageAnchor(surface, url);
    target?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    return Boolean(target);
  }
  if (/^(mailto:|tel:)/i.test(url)) { window.location.assign(url); return true; }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
