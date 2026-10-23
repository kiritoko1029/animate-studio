import type { PageDocument } from '../model';
import { fetchPageApi } from './page-api';

export const guestDraftKey = 'animate-studio:guest-draft:v1';
export type DraftRecord = { page: PageDocument | null; savedAt: string | null };

/** Keep guest drafts in this browser; the old workspace remains a migration source. */
export async function readGuestDraft(): Promise<DraftRecord> {
  let raw: string | null = null;
  try { raw = localStorage.getItem(guestDraftKey); } catch { /* Editing remains available without browser storage. */ }
  if (raw !== null) {
    try {
      const record = JSON.parse(raw) as DraftRecord;
      if (!record?.page || typeof record.page.name !== 'string' || !Array.isArray(record.page.blocks) || !record.page.settings) throw new Error();
      return record;
    } catch { throw new Error('浏览器草稿无法读取。请先备份站点数据，再重试，原草稿尚未覆盖。'); }
  }
  // Migrate the existing anonymous cloud workspace without making auth a prerequisite.
  // Development servers may provide the legacy local draft; production disables that global file.
  {
    try {
      const response = await fetchPageApi('/api/page', { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const record: DraftRecord = await response.json();
        if (record.page) return record;
      }
    } catch { /* An unavailable cloud service must not block guest editing. */ }
  }
  return { page: null, savedAt: null };
}

export function writeGuestDraft(page: PageDocument): DraftRecord {
  const record = { page, savedAt: new Date().toISOString() };
  try { localStorage.setItem(guestDraftKey, JSON.stringify(record)); }
  catch { throw new Error('浏览器空间不足或不允许保存，请先导出页面 JSON 备份。'); }
  return record;
}
