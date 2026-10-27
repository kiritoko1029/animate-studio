import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDocument } from '../src/model.ts';
import { createSiteDocument, createSitePage, duplicateSitePage } from '../shared/site-document.mjs';
import { validateSite } from '../server/validation.mjs';
import { isSeoImage, renderPublicRobots, renderSitemap, resolveSeo, seoMetaEntries, validateSeo } from '../shared/seo.mjs';
import { injectPublicMetadata, matchPublicPagePath } from '../server/public-page.ts';
import { handleCloudPublicPage } from '../server/cloud-account-api.ts';
import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createD1Fixture } from './helpers/d1.mjs';
import { createApp } from '../server/index.mjs';
import { siteFromPlan, applySiteOperation } from '../src/lib/ai/site-ai.ts';
import { parseAiOperation } from '../src/lib/ai/protocol.ts';
import { diffSites } from '../src/lib/site-diff.ts';
import { applySeoMetadata } from '../src/lib/seo.ts';
import { generateNativeCode } from '../src/lib/code-export/native.ts';

const token = '0123456789abcdef0123456789abcdef';
function fixtureSite() {
  const page = createDocument(true);
  page.blocks = [{ id: 'intro', type: 'text', props: { text: '这是公开摘要。', fontSize: 16, padding: 20 }, frame: { x: 48, y: 48, width: 600, height: 120 } }];
  const site = createSiteDocument(page, '知行 & 大学');
  site.pages[0].seo = { title: '知行 & 大学 <首页>', description: '校园 <新闻> & 招生', imageUrl: '/landscape.svg' };
  const news = createSitePage(site, '校园新闻'); news.path = '/news'; news.seo = { title: '新闻 & 公告', description: '最新 <动态>' }; news.page.blocks = [];
  const hidden = createSitePage(site, '内部说明'); hidden.path = '/internal'; hidden.seo = { noIndex: true }; hidden.page.blocks = [];
  const detail = createSitePage(site, '文章详情', 'detail'); detail.path = '/articles/:id'; detail.page.blocks = [];
  const missing = createSitePage(site, '没有找到页面', 'notFound'); missing.page.blocks = [];
  site.pages.push(news, hidden, detail, missing);
  return validateSite(site);
}
async function database(t) {
  const db = await createNodeDatabase({}, { file: ':memory:' });
  t.after(() => db.close());
  await applyNodeMigrations(db);
  const now = new Date().toISOString();
  db.db.$client.prepare('INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)').run('owner', 'Owner', 'owner@seo.test', now, now);
  return db;
}
async function publishedRepository(t, site = fixtureSite()) {
  const db = await database(t), repository = createPageRepository(db.db, db.schema, db.dialect);
  const record = await repository.create('owner', site, crypto.randomUUID());
  const result = await repository.publish('owner', record.id, token, { expectedRevision: record.savedAt, expectedPublishedVersion: null });
  assert.equal(result.status, 'published');
  return { db, repository, record, site };
}

test('SEO validation and page duplication preserve safe metadata only', () => {
  const site = fixtureSite();
  assert.equal(duplicateSitePage(site, site.homePageId).site.pages[1].seo.title, site.pages[0].seo.title);
  assert.notEqual(duplicateSitePage(site, site.homePageId).site.pages[1].seo, site.pages[0].seo);
  assert.equal(isSeoImage('https://example.com/social.png'), true);
  assert.equal(isSeoImage('asset:4e5c7dc6-d76c-4913-b5ea-aa620e001f3f'), true);
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,x', '//evil.test/a.png', '/bad image.png']) assert.equal(isSeoImage(value), false, value);
  assert.throws(() => validateSeo({ title: 'x', extra: true }), /不支持/);
  assert.throws(() => validateSite({ ...site, pages: [{ ...site.pages[0], seo: { imageUrl: 'javascript:alert(1)' } }] }), /图片/);
});

