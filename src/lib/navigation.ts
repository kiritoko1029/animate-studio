import type { MouseEvent } from 'react';
import { safeUrl } from '../model';
import { findPageAnchor } from './page-anchors';

export function navigate(event: MouseEvent<HTMLElement>, rawUrl?: string) {
  event.preventDefault();
  const url = safeUrl(rawUrl);
  if (url.startsWith('#')) {
    const surface = event.currentTarget.closest('.page-surface');
    const target = findPageAnchor(surface, url);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    return;
  }
  if (/^(mailto:|tel:)/i.test(url)) window.location.assign(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
