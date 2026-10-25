import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createDocument } from '../src/model.ts';
import { validatePage } from '../server/validation.mjs';
import { customComponentLimits, customComponentSandbox, validateCustomComponentDefinition, validateCustomComponentSnapshot } from '../shared/custom-components.mjs';
import { buildComponentDocument, componentContentSecurityPolicy, escapeScriptText, fallbackComponentTheme, sanitizeComponentTheme } from '../src/lib/custom-components/document.ts';
import { createRateLimiter, readFrameMessage } from '../src/lib/custom-components/protocol.ts';
import { guardLoops } from '../src/lib/custom-components/loop-guard.ts';
import { createCustomBlock, customComponentTheme, definitionFromInstance, instanceProps, resetCustomInstance, updateInstanceDefinition } from '../src/lib/custom-components/instances.ts';
import { LibraryStorageError, RevisionConflictError, createLocalFolder, renameLocalFolder, deleteLocalFolder, moveLocalComponent, deleteLocalComponent, localLibraryKey, readLocalLibrary, saveLocalComponent, saveAiComponent, pickDefinition } from '../src/lib/custom-components/library.ts';
import { clearDesignerDraft, designerDraftKey, listDesignerDrafts, readDesignerDraft, writeDesignerDraft } from '../src/lib/custom-components/drafts.ts';
import { componentTemplates } from '../src/lib/custom-components/templates.ts';
import { codeHints } from '../src/lib/custom-components/hints.ts';

const definition = (overrides = {}) => ({ name: '测试组件', description: '说明', html: '<p data-prop="title">x</p>', css: 'p{color:red}', js: 'document.body.dataset.ran = "yes";', fields: { title: '默认标题' }, size: { width: 320, height: 180 }, ...overrides });
const pageWith = (...blocks) => { const page = createDocument(true); page.blocks = blocks.map((block, index) => ({ ...block, frame: { x: (index % 5) * 340, y: Math.floor(index / 5) * 200, width: 320, height: 180 } })); return page; };
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => { data.set(key, String(value)); }, removeItem: key => { data.delete(key); } };
}

test('component definitions accept every starter template and reject malformed or oversized input', () => {
  for (const template of componentTemplates) assert.doesNotThrow(() => validateCustomComponentDefinition(template.definition), template.name);
  const invalid = [
    [definition({ name: '' }), /name/],
    [definition({ name: 'x'.repeat(61) }), /name/],
    [definition({ html: 'x'.repeat(customComponentLimits.code + 1) }), /html/],
    [definition({ js: 42 }), /js/],
    [definition({ fields: { title: 'a', secret: 'b' } }), /不支持的属性/],
    [definition({ fields: { url: 'javascript:alert(1)' } }), /安全的链接/],
    [definition({ fields: { imageUrl: 'mailto:a@b.c' } }), /安全的链接/],
    [definition({ size: { width: 10, height: 100 } }), /size.width/],
    [definition({ size: { width: 320.5, height: 100 } }), /整数/],
    [{ ...definition(), owner: 'someone' }, /不支持的属性/],
    [JSON.parse('{"name":"x","html":"","css":"","js":"","__proto__":{"polluted":true}}'), /不支持的属性/],
    [[definition()], /普通对象/],
  ];
  for (const [value, message] of invalid) assert.throws(() => validateCustomComponentDefinition(value), message);
  assert.equal({}.polluted, undefined, 'validation never pollutes prototypes');
  assert.throws(() => validateCustomComponentSnapshot({ ...definition(), source: { kind: 'remote', id: 'x', revision: 1 } }), /source.kind/);
  assert.throws(() => validateCustomComponentSnapshot({ ...definition(), source: { kind: 'local', id: '../x', revision: 1 } }), /source.id/);
});

