/** Account-scoped links between AI drafts and explicit cloud uploads; never includes source code. */
export type AiComponentUpload = { id: string; revision: number; localKey: string | null; updatedAt: number };
const key = (owner: string) => `animate-studio:ai-component-uploads:v1:${encodeURIComponent(owner)}`;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function readComponentUploads(owner: string, storage: Pick<Storage, 'getItem'> = localStorage): Record<string, AiComponentUpload> {
  const raw = storage.getItem(key(owner));
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('组件的云端关联无法读取，原记录未被覆盖。');
  const records: Record<string, AiComponentUpload> = {};
  for (const [target, entry] of Object.entries(value)) {
    if (!entry || typeof entry.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(entry.id) || !Number.isInteger(entry.revision) || entry.revision < 1 || entry.localKey !== null && typeof entry.localKey !== 'string' || !Number.isFinite(entry.updatedAt)) throw new Error('组件的云端关联无法读取，原记录未被覆盖。');
    records[target] = entry;
  }
  return records;
}
export function rememberComponentUpload(owner: string, target: string, upload: AiComponentUpload, storage: StorageLike = localStorage) {
  try {
    const records = { ...readComponentUploads(owner, storage), [target]: upload };
    const recent = Object.entries(records).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 200);
    storage.setItem(key(owner), JSON.stringify(Object.fromEntries(recent)));
  } catch { throw new Error('组件已保存到云端，但本机无法记录关联。请从账号组件库查看并继续编辑。'); }
}
