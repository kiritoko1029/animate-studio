import type { PageDocument } from '../../model';

/** Page identity survives renaming and layout edits; previews have their own browser data. */
export function variableStorageKey(page: PageDocument, scope = 'preview') {
  // Older JSON exports have no page ID. The editor assigns one when opening them.
  const id = page.id ?? `legacy:${JSON.stringify(page.blocks.length ? page.blocks.map(block => block.id).sort() : [page.name])}`;
  return `animate-studio:variables:v1:${scope}:${id}`;
}
