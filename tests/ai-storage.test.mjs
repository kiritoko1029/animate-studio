import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createBlock } from '../src/model.ts';
import { aiSessionsKey, aiUnreadableSessionsKey, newAiSession, readAiSessions, saveAiSessions } from '../src/lib/ai/storage.ts';

function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('invalid edits never replace a readable AI checkpoint, while cleared optional props use the persisted JSON shape', () => {
  const storage = memory(), owner = 'guest', page = createDocument(true);
  page.blocks = [createBlock('heading')];
  const session = newAiSession(page);
  saveAiSessions(owner, [session], storage);
  const original = storage.getItem(aiSessionsKey(owner));
  assert.throws(() => saveAiSessions(owner, [{ ...session, page: { ...page, name: '' } }], storage), /非空文本/);
  assert.equal(storage.getItem(aiSessionsKey(owner)), original);
  assert.deepEqual(readAiSessions(owner, storage)[0].page, page);
  const edited = structuredClone(session);
  edited.page.blocks[0].props.color = undefined;
  const saved = saveAiSessions(owner, [edited], storage);
  assert.equal(Object.hasOwn(saved[0].page.blocks[0].props, 'color'), false);
  assert.equal(readAiSessions(owner, storage).length, 1);
});

test('unreadable records are isolated and backed up before healthy AI sessions replace the source', () => {
  const storage = memory(), owner = 'account:one';
  const good = newAiSession(createDocument(true)), bad = newAiSession({ ...createDocument(true), name: '' });
  const raw = JSON.stringify([bad, good]);
  storage.setItem(aiSessionsKey(owner), raw);
  let invalid;
  const sessions = readAiSessions(owner, storage, count => { invalid = count; });
  assert.equal(invalid, 1);
  assert.deepEqual(sessions.map(session => session.id), [good.id]);
  assert.equal(storage.getItem(aiSessionsKey(owner)), raw, 'reading preserves all original data');
  saveAiSessions(owner, sessions, storage);
  assert.deepEqual(JSON.parse(storage.getItem(aiUnreadableSessionsKey(owner))), [bad]);
  assert.deepEqual(readAiSessions(owner, storage).map(session => session.id), [good.id]);
  assert.equal(storage.getItem(aiUnreadableSessionsKey('account:two')), null, 'backups are account scoped');
  storage.setItem(aiSessionsKey(owner), raw);
  saveAiSessions(owner, sessions, storage);
  assert.equal(JSON.parse(storage.getItem(aiUnreadableSessionsKey(owner))).length, 1, 'repeated recovery does not duplicate backups');
});

test('failed unreadable-record backups preserve the original session array', () => {
  const storage = memory(), owner = 'guest';
  const good = newAiSession(createDocument(true)), bad = newAiSession({ ...createDocument(true), name: '' });
  const raw = JSON.stringify([bad, good]); storage.setItem(aiSessionsKey(owner), raw);
  const full = { getItem: storage.getItem, setItem(key, value) { if (key === aiUnreadableSessionsKey(owner)) throw new Error('quota'); storage.setItem(key, value); } };
  assert.throws(() => saveAiSessions(owner, [good], full), /无法备份/);
  assert.equal(storage.getItem(aiSessionsKey(owner)), raw);
  assert.deepEqual(readAiSessions(owner, storage).map(session => session.id), [good.id]);
});

test('creation mode survives refresh while older page conversations remain readable', () => {
  const storage = memory(), owner = 'guest';
  const component = newAiSession(createDocument(true), 'component'), oldPage = newAiSession(createDocument(true));
  saveAiSessions(owner, [component, oldPage], storage);
  const sessions = readAiSessions(owner, storage);
  assert.equal(sessions[0].mode, 'component'); assert.equal(sessions[1].mode, undefined);
  assert.throws(() => saveAiSessions(owner, [{ ...component, mode: 'unknown' }], storage), /格式不正确/);
  assert.equal(readAiSessions(owner, storage).length, 2);
});