test('pages accept custom instances only with an embedded, declared and safe definition', () => {
  const block = createCustomBlock(definition(), { kind: 'local', id: 'abc', revision: 2 });
  block.bindings = { title: { kind: 'expression', value: '"绑定标题"' } };
  block.events = { click: [{ type: 'notify', expression: '"点到了"' }] };
  assert.doesNotThrow(() => validatePage(pageWith(block)));
  const invalid = [
    [{ ...block, props: { ...block.props, text: '未声明字段' } }, /不是该组件声明的实例字段/],
    [{ ...block, props: { ...block.props, padding: 20 } }, /不支持的属性 padding/],
    [{ ...block, props: { ...block.props, motion: {} } }, /不支持的属性 motion/],
    [{ ...block, props: { title: 'x' } }, /缺少组件定义/],
    [{ ...block, props: { ...block.props, custom: { ...block.props.custom, js: 'x'.repeat(customComponentLimits.code + 1) } } }, /js/],
    [{ ...block, props: { ...block.props, accent: 'red' } }, /十六进制颜色/],
    [{ ...block, type: 'card' }, /不支持的属性/],
    [{ ...block, bindings: { text: { kind: 'expression', value: '"x"' } } }, /联动配置字段无效/],
  ];
  for (const [value, message] of invalid) assert.throws(() => validatePage(pageWith(value)), message);
  const many = Array.from({ length: customComponentLimits.perPage + 1 }, () => createCustomBlock(definition()));
  assert.throws(() => validatePage(pageWith(...many)), /最多包含 40 个自定义组件/);
});

test('instances are independent copies; updates and resets are explicit and keep instance data', () => {
  const source = definition({ fields: { title: '默认标题', text: '默认正文' } });
  const block = createCustomBlock(source, { kind: 'local', id: 'c1', revision: 1 });
  source.js = 'changed();'; source.fields.title = '源组件改名';
  assert.equal(block.props.custom.js, definition().js, 'editing the source after insertion never changes the page copy');
  assert.equal(block.props.title, '默认标题');
  assert.deepEqual(instanceProps({ props: { ...block.props, title: '实例标题' } }), { title: '实例标题', text: '默认正文' });

  const edited = { ...block, props: { ...block.props, title: '实例标题', text: '实例正文', accent: '#123456' }, frame: { x: 10, y: 20, width: 300, height: 150 }, bindings: { text: { kind: 'expression', value: '"x"' }, visible: { kind: 'expression', value: 'true' } } };
  const updated = updateInstanceDefinition(edited, definition({ js: 'v2();', fields: { title: '新默认' } }), { kind: 'local', id: 'c1', revision: 2 });
  assert.equal(updated.props.custom.js, 'v2();');
  assert.equal(updated.props.custom.source.revision, 2);
  assert.equal(updated.props.title, '实例标题', 'overrides of fields that still exist are kept');
  assert.equal(updated.props.text, undefined, 'fields the new version removed are dropped');
  assert.deepEqual(Object.keys(updated.bindings), ['visible'], 'bindings of removed fields are dropped');
  assert.deepEqual(updated.frame, edited.frame);
  assert.equal(updated.props.accent, '#123456');
  assert.doesNotThrow(() => validatePage(pageWith(updated)));

  assert.equal(resetCustomInstance(edited).props.title, '默认标题');
  const recovered = definitionFromInstance(edited);
  assert.equal(recovered.source, undefined);
  assert.equal(recovered.name, '测试组件');

  const settings = createDocument(true).settings;
  const theme = customComponentTheme({ props: { accent: '#ff0000', color: '#00ff00', background: '#0000ff', radius: 4 } }, settings);
  assert.deepEqual([theme.accent, theme.text, theme.surface, theme.radius, theme.onAccent], ['#ff0000', '#00ff00', '#0000ff', '4px', '#000000']);
});

