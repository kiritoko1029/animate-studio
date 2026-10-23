import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { ensureBrowserRandomUUID } from '../src/lib/browser-crypto.ts';
import { createDocument, createBlock } from '../src/model.ts';

test('HTTP startup can create pages and components with securely generated v4 UUIDs', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let calls = 0;
  const insecureContextCrypto = { getRandomValues(bytes) { calls++; return webcrypto.getRandomValues(bytes); } };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: insecureContextCrypto });
  try {
    ensureBrowserRandomUUID();
    const page = createDocument();
    const block = createBlock('button');
    const ids = [page.id, ...page.blocks.map(item => item.id), block.id];
    for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(calls, ids.length);
    const generated = crypto.randomUUID;
    ensureBrowserRandomUUID();
    assert.equal(crypto.randomUUID, generated, 'initialization is idempotent');
  } finally { Object.defineProperty(globalThis, 'crypto', original); }
});

test('secure browsers retain their native randomUUID implementation', () => {
  const original = crypto.randomUUID;
  ensureBrowserRandomUUID();
  assert.equal(crypto.randomUUID, original);
});
