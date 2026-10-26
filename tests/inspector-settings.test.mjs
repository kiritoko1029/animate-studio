import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { officialAnimationControls } from '../shared/animation-settings.mjs';
import { installMatchMedia } from './helpers/media-query.mjs';

test('inspector search reveals mounted controls and expands disclosures without business changes', async t => {
  const countingNumber = officialAnimationControls.countingNumber.groups.CountingNumber;
  assert.equal(typeof countingNumber.decimalPlaces.value, 'number');
  assert.equal(countingNumber.thousandSeparator.advanced, true);

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://inspector.test',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  t.after(() => { window.unmount?.(); window.close(); });
  installMatchMedia(window, { reducedMotion: true });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollCalls = [];
  window.HTMLElement.prototype.scrollIntoView = function (options) {
    window.scrollCalls.push({ element: this, options });
  };

  const bundle = await build({
    stdin: {
      contents: `
        import { act } from 'react';
        import { createRoot } from 'react-dom/client';
        import { flushSync } from 'react-dom';
        import { useState } from 'react';
        import { AnimationSettings } from './src/components/AnimationSettings';
        import { InspectorDisclosure, InspectorDisclosureProvider, InspectorSettingsSearch, revealInspectorAdvanced, useInspectorDisclosure } from './src/components/InspectorSettings';
        window.changeLog = [];
        window.disclosureChanges = [];
        const record = (kind, value) => window.changeLog.push({ kind, value });
        function KeyedTheme({ instance }) {
          const disclosure = useInspectorDisclosure('test:theme');
          return <details key={instance} {...disclosure.detailsProps}><summary onClick={disclosure.onSummaryClick}>测试主题</summary></details>;
        }
        function Fixture() {
          const [preferences, setPreferences] = useState({});
          const [revision, setRevision] = useState(0);
          const [instance, setInstance] = useState(0);
          window.disclosurePreferences = preferences;
          window.restoreDisclosures = value => { setPreferences(value); setRevision(current => current + 1); };
          window.remountTheme = () => setInstance(current => current + 1);
          const change = (id, open) => { window.disclosureChanges.push({ id, open }); setPreferences(current => ({ ...current, [id]: open })); };
          return <InspectorDisclosureProvider value={{ preferences, revision, onChange: change }}><div className="inspector-scroll" id="panel">
            <InspectorSettingsSearch />
            <section className="property-section">
              <h3>内容</h3>
              <input aria-label="标题" value="示例标题" onChange={event => record('title', event.target.value)} />
              <input aria-label="键盘目标甲" value="甲" onChange={event => record('keyboard-a', event.target.value)} />
              <input aria-label="键盘目标乙" value="乙" onChange={event => record('keyboard-b', event.target.value)} />
            </section>
            <InspectorDisclosure id="test:advanced" title="高级设置" badge="高级">
              <section className="property-section">
                <h3>布局</h3>
                <input aria-label="高级间距" value="24" onChange={event => record('spacing', event.target.value)} />
              </section>
              <AnimationSettings type="countingNumber" value={{}} onChange={value => record('motion', value)} />
            </InspectorDisclosure>
            <KeyedTheme instance={instance} />
          </div></InspectorDisclosureProvider>;
        }
        const root = createRoot(document.getElementById('root'));
        window.IS_REACT_ACT_ENVIRONMENT = true;
        window.perform = action => act(() => flushSync(action));
        window.unmount = () => window.perform(() => root.unmount());
        window.revealAdvanced = revealInspectorAdvanced;
        window.perform(() => root.render(<Fixture />));
      `,
      loader: 'jsx',
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    jsx: 'automatic',
    format: 'iife',
    loader: { '.css': 'empty' },
    external: ['shiki'],
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'silent',
  });
  window.eval(bundle.outputFiles[0].text);

  const doc = window.document;
  const panel = doc.getElementById('panel');
  const search = doc.querySelector('input[aria-label="搜索设置"]');
  const disclosure = doc.querySelector('details[data-inspector-advanced]');
  const officialGroup = doc.querySelector('details.official-property-group');
  const officialAdvanced = doc.querySelector('details.official-advanced');
  const normalInput = doc.querySelector('input[aria-label="标题"]');
  const advancedInput = doc.querySelector('input[aria-label="高级间距"]');
  const basicOfficial = doc.querySelector('[data-official-property="CountingNumber.decimalPlaces"] input[aria-label="小数位数"]');
  const advancedOfficial = doc.querySelector('[data-official-property="CountingNumber.thousandSeparator"] input[aria-label="千位分隔符"]');
  const options = () => [...doc.querySelectorAll('.inspector-settings-results [role="option"]')];
  const activeOption = () => doc.querySelector('.inspector-settings-results [role="option"][aria-selected="true"]');
  const fill = value => window.perform(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(search, value);
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const key = value => {
    const event = new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
    window.perform(() => search.dispatchEvent(event));
    return event;
  };
  const choose = label => {
    const option = options().find(node => node.querySelector('strong')?.textContent === label);
    assert.ok(option, `missing search result: ${label}`);
    window.perform(() => option.click());
  };

  assert.ok(normalInput);
  assert.equal(normalInput.closest('details'), null, 'basic inputs are not hidden by a disclosure');
  assert.equal(disclosure.open, false);
  assert.equal(disclosure.querySelector('summary strong').textContent, '高级设置');
  assert.ok(advancedInput, 'closed disclosures keep ordinary controls mounted');
  assert.equal(advancedInput.value, '24');
  assert.equal(officialGroup.open, true);
  assert.equal(officialAdvanced.open, false);
  assert.ok(basicOfficial);
  assert.ok(advancedOfficial, 'closed official advanced groups keep their controls mounted');
  assert.equal(advancedOfficial.closest('[data-official-property]').dataset.officialProperty, 'CountingNumber.thousandSeparator');
  assert.equal(window.changeLog.length, 0);

  window.perform(() => search.focus());
  fill('高级间距');
  assert.equal(search.getAttribute('aria-expanded'), 'true');
  choose('高级间距');
  assert.equal(disclosure.open, true);
  assert.equal(doc.activeElement, advancedInput);
  assert.equal(window.scrollCalls.at(-1).element, advancedInput);
  assert.deepEqual({ ...window.scrollCalls.at(-1).options }, { block: 'center', behavior: 'instant' });
  assert.equal(search.value, '');
  assert.equal(doc.querySelector('.inspector-settings-results'), null);
  assert.equal(window.changeLog.length, 0, 'search and reveal do not edit ordinary values');

  window.perform(() => {
    disclosure.open = false;
    officialGroup.open = false;
    officialAdvanced.open = false;
  });
  fill('thousandSeparator');
  assert.equal(options()[0].querySelector('small').textContent, 'CountingNumber.thousandSeparator');
  choose('千位分隔符');
  assert.equal(disclosure.open, true);
  assert.equal(officialGroup.open, true);
  assert.equal(officialAdvanced.open, true);
  assert.equal(doc.activeElement, advancedOfficial);
  assert.equal(window.scrollCalls.at(-1).element, advancedOfficial);
  assert.equal(window.changeLog.length, 0, 'nested official reveal does not edit motion settings');

  window.perform(() => search.focus());
  fill('键盘目标');
  assert.deepEqual(options().map(node => node.querySelector('strong').textContent), ['键盘目标甲', '键盘目标乙']);
  assert.equal(activeOption().querySelector('strong').textContent, '键盘目标甲');
  assert.equal(key('ArrowDown').defaultPrevented, true);
  assert.equal(activeOption().querySelector('strong').textContent, '键盘目标乙');
  assert.equal(search.getAttribute('aria-activedescendant'), activeOption().id, 'the active result is exposed to screen readers');
  assert.equal(key('ArrowUp').defaultPrevented, true);
  assert.equal(activeOption().querySelector('strong').textContent, '键盘目标甲');
  key('ArrowDown');
  assert.equal(activeOption().querySelector('strong').textContent, '键盘目标乙');
  assert.equal(key('Enter').defaultPrevented, true);
  assert.equal(doc.activeElement, doc.querySelector('input[aria-label="键盘目标乙"]'));
  assert.equal(search.value, '');
  assert.equal(search.getAttribute('aria-expanded'), 'false');
  assert.equal(window.changeLog.length, 0, 'keyboard navigation and selection do not edit values');

  window.perform(() => search.focus());
  fill('高级间距');
  assert.ok(options().length > 0);
  const scrollCount = window.scrollCalls.length;
  assert.equal(key('Escape').defaultPrevented, true);
  assert.equal(search.value, '');
  assert.equal(search.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.querySelector('.inspector-settings-results'), null);
  assert.equal(doc.activeElement, search);
  assert.equal(window.scrollCalls.length, scrollCount, 'Escape dismisses results without revealing a setting');
  assert.equal(window.changeLog.length, 0);

  window.perform(() => { disclosure.open = false; officialGroup.open = false; search.focus(); });
  fill('补齐位数');
  choose('补齐位数');
  assert.equal(doc.activeElement.getAttribute('aria-label'), '补齐位数', 'button and switch controls are searchable');
  assert.equal(doc.activeElement.tagName, 'BUTTON');
  assert.equal(disclosure.open, true);

  window.perform(() => search.focus());
  fill('键盘目标');
  const composing = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
  window.perform(() => search.dispatchEvent(composing));
  assert.equal(composing.defaultPrevented, false, 'IME confirmation is not intercepted');
  assert.equal(search.value, '键盘目标');
  assert.equal(doc.activeElement, search);
  key('Escape');
  assert.equal(window.changeLog.length, 0);

  window.perform(() => {
    disclosure.open = false;
    officialGroup.open = false;
    officialAdvanced.open = false;
    window.revealAdvanced(panel);
  });
  assert.equal(disclosure.open, true);
  assert.equal(officialGroup.open, true);
  assert.equal(doc.activeElement, disclosure.querySelector('summary'));
  assert.equal(window.scrollCalls.at(-1).element, disclosure);
  assert.deepEqual({ ...window.scrollCalls.at(-1).options }, { block: 'start', behavior: 'instant' });
  assert.equal(window.changeLog.length, 0, 'revealing all advanced groups is navigation only');
  assert.equal(officialAdvanced.open, true, 'revealInspectorAdvanced opens each advanced details element itself');
  assert.equal(window.disclosureChanges.length, 0, 'search and programmatic reveal never persist preferences');

  window.perform(() => disclosure.querySelector('summary').click());
  assert.equal(disclosure.open, false);
  window.perform(() => officialGroup.querySelector('summary').click());
  assert.equal(officialGroup.open, false);
  window.perform(() => officialAdvanced.querySelector('summary').click());
  assert.equal(officialAdvanced.open, false);
  assert.deepEqual(Array.from(window.disclosureChanges, ({ id, open }) => ({ id, open })), [
    { id: 'test:advanced', open: false },
    { id: 'motion:countingNumber:CountingNumber', open: false },
    { id: 'motion:countingNumber:CountingNumber:advanced', open: false },
  ], 'only summary clicks save, including explicitly closed default-open groups');
  assert.equal(window.disclosurePreferences['motion:countingNumber:CountingNumber'], false);

  window.perform(() => window.restoreDisclosures({ 'test:advanced': true, 'motion:countingNumber:CountingNumber': false }));
  assert.equal(disclosure.open, true);
  assert.equal(officialGroup.open, false);
  assert.equal(officialAdvanced.open, false, 'account restoration also reapplies defaults and clears temporary reveals');
  assert.deepEqual(window.disclosureChanges.length, 3, 'restoring preferences never writes them back');

  window.perform(() => window.restoreDisclosures({ 'test:theme': true }));
  const previousTheme = doc.querySelector('[data-inspector-disclosure="test:theme"]');
  assert.equal(previousTheme.open, true);
  window.perform(() => window.remountTheme());
  const replacementTheme = doc.querySelector('[data-inspector-disclosure="test:theme"]');
  assert.notEqual(replacementTheme, previousTheme, 'the keyed details element is actually replaced');
  assert.equal(replacementTheme.open, true, 'a newly mounted details element receives the current preference immediately');
  assert.equal(window.disclosureChanges.length, 3);
  assert.deepEqual(errors, []);
});