test('the component document is sandbox-ready: nonce CSP, no network, escaped code and mapped lines', () => {
  const hostile = definition({ html: '<p>a</p></script><script>alert(1)</script><textarea>', css: 'html,body{overflow:auto}p{color:red}</style><script>alert(2)</script>', js: 'const a = "</script><script>alert(3)</script>";\n<!-- legacy\nthrow new Error("line 3");' });
  const { html, jsLine } = buildComponentDocument(hostile, { channel: 'ch', nonce: 'abc123', props: { title: 'T' }, theme: fallbackComponentTheme });
  const policy = componentContentSecurityPolicy('abc123');
  assert.ok(html.includes(`content="${policy}"`));
  assert.match(policy, /script-src 'nonce-abc123'/);
  assert.match(policy, /connect-src 'none'/);
  assert.doesNotMatch(policy, /unsafe-eval|script-src[^;]*unsafe-inline/);
  // Parse without running anything: author code cannot add or close elements.
  const parsed = new JSDOM(html).window.document;
  assert.equal(parsed.querySelectorAll('script').length, 3, 'probe, bootstrap and JavaScript panel only');
  assert.equal(parsed.querySelectorAll('style').length, 2);
  assert.match(parsed.querySelectorAll('style')[0].textContent, /html,body\{margin:0;height:100%;overflow:hidden\}/, 'the component root does not show an unintended scrollbar');
  assert.match(parsed.querySelectorAll('style')[1].textContent, /^html,body\{overflow:auto\}/, 'author styles load last and can explicitly restore root scrolling');
  assert.equal(parsed.querySelector('body').children.length, 3, 'author markup is data until the bootstrap inserts it');
  assert.equal(parsed.querySelectorAll('script')[2].textContent, `\n${escapeScriptText(hostile.js)}\n`);
  assert.ok(parsed.querySelectorAll('style')[1].textContent.includes('p{color:red}<\\/style>'));
  assert.equal(html.split('\n')[jsLine - 1], escapeScriptText('const a = "</script><script>alert(3)</script>";'));
  assert.equal(escapeScriptText('x</SCRIPT>'), 'x\\x3C/SCRIPT>');
  const theme = sanitizeComponentTheme({ ...fallbackComponentTheme, accent: 'red;}</style><script>', font: 'x</style>', radius: '9999999px', scheme: 'evil' });
  assert.equal(theme.accent, fallbackComponentTheme.accent);
  assert.equal(theme.font, fallbackComponentTheme.font);
  assert.equal(theme.radius, fallbackComponentTheme.radius);
  assert.equal(theme.scheme, 'light');
});

test('component frames are only ever sandboxed with allow-scripts', async () => {
  assert.equal(customComponentSandbox, 'allow-scripts');
  const files = [];
  async function walk(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) await walk(path); else if (/\.(tsx?|mjs)$/.test(entry.name)) files.push(path); } }
  await walk('src'); await walk('shared');
  // Comments may explain the rule; code and strings must never contain the token.
  const code = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  for (const file of files) assert.doesNotMatch(code(await readFile(file, 'utf8')), /allow-same-origin/, `${file} must not grant allow-same-origin`);
  const frame = await readFile('src/components/custom/CustomComponentFrame.tsx', 'utf8');
  assert.match(frame, /sandbox=\{customComponentSandbox\}/);
});

test('custom component stylesheets only target their own namespaced classes', async () => {
  // These sheets ship in the main bundle; an unprefixed rule would restyle existing UI
  // (the theme designer already uses .designer-body, .designer-preview, …).
  const prefixes = ['ccd-', 'custom-', 'shared-component-', 'component-code-editor', 'component-share-dialog', 'component-designer', 'page-block--custom'];
  for (const file of ['src/custom-designer.css', 'src/custom-components.css']) {
    const css = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
    for (const [, selectors] of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const list = []; let depth = 0, current = '';
      for (const char of selectors) { if (char === '(') depth++; if (char === ')') depth--; if (char === ',' && !depth) { list.push(current); current = ''; } else current += char; }
      list.push(current);
      for (const selector of list.map(item => item.trim()).filter(Boolean)) {
        // A namespaced class anywhere scopes the rule to (or inside) this feature's elements.
        const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
        assert.ok(classes.some(name => prefixes.some(prefix => name.startsWith(prefix))), `${file}: "${selector}" must be scoped by a namespaced class`);
      }
    }
  }
});