test('public metadata resolves defaults, deep routes, noindex and escaped sitemap', () => {
  const site = fixtureSite(), options = { origin: 'https://studio.test', basePath: `/p/${token}` };
  const home = resolveSeo(site, '/', options);
  assert.equal(home.title, '知行 & 大学 <首页>');
  assert.equal(home.canonical, `https://studio.test/p/${token}`);
  assert.equal(home.imageUrl, 'https://studio.test/landscape.svg');
  assert.equal(home.robots, 'index,follow');
  assert.equal(resolveSeo(site, '/news', options).title, '新闻 & 公告');
  assert.equal(resolveSeo(site, '/articles/42', options).noIndex, true);
  assert.equal(resolveSeo(site, '/missing', options).notFound, true);
  const sitemap = renderSitemap(site, { ...options, publishedAt: '2026-10-27T01:02:03.000Z' });
  assert.match(sitemap, /\/news<\/loc>/);
  assert.doesNotMatch(sitemap, /internal|articles|:id/);
  assert.match(sitemap, /<lastmod>2026-10-27T01:02:03.000Z<\/lastmod>/);
  assert.match(renderPublicRobots(site, options), /Sitemap: https:\/\/studio.test\/p\/[^/]+\/sitemap.xml/);
  const html = injectPublicMetadata('<html><head><title>Editor</title><meta name="description" content="old"></head></html>', home);
  assert.match(html, /知行 &amp; 大学 &lt;首页&gt;/);
  assert.doesNotMatch(html, /<title>Editor<\/title>|content="old"/);
  assert.equal(seoMetaEntries(home).some(entry => entry.property === 'og:image'), true);
  assert.equal(matchPublicPagePath(`/p/${token}/news`).path, '/news');
  assert.equal(matchPublicPagePath(`/p/${token}/robots.txt`).resource, 'robots');
  assert.equal(matchPublicPagePath('/p/not-a-token'), null);
});

test('Node serves real published HTML, sitemap and draft/public separation', async t => {
  const { repository, record, site } = await publishedRepository(t);
  const accounts = { factory: { baseURL: '' }, context: { repository }, close: async () => {} };
  const app = await createApp({ serveFrontend: true, production: false, accounts, viteConfig: { server: { hmr: false } } });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.locals.closeFrontend?.(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${origin}/p/${token}`);
  const home = await response.text();
  assert.equal(response.status, 200);
  assert.match(home, /知行 &amp; 大学 &lt;首页&gt;/);
  assert.match(home, /<link rel="canonical" href="http:\/\/127.0.0.1:\d+\/p\/[^"]+" \/>/);
  assert.match(home, /property="og:image" content="http:\/\/127.0.0.1:\d+\/landscape.svg"/);
  assert.equal(response.headers.get('x-robots-tag'), 'index,follow');
  response = await fetch(`${origin}/p/${token}/news`);
  assert.match(await response.text(), /新闻 &amp; 公告/);
  response = await fetch(`${origin}/p/${token}/articles/42`);
  assert.match(await response.text(), /name="robots" content="noindex,nofollow"/);
  response = await fetch(`${origin}/p/${token}/missing`);
  assert.equal(response.status, 404);
  assert.match(await response.text(), /name="robots" content="noindex,nofollow"/);
  const sitemap = await (await fetch(`${origin}/p/${token}/sitemap.xml`)).text();
  assert.match(sitemap, /\/news<\/loc>/);
  assert.doesNotMatch(sitemap, /internal|articles/);
  const next = structuredClone(site); next.pages[0].seo.title = '仅保存的草稿';
  const saved = await repository.saveSite('owner', record.id, next, record.savedAt);
  assert.equal(saved.status, 'saved');
  assert.match(await (await fetch(`${origin}/p/${token}`)).text(), /知行 &amp; 大学/);
  const published = await repository.publish('owner', record.id, token, { expectedRevision: saved.record.savedAt, expectedPublishedVersion: 1 });
  assert.equal(published.status, 'published');
  assert.match(await (await fetch(`${origin}/p/${token}`)).text(), /仅保存的草稿/);
  await repository.unpublish('owner', record.id);
  response = await fetch(`${origin}/p/${token}`);
  assert.equal(response.status, 404);
  assert.match(await response.text(), /noindex,nofollow/);
  response = await fetch(`${origin}/p/${token}/sitemap.xml`);
  assert.equal(response.status, 404);
});

test('Cloudflare public route reads the shell and real D1 publication', async t => {
  const { db, site } = await publishedRepository(t);
  const d1 = createD1Fixture(db.db.$client);
  const calls = [];
  const response = await handleCloudPublicPage(new Request(`https://studio.test/p/${token}/news`), {
    DB: d1.client,
    ASSETS: { fetch: async request => { calls.push(new URL(request.url).pathname); return new Response('<html><head><title>shell</title></head><body></body></html>'); } },
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /新闻 &amp; 公告/);
  assert.deepEqual(calls, ['/']);
  assert.equal(site.pages[1].seo.title, '新闻 & 公告');
  const missing = await handleCloudPublicPage(new Request(`https://studio.test/p/${token}${'0'.repeat(16)}`), { DB: d1.client, ASSETS: { fetch: async () => new Response('<head></head>') } });
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /noindex/);
});

