import { and, eq, desc } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Dialect-agnostic data access for cloud pages, share snapshots and user
 * preferences. Both dialects use text primary keys, ISO-8601 timestamps in
 * responses and `drizzleAdapter` from Better Auth for the auth tables, so the
 * same functions run on D1 (SQLite) and PostgreSQL.
 *
 * `schema` is a dialect-specific table bundle. Callers never compose raw SQL;
 * every query is parameterized by Drizzle and ownership is part of the WHERE
 * clause, so one user's record can never be selected through another's id.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

type AnyTable = SQLiteTable | PgTable;
type RepositorySchema = {
  studioPages: AnyTable & { id: unknown; userId: unknown; name: unknown; page: unknown; createdAt: unknown; updatedAt: unknown };
  studioPageShare: AnyTable & { pageId: unknown; userId: unknown; token: unknown; snapshot: unknown; publishedAt: unknown };
  userPreferences: AnyTable & { userId: unknown; studioTheme: unknown; updatedAt: unknown };
};

export type PageSummary = { id: string; name: string; createdAt: string; updatedAt: string; shareToken: string | null; publishedAt: string | null };
export type PageRecord = PageSummary & { page: PageDocumentLike; savedAt: string };
export type PageDocumentLike = { version: 1; name: string; settings: Record<string, unknown>; blocks: unknown[] };