test('host accepts only well-formed messages from the exact frame and current channel', () => {
  const frame = {}, other = {};
  const ok = data => readFrameMessage({ source: frame, data: { source: 'animate-studio-component', channel: 'run-1', ...data } }, { source: frame, channel: 'run-1' });
  assert.deepEqual(ok({ type: 'ready' }), { type: 'ready' });
  assert.deepEqual(ok({ type: 'error', message: 'boom', line: 3, column: 7 }), { type: 'error', message: 'boom', line: 3, column: 7 });
  assert.deepEqual(ok({ type: 'log', level: 'warn', message: 'hi' }), { type: 'log', level: 'warn', message: 'hi' });
  assert.deepEqual(ok({ type: 'open-link', href: 'https://example.com' }), { type: 'open-link', href: 'https://example.com' });
  const rejected = [
    readFrameMessage({ source: other, data: { source: 'animate-studio-component', channel: 'run-1', type: 'ready' } }, { source: frame, channel: 'run-1' }),
    readFrameMessage({ source: frame, data: { source: 'animate-studio-component', channel: 'run-1', type: 'ready' } }, { source: null, channel: 'run-1' }),
    ok({ channel: 'run-0', type: 'ready' }),
    ok({ source: 'someone-else', type: 'ready' }),
    ok({ type: 'navigate', href: 'x' }),
    ok({ type: 'ready', extra: true }),
    ok({ type: 'error', message: 'x'.repeat(5000) }),
    ok({ type: 'error', message: 'x', line: -1 }),
    ok({ type: 'log', level: 'debug', message: 'x' }),
    ok({ type: 'open-link', href: 42 }),
    readFrameMessage({ source: frame, data: [] }, { source: frame, channel: 'run-1' }),
    readFrameMessage({ source: frame, data: 'ready' }, { source: frame, channel: 'run-1' }),
  ];
  assert.deepEqual(rejected, rejected.map(() => null));
  let now = 0;
  const allow = createRateLimiter(3, 1000, () => now);
  assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
  now = 1001; assert.equal(allow(), true);
});

test('designer loop guard instruments loop bodies without moving lines or touching strings', () => {
  assert.equal(guardLoops('for (let i=0;i<3;i++) x++;'), 'for (let i=0;i<3;i++) {__asGuard();x++;}');
  assert.equal(guardLoops('while (a) { b() }'), 'while (a) {__asGuard(); b() }');
  assert.equal(guardLoops('do y--; while (y)'), 'do {__asGuard();y--;} while (y)');
  assert.equal(guardLoops('while (a) while (b) x();'), 'while (a) {__asGuard();while (b) {__asGuard();x();}}');
  assert.equal(guardLoops('const s = "while (1) {}"; // for (;;)'), 'const s = "while (1) {}"; // for (;;)');
  assert.equal(guardLoops('while (true) {'), 'while (true) {', 'syntax errors are left for the browser to report');
  const code = 'let i = 0;\nwhile (i < 3) {\n  i++;\n}\nfor (const x of [1]) console.log(x);';
  assert.equal(guardLoops(code).split('\n').length, code.split('\n').length);
});

test('static hints explain the sandbox contract before running', () => {
  const hints = codeHints({ html: '<p>a</p>\n<button onclick="go()">x</button>\n<script>1</script>', css: '@import url(x.css);', js: 'import x from "y";\nfetch("/api")' });
  assert.deepEqual(hints.map(hint => [hint.panel, hint.line]), [['html', 3], ['html', 2], ['css', 1], ['js', 1], ['js', 2]]);
  assert.deepEqual(codeHints(componentTemplates[0].definition), []);
});

