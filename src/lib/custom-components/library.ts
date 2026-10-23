import { customComponentLimits, validateCustomComponentDefinition, type CustomComponentDefinition } from '../../../shared/custom-components.mjs';

/**
 * The browser-local component library. Guests and signed-in users both have
 * one; signing in never uploads or replaces it. Every write is a fresh
 * read-modify-write of the stored list, so a second tab's changes and entries
 * this version cannot read are preserved, and a revision check turns a
 * concurrent edit into an explicit conflict instead of a silent overwrite.
 */
export const localLibraryKey = 'animate-studio:custom-components:v1';

export type LocalComponent = CustomComponentDefinition & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Where the first version came from; informational only. */
  origin?: 'template' | 'shared' | 'page' | 'cloud';
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type LocalLibrary = { components: LocalComponent[]; damaged: boolean; hidden: number };

export class LibraryStorageError extends Error {}
export class RevisionConflictError extends Error {
  current: LocalComponent | null;
  constructor(current: LocalComponent | null) {
    super(current ? '这个组件已在其他标签页中修改。' : '这个组件已被删除。');
    this.current = current;
  }
}

const definitionKeys = ['name', 'description', 'html', 'css', 'js', 'fields', 'size'] as const;
const origins = ['template', 'shared', 'page', 'cloud'];
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;

/** Plain JSON data; a JSON copy stays in the current realm and drops anything non-JSON. */
export const copyJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Contract fields only; metadata never leaks into definitions passed to pages or the API. */
export function pickDefinition(value: CustomComponentDefinition): CustomComponentDefinition {
  const result: Record<string, unknown> = {};
  for (const key of definitionKeys) if (value[key] !== undefined) result[key] = copyJson(value[key]);
  return result as CustomComponentDefinition;
}

function parseEntry(value: unknown): LocalComponent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !idPattern.test(entry.id)) return null;
  if (typeof entry.revision !== 'number' || !Number.isInteger(entry.revision) || entry.revision < 1) return null;
  if (typeof entry.createdAt !== 'string' || typeof entry.updatedAt !== 'string') return null;
  if (entry.origin !== undefined && !origins.includes(String(entry.origin))) return null;
  try {
    const definition = validateCustomComponentDefinition(pickDefinition(entry as unknown as CustomComponentDefinition));
    return { ...definition, id: entry.id, revision: entry.revision, createdAt: entry.createdAt, updatedAt: entry.updatedAt, ...(entry.origin ? { origin: entry.origin as LocalComponent['origin'] } : {}) };
  } catch { return null; }
}

function readRaw(storage: StorageLike): unknown[] {
  let raw: string | null;
  try { raw = storage.getItem(localLibraryKey); } catch { throw new LibraryStorageError('当前浏览器不允许读取本机存储，组件无法保存在本机。'); }
  if (raw === null) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new LibraryStorageError('本机组件库数据已损坏，原数据尚未覆盖。'); }
  const record = data as { version?: unknown; components?: unknown };
  if (!record || record.version !== 1 || !Array.isArray(record.components)) throw new LibraryStorageError('本机组件库数据格式无法识别，原数据尚未覆盖。');
  return record.components;
}

function writeRaw(storage: StorageLike, components: unknown[]) {
  try { storage.setItem(localLibraryKey, JSON.stringify({ version: 1, components })); }
  catch { throw new LibraryStorageError('浏览器空间不足或不允许保存。请删除不需要的本机组件，或先保存到账号。'); }
}

const defaultStorage = (): StorageLike => globalThis.localStorage;

export function readLocalLibrary(storage: StorageLike = defaultStorage()): LocalLibrary {
  try {
    const raw = readRaw(storage);
    const components = raw.map(parseEntry).filter((entry): entry is LocalComponent => entry !== null);
    components.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { components, damaged: false, hidden: raw.length - components.length };
  } catch { return { components: [], damaged: true, hidden: 0 }; }
}

export function getLocalComponent(id: string, storage: StorageLike = defaultStorage()) {
  return readRaw(storage).map(parseEntry).find(entry => entry?.id === id) ?? null;
}

/**
 * Create (no id) or update a component. Updates must name the revision they
 * were based on; a mismatch or a deleted component throws RevisionConflictError.
 */
export function saveLocalComponent(definition: CustomComponentDefinition, options: { id?: string; baseRevision?: number | null; origin?: LocalComponent['origin'] } = {}, storage: StorageLike = defaultStorage(), now = new Date()): LocalComponent {
  const clean = validateCustomComponentDefinition(pickDefinition(definition));
  const raw = readRaw(storage);
  const time = now.toISOString();
  if (options.id === undefined) {
    if (raw.length >= customComponentLimits.perLibrary) throw new LibraryStorageError(`本机最多保存 ${customComponentLimits.perLibrary} 个组件，请先删除不需要的组件。`);
    const created: LocalComponent = { ...clean, id: crypto.randomUUID(), revision: 1, createdAt: time, updatedAt: time, ...(options.origin ? { origin: options.origin } : {}) };
    writeRaw(storage, [...raw, created]);
    return created;
  }
  const index = raw.findIndex(entry => (entry as { id?: unknown })?.id === options.id);
  const current = index < 0 ? null : parseEntry(raw[index]);
  if (!current || (options.baseRevision !== undefined && options.baseRevision !== null && current.revision !== options.baseRevision)) throw new RevisionConflictError(current);
  const updated: LocalComponent = { ...clean, id: current.id, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: time, ...(current.origin ? { origin: current.origin } : {}) };
  const next = [...raw];
  next[index] = updated;
  writeRaw(storage, next);
  return updated;
}

export function deleteLocalComponent(id: string, storage: StorageLike = defaultStorage()): boolean {
  const raw = readRaw(storage);
  const next = raw.filter(entry => (entry as { id?: unknown })?.id !== id);
  if (next.length === raw.length) return false;
  writeRaw(storage, next);
  return true;
}

/** Keep the unreadable data, so the user can back it up before starting over. */
export function resetDamagedLibrary(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage): string | null {
  let raw: string | null = null;
  try { raw = storage.getItem(localLibraryKey); storage.removeItem(localLibraryKey); } catch { throw new LibraryStorageError('当前浏览器不允许修改本机存储。'); }
  return raw;
}

/** Other tabs' writes arrive through the storage event. */
export function subscribeLocalLibrary(callback: () => void) {
  const listener = (event: StorageEvent) => { if (event.key === localLibraryKey || event.key === null) callback(); };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
