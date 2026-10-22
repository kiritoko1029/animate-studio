import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { parse, compileScript, compileStyle } from 'vue/compiler-sfc';
import { createBlock, createDocument, componentTypes } from '../src/model.ts';
import { canvasPresets } from '../shared/canvas-sizes.mjs';
import navbarIcons from '../shared/navbar-icons.json' with { type: 'json' };
import { alignFrame, clampFrame } from '../src/lib/canvas-bounds.ts';
import { moveBlockLayer } from '../src/lib/layers.ts';
import { applyPageTheme, contrastingText, getTheme, saveCustomTheme } from '../src/lib/themes.ts';
import { generateCode } from '../src/lib/code-export/generate.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const [pageCss, libraryCss, portableCss, landscape, catalogCss] = await Promise.all([
  'src/page.css', 'src/library-blocks.css', 'src/lib/code-export/portable.css', 'public/landscape.svg', 'src/catalog-blocks.css',
].map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
const resources = { pageCss, libraryCss, portableCss, catalogCss, assets: { '/landscape.svg': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(landscape)}` } };

test('only embedded previews delegate document scrolling to the editor', t => {
  const page = createDocument(true);
  for (const preview of [false, true]) {
    const output = generateCode(page, 'html', preview ? { ...resources, previewToken: 'preview-scroll-test' } : resources);
    const dom = new JSDOM(output.content, { virtualConsole: new VirtualConsole() });
    t.after(() => dom.window.close());
    const { window } = dom;
    for (const element of [window.document.documentElement, window.document.body]) {
      assert.equal(window.getComputedStyle(element).overflow === 'hidden', preview,
        'standalone HTML must retain page scrolling while the iframe has a single outer scroller');
    }
  }
});

function allComponents() {
  const document = applyPageTheme(createDocument(true), 'tech-blue');
  document.settings.maxWidth = 1000; // This fixture uses two fixed 500 px columns.
  document.blocks = componentTypes.map((type, i) => ({ ...createBlock(type), frame: { x: i % 2 * 500, y: Math.floor(i / 2) * 380, width: 500, height: 370 } }));
  document.settings.canvasHeight = 5800;
  document.blocks.find(block => block.type === 'pagination').props.max = 10;
  document.blocks.find(block => block.type === 'checkbox').props.checked = true;
  return document;
}

async function mount(format, document, copies = 1) {
  const output = generateCode(document, format, resources);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  // jsdom does not implement container queries; compilation/real-browser inspection cover CSS separately.
  virtualConsole.on('jsdomError', error => { if (error.type !== 'css parsing') errors.push(error.message); });
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('warn', (...args) => errors.push(args.join(' ')));
  const observers = [];
  const dom = new JSDOM(format === 'html' ? output.content : '<!doctype html><div id="mount"></div>', {
    url: 'https://example.test/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false });
      window.HTMLElement.prototype.scrollIntoView = function () { window.lastScrolled = this; };
      window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 500 });
      // jsdom has no top layer or native dialog methods; positioning/dismissal are checked in a browser.
      window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
      window.ResizeObserver = class {
        constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
        observe() {}
        disconnect() { this.disconnected = true; }
      };
    },
  });
  try {
    if (format !== 'html') {
      let contents;
      if (format === 'react') {
        contents = output.content.replace('export default function GeneratedPage', 'function GeneratedPage') + `
          import { createRoot } from 'react-dom/client';
          import { flushSync } from 'react-dom';
          const app = createRoot(document.getElementById('mount'));
          flushSync(() => app.render(<>{Array.from({length: ${copies}}, (_, i) => <GeneratedPage key={i} />)}</>));
          window.unmountExport = () => flushSync(() => app.unmount());
          window.performExportAction = action => flushSync(action);
        `;
      } else {
        const { descriptor, errors: parseErrors } = parse(output.content, { filename: output.filename });
        assert.deepEqual(parseErrors, []);
        const compiled = compileScript(descriptor, { id: 'export-test', inlineTemplate: true });
        const styles = compileStyle({ source: descriptor.styles[0].content, filename: output.filename, id: 'data-v-export-test', scoped: true });
        assert.deepEqual(styles.errors, []);
        contents = compiled.content.replace('export default', 'const GeneratedPage =') + `
          import { createApp, h, nextTick } from 'vue';
          const app = createApp({ render: () => Array.from({length: ${copies}}, () => h(GeneratedPage)) });
          app.mount(document.getElementById('mount'));
          window.unmountExport = () => app.unmount();
          window.settleExport = nextTick;
        `;
      }
      const result = await build({ stdin: { contents, loader: 'jsx', resolveDir: root }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' }, logLevel: 'silent' });
      dom.window.eval(result.outputFiles[0].text);
    }
    const act = async action => {
      if (dom.window.performExportAction) dom.window.performExportAction(action);
      else action();
      await dom.window.settleExport?.();
    };
    await dom.window.settleExport?.();
    assert.deepEqual(errors, [], `${format}: exported page must mount without runtime warnings`);
    return { output, dom, window: dom.window, root: dom.window.document.querySelector('.as-export'), errors, observers, act };
  } catch (error) { dom.window.close(); throw error; }
}

for (const format of ['html', 'vue', 'react']) {
  test(`${format}: overall component scale is retained without adding CSS length units`, async t => {
    const page = createDocument(true);
    page.blocks = [{ ...createBlock('navbar'), id: 'scaled-navbar', props: { ...createBlock('navbar').props, contentScale: 200 }, frame: { x: 40, y: 40, width: 1600, height: 170 } }];
    const fixture = await mount(format, page);
    t.after(() => { fixture.window.unmountExport?.(); fixture.window.close(); });
    const frame = fixture.root.querySelector('[data-block-id="scaled-navbar"]');
    assert.equal(frame.style.width, '1600px');
    assert.equal(frame.style.height, '170px');
    const content = frame.querySelector('.as-page-block');
    // jsdom lacks CSS zoom; inspect Vue's generated style and React's assigned property.
    if (format === 'html') assert.match(content.getAttribute('style'), /(?:^|;)\s*zoom:\s*2(?:;|$)/);
    else if (format === 'vue') assert.match(fixture.output.content, /(?:^|;)zoom:2(?:;|")/);
    else assert.equal(String(content.style.zoom), '2');
    assert.equal(frame.querySelector('.as-page-brand-title').textContent, 'Forma');
    assert.deepEqual(fixture.errors, []);
  });

  test(`${format}: overlapping components retain the saved layer order`, async t => {
    let page = createDocument(true);
    page.blocks = ['background', 'foreground', 'middle'].map(id => ({ ...createBlock('card'), id, frame: { x: 40, y: 40, width: 400, height: 300 } }));
    page = moveBlockLayer(page, 'foreground', 'top');
    const fixture = await mount(format, page);
    t.after(() => { fixture.window.unmountExport?.(); fixture.window.close(); });
    const frames = [...fixture.root.querySelectorAll('[data-block-id]')];
    assert.deepEqual(frames.map(frame => [frame.dataset.blockId, frame.style.zIndex]), [['background','1'],['middle','2'],['foreground','3']]);
    assert.ok(frames.every(frame => frame.style.left === '40px' && frame.style.top === '40px'));
  });

  test(`${format}: aligned components retain page margins without a second padding offset`, async t => {
    const page = createDocument(true);
    page.settings.padding = 37;
    const original = { x: 0, y: 100, width: 240, height: 100 };
    page.blocks = ['left', 'center', 'right'].map(alignment => ({ ...createBlock('button'), frame: alignFrame(original, page.settings, alignment) }));
    page.blocks.push({ ...createBlock('navbar'), frame: clampFrame({ x: 0, y: 250, width: 1920, height: 85 }, page.settings) });
    const fixture = await mount(format, page);
    t.after(() => { fixture.window.unmountExport?.(); fixture.window.close(); });
    const frames = [...fixture.root.querySelectorAll('[data-block-id]')];
    assert.deepEqual(frames.map(frame => frame.style.left), ['37px', '840px', '1643px', '37px']);
    assert.deepEqual(frames.map(frame => frame.style.top), ['100px', '100px', '100px', '250px']);
    assert.equal(frames[3].style.width, '1846px');
    assert.equal(fixture.root.querySelector('.free-canvas-margin'), null);
    assert.deepEqual(fixture.errors, []);
  });

  test(`${format}: navbar icons, custom logos, hidden marks and legacy defaults render consistently`, async t => {
    const page = createDocument(true);
    const choices = [{}, ...Object.keys(navbarIcons).map(brandIcon => ({ brandIcon })), { brandIcon: 'none' },
      { brandIcon: 'image', imageUrl: '/landscape.svg' }, { brandIcon: 'image', imageUrl: 'javascript:alert(1)' }];
    page.blocks = choices.map((props, index) => ({
      ...createBlock('navbar'), id: `navbar-${index}`,
      props: { title: `品牌 ${index}`, items: '产品|#products', ...props },
      frame: { x: 0, y: index * 90, width: 1000, height: 85 },
    }));
    const fixture = await mount(format, page);
    t.after(() => { fixture.window.unmountExport?.(); fixture.window.close(); });
    const brands = fixture.root.querySelectorAll('.as-page-brand');
    assert.equal(brands.length, choices.length);
    for (let index = 0; index < brands.length; index++) {
      const brand = brands[index], choice = choices[index].brandIcon ?? 'leaf';
      assert.equal(brand.querySelector('.as-page-brand-title').textContent, `品牌 ${index}`);
      const mark = brand.querySelector('.as-page-brand-mark');
      if (choice === 'none') { assert.equal(mark, null); continue; }
      assert.ok(mark);
      const fallback = mark.querySelector('.as-page-brand-placeholder');
      assert.equal(fallback.querySelector('path').getAttribute('d'), navbarIcons[choice].path);
      if (choices[index].imageUrl === '/landscape.svg') {
        const logo = mark.querySelector('img');
        assert.equal(logo.getAttribute('src'), resources.assets['/landscape.svg']);
        assert.equal(logo.hidden, false);
        assert.equal(fallback.hidden, true);
        await fixture.act(() => logo.dispatchEvent(new fixture.window.Event('error')));
        assert.equal(logo.hidden, true);
        assert.equal(fallback.hidden, false);
      } else {
        assert.equal(mark.querySelector('img'), null, 'blank or unsafe image URLs cannot create image requests');
        assert.equal(fallback.hidden, false);
      }
    }
    assert.deepEqual(fixture.errors, []);
  });

  test(`${format}: Animate page themes carry their canvas and readable control colors into exports`, async t => {
    for (const id of ['animate-light', 'animate-dark']) {
      const page = applyPageTheme(createDocument(), id);
      const theme = getTheme(id);
      const fixture = await mount(format, page);
      t.after(() => fixture.window.close());
      assert.equal(fixture.root.style.backgroundColor, id === 'animate-dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
      assert.equal(fixture.root.style.getPropertyValue('--page-ink'), theme.text);
      assert.equal(fixture.root.style.getPropertyValue('--page-on-accent'), contrastingText(theme.accent));
      assert.equal(fixture.root.style.colorScheme, theme.scheme);
      assert.deepEqual(fixture.errors, []);
    }
  });
}

for (const format of ['html', 'vue', 'react']) {
  test(`${format}: resolution presets retain design dimensions and scale to the available preview width`, async t => {
    for (const { width, height } of canvasPresets) {
      const page = createDocument(true);
      page.settings = { ...page.settings, maxWidth: width, canvasHeight: height };
      page.blocks = [{ ...createBlock('button'), frame: { x: width - 240, y: height - 100, width: 240, height: 100 } }];
      const fixture = await mount(format, page);
      t.after(() => fixture.window.close());
      const canvas = fixture.root.querySelector('.as-page-free-canvas');
      assert.equal(canvas.style.width, `${width}px`);
      assert.equal(canvas.style.height, `${height}px`);
      assert.equal(canvas.style.transform, `scale(${500 / width})`);
      assert.equal(fixture.root.querySelector('[data-block-type="button"]').style.left, `${width - 240}px`);
      assert.ok(Math.abs(parseFloat(fixture.root.querySelector('.as-page-free-scaled-shell').style.height) - height * 500 / width) < 1e-7);
      if (format !== 'html') fixture.window.unmountExport();
    }
  });

  test(`${format}: all ${componentTypes.length} components compile/mount and preserve theme, geometry, assets and initial form state`, async t => {
    const document = allComponents();
    const theme = { ...getTheme('midnight'), id: 'custom-export', name: '导出主题', accent: '#ffaabb' };
    const themed = saveCustomTheme(document, theme, document.blocks.find(block => block.type === 'card').id);
    const before = structuredClone(themed);
    const fixture = await mount(format, themed);
    t.after(() => fixture.window.close());
    const { root, observers } = fixture;
    assert.equal(root.querySelectorAll('[data-block-type]').length, componentTypes.length);
    assert.deepEqual(themed, before, 'export must not mutate the editable page');
    assert.equal(root.style.getPropertyValue('--page-accent'), document.settings.accent);
    assert.equal(root.querySelector('[data-block-type=card] .as-page-block').style.getPropertyValue('--page-accent'), '#ffaabb');
    assert.equal(root.querySelector('[data-block-type=hero]').style.left, '500px');
    assert.equal(root.querySelector('.as-page-free-canvas').style.transform, 'scale(0.5)');
    assert.equal(root.querySelector('.as-page-free-scaled-shell').style.height, '2900px');
    assert.match(root.querySelector('[data-block-type=image] img').src, /^data:image\/svg\+xml/);
    assert.equal(root.querySelector('[type=checkbox]').checked, true);
    assert.equal(root.querySelector('[data-block-type=radio] input').checked, true);
    assert.equal(root.querySelector('select').value, '');
    assert.equal(root.querySelector('[type=range]').value, '60');
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const node of root.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby], label[for]')) {
      const reference = node.getAttribute('aria-controls') || node.getAttribute('aria-labelledby') || node.getAttribute('aria-describedby') || node.htmlFor;
      assert.ok(fixture.window.document.getElementById(reference), `missing label/panel target: ${reference}`);
    }
    if (format !== 'html') {
      fixture.window.unmountExport();
      assert.ok(observers.every(observer => observer.disconnected), 'component unmount must release ResizeObservers');
    }
  });

  test(`${format}: tabs, accordion, switch, slider, select, rating, pagination and anchors work`, async t => {
    const fixture = await mount(format, allComponents());
    t.after(() => fixture.window.close());
    const { window, root } = fixture;
    const click = element => fixture.act(() => element.click());
    const tabs = root.querySelectorAll('[role=tab]');
    await click(tabs[1]);
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    assert.equal(root.querySelectorAll('[role=tabpanel]')[0].hidden, true);
    await fixture.act(() => tabs[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
    assert.equal(window.document.activeElement, tabs[2]);
    const accordions = root.querySelectorAll('.as-accordion-trigger');
    await click(accordions[1]);
    assert.equal(accordions[0].getAttribute('aria-expanded'), 'false');
    assert.equal(accordions[1].getAttribute('aria-expanded'), 'true');
    await click(accordions[1]);
    assert.equal(accordions[1].getAttribute('aria-expanded'), 'false');
    await click(root.querySelector('[role=switch]'));
    assert.equal(root.querySelector('[role=switch]').getAttribute('aria-checked'), 'true');
    const range = root.querySelector('[type=range]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(range, '81');
    await fixture.act(() => range.dispatchEvent(new window.Event('input', { bubbles: true })));
    assert.match(root.querySelector('.as-page-slider-field output').textContent.trim(), /^81/);
    const select = root.querySelector('select');
    select.value = 'option-1';
    await fixture.act(() => select.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.equal(select.value, 'option-1');
    await click(root.querySelector('[aria-label="2 星"]'));
    assert.equal(root.querySelector('.as-page-rating output').textContent, '2 / 5');
    assert.equal(root.querySelectorAll('.as-page-rating-star.is-filled').length, 2);
    await click(root.querySelector('[aria-label="下一页"]'));
    assert.equal(root.querySelector('.as-page-pagination [aria-current=page]').textContent, '2');
    await click(root.querySelector('[aria-label="第 10 页"]'));
    assert.equal(root.querySelector('[aria-label="下一页"]').disabled, true);
    assert.equal(root.querySelector('[aria-label="第 5 页"]').parentElement.hidden, true);
    await click(root.querySelector('[href="#features"]'));
    assert.equal(window.lastScrolled.dataset.anchor, 'features');
    const image = root.querySelector('[data-block-type=image] img');
    await fixture.act(() => image.dispatchEvent(new window.Event('error')));
    assert.equal(image.hidden, true);
    assert.equal(root.querySelector('.as-page-image-placeholder').hidden, false);
    assert.deepEqual(fixture.errors, []);
  });

  test(`${format}: user text stays literal and unsafe URLs cannot become executable markup`, async t => {
    const document = createDocument(true);
    const text = '</script><script>window.exportInjected=1</script> {{constructor.constructor("alert(1)")()}} <img src=x onerror=alert(1)> & " \' ` ${name}';
    document.name = text;
    document.blocks = ['text', 'button', 'image', 'input'].map(createBlock);
    document.blocks[0].props.text = text;
    document.blocks[1].props.url = 'javascript:alert(1)';
    document.blocks[2].props.imageUrl = 'javascript:alert(1)';
    document.blocks[3].props.text = text;
    const fixture = await mount(format, document);
    t.after(() => fixture.window.close());
    assert.equal(fixture.root.querySelector('.as-page-paragraph').textContent, text);
    assert.equal(fixture.root.querySelector('input').placeholder, text);
    assert.equal(fixture.root.querySelector('.as-page-button').getAttribute('href'), '#');
    assert.equal(fixture.root.querySelector('[data-block-type=image] img'), null);
    assert.equal(fixture.window.exportInjected, undefined);
    assert.equal(fixture.root.querySelector('script'), null);
  });
}