test('local library persists, detects concurrent edits and never overwrites damaged data', () => {
  const storage = memoryStorage();
  const first = saveLocalComponent(definition(), { origin: 'template' }, storage, new Date('2026-10-23T00:00:00Z'));
  assert.equal(first.revision, 1);
  const second = saveLocalComponent({ ...definition({ name: '第二个' }), id: 'ignored', revision: 99 }, {}, storage);
  assert.notEqual(second.id, 'ignored', 'ids and revisions are assigned by the store');
  const updated = saveLocalComponent(definition({ name: '已改名' }), { id: first.id, baseRevision: 1 }, storage);
  assert.equal(updated.revision, 2);
  assert.equal(updated.origin, 'template');
  assert.throws(() => saveLocalComponent(definition(), { id: first.id, baseRevision: 1 }, storage), RevisionConflictError, 'stale revision');
  assert.deepEqual(readLocalLibrary(storage).components.map(item => item.name).sort(), ['已改名', '第二个']);

  // An unreadable entry from elsewhere is hidden but kept on later writes.
  const raw = JSON.parse(storage.getItem(localLibraryKey));
  raw.components.push({ id: 'broken', name: '' });
  storage.setItem(localLibraryKey, JSON.stringify(raw));
  assert.equal(readLocalLibrary(storage).hidden, 1);
  assert.equal(deleteLocalComponent(second.id, storage), true);
  assert.ok(JSON.parse(storage.getItem(localLibraryKey)).components.some(entry => entry.id === 'broken'));
  assert.throws(() => saveLocalComponent(definition(), { id: second.id, baseRevision: 1 }, storage), error => error instanceof RevisionConflictError && error.current === null);
  assert.throws(() => saveLocalComponent(definition({ fields: { url: 'javascript:x' } }), {}, storage), /安全的链接/);

  const damaged = memoryStorage({ [localLibraryKey]: '{not json' });
  assert.equal(readLocalLibrary(damaged).damaged, true);
  assert.throws(() => saveLocalComponent(definition(), {}, damaged), LibraryStorageError);
  assert.equal(damaged.getItem(localLibraryKey), '{not json', 'damaged data is left untouched');

  const full = memoryStorage();
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => saveLocalComponent(definition(), {}, full), /浏览器空间不足/);
});

test('local folders preserve legacy components, code revisions, and unreadable records', () => {
  const storage = memoryStorage();
  const original = saveLocalComponent(definition(), {}, storage);
  const old = JSON.parse(storage.getItem(localLibraryKey)); delete old.folders; delete old.components[0].folderId;
  old.components.push({ id: 'unreadable', future: true }); storage.setItem(localLibraryKey, JSON.stringify(old));
  assert.deepEqual(readLocalLibrary(storage).folders, []);
  assert.equal(readLocalLibrary(storage).components[0].folderId, null);
  const a = createLocalFolder('  展示组件  ', storage), b = createLocalFolder('表单组件', storage);
  assert.equal(a.name, '展示组件');
  assert.throws(() => createLocalFolder('展示组件', storage), /名称已存在/);
  assert.throws(() => renameLocalFolder(b.id, '展示组件', storage), /名称已存在/);
  assert.throws(() => createLocalFolder(' ', storage), /文件夹名称/);
  moveLocalComponent(original.id, a.id, storage);
  assert.equal(readLocalLibrary(storage).components[0].revision, 1);
  const edited = saveLocalComponent(definition({ name: '已编辑' }), { id: original.id, baseRevision: 1 }, storage);
  assert.equal(edited.folderId, a.id, 'saving source keeps its current folder');
  renameLocalFolder(a.id, '营销组件', storage);
  assert.equal(readLocalLibrary(storage).folders.find(folder => folder.id === a.id).name, '营销组件');
  assert.throws(() => moveLocalComponent(original.id, 'missing', storage), /未找到/);
  const second = saveLocalComponent(definition({ name: '来自另一标签页' }), { folderId: b.id }, storage);
  deleteLocalFolder(a.id, storage);
  const library = readLocalLibrary(storage);
  assert.equal(library.components.find(item => item.id === original.id).folderId, null);
  assert.equal(library.components.find(item => item.id === original.id).revision, 2, 'deleting a folder never changes source revision');
  assert.equal(library.components.find(item => item.id === second.id).folderId, b.id);
  assert.equal(library.hidden, 1); assert.ok(JSON.parse(storage.getItem(localLibraryKey)).components.some(item => item.id === 'unreadable'));
  assert.equal('folderId' in pickDefinition(edited), false);
});

