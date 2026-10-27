import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createBlock, createDocument } from '../src/model.ts';
import { validatePage } from '../server/validation.mjs';
import { createSiteDocument } from '../shared/site-document.mjs';
import { validateSite } from '../server/validation.mjs';
import { itemField } from '../src/lib/data/item.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { installWebAnimations } from './helpers/web-animations.mjs';

const bundle = await build({ stdin: { contents: `import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {MotionConfig} from 'motion/react';import {PageRenderer} from './src/components/PageRenderer';import {SiteNavigationContext} from './src/lib/site-navigation';import {requestDataSource} from './src/lib/data/runtime';window.requestDataSource=requestDataSource;window.mount=(page,sources)=>{const root=createRoot(document.getElementById('root'));window.perform=fn=>flushSync(fn);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<MotionConfig reducedMotion="always"><SiteNavigationContext.Provider value={{navigate:url=>{window.navigated=url;return true},href:url=>url,isCurrent:()=>false,back:()=>{},params:{id:'a1'}}}><PageRenderer document={page} dataSources={sources} route={{id:'a1'}} dataAccess={{scope:'export'}}/></SiteNavigationContext.Provider></MotionConfig>));};`, loader: 'jsx', resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent' });
const until = async (predicate, message) => { const end = Date.now() + 3000; while (!predicate()) { if (Date.now() > end) assert.fail(message); await new Promise(resolve => setTimeout(resolve, 5)); } };
const books = [{ id: 'a1', title: '设计中的设计', author: '原研哉' }, { id: 'b2', title: '信息架构', author: '彼得·莫尔维尔' }];
function fixture(t) {
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on('error', (...args) => errors.push(args.join(' '))); virtualConsole.on('jsdomError', error => errors.push(error.detail?.stack ?? error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://studio.test/books/a1', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const win = dom.window; Object.assign(win, { structuredClone, TextEncoder, TextDecoder, AbortSignal, AbortController });
  installMatchMedia(win, { reducedMotion: true }); installWebAnimations(win); win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }; win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.HTMLElement.prototype.scrollIntoView = () => {}; win.HTMLElement.prototype.scrollTo = () => {}; win.scrollTo = () => {};
  const calls = []; win.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return Response.json({ id: 'new-book' }, { status: 201 }); };
  win.eval(bundle.outputFiles[0].text); t.after(() => { win.unmount?.(); win.close(); assert.deepEqual(errors, []); });
  return { win, doc: win.document, calls, errors, mount: (page, sources) => win.mount(win.JSON.parse(JSON.stringify(page)), win.JSON.parse(JSON.stringify(sources))) };
}
function dataPage(type) {
  const page = createDocument(true), block = createBlock(type); block.frame = { x: 20, y: 20, width: 560, height: 820 }; page.blocks = [block]; return { page, block };
}

test('data components validate children, mappings and safe form fields', () => {
  for (const type of ['repeater', 'form']) { const { page } = dataPage(type); validatePage(page); }
  const { page } = dataPage('repeater');
  assert.throws(() => validatePage({ ...page, blocks: [{ ...page.blocks[0], props: { ...page.blocks[0].props, dataFields: {} }, children: [{ id: 'nested', type: 'form', props: {} }] }] }), /不能嵌套/);
  assert.throws(() => validatePage({ ...page, blocks: [{ ...page.blocks[0], props: { ...page.blocks[0].props, dataFields: { title: { title: '__proto__.admin' } } } }] }), /原型/);
  const form = dataPage('form').page; form.blocks[0].children[1].props.name = form.blocks[0].children[0].props.name;
  assert.throws(() => validatePage(form), /不能重复/);
  assert.throws(() => validatePage({ ...createDocument(true), blocks: [{ id: 'bad', type: 'text', props: {}, children: [] }] }), /只有动态列表和表单/);
  const site = createSiteDocument(dataPage('form').page); site.dataSources = [{ id: 'writeBook', name: '新建图书', kind: 'rest', mode: 'single', method: 'POST', url: 'https://api.example.com/books', body: { title: '{{form.title}}' } }]; validateSite(site);
});

test('repeater maps records into independent cards and usable detail links', async t => {
  const f = fixture(t), { page, block } = dataPage('repeater');
  block.props.dataFields.description.text = 'author';
  const source = { id: 'books', name: '图书', kind: 'static', mode: 'collection', items: books };
  f.mount(page, [source]);
  f.win.requestDataSource(f.win.JSON.parse(JSON.stringify(source))).then(value => { f.win.directValue = value; }, error => { f.win.directError = error.message; });
  await until(() => f.win.directValue || f.win.directError, 'direct source resolves');
  await until(() => f.doc.querySelectorAll('[data-repeater-item]').length === 2, `two records render: ${f.doc.body.textContent} ${f.errors.join(' | ')}`);
  assert.equal(f.doc.querySelector('[data-repeater-item="a1"] .page-heading').textContent, '设计中的设计');
  assert.equal(f.doc.querySelector('[data-repeater-item="b2"] .page-paragraph').textContent, '彼得·莫尔维尔');
  assert.equal(f.doc.querySelector('[data-repeater-item="a1"] .page-button').textContent, '查看详情');
  assert.equal(f.doc.querySelector('[data-repeater-item="b2"] .page-button').textContent, '查看详情');
  assert.equal(itemField('{{index}}', books[0], 0), '0');
  assert.equal(itemField('/books/{{item.id}}', books[1], 1), '/books/b2');
  assert.equal(itemField('{{item.__proto__.admin}}', books[0], 0), undefined);
  f.win.perform(() => f.doc.querySelector('[data-repeater-item="b2"] .page-button').click());
  assert.equal(f.win.navigated, '/details/b2');
});

test('ordinary detail bindings subscribe to their source and show real data', async t => {
  const f = fixture(t), { page, block } = dataPage('text');
  block.id = 'detail-title'; block.bindings = { text: { kind: 'expression', value: 'data.book.title' } };
  const source = { id: 'book', name: '图书详情', kind: 'static', mode: 'single', items: books[0] };
  f.win.requestDataSource(f.win.JSON.parse(JSON.stringify(source))).then(value => { f.win.directValue = value; }, error => { f.win.directError = error.message; });
  f.mount(page, [source]);
  await until(() => f.win.directValue || f.win.directError, 'direct detail source resolves');
  await until(() => f.doc.querySelector('[data-block-id="detail-title"] .page-paragraph')?.textContent === '设计中的设计', `detail binding loads its source: ${f.doc.body.textContent} ${f.errors.join(' | ')}`);
  assert.equal(f.doc.querySelector('.data-inline-state'), null);
});

test('forms validate, require confirmation, then create and update real HTTP requests', async t => {
  const f = fixture(t), { page, block } = dataPage('form'); block.props.submitSourceId = 'writeBook';
  const sources = [{ id: 'writeBook', name: '保存图书', kind: 'rest', mode: 'single', method: 'POST', url: 'https://api.example.com/books', body: { title: '{{form.title}}' } }];
  f.mount(page, sources);
  await until(() => f.doc.querySelector('.data-form input[name="title"]'), 'form renders');
  const form = f.doc.querySelector('.data-form');
  f.win.perform(() => form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true })));
  await until(() => f.doc.querySelector('.data-form-error').textContent.includes('请填写'), 'required field error');
  assert.equal(f.calls.length, 0, 'no write before validation or confirmation');
  const confirmations = []; f.win.confirm = message => { confirmations.push(message); return true; };
  const input = f.doc.querySelector('input[name="title"]');
  f.win.perform(() => { Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(input, '新书'); input.dispatchEvent(new f.win.Event('input', { bubbles: true })); });
  f.win.perform(() => form.dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true })));
  await until(() => f.calls.length === 1, 'POST is sent after confirmation');
  assert.match(confirmations[0], /POST.*api\.example\.com/);
  assert.equal(f.calls[0].init.method, 'POST'); assert.equal(f.calls[0].init.body, JSON.stringify({ title: '新书' }));
  await until(() => f.doc.querySelector('.data-form-status').textContent === '提交成功', 'success message');
  await until(() => f.doc.querySelector('.data-form-receipt'), 'submission result is available');
  assert.match(f.doc.querySelector('.data-form-receipt').textContent, /new-book/);
  f.win.perform(() => {
    const field = f.doc.querySelector('input[name="title"]');
    Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(field, '临时修改');
    field.dispatchEvent(new f.win.Event('input', { bubbles: true }));
    f.doc.querySelector('.data-form-receipt button').click();
  });
  assert.equal(f.doc.querySelector('input[name="title"]').value, '新书');
  assert.equal(f.calls.length, 1, 'restoring input never repeats a write');
  const updated = { ...page, blocks: [{ ...block, props: { ...block.props, submitSourceId: 'updateBook' } }] };
  f.win.unmount(); f.mount(updated, [{ id: 'updateBook', name: '更新图书', kind: 'rest', mode: 'single', method: 'PUT', url: 'https://api.example.com/books/{{route.id}}', body: { title: '{{form.title}}' } }]);
  await until(() => f.doc.querySelector('.data-form input[name="title"]'), 'update form renders');
  f.win.perform(() => { const field = f.doc.querySelector('input[name="title"]'); Object.getOwnPropertyDescriptor(f.win.HTMLInputElement.prototype, 'value').set.call(field, '更新后的书名'); field.dispatchEvent(new f.win.Event('input', { bubbles: true })); f.doc.querySelector('.data-form').dispatchEvent(new f.win.Event('submit', { bubbles: true, cancelable: true })); });
  await until(() => f.calls.length === 2, 'PUT is sent with route parameter');
  assert.equal(f.calls[1].url, 'https://api.example.com/books/a1'); assert.equal(f.calls[1].init.method, 'PUT'); assert.equal(f.calls[1].init.body, JSON.stringify({ title: '更新后的书名' }));
});

test('legacy tables keep their static rows without a selected data source', async t => {
  const f = fixture(t), { page } = dataPage('table'); f.mount(page, []);
  await until(() => f.doc.querySelector('.page-data-table'), 'legacy table renders');
  assert.equal(f.doc.querySelector('tbody td').textContent, '品牌官网');
});
