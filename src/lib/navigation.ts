import type { MouseEvent } from 'react';
import { safeUrl } from '../model';

export function navigate(event: MouseEvent<HTMLElement>, rawUrl?: string) {
  event.preventDefault();
  const url = safeUrl(rawUrl);
  if (url.startsWith('#')) {
    const surface = event.currentTarget.closest('.page-surface');
    const target = url.length === 1 ? surface : Array.from(surface?.querySelectorAll('[data-anchor]') ?? []).find(node => `#${node.getAttribute('data-anchor')}` === url);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    return;
  }
  if (/^(mailto:|tel:)/i.test(url)) window.location.assign(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
