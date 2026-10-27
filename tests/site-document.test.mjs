import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createBlock, toFreeDocument } from '../src/model.ts';
import { createSiteDocument, createSitePage, createLayoutDocument, toSiteDocument, validateSiteDocument, matchSiteRoute, composeSitePage, duplicateSitePage, moveSitePage, setSiteHomePage, removeSitePage, inspectSiteLinks, replaceActiveDocument, getActiveDocument, siteLimits } from '../shared/site-document.mjs';
import { validatePage, validateSite } from '../server/validation.mjs';

const valid = site => validateSiteDocument(site, validatePage);
function fixture() {
  const site = createSiteDocument(createDocument(true));
  const list = createSitePage(site, '作品列表'); list.path = '/products';
  const detail = createSitePage(site, '作品详情', 'detail'); detail.path = '/products/:id';
  site.pages.push(list, detail);
  return site;
}

test('legacy pages become valid single-page sites without changing their identity', () => {
  const page = toFreeDocument({ ...createDocument(true), id: undefined });
  const site = toSiteDocument(page);
  assert.equal(site.pages[0].page.id, page.id);
  assert.equal(site.pages[0].path, '/');
  assert.notEqual(site.id, page.id);
  assert.equal(toSiteDocument(site), site);
  valid(site);
});

test('site page operations preserve independent drafts and stable ids', () => {
  const site = fixture(); valid(site);
  const { site: copied, id } = duplicateSitePage(site, site.pages[1].id);
  assert.equal(copied.pages.length, 4);
  assert.notEqual(id, site.pages[1].id);
  assert.notEqual(copied.pages[2].page.id, copied.pages[1].page.id);
  assert.equal(copied.pages[2].page.blocks[0]?.id, copied.pages[1].page.blocks[0]?.id, 'block ids are scoped to their page');
  assert.equal(moveSitePage(copied, id, -1).pages[1].id, id);
  const home = setSiteHomePage(site, site.pages[1].id);
  assert.equal(home.pages[1].path, '/');
  assert.notEqual(home.pages[0].path, '/');
  valid(home);
  const next = replaceActiveDocument(site, site.pages[1].id, { ...site.pages[1].page, name: '项目列表' });
  assert.equal(next.pages[1].name, '项目列表');
  assert.equal(getActiveDocument(next, site.pages[1].id).name, '项目列表');
  assert.equal(site.pages[1].name, '作品列表', 'updates are immutable');
  site.sharedLayout.sidebar = createLayoutDocument('sidebar', site.pages[0].page.settings);
  const sidebar = replaceActiveDocument(site, 'sidebar', { ...site.sharedLayout.sidebar, name: '后台导航' });
  assert.equal(getActiveDocument(sidebar, 'sidebar').name, '后台导航');
  assert.equal(getActiveDocument(site, 'sidebar').name, '共享侧栏');
});

test('routing resolves static paths, dynamic parameters, encoded values and missing routes', () => {
  const site = fixture();
  assert.equal(matchSiteRoute(site, '/products').entry.name, '作品列表');
  assert.equal(matchSiteRoute(site, '/products/a%20b').params.id, 'a b');
  assert.equal(matchSiteRoute(site, '/products/a%2Fb').params.id, 'a/b');
  assert.equal(matchSiteRoute(site, '/').entry.id, site.homePageId);
  assert.equal(matchSiteRoute(site, '#/products/42').params.id, '42');
  assert.equal(matchSiteRoute(site, '/products/42/reviews'), null);
  assert.equal(matchSiteRoute(site, '//evil.example'), null);
  assert.throws(() => { const next = fixture(); next.pages[2].path = '/bad path'; valid(next); }, /站内路径/);
  assert.throws(() => { const next = fixture(); next.pages[2].path = next.pages[1].path; valid(next); }, /不能重复/);
});

