import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument } from '../src/model.ts';
import { validatePage, validateSite } from '../server/validation.mjs';
import { composeSitePage, createLayoutDocument, createSiteDocument } from '../shared/site-document.mjs';
import { createResponsiveCandidate, validateResponsive, responsiveDevice, pageAtDevice, pageAtWidth, updateDeviceFrame, updateDeviceFrames, updateDeviceCanvas, setDeviceBlockHidden, pruneResponsiveFrames, resetDeviceLayout } from '../src/lib/responsive.ts';

function fixture() {
  const page = createDocument(true);
  page.settings.maxWidth = 1000; page.settings.canvasHeight = 1400; page.settings.padding = 24;
  page.blocks = [
    { id: 'heading', type: 'heading', props: { title: '标题' }, frame: { x: 40, y: 40, width: 400, height: 200 }, bindings: { title: { kind: 'expression', value: 'state.title' } } },
    { id: 'card', type: 'card', props: { title: '卡片', text: '共用内容' }, frame: { x: 500, y: 40, width: 400, height: 240 } },
    { id: 'body', type: 'text', props: { text: '正文' }, frame: { x: 40, y: 400, width: 900, height: 200 } },
  ];
  return page;
}

test('fixed pages stay unchanged while adaptive candidates preserve reading order', () => {
  const page = fixture(), original = structuredClone(page);
  assert.equal(pageAtDevice(page, 'mobile'), page);
  assert.equal(pageAtWidth(page, 390), page);
  validateResponsive(page);
  const next = createResponsiveCandidate(page);
  assert.deepEqual(page, original);
  assert.equal(next.settings.responsive.mode, 'adaptive');
  assert.equal(next.settings.responsive.breakpoints.tablet.width, 768);
  assert.equal(next.settings.responsive.breakpoints.mobile.width, 390);
  assert.deepEqual(next.settings.responsive.breakpoints.mobile.frames.heading, { x: 24, y: 24, width: 342, height: 234 });
  assert.equal(next.settings.responsive.breakpoints.mobile.frames.card.y, 282);
  assert.ok(next.settings.responsive.breakpoints.mobile.frames.body.y > next.settings.responsive.breakpoints.mobile.frames.card.y);
  assert.equal(responsiveDevice(next.settings, 1200), 'desktop');
  assert.equal(responsiveDevice(next.settings, 1024), 'tablet');
  assert.equal(responsiveDevice(next.settings, 768), 'tablet');
  assert.equal(responsiveDevice(next.settings, 640), 'mobile');
  assert.equal(responsiveDevice(next.settings, 390), 'mobile');
  assert.equal(responsiveDevice(next.settings, 320), 'mobile');
  assert.equal(pageAtWidth(next, 390).settings.maxWidth, 390);
  assert.equal(pageAtWidth(next, 768).settings.maxWidth, 768);
  assert.equal(pageAtWidth(next, 1440).settings.maxWidth, 1000);
  validatePage(next);
  const withChildren = { ...next, blocks: [...next.blocks, { ...createBlock('form'), id: 'form', frame: { x: 24, y: 900, width: 500, height: 640 } }, { ...createBlock('repeater'), id: 'list', frame: { x: 24, y: 1600, width: 600, height: 820 } }] };
  validatePage(createResponsiveCandidate(withChildren));
});

test('editing one breakpoint never mutates desktop frames or shared block content', () => {
  const page = createResponsiveCandidate(fixture()), desktop = structuredClone(page.blocks);
  const frame = { x: 32, y: 64, width: 300, height: 240 };
  const mobile = updateDeviceFrame(page, 'heading', frame, 'mobile');
  assert.deepEqual(mobile.blocks, desktop);
  assert.deepEqual(pageAtDevice(mobile, 'mobile').blocks.find(block => block.id === 'heading').frame, frame);
  assert.deepEqual(pageAtDevice(mobile, 'tablet').blocks.find(block => block.id === 'heading').frame, pageAtDevice(page, 'tablet').blocks[0].frame);
  assert.equal(mobile.blocks[0].bindings.title.value, 'state.title');
  const group = updateDeviceFrames(mobile, { heading: { ...frame, x: 40 }, card: { x: 24, y: 400, width: 342, height: 280 } }, 'mobile');
  assert.equal(pageAtDevice(group, 'mobile').blocks.find(block => block.id === 'card').frame.y, 400);
  assert.deepEqual(group.blocks, desktop);
  const resized = updateDeviceCanvas(group, { width: 375, height: 2400 }, 'mobile');
  assert.equal(pageAtDevice(resized, 'mobile').settings.maxWidth, 375);
  assert.equal(resized.settings.maxWidth, 1000);
  assert.equal(resized.settings.responsive.breakpoints.tablet.width, 768);
});

