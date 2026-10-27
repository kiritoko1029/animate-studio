import { and, desc, eq, isNull } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { collectMediaReferences, type MediaAsset } from '../shared/media.mjs';
import type { StudioDocument } from '../shared/site-document.mjs';

type AnyTable = SQLiteTable | PgTable;
type Schema = {
  studioPages: AnyTable & { id: unknown; userId: unknown; page: unknown };
  studioPageShare: AnyTable & { pageId: unknown; token: unknown; snapshot: unknown };
  studioPageVersions: AnyTable & { pageId: unknown; userId: unknown; snapshot: unknown };
  studioMedia: AnyTable & { id: unknown; pageId: unknown; userId: unknown; name: unknown; mime: unknown; size: unknown; hash: unknown; storageKey: unknown; createdAt: unknown; deletedAt: unknown };
};
type Row = Record<string, unknown>;
type Database = {
  select: (fields?: unknown) => { from: (table: unknown) => {
    where: (condition: unknown) => { limit: (count: number) => Promise<Row[]>; orderBy: (order: unknown) => Promise<Row[]> } & Promise<Row[]>;
    innerJoin: (table: unknown, condition: unknown) => { where: (condition: unknown) => { limit: (count: number) => Promise<Row[]> } };
  } };
  insert: (table: unknown) => { values: (value: unknown) => { returning: () => Promise<Row[]> } };
  update: (table: unknown) => { set: (value: unknown) => { where: (condition: unknown) => { returning: () => Promise<Row[]> } } };
  delete: (table: unknown) => { where: (condition: unknown) => { returning: () => Promise<Row[]> } };
};
export type StoredMediaAsset = MediaAsset & { pageId: string; storageKey: string; hash: string; deletedAt: string | null };
export type NewMediaAsset = { id: string; name: string; mime: MediaAsset['mime']; size: number; hash: string; storageKey: string };
function mediaLimitError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const message = String((current as { message?: unknown }).message);
    if (message.includes('studio_media_count_limit') || message.includes('studio_media_bytes_limit')) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
export function createMediaRepository(db: unknown, schema: Schema, dialect: 'sqlite' | 'pg' = 'sqlite') {
  const typed = db as Database, table = schema.studioMedia;
  const ts = (value: string) => dialect === 'pg' ? new Date(value) : value;
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value === null || value === undefined ? null : String(value);
  const asset = (row: Row): StoredMediaAsset => ({ id: String(row.id), pageId: String(row.pageId), name: String(row.name), mime: row.mime as MediaAsset['mime'], size: Number(row.size), hash: String(row.hash), storageKey: String(row.storageKey), createdAt: iso(row.createdAt)!, deletedAt: iso(row.deletedAt) });
  const owned = (userId: string, pageId: string) => and(eq(table.userId as never, userId), eq(table.pageId as never, pageId));
  return {
    async list(userId: string, pageId: string): Promise<MediaAsset[]> {
      const rows = await typed.select().from(table).where(and(owned(userId, pageId), isNull(table.deletedAt as never))).orderBy(desc(table.createdAt as never));
      return rows.map(row => { const value = asset(row); return { id: value.id, name: value.name, mime: value.mime, size: value.size, createdAt: value.createdAt }; });
    },
    async usage(userId: string, pageId: string) {
      const rows = await typed.select({ size: table.size }).from(table).where(owned(userId, pageId));
      return { count: rows.length, bytes: rows.reduce((total, row) => total + Number(row.size), 0) };
    },
    async find(userId: string, pageId: string, id: string, includeRemoved = false): Promise<StoredMediaAsset | null> {
      const conditions = [owned(userId, pageId), eq(table.id as never, id), ...(includeRemoved ? [] : [isNull(table.deletedAt as never)])];
      const [row] = await typed.select().from(table).where(and(...conditions)).limit(1);
      return row ? asset(row) : null;
    },
    async findShared(token: string, id: string): Promise<StoredMediaAsset | null> {
      const [row] = await typed.select({ id: table.id, pageId: table.pageId, name: table.name, mime: table.mime, size: table.size, hash: table.hash, storageKey: table.storageKey, createdAt: table.createdAt, deletedAt: table.deletedAt }).from(table).innerJoin(schema.studioPageShare, eq(table.pageId as never, schema.studioPageShare.pageId as never)).where(and(eq(schema.studioPageShare.token as never, token), eq(table.id as never, id))).limit(1);
      return row ? asset(row) : null;
    },
    async create(userId: string, pageId: string, input: NewMediaAsset): Promise<{ status: 'created'; asset: StoredMediaAsset } | { status: 'limit' | 'conflict' }> {
      const now = new Date().toISOString();
      const existing = await this.find(userId, pageId, input.id, true);
      if (existing) return existing.hash === input.hash && existing.storageKey === input.storageKey ? { status: 'created', asset: existing } : { status: 'conflict' };
      try {
        const [row] = await typed.insert(table).values({ ...input, userId, pageId, createdAt: ts(now), deletedAt: null }).returning();
        return { status: 'created', asset: asset(row) };
      } catch (error) {
        if (mediaLimitError(error)) return { status: 'limit' };
        if (String((error as { message?: string }).message).includes('UNIQUE')) {
          const current = await this.find(userId, pageId, input.id, true);
          if (current?.hash === input.hash) return { status: 'created', asset: current };
        }
        throw error;
      }
    },
    async missingReferences(userId: string, pageId: string, document: StudioDocument, includeRemoved = false) {
      const missing: string[] = [];
      for (const id of collectMediaReferences(document)) if (!await this.find(userId, pageId, id, includeRemoved)) missing.push(id);
      return missing;
    },
    async remove(userId: string, pageId: string, id: string): Promise<{ status: 'missing' | 'used' | 'retained' | 'deleted'; storageKey?: string }> {
      const current = await this.find(userId, pageId, id, true);
      if (!current) return { status: 'missing' };
      const [draft] = await typed.select({ page: schema.studioPages.page }).from(schema.studioPages).where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId))).limit(1);
      if (!draft) return { status: 'missing' };
      if (collectMediaReferences(JSON.parse(String(draft.page))).includes(id)) return { status: 'used' };
      const shares = await typed.select({ snapshot: schema.studioPageShare.snapshot }).from(schema.studioPageShare).where(eq(schema.studioPageShare.pageId as never, pageId));
      const versions = await typed.select({ snapshot: schema.studioPageVersions.snapshot }).from(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.pageId as never, pageId), eq(schema.studioPageVersions.userId as never, userId)));
      if ([...shares, ...versions].some(row => collectMediaReferences(JSON.parse(String(row.snapshot))).includes(id))) {
        await typed.update(table).set({ deletedAt: ts(new Date().toISOString()) }).where(and(owned(userId, pageId), eq(table.id as never, id))).returning();
        return { status: 'retained' };
      }
      await typed.delete(table).where(and(owned(userId, pageId), eq(table.id as never, id))).returning();
      return { status: 'deleted', storageKey: current.storageKey };
    },
    async listStorageKeys(userId: string, pageId: string) {
      const rows = await typed.select({ storageKey: table.storageKey }).from(table).where(owned(userId, pageId));
      return rows.map(row => String(row.storageKey));
    },
  };
}