test('AI keeps approved SEO and publication diffs include it', () => {
  const site = fixtureSite();
  const plan = { name: site.name, summary: '仅修改首页搜索信息', sharedLayout: [], deletes: [], pages: [{ id: site.homePageId, name: site.pages[0].name, path: '/', kind: 'page', seo: { title: 'AI 生成的标题', description: 'AI 生成的描述' }, layout: [] }] };
  const parsed = parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'sitePlan', ...plan }));
  const skeleton = siteFromPlan(site, parsed);
  assert.equal(skeleton.pages[0].seo.title, 'AI 生成的标题');
  assert.equal(skeleton.pages[1].seo.title, '新闻 & 公告');
  const page = { ...site.pages[0].page, name: site.pages[0].name };
  const next = applySiteOperation(skeleton, parsed, { v: 1, seq: 1, op: 'sitePage', id: site.homePageId, page });
  assert.equal(next.pages[0].seo.description, 'AI 生成的描述');
  assert.equal(diffSites(site, next).pages[0].metadataChanged, true);
  assert.throws(() => parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'sitePlan', ...plan, pages: [{ ...plan.pages[0], seo: { imageUrl: 'javascript:alert(1)' } }] })), /图片/);
});

test('client route metadata restores cleanly and native exports stay conservative', () => {
  const dom = new JSDOM('<head><title>Editor</title><meta name="description" content="old"></head><body></body>', { url: 'https://studio.test/' });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = dom.window;
  try {
    const site = fixtureSite();
    const cleanup = applySeoMetadata(resolveSeo(site, '/news', { origin: 'https://studio.test', basePath: `/p/${token}` }));
    assert.equal(dom.window.document.title, '新闻 & 公告');
    assert.equal(dom.window.document.head.querySelector('meta[property="og:url"]').content, `https://studio.test/p/${token}/news`);
    cleanup();
    assert.equal(dom.window.document.title, 'Editor');
    assert.equal(dom.window.document.head.querySelector('meta[name="description"]').content, 'old');
    assert.equal(dom.window.document.head.querySelector('meta[property="og:url"]'), null);
    const withImage = applySeoMetadata(resolveSeo(site, '/', { origin: 'https://studio.test', basePath: `/p/${token}` }));
    assert.ok(dom.window.document.head.querySelector('meta[property="og:image"]'));
    withImage();
    const withoutImage = applySeoMetadata(resolveSeo(site, '/news', { origin: 'https://studio.test', basePath: `/p/${token}` }));
    assert.equal(dom.window.document.head.querySelector('meta[property="og:image"]'), null);
    assert.equal(dom.window.document.head.querySelector('link[rel="canonical"]').href, `https://studio.test/p/${token}/news`);
    withoutImage();
  } finally { if (original) Object.defineProperty(globalThis, 'window', original); else delete globalThis.window; dom.window.close(); }
  const output = generateNativeCode(fixtureSite(), 'html', { code: 'window.example=true;', css: '' });
  assert.match(output.content, /name="robots" content="noindex,nofollow"/);
  assert.match(output.content, /知行 &amp; 大学 &lt;首页&gt;/);
  assert.doesNotMatch(output.content, /<title>知行 & 大学 <首页><\/title>/);
});
