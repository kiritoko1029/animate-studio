import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlock, createDocument } from '../src/model.ts';
import { applyPageTheme, blockThemeStyle, contrastingText, deleteCustomTheme, getTheme, saveCustomTheme, pageThemeStyle, prepareBlockForPage, themePresets } from '../src/lib/themes.ts';

test('a page preset resets inherited appearance while retaining content, geometry and independent themes', () => {
  const document = createDocument();
  const original = structuredClone(document);
  document.blocks[1].props = { ...document.blocks[1].props, accent: '#ff0000', color: '#000000', radius: 27 };
  const independent = { ...createBlock('card'), props: { theme: 'midnight', background: '#123456', radius: 7, title: '独立卡片' } };
  document.blocks.push(independent);
  const before = structuredClone(document);
  const result = applyPageTheme(document, 'tech-blue');
  assert.deepEqual(document, before, 'theme changes must not mutate undo history');
  assert.deepEqual(result.blocks.map(block => block.frame), document.blocks.map(block => block.frame));
  assert.equal(result.blocks[1].props.title, original.blocks[1].props.title);
  for (const prop of ['accent', 'background', 'color', 'radius']) assert.equal(Object.hasOwn(result.blocks[1].props, prop), false);
  assert.deepEqual(result.blocks.at(-1), independent);
  assert.equal(result.settings.accent, getTheme('tech-blue').accent);
  assert.equal(result.settings.background, getTheme('tech-blue').canvas);
});

test('new blocks inherit active presets and legacy pages retain their original defaults', () => {
  const block = createBlock('card');
  const legacy = createDocument(true);
  assert.equal(prepareBlockForPage(block, legacy.settings), block);
  const themed = applyPageTheme(legacy, 'mono');
  const prepared = prepareBlockForPage(block, themed.settings);
  assert.equal(prepared.props.background, undefined);
  assert.equal(prepared.props.radius, undefined);
  assert.equal(blockThemeStyle(prepared, themed.settings).borderRadius, 0);
  assert.equal(block.props.radius, 16);
});

test('independent theme and custom accent override page tokens without leaking to siblings', () => {
  const page = applyPageTheme(createDocument(true), 'tech-blue');
  const own = { ...createBlock('button'), props: { theme: 'midnight', accent: '#fff', color: '#123456', radius: 3 } };
  const style = blockThemeStyle(own, page.settings);
  assert.equal(style['--page-accent'], '#fff');
  assert.equal(style['--page-on-accent'], '#000000');
  assert.equal(style['--page-ink'], getTheme('midnight').text);
  assert.equal(style.color, '#123456');
  assert.equal(style.borderRadius, 3);
  assert.equal(style.background, getTheme('midnight').canvas);
  assert.equal(blockThemeStyle(createBlock('text'), page.settings)['--page-accent'], getTheme('tech-blue').accent);
  assert.equal(pageThemeStyle(page.settings)['--page-accent'], getTheme('tech-blue').accent);
});

test('all presets provide readable text contrast on their canvas and panel surfaces', () => {
  function luminance(hex) {
    const rgb = [1, 3, 5].map(i => { const n = parseInt(hex.slice(i, i + 2), 16) / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  for (const theme of themePresets) {
    for (const surface of [theme.canvas, theme.surface, theme.panel]) {
      assert.ok(contrast(theme.text, surface) >= 4.5, `${theme.id}: main text on ${surface}`);
      assert.ok(contrast(theme.muted, surface) >= 4.5, `${theme.id}: secondary text on ${surface}`);
    }
    assert.ok(contrast(contrastingText(theme.accent), theme.accent) >= 4.5, `${theme.id}: button text`);
  }
});


test('custom themes apply all tokens and are kept inside an immutable document history entry', () => {
  const original = createDocument();
  const before = structuredClone(original);
  const theme = { ...getTheme('tech-blue'), id: 'custom-sea', name: '海盐蓝', accent: '#007f8b', canvas: '#f0fafb', radius: 22, controlRadius: 12 };
  const result = saveCustomTheme(original, theme);
  assert.deepEqual(original, before);
  assert.deepEqual(result.settings.customThemes, [theme]);
  assert.equal(result.settings.theme, theme.id);
  const style = blockThemeStyle(result.blocks[0], result.settings);
  assert.equal(style['--page-accent'], theme.accent);
  assert.equal(style['--theme-radius'], '22px');
  assert.equal(style['--theme-control-radius'], '12px');
  assert.equal(style['--page-heading-font'], theme.headingFont);
  assert.equal(pageThemeStyle(result.settings).background, theme.canvas);
  const next = prepareBlockForPage(createBlock('card'), result.settings);
  assert.equal(blockThemeStyle(next, result.settings).borderRadius, 22);
});

test('editing a shared custom theme updates users while preserving explicit overrides elsewhere', () => {
  const theme = { ...getTheme('nature'), id: 'custom-brand', name: '品牌主题' };
  let document = saveCustomTheme(createDocument(), theme);
  const independent = createBlock('card');
  independent.props = { theme: theme.id, accent: '#112233', radius: 7 };
  document.blocks.push(independent);
  const target = document.blocks[0].id;
  const before = structuredClone(document);
  const changed = { ...theme, accent: '#3355aa', canvas: '#f0f4ff', text: '#101030' };
  const result = saveCustomTheme(document, changed, target);
  assert.deepEqual(document, before);
  assert.equal(result.settings.customThemes.length, 1);
  assert.equal(result.settings.accent, changed.accent);
  assert.equal(result.settings.background, changed.canvas);
  assert.equal(result.blocks[0].props.theme, theme.id);
  const style = blockThemeStyle(result.blocks.at(-1), result.settings);
  assert.equal(style['--page-ink'], changed.text);
  assert.equal(style['--page-accent'], '#112233');
  assert.equal(style.borderRadius, 7);
});

test('copies have independent references and edits do not mutate the original theme', () => {
  const theme = { ...getTheme('midnight'), id: 'custom-night', name: '夜色' };
  const document = saveCustomTheme(createDocument(), theme);
  const copy = { ...theme, id: 'custom-night-copy', name: '夜色副本', accent: '#ffbb44' };
  const result = saveCustomTheme(document, copy, document.blocks[0].id);
  assert.equal(result.settings.customThemes.length, 2);
  assert.equal(result.settings.theme, theme.id);
  assert.equal(getTheme(theme.id, result.settings.customThemes).accent, theme.accent);
  assert.equal(blockThemeStyle(result.blocks[0], result.settings)['--page-accent'], copy.accent);
});

test('removing a theme clears every reference and leaves other independent themes intact', () => {
  const theme = { ...getTheme('violet'), id: 'custom-purple', name: '紫色品牌' };
  let document = saveCustomTheme(createDocument(), theme);
  document = saveCustomTheme(document, theme, document.blocks[0].id);
  document.blocks[1].props.theme = 'midnight';
  const before = structuredClone(document);
  const result = deleteCustomTheme(document, theme.id);
  assert.deepEqual(document, before);
  assert.equal(result.settings.theme, 'nature');
  assert.deepEqual(result.settings.customThemes, []);
  assert.equal(result.blocks[0].props.theme, undefined);
  assert.equal(result.blocks[1].props.theme, 'midnight');
  assert.deepEqual(result.blocks.map(block => block.frame), document.blocks.map(block => block.frame));
});
