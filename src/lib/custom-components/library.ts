import { customComponentLimits, validateCustomComponentDefinition, type CustomComponentDefinition, type CustomComponentSource } from '../../../shared/custom-components.mjs';
import { componentFolderLimits, validateComponentFolderName, type ComponentFolder } from '../../../shared/component-folders.mjs';

/** Browser-local library; every mutation starts from current storage and keeps unreadable records. */
export const localLibraryKey = 'animate-studio:custom-components:v1';
export type LocalComponent = CustomComponentDefinition & {
  id: string; revision: number; createdAt: string; updatedAt: string; folderId: string | null;
  origin?: 'template' | 'shared' | 'page' | 'cloud' | 'ai';
  /** Stable task/block identity, used only to retry an AI library save without duplicating it. */
  generationKey?: string;
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type RawLibrary = { version: 1; components: unknown[]; folders: unknown[]; [key: string]: unknown };
export type LocalLibrary = { components: LocalComponent[]; folders: ComponentFolder[]; damaged: boolean; hidden: number };
export type SaveLocalOptions = { id?: string; baseRevision?: number | null; origin?: LocalComponent['origin']; folderId?: string | null; generationKey?: string };
export class LibraryStorageError extends Error {}
export class RevisionConflictError extends Error {
  current: LocalComponent | null;
  constructor(current: LocalComponent | null) { super(current ? '这个组件已在其他标签页中修改。' : '这个组件已被删除。'); this.current = current; }
}
const definitionKeys = ['name', 'description', 'html', 'css', 'js', 'fields', 'size'] as const;
const origins = ['template', 'shared', 'page', 'cloud', 'ai'];
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
export const copyJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Library metadata never enters a page definition, share snapshot, or export. */
export function pickDefinition(value: CustomComponentDefinition): CustomComponentDefinition {
  const result: Record<string, unknown> = {};
  for (const key of definitionKeys) if (value[key] !== undefined) result[key] = copyJson(value[key]);
  return result as CustomComponentDefinition;
}
const definitionKey = (value: CustomComponentDefinition) => JSON.stringify(pickDefinition({ ...value,
  ...(value.fields ? { fields: Object.fromEntries(Object.entries(value.fields).sort(([a], [b]) => a.localeCompare(b))) } : {}),
  ...(value.size ? { size: { width: value.size.width, height: value.size.height } } : {}),
}));
function parseEntry(value: unknown): LocalComponent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !idPattern.test(entry.id) || typeof entry.revision !== 'number' || !Number.isInteger(entry.revision) || entry.revision < 1) return null;
  if (typeof entry.createdAt !== 'string' || typeof entry.updatedAt !== 'string' || entry.origin !== undefined && !origins.includes(String(entry.origin))) return null;
  if (entry.folderId !== undefined && entry.folderId !== null && (typeof entry.folderId !== 'string' || !idPattern.test(entry.folderId))) return null;
  if (entry.generationKey !== undefined && (typeof entry.generationKey !== 'string' || !entry.generationKey || entry.generationKey.length > 500)) return null;
  try {
    const definition = validateCustomComponentDefinition(pickDefinition(entry as unknown as CustomComponentDefinition));
    return { ...definition, id: entry.id, revision: entry.revision, createdAt: entry.createdAt, updatedAt: entry.updatedAt, folderId: entry.folderId as string | null ?? null,
      ...(entry.origin ? { origin: entry.origin as LocalComponent['origin'] } : {}), ...(entry.generationKey ? { generationKey: entry.generationKey as string } : {}) };
  } catch { return null; }
}
function parseFolder(value: unknown): ComponentFolder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const folder = value as Record<string, unknown>;
  if (typeof folder.id !== 'string' || !idPattern.test(folder.id) || typeof folder.createdAt !== 'string' || typeof folder.updatedAt !== 'string') return null;
  try { return { id: folder.id, name: validateComponentFolderName(folder.name), createdAt: folder.createdAt, updatedAt: folder.updatedAt }; } catch { return null; }
}
function readRaw(storage: StorageLike): RawLibrary {
  let raw: string | null;
  try { raw = storage.getItem(localLibraryKey); } catch { throw new LibraryStorageError('当前浏览器不允许读取本机存储，组件无法保存在本机。'); }
  if (raw === null) return { version: 1, components: [], folders: [] };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new LibraryStorageError('本机组件库数据已损坏，原数据尚未覆盖。'); }
  const record = data as Partial<RawLibrary>;
  if (!record || record.version !== 1 || !Array.isArray(record.components) || record.folders !== undefined && !Array.isArray(record.folders)) throw new LibraryStorageError('本机组件库数据格式无法识别，原数据尚未覆盖。');
  return { ...record, version: 1, components: record.components, folders: record.folders ?? [] };
}
function writeRaw(storage: StorageLike, library: RawLibrary) {
  try { storage.setItem(localLibraryKey, JSON.stringify(library)); }
  catch { throw new LibraryStorageError('浏览器空间不足或不允许保存。请删除不需要的本机组件，或先保存到账号。'); }
}
const defaultStorage = (): StorageLike => globalThis.localStorage;
const foldersIn = (raw: RawLibrary) => raw.folders.map(parseFolder).filter((value): value is ComponentFolder => value !== null);
function requireFolder(raw: RawLibrary, id: string | null) {
  if (id !== null && !foldersIn(raw).some(folder => folder.id === id)) throw new LibraryStorageError('未找到该文件夹。');
}
export function readLocalLibrary(storage: StorageLike = defaultStorage()): LocalLibrary {
  try {
    const raw = readRaw(storage), folders = foldersIn(raw);
    const components = raw.components.map(parseEntry).filter((entry): entry is LocalComponent => entry !== null)
      .map(entry => entry.folderId && !folders.some(folder => folder.id === entry.folderId) ? { ...entry, folderId: null } : entry);
    components.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); folders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { components, folders, damaged: false, hidden: raw.components.length - components.length };
  } catch { return { components: [], folders: [], damaged: true, hidden: 0 }; }
}
export function getLocalComponent(id: string, storage: StorageLike = defaultStorage()) {
  return readRaw(storage).components.map(parseEntry).find(entry => entry?.id === id) ?? null;
}
export function saveLocalComponent(definition: CustomComponentDefinition, options: SaveLocalOptions = {}, storage: StorageLike = defaultStorage(), now = new Date()): LocalComponent {
  const clean = validateCustomComponentDefinition(pickDefinition(definition)), raw = readRaw(storage), time = now.toISOString();
  if (options.folderId !== undefined) requireFolder(raw, options.folderId);
  if (options.generationKey !== undefined && (!options.generationKey || options.generationKey.length > 500)) throw new LibraryStorageError('AI 组件标识无效。');
  if (options.id === undefined) {
    if (raw.components.length >= customComponentLimits.perLibrary) throw new LibraryStorageError(`本机最多保存 ${customComponentLimits.perLibrary} 个组件，请先删除不需要的组件。`);
    const created: LocalComponent = { ...clean, id: crypto.randomUUID(), revision: 1, createdAt: time, updatedAt: time, folderId: options.folderId ?? null,
      ...(options.origin ? { origin: options.origin } : {}), ...(options.generationKey ? { generationKey: options.generationKey } : {}) };
    writeRaw(storage, { ...raw, components: [...raw.components, created] }); return created;
  }
  const index = raw.components.findIndex(entry => (entry as { id?: unknown })?.id === options.id), current = index < 0 ? null : parseEntry(raw.components[index]);
  if (!current || options.baseRevision !== undefined && options.baseRevision !== null && current.revision !== options.baseRevision) throw new RevisionConflictError(current);
  const updated: LocalComponent = { ...clean, id: current.id, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: time,
    folderId: options.folderId === undefined ? current.folderId : options.folderId, ...(current.origin ? { origin: current.origin } : {}), ...(current.generationKey ? { generationKey: current.generationKey } : {}) };
  const components = [...raw.components]; components[index] = updated; writeRaw(storage, { ...raw, components }); return updated;
}
/** Replaying a checkpoint must not create another copy or overwrite a manually edited source. */
export function saveAiComponent(definition: CustomComponentDefinition, key: string, source?: CustomComponentSource, folderId?: string | null, storage: StorageLike = defaultStorage()): LocalComponent {
  const clean = validateCustomComponentDefinition(pickDefinition(definition)), canonical = definitionKey(clean);
  const matches = (entry: LocalComponent) => definitionKey(entry) === canonical;
  const entries = readRaw(storage).components.map(parseEntry).filter((entry): entry is LocalComponent => entry !== null);
  if (source?.kind === 'local') {
    const current = entries.find(entry => entry.id === source.id);
    if (!current) throw new RevisionConflictError(null);
    if (matches(current)) return current;
    return saveLocalComponent(clean, { id: current.id, baseRevision: source.revision }, storage);
  }
  const existing = entries.find(entry => entry.generationKey === key && matches(entry));
  if (existing) return existing;
  return saveLocalComponent(clean, { origin: 'ai', generationKey: key, folderId }, storage);
}
export function deleteLocalComponent(id: string, storage: StorageLike = defaultStorage()): boolean {
  const raw = readRaw(storage), components = raw.components.filter(entry => (entry as { id?: unknown })?.id !== id);
  if (components.length === raw.components.length) return false;
  writeRaw(storage, { ...raw, components }); return true;
}
export function createLocalFolder(name: string, storage: StorageLike = defaultStorage(), now = new Date()): ComponentFolder {
  const raw = readRaw(storage), clean = validateComponentFolderName(name);
  if (raw.folders.length >= componentFolderLimits.perLibrary) throw new LibraryStorageError(`最多创建 ${componentFolderLimits.perLibrary} 个组件文件夹。`);
  if (foldersIn(raw).some(folder => folder.name === clean)) throw new LibraryStorageError('文件夹名称已存在。');
  const time = now.toISOString(), folder = { id: crypto.randomUUID(), name: clean, createdAt: time, updatedAt: time };
  writeRaw(storage, { ...raw, folders: [...raw.folders, folder] }); return folder;
}
export function renameLocalFolder(id: string, name: string, storage: StorageLike = defaultStorage(), now = new Date()): ComponentFolder {
  const raw = readRaw(storage), clean = validateComponentFolderName(name); requireFolder(raw, id);
  if (foldersIn(raw).some(folder => folder.id !== id && folder.name === clean)) throw new LibraryStorageError('文件夹名称已存在。');
  const current = foldersIn(raw).find(folder => folder.id === id)!, folder = { ...current, name: clean, updatedAt: now.toISOString() };
  writeRaw(storage, { ...raw, folders: raw.folders.map(entry => (entry as { id?: unknown })?.id === id ? folder : entry) }); return folder;
}
export function deleteLocalFolder(id: string, storage: StorageLike = defaultStorage()): boolean {
  const raw = readRaw(storage); requireFolder(raw, id);
  writeRaw(storage, { ...raw, folders: raw.folders.filter(entry => (entry as { id?: unknown })?.id !== id), components: raw.components.map(entry => {
    return entry && typeof entry === 'object' && (entry as { folderId?: unknown }).folderId === id ? { ...entry, folderId: null } : entry;
  }) }); return true;
}
export function moveLocalComponent(id: string, folderId: string | null, storage: StorageLike = defaultStorage(), now = new Date()): LocalComponent {
  const raw = readRaw(storage); requireFolder(raw, folderId);
  const index = raw.components.findIndex(entry => (entry as { id?: unknown })?.id === id), current = index < 0 ? null : parseEntry(raw.components[index]);
  if (!current) throw new RevisionConflictError(null);
  if (current.folderId === folderId) return current;
  const updated = { ...current, folderId, updatedAt: now.toISOString() }, components = [...raw.components]; components[index] = updated;
  writeRaw(storage, { ...raw, components }); return updated;
}
export function resetDamagedLibrary(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage): string | null {
  let raw: string | null = null;
  try { raw = storage.getItem(localLibraryKey); storage.removeItem(localLibraryKey); } catch { throw new LibraryStorageError('当前浏览器不允许修改本机存储。'); }
  return raw;
}
export function subscribeLocalLibrary(callback: () => void) {
  const listener = (event: StorageEvent) => { if (event.key === localLibraryKey || event.key === null) callback(); };
  window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener);
}
