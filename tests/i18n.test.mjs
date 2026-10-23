import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocale, initializeLocale, localeStorageKey, resolveLocale, setLocale, t, translateMessage } from '../src/i18n/index.ts';
import { blockLabel } from '../src/i18n/catalog.ts';
import { createDocument } from '../src/model.ts';
import { generateNativeCode } from '../src/lib/code-export/native.ts';
import english from '../src/i18n/en.json' with { type: 'json' };

// Locale resolution is independent of Node's own language or the test machine.
test('locale resolution prefers valid stored choices, recognizes Chinese variants and falls back to English', () => {
  assert.equal(resolveLocale('en', ['zh-CN']), 'en');
  assert.equal(resolveLocale('zh-CN', ['en-US']), 'zh-CN');
  for (const language of ['zh', 'zh-TW', 'zh-Hant-HK']) assert.equal(resolveLocale(null, [language]), 'zh-CN');
  for (const language of ['en-US', 'en-GB', 'fr-FR']) assert.equal(resolveLocale('invalid', [language]), 'en');
});

test('messages preserve interpolation values and custom names while translating known validation errors', () => {
  setLocale('en', false);
  try {
    assert.equal(t('已导入「{0}」', { 0: '标题 <img> {1}' }), 'Imported “标题 <img> {1}”');
    assert.equal(t('unknown-key'), 'unknown-key');
    assert.equal(blockLabel({ type: 'custom', props: { custom: { name: '标题' } } }), '标题');
    assert.equal(blockLabel({ type: 'button', props: {} }), 'Button');
    assert.equal(translateMessage('验证码已过期，请重新发送。'), 'Verification code expired. Request another code.');
    assert.equal(translateMessage('page.settings 包含不支持的属性'), 'page.settings contains unsupported properties');
    assert.equal(translateMessage('每个账号最多保存 200 个组件，请先删除不需要的组件。'), 'Each account can save at most 200 components. Delete unused components first.');
    assert.equal(translateMessage('Custom error: 用户作品'), 'Custom error: 用户作品');
  } finally { setLocale('zh-CN', false); }
});

test('storage denial still allows detection and a session language choice', () => {
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['en-US'], language: 'en-US' } });
  try {
    assert.doesNotThrow(() => initializeLocale());
    assert.equal(getLocale(), 'en');
    assert.doesNotThrow(() => setLocale('zh-CN'));
    assert.equal(getLocale(), 'zh-CN');
  } finally {
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage); else delete globalThis.localStorage;
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator); else delete globalThis.navigator;
  }
  assert.equal(localeStorageKey, 'animate-studio:locale');
});

test('English messages preserve every numbered interpolation slot', () => {
  const slots = text => [...text.matchAll(/(?<!\$)\{(\d+)\}/g)].map(match => match[1]).sort();
  for (const [source, translated] of Object.entries(english)) {
    assert.ok(translated.trim(), `empty translation: ${source}`);
    assert.deepEqual(slots(translated), slots(source), `interpolation mismatch: ${source}`);
  }
});


test('workbench language does not change authored documents or exported HTML', () => {
  const page = createDocument();
  const original = JSON.stringify(page);
  const bundle = { code: 'window.AnimateStudioNative = {};', css: '' };
  const chinese = generateNativeCode(page, 'html', bundle);
  setLocale('en', false);
  try {
    assert.deepEqual(generateNativeCode(page, 'html', bundle), chinese);
    assert.equal(JSON.stringify(page), original);
  } finally { setLocale('zh-CN', false); }
});