test('shared layout composition offsets frames and namespaces script and block ids', () => {
  const site = fixture(), entry = site.pages[0];
  entry.page.blocks = [{ ...createBlock('text'), id: 'body-copy', frame: { x: 48, y: 48, width: 300, height: 160 } }];
  site.sharedLayout.header = createLayoutDocument('header', entry.page.settings);
  site.sharedLayout.header.blocks = [{ ...createBlock('navbar'), id: 'site-nav', frame: { x: 0, y: 0, width: 1920, height: 85 } }];
  site.sharedLayout.header.scripts = [{ id: 'track', name: 'Track', code: 'ctx.log("ok")' }];
  site.sharedLayout.header.blocks[0].events = { click: [{ type: 'script', scriptId: 'track' }] };
  entry.layout = ['header'];
  const composed = composeSitePage(site, entry);
  assert.equal(composed.settings.canvasHeight, entry.page.settings.canvasHeight + 320);
  assert.equal(composed.blocks[0].id, 'body-copy');
  assert.equal(composed.blocks[0].frame.y, 368);
  assert.equal(composed.blocks[1].id, 'header-site-nav');
  assert.equal(composed.blocks[1].events.click[0].scriptId, 'header-track');
  validatePage(composed); valid(site);
  entry.layout = ['header', 'footer']; site.sharedLayout.footer = createLayoutDocument('footer', entry.page.settings);
  site.sharedLayout.footer.blocks = [{ ...createBlock('footer'), id: 'site-footer', frame: { x: 0, y: 16, width: 1000, height: 110 } }];
  const withFooter = composeSitePage(site, entry);
  assert.equal(withFooter.settings.canvasHeight, entry.page.settings.canvasHeight + 640);
  assert.equal(withFooter.blocks.at(-1).id, 'footer-site-footer');
  assert.equal(withFooter.blocks.at(-1).frame.y, 320 + entry.page.settings.canvasHeight + 16);
  validatePage(withFooter); valid(site);
  entry.layout = ['header', 'sidebar']; site.sharedLayout.sidebar = createLayoutDocument('sidebar', entry.page.settings);
  site.sharedLayout.sidebar.blocks = [{ ...createBlock('text'), id: 'side-copy', frame: { x: 0, y: 32, width: 292, height: 160 } }];
  const withSidebar = composeSitePage(site, entry);
  assert.equal(withSidebar.blocks[0].frame.x, 48 + 320);
  assert.equal(withSidebar.blocks.at(-1).frame.y, 320 + 32);
  assert.equal(withSidebar.blocks.at(-1).id, 'sidebar-side-copy');
  validatePage(withSidebar); valid(site);
  site.sharedLayout.sidebar.settings.maxWidth = 800;
  assert.throws(() => valid(site), /320–640/);
  site.sharedLayout.sidebar.settings.maxWidth = 320;
  entry.page.blocks[0].frame.x = 1800;
  assert.throws(() => composeSitePage(site, entry), /超出页面宽度/);
  entry.page.blocks[0].frame.x = 48;
  site.sharedLayout.footer.settings.canvasHeight = 1000; entry.page.settings.canvasHeight = 6000;
  assert.throws(() => composeSitePage(site, entry), /6000/);
});

test('page deletion reports and cleans only literal internal links atomically', () => {
  const site = fixture(), target = site.pages[1];
  site.pages[0].page.blocks = [{ ...createBlock('button'), id: 'more', props: { ...createBlock('button').props, url: target.path }, frame: { x: 20, y: 20, width: 240, height: 100 } }];
  site.pages[0].page.blocks[0].events = { click: [{ type: 'navigate', expression: '"/products"' }] };
  assert.equal(inspectSiteLinks(site).filter(link => link.missing).length, 0);
  const removed = removeSitePage(site, target.id);
  assert.equal(removed.pages.length, 2);
  assert.equal(removed.pages[0].page.blocks[0].props.url, '#');
  assert.equal(removed.pages[0].page.blocks[0].events.click[0].expression, '"#"');
  assert.throws(() => removeSitePage(site, site.homePageId), /不能删除/);
  valid(removed);
});

test('strict validation rejects unsupported fields, invalid ownership and size overflow', () => {
  const site = fixture();
  assert.throws(() => valid({ ...site, credentials: 'secret' }), /不支持的属性/);
  assert.throws(() => valid({ ...site, homePageId: 'missing', pages: site.pages.map(entry => entry.path === '/' ? { ...entry, path: '/home' } : entry) }), /首页不存在/);
  assert.throws(() => valid({ ...site, pages: [{ ...site.pages[0], page: { ...site.pages[0].page, id: 'different' } }] }), /必须一致/);
  assert.throws(() => valid({ ...site, pages: Array.from({ length: siteLimits.pages + 1 }, (_, index) => ({ ...site.pages[0], id: `p-${index}`, path: `/p-${index}`, page: { ...site.pages[0].page, id: `p-${index}` } })) }), /1–24/);
  const huge = createSiteDocument(createDocument(true));
  huge.pages[0].page.blocks = Array.from({ length: 200 }, () => ({ ...createBlock('table'), frame: { x: 20, y: 20, width: 560, height: 310 }, props: { items: 'a'.repeat(20000) } }));
  assert.throws(() => valid(huge), /2 MiB/);
});
