import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { inspectorDisclosureLimits, inspectorDisclosureStorageKey, validateInspectorDisclosures } from '../src/lib/workbench-preferences.ts';
import { officialAnimationControls } from '../shared/animation-settings.mjs';

test('inspector disclosure preferences preserve explicit open and closed states', () => {
  assert.equal(inspectorDisclosureStorageKey, 'animate-studio:inspector-disclosures:v1');
  assert.deepEqual(validateInspectorDisclosures({ 'component:button:advanced': true, 'motion:countingNumber:CountingNumber': false }), {
    'component:button:advanced': true,
    'motion:countingNumber:CountingNumber': false,
  });
  assert.deepEqual(validateInspectorDisclosures({}), {});
  assert.deepEqual(validateInspectorDisclosures(runInNewContext('({"component:hero:advanced": false})')), { 'component:hero:advanced': false });
});

test('inspector disclosure preferences reject arbitrary, oversized and non-boolean storage', () => {
  const invalid = [
    null, [], 'component:button:advanced', 1, new Date(),
    { 'component:button:advanced': 'true' },
    { 'component:button:advanced': null },
    { ['__proto__']: true },
    { 'bad key': true },
    { [`component:${'x'.repeat(inspectorDisclosureLimits.maxKeyLength)}`]: true },
    Object.fromEntries(Array.from({ length: inspectorDisclosureLimits.maxEntries + 1 }, (_, index) => [`component:type${index}:advanced`, true])),
  ];
  for (const value of invalid) assert.equal(validateInspectorDisclosures(value), null);
  assert.equal(validateInspectorDisclosures(Object.fromEntries(Array.from({ length: inspectorDisclosureLimits.maxEntries }, (_, index) => [`component:type${index}:advanced`, index % 2 === 0]))) !== null, true);
  assert.deepEqual(validateInspectorDisclosures({ ['x'.repeat(inspectorDisclosureLimits.maxKeyLength)]: false }), { ['x'.repeat(inspectorDisclosureLimits.maxKeyLength)]: false });
});

test('all official motion groups fit the persisted key contract', () => {
  for (const [type, entry] of Object.entries(officialAnimationControls)) {
    for (const group of Object.keys(entry.groups)) {
      const key = `motion:${type}:${group}`;
      assert.ok(key.length <= inspectorDisclosureLimits.maxKeyLength, key);
      assert.deepEqual(validateInspectorDisclosures({ [key]: false, [`${key}:advanced`]: true }), { [key]: false, [`${key}:advanced`]: true });
    }
  }
});
