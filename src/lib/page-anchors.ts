import type { PageDocument } from '../model.ts';

/** Stable block IDs take precedence over the original template's section aliases. */
export function findPageAnchor(surface: Element | null | undefined, hash: string): Element | null {
  if (!surface || !hash.startsWith('#')) return null;
  if (hash === '#') return surface;
  const targets = Array.from(surface.querySelectorAll('[data-anchor]'));
  return targets.find(node => node.getAttribute('data-block-id') === hash.slice(1))
    ?? targets.find(node => `#${node.getAttribute('data-anchor')}` === hash) ?? null;
}

export function pageAnchorNames(page: PageDocument): Set<string> {
  const names = new Set(page.blocks.map(block => block.id));
  for (const block of page.blocks) {
    if (block.type === 'card') names.add('features');
    if (block.type === 'accordion') names.add('about');
    if (block.type === 'footer') names.add('contact');
  }
  return names;
}
