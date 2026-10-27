import type { Block, ComponentType, SiteDocument, StudioDocument } from '../model.ts';
import { toSiteDocument, type SitePageEntry, type SiteRegion } from '../../shared/site-document.mjs';
import { jsonEqual } from './publishing.ts';

export type SiteChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';
export type SiteBlockChange = { id: string; type: ComponentType; kind: SiteChangeKind };
export type SitePageChange = {
  id: string; name: string; path: string; pageKind: SitePageEntry['kind']; kind: SiteChangeKind;
  settingsChanged: boolean; layoutChanged: boolean; metadataChanged: boolean; orderChanged: boolean;
  blocks: SiteBlockChange[];
};
export type SiteItemChange = { id: string; name: string; kind: SiteChangeKind };
export type SiteDiff = {
  pages: SitePageChange[]; layouts: (SiteItemChange & { region: SiteRegion })[]; dataSources: SiteItemChange[];
  siteNameChanged: boolean; pageOrderChanged: boolean; dataSourceOrderChanged: boolean; hasChanges: boolean; changedPages: number; changedBlocks: number; removedPages: number;
};

function orderChanged(before: string[], after: string[]): boolean {
  const afterIds = new Set(after), beforeIds = new Set(before);
  const retained = before.filter(id => afterIds.has(id)), reordered = after.filter(id => beforeIds.has(id));
  return retained.some((id, index) => id !== reordered[index]);
}

function blockChanges(before: Block[] | undefined, after: Block[]): { blocks: SiteBlockChange[]; orderChanged: boolean; changed: boolean } {
  const old = new Map((before ?? []).map(block => [block.id, block])), next = new Map(after.map(block => [block.id, block]));
  const ids = [...after.map(block => block.id), ...(before ?? []).filter(block => !next.has(block.id)).map(block => block.id)];
  const blocks = ids.map(id => {
    const previous = old.get(id), current = next.get(id);
    const kind: SiteChangeKind = !previous ? 'added' : !current ? 'removed' : !jsonEqual(previous, current) ? 'changed' : 'unchanged';
    return { id, type: (current ?? previous)!.type, kind };
  });
  const orderChanged = (before ?? []).length === after.length && (before ?? []).some((block, index) => block.id !== after[index]?.id);
  return { blocks, orderChanged, changed: orderChanged || blocks.some(block => block.kind !== 'unchanged') };
}

function pageChanges(before: SiteDocument | null, after: SiteDocument): SitePageChange[] {
  const old = new Map((before?.pages ?? []).map(entry => [entry.id, entry])), next = new Map(after.pages.map(entry => [entry.id, entry]));
  const ids = [...after.pages.map(entry => entry.id), ...(before?.pages ?? []).filter(entry => !next.has(entry.id)).map(entry => entry.id)];
  return ids.map(id => {
    const previous = old.get(id), current = next.get(id), entry = current ?? previous!;
    const compared = blockChanges(previous?.page.blocks, current?.page.blocks ?? []);
    const settingsChanged = !jsonEqual(previous?.page.settings, current?.page.settings);
    const layoutChanged = !jsonEqual(previous?.layout, current?.layout);
    const metadataChanged = previous?.name !== current?.name || previous?.path !== current?.path || previous?.kind !== current?.kind || previous?.group !== current?.group || !jsonEqual(previous?.seo, current?.seo) || !jsonEqual(previous?.page.variables ?? [], current?.page.variables ?? []) || !jsonEqual(previous?.page.scripts ?? [], current?.page.scripts ?? []);
    const changed = compared.changed || settingsChanged || layoutChanged || metadataChanged;
    return { id, name: entry.name, path: entry.path, pageKind: entry.kind, kind: !previous ? 'added' : !current ? 'removed' : changed ? 'changed' : 'unchanged', settingsChanged, layoutChanged, metadataChanged, orderChanged: compared.orderChanged, blocks: compared.blocks };
  });
}

function itemChanges(before: { id: string; name: string }[] | undefined, after: { id: string; name: string }[]): { items: SiteItemChange[]; orderChanged: boolean } {
  const old = new Map((before ?? []).map(item => [item.id, item])), next = new Map(after.map(item => [item.id, item]));
  const ids = [...new Set([...old.keys(), ...next.keys()])];
  return {
    items: ids.map(id => {
      const previous = old.get(id), current = next.get(id);
      return { id, name: (current ?? previous)!.name, kind: !previous ? 'added' : !current ? 'removed' : !jsonEqual(previous, current) ? 'changed' : 'unchanged' };
    }),
    orderChanged: orderChanged((before ?? []).map(item => item.id), after.map(item => item.id)),
  };
}

export function diffSites(before: StudioDocument | null, after: StudioDocument): SiteDiff {
  before = before ? toSiteDocument(before) : null;
  after = toSiteDocument(after);
  const pages = pageChanges(before, after);
  const regions = ['header', 'footer', 'sidebar'] as const;
  const layouts: SiteDiff['layouts'] = regions.filter(region => before?.sharedLayout[region] || after.sharedLayout[region]).map(region => {
    const previous = before?.sharedLayout[region], current = after.sharedLayout[region];
    return { id: `shared-${region}`, region, name: current?.name ?? previous?.name ?? region, kind: !previous ? 'added' : !current ? 'removed' : !jsonEqual(previous, current) ? 'changed' : 'unchanged' };
  });
  const sourceChanges = itemChanges(before?.dataSources, after.dataSources ?? []), dataSources = sourceChanges.items;
  const siteNameChanged = !!before && before.name !== after.name;
  const pageOrderChanged = orderChanged((before?.pages ?? []).map(entry => entry.id), after.pages.map(entry => entry.id));
  return {
    pages, layouts, dataSources, siteNameChanged, pageOrderChanged, dataSourceOrderChanged: sourceChanges.orderChanged,
    hasChanges: !before || siteNameChanged || pageOrderChanged || sourceChanges.orderChanged || [...pages, ...layouts, ...dataSources].some(item => item.kind !== 'unchanged'),
    changedPages: pages.filter(page => page.kind !== 'unchanged').length,
    changedBlocks: pages.reduce((total, page) => total + page.blocks.filter(block => block.kind !== 'unchanged').length, 0),
    removedPages: pages.filter(page => page.kind === 'removed').length,
  };
}