for (const format of ['vue', 'react']) {
  test(`${format}: multiple component instances have independent controls, IDs and cleanup`, async t => {
    const fixture = await mount(format, allComponents(), 2);
    t.after(() => fixture.window.close());
    const roots = fixture.window.document.querySelectorAll('.as-export');
    const ids = [...fixture.window.document.querySelectorAll('.as-export [id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length);
    await fixture.act(() => roots[0].querySelector('[aria-label="2 星"]').click());
    assert.equal(roots[0].querySelector('.as-page-rating output').textContent, '2 / 5');
    assert.equal(roots[1].querySelector('.as-page-rating output').textContent, '4 / 5');
    fixture.window.unmountExport();
    assert.ok(fixture.observers.every(observer => observer.disconnected));
  });
}

test('empty pages and legacy blocks without frames export without errors in every format', async t => {
  for (const format of ['html', 'vue', 'react']) {
    const empty = createDocument(true);
    const fixture = await mount(format, empty);
    t.after(() => fixture.window.close());
    assert.equal(fixture.root.querySelectorAll('[data-block-type]').length, 0);
    empty.blocks = ['button', 'tabs'].map(createBlock);
    const legacy = await mount(format, empty);
    t.after(() => legacy.window.close());
    assert.equal(legacy.root.querySelectorAll('[data-block-type]').length, 2);
    assert.equal(legacy.root.querySelector('[data-block-type=button]').style.top, '32px');
  }
});

for (const format of ['html', 'vue', 'react']) {
  test(`${format}: page bindings, ordered events, disabled/visible states and independent instances work`, async t => {
    const { createInteractionDemo } = await import('../src/lib/interactions/demo.ts');
    const document = createInteractionDemo();
    const slider = document.blocks.find(b => b.type === 'slider');
    slider.events = { change: [{ type: 'condition', expression: 'state.progress >= 50', then: [{ type: 'set', variable: 'name', expression: '"进度过半"' }], else: [] }] };
    const fixture = await mount(format, document, format === 'html' ? 1 : 2);
    t.after(() => fixture.window.close());
    const { window, root } = fixture;
    const setInput = (element, value) => fixture.act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await setInput(root.querySelector('input'), '小林');
    assert.match(root.textContent, /小林/);
    await setInput(root.querySelector('[type=range]'), '75');
    assert.equal(root.querySelector('progress').value, 75);
    assert.equal(root.querySelector('.as-page-statistic-value').textContent, '75%');
    assert.match(root.textContent, /你好，进度过半！/);
    const submit = root.querySelector('[data-block-type=button] button');
    const alert = root.querySelector('[data-block-type=alert]');
    assert.equal(submit.disabled, true);
    assert.equal(alert.hidden, true);
    await fixture.act(() => root.querySelector('[type=checkbox]').click());
    assert.equal(submit.disabled, false);
    await fixture.act(() => submit.click());
    // The following notification is after an awaited action step.
    await Promise.resolve();
    assert.equal(alert.hidden, false);
    assert.match(root.querySelector('.as-runtime-notice').textContent, /提交成功/);
    const notice = root.querySelector('.as-runtime-notice');
    assert.equal(notice.tagName, 'DIALOG');
    assert.equal(notice.open, true, 'notification opens a dialog, rather than appending offscreen text');
    notice.close();
    await fixture.act(() => submit.click());
    await Promise.resolve();
    assert.equal(notice.open, true, 'notification can be opened again after dismissal');
    if (format !== 'html') {
      const other = window.document.querySelectorAll('.as-export')[1];
      assert.equal(other.querySelector('progress').value, 30);
      assert.equal(other.querySelector('input').value, '');
      assert.equal(other.querySelector('.as-runtime-notice').open, false);
      fixture.window.unmountExport();
      assert.ok(fixture.observers.every(observer => observer.disconnected));
    }
    assert.deepEqual(fixture.errors, []);
  });
}

for (const format of ['html', 'vue', 'react']) {
  test(`${format}: catalog controls update bindings, filter OTP and keep animated content reactive`, async t => {
    const page = createDocument(true);
    page.variables = [
      { name: 'enabled', type: 'boolean', initial: false },
      { name: 'choice', type: 'string', initial: '' },
      { name: 'otp', type: 'string', initial: '' },
      { name: 'text', type: 'string', initial: '开始' },
    ];
    page.blocks = ['toggle', 'collapsible', 'combobox', 'inputOtp', 'typingText', 'codeBlock', 'button'].map(type => createBlock(type));
    for (const block of page.blocks) {
      if (['toggle', 'collapsible'].includes(block.type)) block.bindings = { checked: { kind: 'variable', value: 'enabled' } };
      if (block.type === 'combobox') block.bindings = { value: { kind: 'variable', value: 'choice' } };
      if (block.type === 'inputOtp') block.bindings = { value: { kind: 'variable', value: 'otp' } };
      if (block.type === 'typingText') block.bindings = { title: { kind: 'variable', value: 'text' } };
      if (block.type === 'codeBlock') block.bindings = { text: { kind: 'variable', value: 'text' } };
      if (block.type === 'button') block.events = { click: [{ type: 'set', variable: 'text', expression: '"更新后的内容"' }] };
    }
    const fixture = await mount(format, page);
    t.after(() => { fixture.window.unmountExport?.(); fixture.window.close(); });
    const { root, window, act, errors } = fixture;
    const control = (type, selector) => root.querySelector(`[data-block-type="${type}"] ${selector}`);
    await act(() => control('toggle', 'button').click());
    assert.equal(control('toggle', 'button').getAttribute('aria-pressed'), 'true');
    assert.equal(control('collapsible', 'button').getAttribute('aria-expanded'), 'true', 'boolean changes must reach other linked controls');
    await act(() => control('collapsible', 'button').click());
    assert.equal(control('toggle', 'button').getAttribute('aria-pressed'), 'false');
    const input = async (type, value) => act(() => {
      const element = control(type, 'input');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await input('combobox', '产品开发');
    assert.equal(control('combobox', 'input').value, '产品开发');
    assert.equal(root.querySelectorAll(`#${control('combobox', 'input').getAttribute('list').replaceAll(':', '\\:')} option`).length, 3);
    await input('inputOtp', '1a2-345678');
    assert.equal(control('inputOtp', 'input').value, '123456');
    await act(() => control('button', 'button').click());
    assert.equal(control('typingText', '[data-text-value]').textContent, '更新后的内容');
    assert.equal(control('codeBlock', 'code').textContent, '更新后的内容');
    assert.deepEqual(errors, []);
  });

  test(`${format}: catalog dialogs, grouped menus, pinning, questionnaire and clipboard work`, async t => {
    const page = createDocument(true);
    page.blocks = ['dialog', 'menubar', 'pinnedList', 'questionnaire', 'copyButton', 'themeTogglerButton'].map(type => createBlock(type));
    // This suite exercises the legacy text-list export contract. New catalog defaults
    // use the native renderer's structured menus, tested through that entry point.
    page.blocks.find(block => block.type === 'questionnaire').props.items = '你关注哪个方向？|界面设计,产品开发,品牌创意\n有什么想告诉我们？';
    page.blocks.find(block => block.type === 'menubar').props.items = '产品|组件库|#features\n产品|动效|#effects\n资源|使用指南|#docs\n资源|关于我们|#about';
    const fixture = await mount(format, page);
    t.after(() => { fixture.window.unmountExport?.(); fixture.window.close(); });
    const { root, window, act, errors } = fixture;
    const control = (type, selector) => root.querySelector(`[data-block-type="${type}"] ${selector}`);
    await act(() => control('dialog', '[data-catalog-action="open-dialog"]').click());
    assert.equal(control('dialog', 'dialog').open, true);
    await act(() => control('dialog', '[data-catalog-action="close-dialog"]').click());
    assert.equal(control('dialog', 'dialog').open, false);
    const menus = [...root.querySelectorAll('[data-block-type=menubar] [data-catalog-action="open-popover"]')];
    await act(() => menus[1].click());
    const popup = window.document.getElementById(menus[1].getAttribute('aria-controls'));
    assert.equal(popup.hidden, false);
    assert.match(popup.textContent, /使用指南/);
    await act(() => control('pinnedList', 'button[aria-label="置顶 收件箱"]').click());
    assert.equal(control('pinnedList', 'button[aria-label="取消置顶 收件箱"]').parentElement.hidden, false);
    assert.equal(control('pinnedList', 'button[aria-label="置顶 收件箱"]').parentElement.hidden, true);
    const questions = root.querySelectorAll('[data-block-type=questionnaire] fieldset');
    assert.equal(questions[0].querySelector('button').disabled, true);
    await act(() => questions[0].querySelector('input').click());
    assert.equal(questions[0].querySelector('button').disabled, false);
    await act(() => questions[0].querySelector('button').click());
    assert.equal(questions[0].hidden, true);
    assert.equal(questions[1].hidden, false);
    await act(() => {
      const input = questions[1].querySelector('input');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '更多组件');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(() => questions[1].querySelectorAll('button')[1].click());
    assert.equal(control('questionnaire', '[role=status]').hidden, false);
    let copied;
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
    await act(() => control('copyButton', 'button').click());
    assert.equal(copied, '欢迎使用 Animate Studio');
    assert.equal(control('copyButton', '[role=status]').textContent, '已复制');
    await act(() => control('themeTogglerButton', 'button').click());
    assert.equal(root.dataset.catalogScheme, 'dark');
    await act(() => control('themeTogglerButton', 'button').click());
    assert.equal(root.dataset.catalogScheme, 'light');
    assert.deepEqual(errors, []);
  });
}

test('minified production generator emits a self-contained catalog runtime', async t => {
  const page = createDocument(true);
  page.blocks = [createBlock('dialog'), createBlock('typingText')];
  const compiler = new JSDOM('', { runScripts: 'dangerously' });
  t.after(() => compiler.window.close());
  const bundled = await build({
    stdin: { contents: `import { generateCode } from './src/lib/code-export/generate.ts'; window.generated = generateCode(${JSON.stringify(page)}, 'html', ${JSON.stringify(resources)}).content;`, loader: 'js', resolveDir: root },
    bundle: true, minify: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
  compiler.window.eval(bundled.outputFiles[0].text);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (error.type !== 'css parsing') errors.push(error.message); });
  const exported = new JSDOM(compiler.window.generated, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: true });
      window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    },
  });
  t.after(() => exported.window.close());
  exported.window.document.querySelector('[data-catalog-action="open-dialog"]').click();
  assert.equal(exported.window.document.querySelector('.as-page-catalog-dialog').open, true);
  assert.deepEqual(errors, [], 'serialized helpers cannot depend on names outside the emitted function');
});
