import { validatePage } from '../../../server/validation.mjs';
import { parseAiQuestions } from './protocol.ts';
import type { AiCreationMode, AiSession, AiVersion } from './types.ts';

export const aiSessionsKey = (owner: string) => `animate-studio:ai-sessions:v1:${encodeURIComponent(owner)}`;
export const aiUnreadableSessionsKey = (owner: string) => `${aiSessionsKey(owner)}:unreadable`;
export const aiMaxVersions = 10;
const statuses = ['idle', 'running', 'paused', 'complete', 'waiting', 'error'];
function validateSession(value: any): AiSession {
  if (!value || value.version !== 1 || typeof value.id !== 'string' || typeof value.task !== 'string' || typeof value.summary !== 'string' || typeof value.error !== 'string' || !Array.isArray(value.messages) || !Array.isArray(value.receipts) || !Number.isFinite(value.updatedAt) || !statuses.includes(value.status)) throw new Error('AI 对话记录格式不正确，原记录未被覆盖。');
  validatePage(value.page);
  if (value.mode !== undefined && !['page', 'component'].includes(value.mode)) throw new Error('AI 对话记录格式不正确，原记录未被覆盖。');
  if (value.selectedBlockIds !== undefined && (!Array.isArray(value.selectedBlockIds) || value.selectedBlockIds.length > 200 || value.selectedBlockIds.some((id: unknown) => typeof id !== 'string'))) throw new Error('AI 对话记录格式不正确，原记录未被覆盖。');
  if (value.messages.some((message: any) => !message || typeof message.id !== 'string' || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string' || !Number.isFinite(message.time))) throw new Error('AI 对话消息格式不正确。');
  for (const message of value.messages) if (message.questions !== undefined) parseAiQuestions(message.questions);
  if (value.receipts.some((receipt: any) => !receipt || typeof receipt.runId !== 'string' || typeof receipt.summary !== 'string' || typeof receipt.op !== 'string' || !Number.isInteger(receipt.seq))) throw new Error('AI 操作记录格式不正确。');
  // Records written before snapshots existed have no versions.
  const versions = value.versions ?? [];
  if (!Array.isArray(versions) || versions.some((version: any) => !version || typeof version.id !== 'string' || typeof version.runId !== 'string' || !['before', 'after'].includes(version.kind) || !Number.isFinite(version.time) || typeof version.label !== 'string')) throw new Error('AI 版本记录格式不正确。');
  for (const version of versions) validatePage(version.page);
  return { ...value, versions } as AiSession;
}
function parseSessions(raw: string): unknown[] {
  const saved: unknown = JSON.parse(raw);
  if (!Array.isArray(saved) || saved.length > 12) throw new Error('AI 对话记录无法读取，原记录未被覆盖。');
  return saved;
}
/** A damaged record must not hide other pages; the original storage is kept until safely backed up. */
export function readAiSessions(owner: string, storage: Pick<Storage, 'getItem'> = localStorage, onInvalid?: (count: number) => void): AiSession[] {
  const raw = storage.getItem(aiSessionsKey(owner));
  if (!raw) { onInvalid?.(0); return []; }
  const sessions: AiSession[] = [];
  let invalid = 0;
  for (const value of parseSessions(raw)) {
    try { const session = validateSession(value); sessions.push({ ...session, status: session.status === 'running' ? 'paused' : session.status }); }
    catch { invalid++; }
  }
  onInvalid?.(invalid);
  return sessions;
}
type SessionStorage = Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>>;
function preserveUnreadableSessions(owner: string, storage: SessionStorage) {
  const raw = storage.getItem?.(aiSessionsKey(owner));
  if (!raw) return;
  const invalid = parseSessions(raw).filter(value => { try { validateSession(value); return false; } catch { return true; } });
  if (!invalid.length) return;
  try {
    const key = aiUnreadableSessionsKey(owner), previous = storage.getItem?.(key);
    const saved: unknown = previous ? JSON.parse(previous) : [];
    if (!Array.isArray(saved)) throw new Error('Invalid backup');
    const entries = new Set([...saved, ...invalid].map(value => JSON.stringify(value)));
    storage.setItem(key, `[${[...entries].join(',')}]`);
  } catch { throw new Error('无法备份不可读取的 AI 对话记录，原记录未被覆盖。请释放浏览器存储空间后重试。'); }
}
/** Saves sessions, newest first. Version snapshots are dropped oldest-first when storage is full, before the checkpoint itself is refused. */
export function saveAiSessions(owner: string, sessions: AiSession[], storage: SessionStorage = localStorage): AiSession[] {
  if (sessions.length > 12) throw new Error('最多保留 12 个 AI 页面，请先移除不需要的对话记录。');
  let saved = sessions.map(session => ({ ...session, messages: session.messages.slice(-60), receipts: session.receipts.slice(-100), versions: session.versions.slice(-aiMaxVersions) }));
  // Validate the persisted JSON shape before touching storage. Transient editor values (such
  // as an empty name while typing) must never replace the last readable checkpoint.
  // Explicit fields keep credentials and request headers out of persisted checkpoints.
  const safe = saved.map(session => ({ version: 1, id: session.id, page: session.page,
      messages: session.messages.map(({ id, role, text, time, questions }) => ({ id, role, text, time, ...(questions ? { questions } : {}) })),
      receipts: session.receipts, versions: session.versions.map(({ id, runId, kind, time, label, page }) => ({ id, runId, kind, time, label, page })),
      status: session.status, task: session.task, summary: session.summary, error: session.error, updatedAt: session.updatedAt, usage: session.usage, selectedBlockIds: session.selectedBlockIds, mode: session.mode }));
  saved = JSON.parse(JSON.stringify(safe)).map(validateSession);
  preserveUnreadableSessions(owner, storage);
  while (true) {
    try { storage.setItem(aiSessionsKey(owner), JSON.stringify(saved)); return saved; }
    catch {
      const remaining = saved.reduce((count, session) => count + session.versions.length, 0);
      if (!remaining) throw new Error('浏览器无法保存 AI 进度，已暂停。请导出页面备份并释放浏览器存储空间。');
      saved = dropOldestVersions(saved, Math.ceil(remaining / 4));
    }
  }
}
/** Other pages lose snapshots before the page being written (sessions[0]). */
function dropOldestVersions(sessions: AiSession[], count: number): AiSession[] {
  const order = sessions.flatMap((session, index) => session.versions.map(version => ({ index, version })))
    .sort((a, b) => Number(a.index === 0) - Number(b.index === 0) || a.version.time - b.version.time);
  const dropped = new Set(order.slice(0, count).map(entry => entry.version));
  return sessions.map(session => ({ ...session, versions: session.versions.filter(version => !dropped.has(version)) }));
}
/** Adds a snapshot unless an existing one already holds the same page. */
export function withAiVersion(session: AiSession, version: Omit<AiVersion, 'id'>): AiSession {
  const key = JSON.stringify(version.page);
  if (session.versions.some(value => JSON.stringify(value.page) === key)) return session;
  return { ...session, versions: [...session.versions, { ...version, id: `${version.runId}:${version.kind}`, label: version.label.slice(0, 300) }].slice(-aiMaxVersions) };
}
export function newAiSession(page: AiSession['page'], mode?: AiCreationMode): AiSession {
  return { version: 1, id: page.id!, page: structuredClone(page), messages: [], receipts: [], versions: [], status: 'idle', task: '', summary: '', error: '', updatedAt: Date.now(), usage: { input: 0, output: 0 }, ...(mode ? { mode } : {}) };
}