test('missing overrides inherit, hidden blocks recover, pruning removes stale ids and reset is reversible', () => {
  const page = createResponsiveCandidate(fixture());
  const inherited = structuredClone(page);
  delete inherited.settings.responsive.breakpoints.mobile.frames.heading;
  const frame = pageAtDevice(inherited, 'mobile').blocks.find(block => block.id === 'heading').frame;
  assert.deepEqual(frame, pageAtDevice(inherited, 'mobile').blocks[0].frame);
  assert.ok(frame.width < 400);
  const hidden = setDeviceBlockHidden(page, 'heading', true, 'mobile');
  assert.equal(pageAtDevice(hidden, 'mobile').blocks.some(block => block.id === 'heading'), false);
  assert.equal(pageAtDevice(hidden, 'tablet').blocks.some(block => block.id === 'heading'), true);
  const restored = setDeviceBlockHidden(hidden, 'heading', false, 'mobile');
  assert.deepEqual(pageAtDevice(restored, 'mobile').blocks.find(block => block.id === 'heading').frame, frame);
  const hiddenTablet = setDeviceBlockHidden(inherited, 'heading', true, 'tablet');
  assert.equal(pageAtDevice(hiddenTablet, 'mobile').blocks.some(block => block.id === 'heading'), false);
  const restoredMobile = setDeviceBlockHidden(hiddenTablet, 'heading', false, 'mobile');
  assert.equal(pageAtDevice(restoredMobile, 'mobile').blocks.some(block => block.id === 'heading'), true);
  assert.equal(pageAtDevice(restoredMobile, 'tablet').blocks.some(block => block.id === 'heading'), false);
  const pruned = pruneResponsiveFrames({ ...page, blocks: page.blocks.filter(block => block.id !== 'card') });
  assert.equal(pruned.settings.responsive.breakpoints.mobile.frames.card, undefined);
  validatePage(pruned);
  const reset = resetDeviceLayout(hidden, 'mobile');
  assert.deepEqual(reset.settings.responsive.breakpoints.mobile, page.settings.responsive.breakpoints.mobile);
  assert.deepEqual(reset.settings.responsive.breakpoints.tablet, hidden.settings.responsive.breakpoints.tablet);
  assert.deepEqual(resetDeviceLayout(page, 'desktop').settings.responsive, { mode: 'fixed' });
});

test('responsive validation rejects unsafe or stale schema without loosening page limits', () => {
  const page = createResponsiveCandidate(fixture());
  assert.throws(() => validateResponsive({ ...page, settings: { ...page.settings, responsive: { mode: 'fixed', breakpoints: {} } } }), /固定画布/);
  assert.throws(() => validateResponsive({ ...page, settings: { ...page.settings, responsive: { ...page.settings.responsive, breakpoints: { ...page.settings.responsive.breakpoints, mobile: { ...page.settings.responsive.breakpoints.mobile, frames: { deleted: null } } } } } }), /已删除/);
  assert.throws(() => validateResponsive({ ...page, settings: { ...page.settings, responsive: { ...page.settings.responsive, breakpoints: { ...page.settings.responsive.breakpoints, mobile: { ...page.settings.responsive.breakpoints.mobile, frames: { heading: { x: 0, y: 0, width: 0, height: 32 } } } } } } }), /width/);
  assert.throws(() => validateResponsive({ ...page, settings: { ...page.settings, responsive: { ...page.settings.responsive, breakpoints: { ...page.settings.responsive.breakpoints, mobile: { ...page.settings.responsive.breakpoints.mobile, frames: JSON.parse('{"__proto__":null}') } } } } }), /不支持的属性/);
  const tall = fixture(); tall.blocks[0].frame.height = 3000; tall.blocks[1].frame.y = 3100; tall.blocks[1].frame.height = 3000; tall.blocks[2].frame.y = 6200; tall.settings.canvasHeight = 6000;
  assert.throws(() => createResponsiveCandidate(tall), /6000/);
  const clamped = updateDeviceFrame(page, 'heading', { x: 0, y: 5900, width: 342, height: 200 }, 'mobile');
  assert.ok(pageAtDevice(clamped, 'mobile').blocks[0].frame.y + pageAtDevice(clamped, 'mobile').blocks[0].frame.height <= 6000);
  validatePage(clamped);
});

test('composed responsive pages retain shared prefixes, offsets and height limits', () => {
  const page = createResponsiveCandidate(fixture()), site = createSiteDocument(page);
  site.sharedLayout.header = createLayoutDocument('header', page.settings);
  site.sharedLayout.header.blocks = [{ id: 'brand', type: 'text', props: { text: '共享品牌' }, frame: { x: 24, y: 24, width: 400, height: 120 } }];
  site.sharedLayout.header = createResponsiveCandidate(site.sharedLayout.header);
  site.pages[0].layout = ['header'];
  const desktop = composeSitePage(site, site.pages[0]);
  assert.equal(desktop.blocks[0].frame.y, 360);
  assert.equal(desktop.blocks.at(-1).id, 'header-brand');
  const mobile = composeSitePage(site, site.pages[0], 390);
  assert.equal(mobile.settings.maxWidth, 390);
  assert.equal(mobile.settings.canvasHeight <= 6000, true);
  assert.equal(mobile.blocks.at(-1).id, 'header-brand');
  assert.equal(mobile.settings.responsive, undefined);
  validatePage(mobile);
  validateSite(site);
  const original = structuredClone(site.pages[0].page);
  assert.deepEqual(site.pages[0].page, original);
});

test('narrow sidebars stack above content without losing shared navigation', () => {
  const page = fixture(); page.blocks = page.blocks.slice(0, 1);
  const site = createSiteDocument(createResponsiveCandidate(page));
  site.sharedLayout.sidebar = createLayoutDocument('sidebar', page.settings);
  site.sharedLayout.sidebar.settings.canvasHeight = 420;
  site.sharedLayout.sidebar.blocks = [{ id: 'menu', type: 'text', props: { text: '共享菜单' }, frame: { x: 24, y: 24, width: 200, height: 120 } }];
  site.pages[0].layout = ['sidebar'];
  const desktop = composeSitePage(site, site.pages[0]);
  assert.equal(desktop.blocks[0].frame.x, 360);
  const mobile = composeSitePage(site, site.pages[0], 390);
  assert.equal(mobile.blocks.find(block => block.id === 'sidebar-menu').frame.y, 24);
  assert.equal(mobile.blocks.find(block => block.id === 'heading').frame.y, 444);
  assert.equal(mobile.blocks.find(block => block.id === 'heading').frame.x, 24);
  assert.ok(mobile.settings.canvasHeight <= 6000);
  validatePage(mobile);
  validateSite(site);
});
