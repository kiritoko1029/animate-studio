import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCollectionSource, prepareCollection, collectionFields } from '../shared/collections.mjs';
import { validateDataSource, validateDataSources, prepareDataSource } from '../shared/data-sources.mjs';
import { createDataStore, requestDataSource } from '../src/lib/data/runtime.ts';
import { validatePage, validateSite } from '../server/validation.mjs';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';

const asset = 'asset:4e5c7dc6-d76c-4913-b5ea-aa620e001f3f';
const fields = [
  { key: 'title', label: '标题', type: 'text' },
  { key: 'body', label: '正文', type: 'longText' },
  { key: 'views', label: '阅读量', type: 'number' },
  { key: 'published', label: '已发布', type: 'boolean' },
  { key: 'link', label: '原文链接', type: 'url' },
  { key: 'cover', label: '封面', type: 'image' },
];
const records = [
  { id: 'first', values: { title: '第一篇文章', body: '正文一', views: 10, published: true, link: '', cover: asset } },
  { id: 'second', values: { title: '第二篇文章', body: '正文二', views: 20, published: false, link: 'https://example.com/two', cover: '' } },
];
const source = { id: 'articles', name: '文章', kind: 'collection', mode: 'collection', fields, records, pageSize: 1 };
const detail = { ...source, id: 'article', mode: 'single', detailField: 'id', detailParameter: 'id' };

test('content collections validate fields, records and references without network access', async () => {
  assert.equal(validateDataSource(source), source);
  assert.deepEqual(collectionFields(source).map(field => [field.path, field.type]), fields.map(field => [field.key, ['number', 'boolean'].includes(field.type) ? field.type : 'string']));
  assert.deepEqual(await requestDataSource(source), records.map(item => ({ id: item.id, ...item.values })));
  assert.throws(() => validateDataSource({ ...source, fields: [...fields, { key: 'title', label: '重复', type: 'text' }] }), /不能重复/);
  for (const key of ['1title', '__proto__', 'constructor', 'has space']) assert.throws(() => validateDataSource({ ...source, fields: [{ key, label: '非法', type: 'text' }] }), /key/);
  assert.throws(() => validateDataSource({ ...source, records: [records[0], records[0]] }), /不能重复/);
  assert.throws(() => validateDataSource({ ...source, records: [{ id: 'bad id', values: {} }] }), /记录 id/);
  assert.throws(() => validateDataSource({ ...source, records: JSON.parse('[{"id":"polluted","values":{"__proto__":{"admin":true}}}]') }), /不支持的属性/);
  assert.throws(() => validateDataSource({ ...source, records: [{ id: 'wrong', values: { title: 42 } }] }), /记录.title/);
  assert.throws(() => validateDataSource({ ...source, records: [{ id: 'wrong', values: { views: '10' } }] }), /有限数字/);
  assert.throws(() => validateDataSource({ ...source, records: [{ id: 'wrong', values: { published: 'true' } }] }), /布尔值/);
  assert.throws(() => validateDataSource({ ...source, records: [{ id: 'wrong', values: { link: 'javascript:alert(1)' } }] }), /安全的链接/);
  assert.throws(() => validateDataSource({ ...source, records: [{ id: 'wrong', values: { cover: 'asset:not-a-real-id' } }] }), /站点素材/);
  assert.throws(() => validateDataSource({ ...source, records: [{ id: 'wrong', values: { unknown: '' } }] }), /不支持的属性/);
  assert.throws(() => validateDataSource({ ...source, fields: [] }), /1–20/);
  assert.throws(() => validateDataSource({ ...source, fields: Array.from({ length: 21 }, (_, index) => ({ key: `field${index}`, label: '字段', type: 'text' })) }), /1–20/);
  assert.throws(() => validateDataSource({ ...source, records: Array.from({ length: 501 }, (_, index) => ({ id: `row${index}`, values: {} })) }), /500/);
  assert.throws(() => validateDataSource({ ...source, url: 'https://example.com' }), /不需要接口地址/);
  assert.throws(() => validateDataSource({ ...detail, detailField: 'missing' }), /详情匹配字段/);
  assert.throws(() => validateDataSource({ ...detail, detailParameter: 'bad parameter' }), /详情路由参数/);
});

test('collection list and detail respect route parameters and missing records fail explicitly', async () => {
  assert.deepEqual(prepareDataSource(source), prepareCollection(source));
  assert.deepEqual(prepareCollection(detail, { route: { id: 'second' } }).value, { id: 'second', ...records[1].values });
  assert.equal(prepareCollection(detail, { route: { id: 'missing' } }).value, null);
  assert.equal(prepareCollection(detail).value, null);
  await assert.rejects(requestDataSource(detail, { context: { route: { id: 'missing' } } }), /没有找到匹配的内容记录/);
  const bySlug = { ...detail, detailField: 'title', detailParameter: 'slug' };
  assert.equal(prepareCollection(bySlug, { route: { slug: '第一篇文章' } }).value.id, 'first');
  const store = createDataStore([source], { scope: 'preview' });
  await store.load(source.id, store.keyFor(source.id));
  assert.equal(store.get(source.id).items.length, 1);
  assert.equal(store.get(source.id).pageCount, 2);
  store.get(source.id).setPage(2);
  await store.load(source.id, store.keyFor(source.id), 2);
  assert.equal(store.get(source.id).items[0].title, '第二篇文章');
  assert.equal(store.get(source.id).value.length, 2, 'charts retain the full collection while lists paginate');
  const detailStore = createDataStore([detail], { scope: 'share' });
  detailStore.setContext({ route: { id: 'second' } });
  await detailStore.load(detail.id, detailStore.keyFor(detail.id));
  assert.equal(detailStore.values().article.title, '第二篇文章');
  detailStore.dispose(); store.dispose();
});

test('collections survive site validation and image field mappings while legacy sources stay unchanged', () => {
  const page = createDocument(true);
  page.blocks = [{ id: 'list', type: 'repeater', props: { sourceId: 'articles', dataFields: { title: { title: 'title' }, description: { text: 'body' }, cover: { imageUrl: 'cover' }, more: { url: '/articles/{{item.id}}' } } }, frame: { x: 20, y: 20, width: 600, height: 820 }, children: [{ id: 'title', type: 'heading', props: { title: '标题' } }, { id: 'description', type: 'text', props: { text: '正文' } }, { id: 'cover', type: 'image', props: { imageUrl: '' } }, { id: 'more', type: 'button', props: { label: '阅读', url: '#' } }] }];
  validatePage(page);
  const site = createSiteDocument(page);
  const staticSource = { id: 'static', name: '旧静态数据', kind: 'static', mode: 'collection', items: [{ id: 1, title: '保留' }] };
  const rest = { id: 'remote', name: '旧接口', kind: 'rest', mode: 'single', url: 'https://api.example.com/article', method: 'GET' };
  site.dataSources = [source, staticSource, rest];
  assert.equal(validateSite(site), site);
  assert.deepEqual(validateDataSources([staticSource, rest]), [staticSource, rest]);
  assert.deepEqual(prepareDataSource(staticSource), { value: staticSource.items });
  assert.equal(prepareDataSource(rest).url, rest.url);
});
