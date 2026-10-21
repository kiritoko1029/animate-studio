import type { PageDocument } from '../model';

export type LayerAction = 'lower' | 'raise' | 'top' | 'bottom';

/** Blocks are stored back to front; reordering never changes their geometry. */
export function moveBlockLayer(page: PageDocument, id: string, action: LayerAction): PageDocument {
  const from = page.blocks.findIndex(block => block.id === id);
  if (from < 0) return page;
  const to = action === 'top' ? page.blocks.length - 1 : action === 'bottom' ? 0
    : Math.max(0, Math.min(page.blocks.length - 1, from + (action === 'raise' ? 1 : -1)));
  if (from === to) return page;
  const blocks = [...page.blocks];
  blocks.splice(to, 0, blocks.splice(from, 1)[0]);
  return { ...page, blocks };
}
