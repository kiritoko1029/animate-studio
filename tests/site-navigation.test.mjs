import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildComponentDocument } from '../src/lib/custom-components/document.ts';
import { customComponentBootstrap } from '../shared/custom-component-runtime.mjs';
import { updateMessage } from '../src/lib/custom-components/protocol.ts';
import { siteMenuPath } from '../src/lib/site-navigation.ts';

const theme = { accent: '#2563EB', onAccent: '#fff', text: '#111', muted: '#666', surface: '#fff', panel: '#fff', canvas: '#fff', border: '#ddd', radius: '8px', font: 'sans-serif', scheme: 'light' };

test('custom component route is read-only and updates without a rerun', async () => {
  const definition = { name: '后台菜单', html: '<a data-page="home" href="/">首页</a><a data-page="books" href="/books">馆藏</a>', css: '', js: 'const updateRoute = () => { document.body.dataset.active = component.route.pageId; document.body.dataset.path = component.route.path; document.body.dataset.param = component.route.params.id; }; component.onProps(updateRoute); updateRoute();' };
  const route = { path: '/books', pageId: 'books', pattern: '/books/:id', params: { id: '42' } };
  const document = buildComponentDocument(definition, { channel: 'test', nonce: 'test', props: {}, theme, route });
  assert.match(document.html, /component\.route/);
  assert.match(document.html, /"pageId":"books"/);
  const dom = new JSDOM(document.html, { url: 'https://studio.test', runScripts: 'outside-only' });
  dom.window.eval(`(${customComponentBootstrap.toString()})(${JSON.stringify({ channel: 'test', html: definition.html, props: {}, theme, loopGuard: false, route })})`);
  dom.window.eval(definition.js);
  assert.equal(dom.window.document.body.dataset.active, 'books');
  assert.equal(dom.window.document.body.dataset.path, '/books');
  assert.equal(dom.window.document.body.dataset.param, '42');
  assert.equal(dom.window.component.route.path, '/books');
  assert.ok(Object.isFrozen(dom.window.component.route));
  assert.ok(Object.isFrozen(dom.window.component.route.params));
  assert.throws(() => { dom.window.component.route.path = '/'; }, TypeError);
  const next = { path: '/books/43', pageId: 'books', pattern: '/books/:id', params: { id: '43' } };
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { source: dom.window, data: updateMessage('test', {}, theme, next) }));
  assert.equal(dom.window.document.body.dataset.active, 'books');
  assert.equal(dom.window.document.body.dataset.path, '/books/43');
  assert.equal(dom.window.document.body.dataset.param, '43');
  assert.equal(dom.window.component.route.params.id, '43');
  assert.equal(dom.window.component.route.pageId, 'books');
  assert.equal(dom.window.component.route.path, '/books/43');
  assert.equal(dom.window.site, undefined, 'site data is not exposed to author code');
  dom.window.close();
});

test('route update messages are optional and dynamic menu paths are usable examples', () => {
  assert.deepEqual(updateMessage('legacy', {}, {}), { channel: 'legacy', type: 'update', props: {}, theme: {} });
  assert.equal(siteMenuPath({ path: '/products/:id' }), '/products/example');
  assert.equal(siteMenuPath({ path: '/products' }), '/products');
});
