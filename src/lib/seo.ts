import { seoMetaEntries, type ResolvedSeo } from '../../shared/seo.mjs';

export function applySeoMetadata(seo: ResolvedSeo): () => void {
  const head = window.document.head;
  const previousTitle = window.document.title;
  window.document.title = seo.title;
  const restore: (() => void)[] = [() => { window.document.title = previousTitle; }];
  const entries = seoMetaEntries(seo), retained = new Set(entries.map(entry => entry.key));
  head.querySelectorAll<HTMLMetaElement>('meta[property^="og:"], meta[name^="twitter:"]').forEach(element => {
    const key = `${element.hasAttribute('property') ? 'property' : 'name'}:${element.getAttribute('property') ?? element.getAttribute('name')}`;
    if (retained.has(key)) return;
    const previous = element.getAttribute('content');
    element.remove();
    restore.push(() => { if (previous === null) element.remove(); else if (!element.isConnected) head.append(element); });
  });
  for (const entry of entries) {
    const selector = entry.property ? `meta[property="${entry.property}"]` : `meta[name="${entry.name}"]`;
    let element = head.querySelector<HTMLMetaElement>(selector);
    const previous = element?.getAttribute('content') ?? null;
    if (!element) { element = window.document.createElement('meta'); head.append(element); }
    if (entry.property) element.setAttribute('property', entry.property); else element.setAttribute('name', entry.name!);
    element.setAttribute('content', entry.content);
    restore.push(() => { if (previous === null) element.remove(); else element.setAttribute('content', previous); });
  }
  let canonical = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const previousCanonical = canonical?.getAttribute('href') ?? null;
  if (seo.canonical) {
    if (!canonical) { canonical = window.document.createElement('link'); canonical.rel = 'canonical'; head.append(canonical); }
    canonical.href = seo.canonical;
  } else canonical?.remove();
  restore.push(() => {
    if (!canonical) return;
    if (previousCanonical === null) canonical.remove(); else { canonical.rel = 'canonical'; canonical.href = previousCanonical; if (!canonical.isConnected) head.append(canonical); }
  });
  return () => { for (const undo of restore.reverse()) undo(); };
}
export function clearSeoMetadata(): void {
  window.document.head.querySelectorAll('meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]').forEach(element => element.remove());
}
