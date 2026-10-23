import { validateCustomComponentDefinition, type CustomComponentDefinition } from '../../../shared/custom-components.mjs';
import { pickDefinition } from './library.ts';

/**
 * Crash and close protection for the designer. Unsaved edits are mirrored to
 * this browser per target (a new component, a local or a cloud component) and
 * offered back the next time that target is opened. Saving or discarding
 * clears the entry. Drafts never leave the browser.
 */
export const designerDraftKey = 'animate-studio:custom-component-drafts:v1';
/** Present while a preview run has started but not reported back. */
export const pendingRunKey = 'animate-studio:custom-component-run:v1';

export type DesignerTarget = { kind: 'local' | 'cloud'; id: string } | null;
export type DesignerDraft = { target: DesignerTarget; baseRevision: number | null; ownerId?: string; definition: CustomComponentDefinition; updatedAt: string };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const maxDrafts = 10;

export const draftKey = (target: DesignerTarget, ownerId?: string) => target ? `${target.kind}:${target.kind === 'cloud' && ownerId ? `${encodeURIComponent(ownerId)}:` : ''}${target.id}` : 'new';

function readAll(storage: StorageLike): Record<string, DesignerDraft> {
  try {
    const data = JSON.parse(storage.getItem(designerDraftKey) ?? 'null') as { version?: number; drafts?: Record<string, DesignerDraft> } | null;
    if (!data || data.version !== 1 || !data.drafts || typeof data.drafts !== 'object') return {};
    const result: Record<string, DesignerDraft> = {};
    for (const [key, draft] of Object.entries(data.drafts)) {
      try {
        if (!draft || typeof draft.updatedAt !== 'string' || draftKey(draft.target, draft.ownerId) !== key) continue;
        result[key] = { target: draft.target, ...(typeof draft.ownerId === 'string' ? { ownerId: draft.ownerId } : {}), baseRevision: typeof draft.baseRevision === 'number' ? draft.baseRevision : null, definition: pickDefinition(draft.definition), updatedAt: draft.updatedAt };
      } catch { /* Skip one unreadable draft, keep the others. */ }
    }
    return result;
  } catch { return {}; }
}

function writeAll(storage: StorageLike, drafts: Record<string, DesignerDraft>) {
  const entries = Object.entries(drafts).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt)).slice(0, maxDrafts);
  if (!entries.length) storage.removeItem(designerDraftKey);
  else storage.setItem(designerDraftKey, JSON.stringify({ version: 1, drafts: Object.fromEntries(entries) }));
}

const defaultStorage = (): StorageLike => globalThis.localStorage;

export function listDesignerDrafts(storage: StorageLike = defaultStorage(), ownerId: string | null = null): DesignerDraft[] {
  return Object.values(readAll(storage)).filter(draft => draft.target?.kind !== 'cloud' || Boolean(ownerId && draft.ownerId === ownerId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readDesignerDraft(target: DesignerTarget, storage: StorageLike = defaultStorage(), ownerId: string | null = null): DesignerDraft | null {
  if (target?.kind === 'cloud' && !ownerId) return null;
  return readAll(storage)[draftKey(target, ownerId ?? undefined)] ?? null;
}

/** Returns false when the browser refuses to store the draft (the editor keeps working). */
export function writeDesignerDraft(draft: Omit<DesignerDraft, 'updatedAt'>, storage: StorageLike = defaultStorage(), now = new Date()): boolean {
  try {
    const drafts = readAll(storage);
    if (draft.target?.kind === 'cloud' && !draft.ownerId) return false;
    drafts[draftKey(draft.target, draft.ownerId)] = { ...draft, definition: pickDefinition(draft.definition), updatedAt: now.toISOString() };
    writeAll(storage, drafts);
    return true;
  } catch { return false; }
}

export function clearDesignerDraft(target: DesignerTarget, storage: StorageLike = defaultStorage(), ownerId: string | null = null) {
  if (target?.kind === 'cloud' && !ownerId) return;
  try {
    const drafts = readAll(storage);
    if (!(draftKey(target, ownerId ?? undefined) in drafts)) return;
    delete drafts[draftKey(target, ownerId ?? undefined)];
    writeAll(storage, drafts);
  } catch { /* Nothing to clear. */ }
}

/** A draft may hold invalid work in progress; this reports whether it can be saved as is. */
export function draftProblem(definition: CustomComponentDefinition): string | null {
  try { validateCustomComponentDefinition(definition); return null; } catch (error) { return error instanceof Error ? error.message : '组件内容无效'; }
}

/**
 * A run that started but never reported back usually means the previous tab
 * froze on this code. The designer then waits for an explicit run.
 */
export function markRunStarted(storage: StorageLike = defaultStorage(), now = Date.now()) {
  try { storage.setItem(pendingRunKey, String(now)); } catch { /* Optional protection. */ }
}
export function markRunFinished(storage: StorageLike = defaultStorage()) {
  try { storage.removeItem(pendingRunKey); } catch { /* Optional protection. */ }
}
export function previousRunUnfinished(storage: StorageLike = defaultStorage()) {
  try { return storage.getItem(pendingRunKey) !== null; } catch { return false; }
}