test('AI component saves are idempotent and preserve manual changes and grouping', () => {
  const storage = memoryStorage(), folder = createLocalFolder('AI 组件', storage);
  const first = saveAiComponent(definition(), 'page:block', undefined, folder.id, storage);
  assert.equal(first.origin, 'ai'); assert.equal(first.folderId, folder.id);
  const retry = saveAiComponent(definition(), 'page:block', undefined, folder.id, storage);
  assert.equal(retry.id, first.id); assert.equal(retry.revision, 1);
  assert.equal(readLocalLibrary(storage).components.length, 1);
  const source = { kind: 'local', id: first.id, revision: 1 };
  const revised = saveAiComponent(definition({ css: 'p{color:blue}' }), 'page:block', source, undefined, storage);
  assert.equal(revised.id, first.id); assert.equal(revised.revision, 2); assert.equal(revised.folderId, folder.id);
  assert.equal(saveAiComponent(definition({ css: 'p{color:blue}' }), 'page:block', source, undefined, storage).revision, 2, 'a checkpoint retry does not create another revision');
  saveLocalComponent(definition({ name: '手动修改' }), { id: first.id, baseRevision: 2 }, storage);
  assert.throws(() => saveAiComponent(definition({ css: 'p{color:green}' }), 'page:block', source, undefined, storage), RevisionConflictError);
  const copy = saveAiComponent(definition({ css: 'p{color:green}' }), 'page:block', undefined, folder.id, storage);
  assert.notEqual(copy.id, first.id, 'a source-less retry cannot overwrite a manually edited component');
  assert.equal(saveAiComponent(definition({ css: 'p{color:green}' }), 'page:block', undefined, folder.id, storage).id, copy.id);
  assert.equal(readLocalLibrary(storage).components.find(item => item.id === first.id).name, '手动修改');
  assert.equal('generationKey' in pickDefinition(copy), false);
});

test('designer drafts are kept per target and survive unrelated corruption', () => {
  const storage = memoryStorage();
  assert.equal(writeDesignerDraft({ target: null, baseRevision: null, definition: definition({ name: '' }) }, storage), true, 'work in progress may be invalid');
  writeDesignerDraft({ target: { kind: 'local', id: 'a' }, baseRevision: 3, definition: definition({ name: '本机草稿' }) }, storage);
  assert.equal(readDesignerDraft({ kind: 'local', id: 'a' }, storage).baseRevision, 3);
  assert.equal(readDesignerDraft(null, storage).definition.name, '');
  assert.equal(listDesignerDrafts(storage).length, 2);
  clearDesignerDraft(null, storage);
  assert.equal(readDesignerDraft(null, storage), null);
  storage.setItem(designerDraftKey, 'garbage');
  assert.deepEqual(listDesignerDrafts(storage), []);
});

function runDocument(t, built, { beforeParse } = {}) {
  const messages = [], errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(built.html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console, beforeParse(window) {
    // A top-level JSDOM window is its own parent: capture what the bootstrap sends to the host.
    window.postMessage = data => messages.push(structuredClone(data));
    beforeParse?.(window);
  } });
  t.after(() => dom.window.close());
  return { dom, window: dom.window, messages, errors };
}
const wait = () => new Promise(resolve => setTimeout(resolve, 20));

