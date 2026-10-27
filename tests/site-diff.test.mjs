import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument } from '../src/model.ts';
import { createLayoutDocument, createSiteDocument, createSitePage } from '../shared/site-document.mjs';
import { diffSites } from '../src/lib/site-diff.ts';

function fixture() {
  const page = createDocument(true), block = { ...createBlock('text'), id: 'intro', frame: { x: 48, y: 48, width: 600, height: 140 } };
  page.blocks = [block];
  const site = createSiteDocument(page);
  return { site, block };
}

test('first publication and JSON object key order have useful, stable semantics', () => {
  const { site } = fixture();
  assert.equal(diffSites(null, site).hasChanges, true);
  assert.equal(diffSites(site, site).hasChanges, false);
  const reordered = structuredClone(site);
  reordered.pages[0].page.blocks[0] = Object.fromEntries(Object.entries(reordered.pages[0].page.blocks[0]).reverse());
  assert.equal(diffSites(site, reordered).hasChanges, false, 'object key order is not a content change');
  assert.equal(diffSites(site.pages[0].page, site).hasChanges, false, 'legacy single-page documents compare through the site contract');
});

test('site diff identifies page, block, layout and data-source changes without reading JSON manually', () => {
  const { site } = fixture();
  const after = structuredClone(site);
  after.name = '更新后的站点';
  const entry = after.pages[0];
  entry.name = '新首页'; entry.page.name = '新首页'; entry.page.settings.padding = 24;
  entry.page.blocks[0].props.text = '新版内容';
  entry.page.blocks.push({ ...createBlock('button'), id: 'cta', frame: { x: 48, y: 240, width: 220, height: 80 } });
  entry.page.blocks.reverse();
  const header = createLayoutDocument('header', entry.page.settings);
  after.sharedLayout.header = header; entry.layout = ['header'];
  after.dataSources = [{ id: 'books', name: '书籍', kind: 'static', mode: 'collection', items: [{ id: 1, title: '示例' }] }];
  const diff = diffSites(site, after);
  assert.equal(diff.siteNameChanged, true);
  assert.equal(diff.changedPages, 1);
  assert.equal(diff.changedBlocks, 2);
  assert.equal(diff.pages[0].settingsChanged, true);
  assert.equal(diff.pages[0].metadataChanged, true);
  assert.equal(diff.pages[0].layoutChanged, true);
  assert.equal(diff.pages[0].orderChanged, false, 'adding a block is not itself a reorder');
  const reordered = structuredClone(after); reordered.pages[0].page.blocks.reverse();
  assert.equal(diffSites(after, reordered).pages[0].orderChanged, true);
  assert.deepEqual(diff.pages[0].blocks.map(block => block.kind).sort(), ['added', 'changed']);
  assert.equal(diff.layouts[0].kind, 'added');
  assert.equal(diff.dataSources[0].kind, 'added');
});

test('site diff makes public page, layout and data-source removal explicit', () => {
  const { site } = fixture();
  const extra = createSitePage(site, '活动页'); extra.path = '/event';
  site.pages.push(extra);
  const header = createLayoutDocument('header', site.pages[0].page.settings);
  site.sharedLayout.header = header; site.pages[0].layout = ['header'];
  site.dataSources = [{ id: 'old', name: '旧数据', kind: 'static', mode: 'collection', items: [] }];
  const after = structuredClone(site);
  after.pages = after.pages.filter(entry => entry.id !== extra.id);
  after.pages[0].layout = []; delete after.sharedLayout.header; delete after.dataSources;
  const diff = diffSites(site, after);
  assert.equal(diff.removedPages, 1);
  assert.equal(diff.pages.find(page => page.id === extra.id).kind, 'removed');
  assert.equal(diff.layouts[0].kind, 'removed');
  assert.equal(diff.dataSources[0].kind, 'removed');
});

test('page tree and data source order changes are visible even when content is otherwise identical', () => {
  const { site } = fixture();
  const second = createSitePage(site, '第二页'); second.path = '/second'; site.pages.push(second);
  site.dataSources = [
    { id: 'a', name: '数据 A', kind: 'static', mode: 'collection', items: [] },
    { id: 'b', name: '数据 B', kind: 'static', mode: 'collection', items: [] },
  ];
  const after = structuredClone(site);
  after.pages.reverse(); after.dataSources.reverse();
  const diff = diffSites(site, after);
  assert.equal(diff.pageOrderChanged, true);
  assert.equal(diff.dataSourceOrderChanged, true);
  assert.equal(diff.hasChanges, true);
  assert.ok(diff.pages.every(page => page.kind === 'unchanged'));
  assert.ok(diff.dataSources.every(source => source.kind === 'unchanged'));
});