export function createPageRepository(db: unknown, schema: RepositorySchema, dialect: 'sqlite' | 'pg' = 'sqlite') {
  const typed = db as {
    select: (...args: unknown[]) => { from: (t: unknown) => SelectChain };
    insert: (t: unknown) => { values: (v: unknown) => { returning: () => Promise<Record<string, unknown>[]>; onConflictDoUpdate: (o: unknown) => { returning: () => Promise<Record<string, unknown>[]> } } };
    update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<Record<string, unknown>[]> } } };
    delete: (t: unknown) => { where: (c: unknown) => { returning: (v: unknown) => Promise<Record<string, unknown>[]> } };
  };
  type Limited = { limit: (n: number) => Promise<Record<string, unknown>[]> };
  type SelectChain = {
    where: (c: unknown) => Limited & { orderBy: (o: unknown) => Limited & Promise<Record<string, unknown>[]> };
    leftJoin: (t: unknown, c: unknown) => { where: (c: unknown) => Limited & { orderBy: (o: unknown) => Limited & Promise<Record<string, unknown>[]> } };
    limit: (n: number) => Promise<Record<string, unknown>[]>;
  };
  const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));
  // PostgreSQL timestamp columns bind Date objects; SQLite text columns bind strings.
  const ts = (value: string): Date | string => (dialect === 'pg' ? new Date(value) : value);
  const toRecord = (row: Record<string, unknown>, shareRow?: Record<string, unknown>): PageRecord => ({
    id: String(row.id),
    name: String(row.name),
    page: JSON.parse(String(row.page)),
    createdAt: iso(row.createdAt),
    // The editor persistence contract exposes the last persisted timestamp
    // as savedAt; for cloud pages that is the record's updatedAt.
    updatedAt: iso(row.updatedAt),
    savedAt: iso(row.updatedAt),
    shareToken: shareRow ? String(shareRow.token) : null,
    publishedAt: shareRow ? iso(shareRow.publishedAt) : null,
  });

  return {
    async list(userId: string): Promise<PageSummary[]> {
      const rows = await typed
        .select({
          id: schema.studioPages.id,
          name: schema.studioPages.name,
          createdAt: schema.studioPages.createdAt,
          updatedAt: schema.studioPages.updatedAt,
          token: schema.studioPageShare.token,
          publishedAt: schema.studioPageShare.publishedAt,
        })
        .from(schema.studioPages)
        .leftJoin(schema.studioPageShare, eq(schema.studioPageShare.pageId as never, schema.studioPages.id as never))
        .where(eq(schema.studioPages.userId as never, userId))
        .orderBy(desc(schema.studioPages.updatedAt as never)) as unknown as Record<string, unknown>[];
      return rows.map(row => ({
        id: String(row.id),
        name: String(row.name),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        shareToken: row.token ? String(row.token) : null,
        publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
      }));
    },

    async create(userId: string, page: PageDocumentLike, id: string): Promise<PageRecord> {
      const now = new Date().toISOString();
      const [row] = await typed.insert(schema.studioPages)
        .values({ id, userId, name: page.name, page: JSON.stringify(page), createdAt: ts(now), updatedAt: ts(now) })
        .returning();
      return toRecord(row, undefined);
    },

    async findOwned(userId: string, pageId: string): Promise<PageRecord | null> {
      const rows = await typed.select()
        .from(schema.studioPages)
        .where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId)))
        .limit(1) as unknown as Record<string, unknown>[];
      const row = rows[0];
      if (!row) return null;
      const shareRows = await typed.select()
        .from(schema.studioPageShare)
        .where(eq(schema.studioPageShare.pageId as never, pageId))
        .limit(1) as unknown as Record<string, unknown>[];
      return toRecord(row, shareRows[0]);
    },

    async save(userId: string, pageId: string, page: PageDocumentLike): Promise<PageRecord | null> {
      const now = new Date().toISOString();
      const rows = await typed.update(schema.studioPages)
        .set({ page: JSON.stringify(page), name: page.name, updatedAt: ts(now) })
        .where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId)))
        .returning();
      const row = rows[0];
      if (!row) return null;
      const shareRows = await typed.select()
        .from(schema.studioPageShare)
        .where(eq(schema.studioPageShare.pageId as never, pageId))
        .limit(1) as unknown as Record<string, unknown>[];
      return toRecord(row, shareRows[0]);
    },

    async remove(userId: string, pageId: string): Promise<boolean> {
      // studio_page_share rows cascade on delete in both dialects.
      const rows = await typed.delete(schema.studioPages)
        .where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId)))
        .returning({ id: schema.studioPages.id });
      return rows.length > 0;
    },

    async publish(userId: string, pageId: string, token: string): Promise<{ token: string; publishedAt: string } | null> {
      // The snapshot re-reads the persisted draft so the published state always
      // matches what was saved, never an in-flight editor buffer.
      const existing = await this.findOwned(userId, pageId);
      if (!existing) return null;
      const now = new Date().toISOString();
      const rows = await typed.insert(schema.studioPageShare)
        .values({ pageId, userId, token, snapshot: JSON.stringify(existing.page), publishedAt: ts(now) })
        .onConflictDoUpdate({
          target: schema.studioPageShare.pageId,
          set: { snapshot: JSON.stringify(existing.page), publishedAt: ts(now) },
        })
        .returning();
      const row = rows[0];
      return { token: String(row.token), publishedAt: iso(row.publishedAt) };
    },

    async unpublish(userId: string, pageId: string): Promise<boolean> {
      const rows = await typed.delete(schema.studioPageShare)
        .where(and(eq(schema.studioPageShare.pageId as never, pageId), eq(schema.studioPageShare.userId as never, userId)))
        .returning({ pageId: schema.studioPageShare.pageId });
      return rows.length > 0;
    },

    async findPublished(token: string): Promise<{ page: PageDocumentLike; publishedAt: string } | null> {
      const rows = await typed.select()
        .from(schema.studioPageShare)
        .where(eq(schema.studioPageShare.token as never, token))
        .limit(1) as unknown as Record<string, unknown>[];
      const row = rows[0];
      if (!row) return null;
      return { page: JSON.parse(String(row.snapshot)), publishedAt: iso(row.publishedAt) };
    },

    async getPreferences(userId: string): Promise<{ version: 1; studioTheme: 'light' | 'dark'; updatedAt: string | null }> {
      const rows = await typed.select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId as never, userId))
        .limit(1) as unknown as Record<string, unknown>[];
      const row = rows[0];
      return { version: 1, studioTheme: row?.studioTheme === 'dark' ? 'dark' : 'light', updatedAt: row ? iso(row.updatedAt) : null };
    },

    async setPreferences(userId: string, studioTheme: 'light' | 'dark'): Promise<{ version: 1; studioTheme: 'light' | 'dark'; updatedAt: string }> {
      const now = new Date().toISOString();
      const rows = await typed.insert(schema.userPreferences)
        .values({ userId, studioTheme, updatedAt: ts(now) })
        .onConflictDoUpdate({ target: schema.userPreferences.userId, set: { studioTheme, updatedAt: ts(now) } })
        .returning();
      const row = rows[0];
      return { version: 1, studioTheme: row.studioTheme === 'dark' ? 'dark' : 'light', updatedAt: iso(row.updatedAt) };
    },
  };
}