test('bootstrap exposes the documented API, fills fields and reports mapped errors to the host', async t => {
  const built = buildComponentDocument({
    name: 'demo',
    html: '<h1 data-prop="title">x</h1><a class="out" data-prop-href="url">go</a><a class="inner" href="#part">in</a><img data-prop-src="imageUrl"><textarea>',
    css: 'h1{color:var(--as-accent)}',
    js: 'window.seen = component.props.title;\ncomponent.onProps(props => { window.updated = props.title; });\nconsole.log("hello", { a: 1 });\nnull.boom;',
  }, { channel: 'run-7', nonce: 'n', props: { title: '第一版', url: 'https://example.com/a', imageUrl: '' }, theme: { ...fallbackComponentTheme, accent: '#ff0000', scheme: 'dark' } });
  const { window, messages } = runDocument(t, built);
  await wait();
  const document = window.document;
  assert.equal(document.querySelector('h1').textContent, '第一版');
  assert.equal(window.seen, '第一版', 'author JavaScript runs after the markup, even with an unclosed textarea');
  assert.equal(document.querySelector('.out').getAttribute('href'), 'https://example.com/a');
  assert.equal(document.querySelector('img').hasAttribute('src'), false);
  assert.equal(document.documentElement.dataset.scheme, 'dark');
  assert.equal(document.documentElement.style.getPropertyValue('--as-accent'), '#ff0000');
  assert.ok(Object.isFrozen(window.component) && Object.isFrozen(window.component.props));
  assert.ok(messages.every(message => message.source === 'animate-studio-component' && message.channel === 'run-7'));
  assert.ok(messages.some(message => message.type === 'log' && message.message === 'hello {"a":1}'));
  const error = messages.find(message => message.type === 'error');
  assert.ok(error, 'runtime errors are reported');
  assert.equal(error.line, 4, 'lines refer to the JavaScript panel');
  assert.ok(messages.some(message => message.type === 'ready'));

  window.dispatchEvent(new window.MessageEvent('message', { source: window, data: { channel: 'run-7', type: 'update', props: { title: '第二版', url: '', imageUrl: 'https://example.com/i.png' }, theme: { ...fallbackComponentTheme, accent: '#00ff00' } } }));
  window.dispatchEvent(new window.MessageEvent('message', { source: window, data: { channel: 'other-run', type: 'update', props: { title: '不应生效' }, theme: {} } }));
  window.dispatchEvent(new window.MessageEvent('message', { source: null, data: { channel: 'run-7', type: 'update', props: { title: '伪造来源' }, theme: {} } }));
  assert.equal(document.querySelector('h1').textContent, '第二版');
  assert.equal(window.updated, '第二版');
  assert.equal(document.querySelector('.out').hasAttribute('href'), false);
  assert.equal(document.querySelector('img').getAttribute('src'), 'https://example.com/i.png');
  assert.equal(document.documentElement.style.getPropertyValue('--as-accent'), '#00ff00');

  messages.length = 0;
  document.querySelector('.out').setAttribute('href', 'https://example.com/b');
  document.querySelector('.out').click();
  document.querySelector('.inner').click();
  assert.deepEqual(messages.filter(message => message.type === 'open-link').map(message => message.href), ['https://example.com/b'], 'external links go through the host; fragments stay inside');
});

test('designer runs stop runaway loops through the injected guard', async t => {
  const built = buildComponentDocument({ name: 'loop', html: '', css: '', js: 'let n = 0;\nwhile (true) { n++; }\nwindow.after = true;' }, { channel: 'g', nonce: 'n', props: {}, theme: fallbackComponentTheme, transformScript: guardLoops });
  const { window, messages } = runDocument(t, built);
  await wait();
  const error = messages.find(message => message.type === 'error');
  assert.match(error.message, /死循环/);
  assert.equal(error.line, 2);
  assert.equal(window.after, undefined);
  assert.ok(messages.some(message => message.type === 'ready'), 'the frame still reports ready');
});

test('private component drafts are scoped by account and hidden from guests and other accounts', () => {
  const storage = memoryStorage();
  const target = { kind: 'cloud', id: 'private-component' };
  assert.equal(writeDesignerDraft({ target, baseRevision: 1, definition: definition() }, storage), false, 'cloud drafts require an owner');
  writeDesignerDraft({ target, ownerId: 'alice', baseRevision: 1, definition: definition({ name: 'Alice draft' }) }, storage);
  writeDesignerDraft({ target, ownerId: 'bob', baseRevision: 1, definition: definition({ name: 'Bob draft' }) }, storage);
  assert.deepEqual(listDesignerDrafts(storage), []);
  assert.equal(readDesignerDraft(target, storage), null);
  assert.deepEqual(listDesignerDrafts(storage, 'alice').map(draft => draft.definition.name), ['Alice draft']);
  assert.equal(readDesignerDraft(target, storage, 'bob').definition.name, 'Bob draft');
  clearDesignerDraft(target, storage, 'bob');
  assert.equal(readDesignerDraft(target, storage, 'alice').definition.name, 'Alice draft');
  assert.equal(readDesignerDraft(target, storage, 'bob'), null);
});
