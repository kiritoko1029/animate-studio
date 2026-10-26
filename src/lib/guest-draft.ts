import type { StudioDocument } from '../model';
import { isSiteDocument, validateSiteDocument } from '../../shared/site-document.mjs';
import { validatePage } from '../../server/validation.mjs';
import { fetchPageApi } from './page-api';

export const guestDraftKey = 'animate-studio:guest-draft:v1';
export const guestSiteDraftKey = 'animate-studio:guest-site-draft:v1';
export type DraftRecord = { page: StudioDocument | null; savedAt: string | null };

function parseDraft(raw: string, site: boolean): DraftRecord {
  try {
    const record = JSON.parse(raw) as DraftRecord;
    if (!record?.page || (record.savedAt !== null && typeof record.savedAt !== 'string')) throw new Error();
    if (site) validateSiteDocument(record.page, validatePage);
    else validatePage(record.page);
    return record;
  } catch { throw new Error('浏览器草稿无法读取。请先备份站点数据，再重试，原草稿尚未覆盖。'); }
}

/** Keep guest drafts in this browser; the old workspace remains a migration source. */
export async function readGuestDraft(): Promise<DraftRecord> {
  let siteRaw: string | null = null, legacyRaw: string | null = null;
  try { siteRaw = localStorage.getItem(guestSiteDraftKey); legacyRaw = localStorage.getItem(guestDraftKey); } catch { /* Editing remains available without browser storage. */ }
  if (siteRaw !== null) return parseDraft(siteRaw, true);
  if (legacyRaw !== null) return parseDraft(legacyRaw, false);
  try {
    const response = await fetchPageApi('/api/page', { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const record: DraftRecord = await response.json();
      if (record.page) return isSiteDocument(record.page) ? parseDraft(JSON.stringify(record), true) : parseDraft(JSON.stringify(record), false);
    }
  } catch { /* An unavailable cloud service must not block guest editing. */ }
  return { page: null, savedAt: null };
}

export function writeGuestDraft(page: StudioDocument): DraftRecord {
  const record = JSON.parse(JSON.stringify({ page, savedAt: new Date().toISOString() })) as DraftRecord & { page: StudioDocument };
  if (isSiteDocument(record.page)) validateSiteDocument(record.page, validatePage); else validatePage(record.page);
  try { localStorage.setItem(isSiteDocument(record.page) ? guestSiteDraftKey : guestDraftKey, JSON.stringify(record)); }
  catch { throw new Error('浏览器空间不足或不允许保存，请先导出页面 JSON 备份。'); }
  return record;
}
