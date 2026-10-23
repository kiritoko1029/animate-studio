import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createDocument } from '../src/model.ts';
import { validatePage } from '../server/validation.mjs';
import { generateNativeCode } from '../src/lib/code-export/native.ts';
import { generateCode } from '../src/lib/code-export/generate.ts';
import { createCustomBlock } from '../src/lib/custom-components/instances.ts';
import { componentTemplates } from '../src/lib/custom-components/templates.ts';
import { installMatchMedia } from './helpers/media-query.mjs';
import { nativeExportPlugin } from '../scripts/native-export-plugin.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const definition = { ...structuredClone(componentTemplates[4].definition), js: 'document.body.dataset.ran = "yes"; // </script> stays inside the component' };

function customPage() {
  const page = createDocument(true);
  page.name = '导出页面';
  const linked = createCustomBlock(definition, { kind: 'local', id: 'source-1', revision: 3 });
  linked.frame = { x: 40, y: 40, width: 240, height: 100 };
  linked.props.label = '实例文字';
  const plain = createCustomBlock(componentTemplates[2].definition);
  plain.frame = { x: 320, y: 40, width: 380, height: 220 };
  page.blocks = [linked, plain];
  return validatePage(page);
}

// The exact runtime downloads embed: the native export plugin's own production build.
const exportModule = await nativeExportPlugin().load('\0virtual:animate-studio-native-export');
const runtime = JSON.parse(exportModule.slice('export default '.length).replace(/;\s*$/, ''));

function load(t, html) {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => { if (error.type !== 'css parsing') errors.push(error.message); });
  const dom = new JSDOM(html, { url: 'https://export.test/page.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console, beforeParse(window) {
    installMatchMedia(window, { reducedMotion: true });
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, onfinish: null, addEventListener() {} }; };
  } });
  t.after(() => dom.window.close());
  return { window: dom.window, document: dom.window.document, errors };
}
const until = async (predicate, description) => { const deadline = Date.now() + 4000; while (!predicate()) { if (Date.now() > deadline) assert.fail(description); await new Promise(resolve => setTimeout(resolve, 10)); } };

test('HTML, React and Vue exports embed the definitions and render them through the sandbox', async t => {
  const page = customPage();
  const bundle = { code: runtime.code, css: runtime.css };
  const html = generateNativeCode(page, 'html', bundle).content;
  // Parse without running: the whole runtime and the mount call stay in one script element.
  const parsed = new JSDOM(html).window.document;
  assert.equal(parsed.scripts.length, 1);
  assert.match(parsed.scripts[0].textContent, /AnimateStudioNative\.mount\(/);
  assert.equal(parsed.body.children.length, 2, 'nothing leaks out of the export script');
  // The page JSON travels with the export, so it does not depend on any library copy.
  assert.ok(html.includes(JSON.stringify(definition.css).slice(1, 40).replace(/[<>&]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)));
  assert.doesNotMatch(html, /<\/script> stays inside/, 'component code cannot close the export script');
  for (const format of ['react', 'vue']) {
    const wrapper = generateNativeCode(page, format, bundle).content;
    assert.match(wrapper, format === 'react' ? /srcDoc=\{html\}/ : /:srcdoc="html"/);
    assert.ok(wrapper.includes('实例文字'), `${format} carries the instance fields`);
  }

  const exported = load(t, html);
  await until(() => exported.document.querySelectorAll('.custom-component-frame iframe').length === 2, 'both components render');
  const [linked, plain] = exported.document.querySelectorAll('.custom-component-frame iframe');
  for (const frame of [linked, plain]) {
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
    assert.match(frame.getAttribute('srcdoc'), /connect-src 'none'/);
  }
  assert.match(linked.getAttribute('srcdoc'), /实例文字/, 'instance values are part of the first render');
  assert.match(linked.getAttribute('srcdoc'), /document\.body\.dataset\.ran/);

  // Host side of the exported page: only the frame's own window and run are trusted.
  const channel = /"channel":"([^"]+)"/.exec(linked.getAttribute('srcdoc'))[1];
  const posted = [], opened = [];
  linked.contentWindow.postMessage = data => posted.push(data);
  exported.window.open = (...args) => { opened.push(args); return null; };
  const send = (data, source = linked.contentWindow) => exported.window.dispatchEvent(new exported.window.MessageEvent('message', { source, data: exported.window.JSON.parse(JSON.stringify({ source: 'animate-studio-component', channel, ...data })) }));
  send({ type: 'ready' }, plain.contentWindow);
  send({ type: 'ready' });
  await until(() => posted.length === 1, 'the ready frame receives its fields once');
  assert.equal(posted[0].type, 'update');
  assert.equal(posted[0].props.label, '实例文字');
  send({ type: 'open-link', href: 'javascript:alert(document.cookie)' });
  send({ type: 'open-link', href: '//evil.example/path' });
  send({ type: 'open-link', href: 'https://animate-ui.com/docs' });
  await until(() => opened.length === 1, 'safe links open');
  assert.deepEqual(opened[0], ['https://animate-ui.com/docs', '_blank', 'noopener,noreferrer']);
  assert.deepEqual(exported.errors, []);
});

test('the serialized bootstrap still runs after production minification', async t => {
  const compiled = await build({
    stdin: { contents: `import { buildComponentDocument, fallbackComponentTheme } from './src/lib/custom-components/document.ts'; window.built = buildComponentDocument({ name: 'm', html: '<b data-prop="title"></b>', css: '', js: 'window.ran = component.props.title;' }, { channel: 'min', nonce: 'n', props: { title: '压缩后可用' }, theme: fallbackComponentTheme });`, loader: 'js', resolveDir: root },
    bundle: true, minify: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
  const compiler = new JSDOM('', { runScripts: 'dangerously' });
  t.after(() => compiler.window.close());
  compiler.window.eval(compiled.outputFiles[0].text);
  const messages = [];
  const frame = new JSDOM(compiler.window.built.html, { runScripts: 'dangerously', beforeParse(window) { window.postMessage = data => messages.push(data); } });
  t.after(() => frame.window.close());
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(frame.window.document.querySelector('b').textContent, '压缩后可用');
  assert.equal(frame.window.ran, '压缩后可用');
  assert.ok(messages.some(message => message.type === 'ready' && message.channel === 'min'));
});

test('the legacy generator emits the same sandboxed frame for every format', () => {
  const page = customPage();
  const resources = { pageCss: '', libraryCss: '', portableCss: '' };
  const html = generateCode(page, 'html', resources).content;
  const parsed = new JSDOM(html).window.document;
  const frames = parsed.querySelectorAll('iframe');
  assert.equal(frames.length, 2);
  for (const frame of frames) assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
  assert.match(frames[0].getAttribute('srcdoc'), /实例文字/);
  assert.match(generateCode(page, 'react', resources).content, /sandbox=\{"allow-scripts"\}[\s\S]*srcDoc=\{/);
  assert.match(generateCode(page, 'vue', resources).content, /sandbox="allow-scripts"[\s\S]*srcdoc="/);
  for (const format of ['html', 'react', 'vue']) assert.doesNotMatch(generateCode(page, format, resources).content, /allow-same-origin/);
});
