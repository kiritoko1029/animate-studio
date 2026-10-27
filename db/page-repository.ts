import { and, eq, desc, exists, lt, ne, not, sql, type SQL } from 'drizzle-orm';
import type { StudioDocument } from '../shared/site-document.mjs';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { validateInspectorDisclosures, type InspectorDisclosurePreferences, type WorkbenchPreferencesPatch } from '../src/lib/workbench-preferences.ts';
import { jsonEqual, publishHistoryLimit, type PublishRequest, type PublishResult, type PublishStatus, type PublishVersionDetail, type PublishVersionSummary } from '../src/lib/publishing.ts';

/**
 * Dialect-agnostic data access for cloud pages, immutable publish versions,
 * share snapshots and user preferences. Ownership is part of every private
 * query; public snapshot lookup is intentionally token-only.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

type AnyTable = SQLiteTable | PgTable;
type RepositorySchema = {
  studioPages: AnyTable & { id: unknown; userId: unknown; name: unknown; page: unknown; createdAt: unknown; updatedAt: unknown };
  studioPageShare: AnyTable & { pageId: unknown; userId: unknown; token: unknown; snapshot: unknown; publishedAt: unknown; activeVersion: unknown };
  studioPageVersions: AnyTable & { id: unknown; pageId: unknown; userId: unknown; version: unknown; snapshot: unknown; sourceVersion: unknown; createdAt: unknown };
  userPreferences: AnyTable & { userId: unknown; studioTheme: unknown; inspectorDisclosures: unknown; updatedAt: unknown };
};

export type PageSummary = { id: string; name: string; createdAt: string; updatedAt: string; shareToken: string | null; publishedAt: string | null; publishedVersion: number | null };
export type PageRecord = PageSummary & { page: PageDocumentLike; savedAt: string };
export type PageDocumentLike = StudioDocument;
type Row = Record<string, unknown>;
type MaybePromise<T> = T | Promise<T>;
type Limited = { limit: (n: number) => MaybePromise<Row[]>; get: () => MaybePromise<Row | undefined>; getSQL: () => SQL };
type SelectChain = {
  where: (c: unknown) => Limited & { orderBy: (o: unknown) => Limited & Promise<Row[]> };
  leftJoin: (t: unknown, c: unknown) => { where: (c: unknown) => Limited & { orderBy: (o: unknown) => Limited & Promise<Row[]> } };
  limit: (n: number) => Promise<Row[]>;
};
type InsertChain = {
  values: (v: unknown) => InsertChain;
  select: (q: unknown) => InsertChain;
  onConflictDoUpdate: (o: unknown) => InsertChain;
  returning: (v?: unknown) => MaybePromise<Row[]>;
  run: () => unknown;
};
type Database = {
  select: (...args: unknown[]) => { from: (t: unknown) => SelectChain };
  insert: (t: unknown) => InsertChain;
  update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => { returning: (v?: unknown) => MaybePromise<Row[]>; run: () => unknown } } };
  delete: (t: unknown) => { where: (c: unknown) => { returning: (v?: unknown) => Promise<Row[]>; run: () => unknown } };
  transaction?: <T>(run: (tx: Database) => Promise<T>) => Promise<T>;
  batch?: (queries: unknown[]) => Promise<unknown[]>;
  $client?: { transaction: <T>(run: () => T) => () => T };
};
type PublicationInput = { userId: string; pageId: string; token: string; expectedRevision?: string; expectedPublishedVersion: number | null; sourceVersion?: number };
class PublicationConflict extends Error {}

export function createPageRepository(db: unknown, schema: RepositorySchema, dialect: 'sqlite' | 'pg' = 'sqlite') {
  const typed = db as Database;
  const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));
  const ts = (value: string): Date | string => (dialect === 'pg' ? new Date(value) : value);
  const toRecord = (row: Row, shareRow?: Row): PageRecord => ({
    id: String(row.id), name: String(row.name), page: JSON.parse(String(row.page)),
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), savedAt: iso(row.updatedAt),
    shareToken: shareRow ? String(shareRow.token) : null,
    publishedAt: shareRow ? iso(shareRow.publishedAt) : null,
    publishedVersion: shareRow ? Number(shareRow.activeVersion) : null,
  });
  const toVersion = (row: Row): PublishVersionSummary => ({ id: String(row.id), version: Number(row.version), createdAt: iso(row.createdAt), sourceVersion: row.sourceVersion === null || row.sourceVersion === undefined ? null : Number(row.sourceVersion) });
  const toResult = (row: Row, sourceVersion: number | null, unchanged = false): PublishResult => ({ token: String(row.token), publishedAt: iso(row.publishedAt), version: Number(row.activeVersion), sourceVersion, ...(unchanged ? { unchanged: true } : {}) });
  const sameSnapshot = (left: string, right: string) => {
    try { return jsonEqual(JSON.parse(left), JSON.parse(right)); } catch { return left === right; }
  };
  const chain = <T, R>(value: MaybePromise<T>, next: (value: T) => R): R => value && typeof (value as { then?: unknown }).then === 'function' ? (value as PromiseLike<T>).then(next) as R : next(value as T);
  const rowsOf = (query: unknown): MaybePromise<Row[]> => dialect === 'sqlite' ? (query as { all: () => Row[] }).all() : query as Promise<Row[]>;
  const readDraft = (connection: Database, userId: string, pageId: string) => connection.select().from(schema.studioPages).where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId))).get() as MaybePromise<Row | undefined>;
  const readShare = (connection: Database, userId: string, pageId: string) => connection.select().from(schema.studioPageShare).where(and(eq(schema.studioPageShare.pageId as never, pageId), eq(schema.studioPageShare.userId as never, userId))).get() as MaybePromise<Row | undefined>;
  const readVersion = (connection: Database, userId: string, pageId: string, version: number) => connection.select().from(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.pageId as never, pageId), eq(schema.studioPageVersions.userId as never, userId), eq(schema.studioPageVersions.version as never, version))).get() as MaybePromise<Row | undefined>;
  const latestVersion = (connection: Database, userId: string, pageId: string): MaybePromise<number> => {
    const rows = rowsOf(connection.select({ version: schema.studioPageVersions.version }).from(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.pageId as never, pageId), eq(schema.studioPageVersions.userId as never, userId))).orderBy(desc(schema.studioPageVersions.version as never)).limit(1));
    return chain(rows, values => Number(values[0]?.version ?? 0));
  };
  const isUniqueViolation = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const code = 'code' in error ? String(error.code) : '';
    return code === '23505' || code.startsWith('SQLITE_CONSTRAINT') || error instanceof Error && error.message.includes('UNIQUE constraint failed');
  };

  function writePublicationCore(connection: Database, input: PublicationInput): MaybePromise<PublishStatus> {
    const guarded = input.sourceVersion === undefined
      ? rowsOf(connection.update(schema.studioPages).set({ updatedAt: schema.studioPages.updatedAt }).where(and(eq(schema.studioPages.id as never, input.pageId), eq(schema.studioPages.userId as never, input.userId), eq(schema.studioPages.updatedAt as never, ts(input.expectedRevision!)))).returning({ id: schema.studioPages.id }))
      : [{}];
    return chain(guarded, rows => {
      if (!rows[0]) return chain(readDraft(connection, input.userId, input.pageId), draft => ({ status: draft ? 'conflict' : 'missing' }));
      return chain(readShare(connection, input.userId, input.pageId), share => {
        if (input.sourceVersion !== undefined && !share) return { status: 'closed' };
        if ((share ? Number(share.activeVersion) : null) !== input.expectedPublishedVersion) return { status: 'conflict' };
        return chain(input.sourceVersion === undefined ? readDraft(connection, input.userId, input.pageId) : readVersion(connection, input.userId, input.pageId, input.sourceVersion), source => {
          if (!source) return { status: 'missing' };
          const snapshot = input.sourceVersion === undefined ? String(source.page) : String(source.snapshot);
          if (share && sameSnapshot(String(share.snapshot), snapshot)) return { status: 'unchanged', result: toResult(share, null, true) };
          return chain(latestVersion(connection, input.userId, input.pageId), latest => {
            const version = latest + 1, now = new Date().toISOString();
            return chain(connection.insert(schema.studioPageVersions).values({ id: `${input.pageId}:${version}`, pageId: input.pageId, userId: input.userId, version, snapshot, sourceVersion: input.sourceVersion ?? null, createdAt: ts(now) }).run(), () => {
              const rows = rowsOf(connection.insert(schema.studioPageShare).values({ pageId: input.pageId, userId: input.userId, token: input.token, snapshot, publishedAt: ts(now), activeVersion: version }).onConflictDoUpdate({
                target: schema.studioPageShare.pageId,
                set: { snapshot, publishedAt: ts(now), activeVersion: version },
                setWhere: eq(schema.studioPageShare.activeVersion as never, input.expectedPublishedVersion ?? 0),
              }).returning());
              return chain(rows, published => {
                if (!published[0]) throw new PublicationConflict();
                return chain(connection.delete(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.pageId as never, input.pageId), eq(schema.studioPageVersions.userId as never, input.userId), lt(schema.studioPageVersions.version as never, version - publishHistoryLimit + 1), ne(schema.studioPageVersions.version as never, version))).run(), () => ({ status: 'published', result: toResult(published[0], input.sourceVersion ?? null) }));
              });
            });
          });
        });
      });
    });
  }

  async function writeNodePublication(input: PublicationInput): Promise<PublishStatus> {
    try {
      if (dialect === 'sqlite') {
        if (!typed.$client) throw new Error('SQLite 不支持发布事务。');
        const result = typed.$client.transaction(() => writePublicationCore(typed, input))();
        if (result instanceof Promise) throw new Error('SQLite 发布事务必须是同步执行。');
        return result;
      }
      if (!typed.transaction) throw new Error('数据库不支持发布事务。');
      return await typed.transaction(async connection => writePublicationCore(connection, input));
    } catch (error) {
      if (error instanceof PublicationConflict || isUniqueViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async function writeD1Publication(input: PublicationInput): Promise<PublishStatus> {
    const source = input.sourceVersion === undefined ? await readDraft(typed, input.userId, input.pageId) : await readVersion(typed, input.userId, input.pageId, input.sourceVersion);
    if (!source) return { status: 'missing' };
    if (input.expectedRevision !== undefined && iso(source.updatedAt) !== input.expectedRevision) return { status: 'conflict' };
    const share = await readShare(typed, input.userId, input.pageId);
    if (input.sourceVersion !== undefined && !share) return { status: 'closed' };
    if ((share ? Number(share.activeVersion) : null) !== input.expectedPublishedVersion) return { status: 'conflict' };
    const snapshot = input.sourceVersion === undefined ? String(source.page) : String(source.snapshot);
    if (share && sameSnapshot(String(share.snapshot), snapshot)) return { status: 'unchanged', result: toResult(share, null, true) };
    const version = await latestVersion(typed, input.userId, input.pageId) + 1;
    const now = new Date().toISOString(), id = `${input.pageId}:${version}`;
    const active = typed.select({ value: sql`coalesce(max(${schema.studioPageShare.activeVersion}), 0)` }).from(schema.studioPageShare).where(and(eq(schema.studioPageShare.pageId as never, input.pageId), eq(schema.studioPageShare.userId as never, input.userId)));
    const expected = eq(active, input.expectedPublishedVersion ?? 0);
    const sourceTable = input.sourceVersion === undefined ? schema.studioPages : schema.studioPageVersions;
    const sourceWhere = input.sourceVersion === undefined
      ? and(eq(schema.studioPages.id as never, input.pageId), eq(schema.studioPages.userId as never, input.userId), eq(schema.studioPages.updatedAt as never, ts(input.expectedRevision!)), expected)
      : and(eq(schema.studioPageVersions.pageId as never, input.pageId), eq(schema.studioPageVersions.userId as never, input.userId), eq(schema.studioPageVersions.version as never, input.sourceVersion), expected);
    const insertVersion = typed.insert(schema.studioPageVersions).select(typed.select({
      id: sql`${id}`, pageId: sql`${input.pageId}`, userId: sql`${input.userId}`, version: sql`${version}`,
      snapshot: input.sourceVersion === undefined ? sql`${snapshot}` : schema.studioPageVersions.snapshot,
      sourceVersion: sql`${input.sourceVersion ?? null}`, createdAt: sql`${ts(now)}`,
    }).from(sourceTable).where(sourceWhere));
    const insertShare = typed.insert(schema.studioPageShare).select(typed.select({
      pageId: sql`${input.pageId}`, userId: sql`${input.userId}`, token: sql`${input.token}`,
      snapshot: schema.studioPageVersions.snapshot, publishedAt: sql`${ts(now)}`, activeVersion: sql`${version}`,
    }).from(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.id as never, id), eq(schema.studioPageVersions.pageId as never, input.pageId), eq(schema.studioPageVersions.userId as never, input.userId), expected))).onConflictDoUpdate({
      target: schema.studioPageShare.pageId,
      set: { snapshot, publishedAt: ts(now), activeVersion: version }, setWhere: expected,
    }).returning();
    const activeNew = exists(typed.select({ one: sql`1` }).from(schema.studioPageShare).where(and(eq(schema.studioPageShare.pageId as never, input.pageId), eq(schema.studioPageShare.userId as never, input.userId), eq(schema.studioPageShare.activeVersion as never, version))));
    const prune = typed.delete(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.pageId as never, input.pageId), eq(schema.studioPageVersions.userId as never, input.userId), lt(schema.studioPageVersions.version as never, version - publishHistoryLimit + 1), ne(schema.studioPageVersions.version as never, version), activeNew));
    const cleanup = typed.delete(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.id as never, id), eq(schema.studioPageVersions.userId as never, input.userId), not(activeNew)));
    try {
      const results = await typed.batch!([insertVersion, insertShare, prune, cleanup]);
      const row = (results[1] as Row[] | undefined)?.[0];
      return row ? { status: 'published', result: toResult(row, input.sourceVersion ?? null) } : { status: 'conflict' };
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  const writePublication = (input: PublicationInput) => typed.batch ? writeD1Publication(input) : writeNodePublication(input);
  const versions = async (userId: string, pageId: string) => {
    const rows = await typed.select({ id: schema.studioPageVersions.id, version: schema.studioPageVersions.version, createdAt: schema.studioPageVersions.createdAt, sourceVersion: schema.studioPageVersions.sourceVersion }).from(schema.studioPageVersions).where(and(eq(schema.studioPageVersions.pageId as never, pageId), eq(schema.studioPageVersions.userId as never, userId))).orderBy(desc(schema.studioPageVersions.version as never)).limit(publishHistoryLimit);
    return rows.map(toVersion);
  };

  return {
    async list(userId: string): Promise<PageSummary[]> {
      const rows = await typed.select({ id: schema.studioPages.id, name: schema.studioPages.name, createdAt: schema.studioPages.createdAt, updatedAt: schema.studioPages.updatedAt, token: schema.studioPageShare.token, publishedAt: schema.studioPageShare.publishedAt, publishedVersion: schema.studioPageShare.activeVersion }).from(schema.studioPages).leftJoin(schema.studioPageShare, eq(schema.studioPageShare.pageId as never, schema.studioPages.id as never)).where(eq(schema.studioPages.userId as never, userId)).orderBy(desc(schema.studioPages.updatedAt as never)) as unknown as Row[];
      return rows.map(row => ({ id: String(row.id), name: String(row.name), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), shareToken: row.token ? String(row.token) : null, publishedAt: row.publishedAt ? iso(row.publishedAt) : null, publishedVersion: row.publishedVersion === null || row.publishedVersion === undefined ? null : Number(row.publishedVersion) }));
    },
    async create(userId: string, page: PageDocumentLike, id: string): Promise<PageRecord> {
      const now = new Date().toISOString();
      const [row] = await typed.insert(schema.studioPages).values({ id, userId, name: page.name, page: JSON.stringify(page), createdAt: ts(now), updatedAt: ts(now) }).returning();
      return toRecord(row, undefined);
    },
    async findOwned(userId: string, pageId: string): Promise<PageRecord | null> {
      const row = await readDraft(typed, userId, pageId);
      return row ? toRecord(row, await readShare(typed, userId, pageId)) : null;
    },
    async save(userId: string, pageId: string, page: PageDocumentLike): Promise<PageRecord | null> {
      const now = new Date().toISOString();
      const rows = await typed.update(schema.studioPages).set({ page: JSON.stringify(page), name: page.name, updatedAt: ts(now) }).where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId))).returning();
      return rows[0] ? toRecord(rows[0], await readShare(typed, userId, pageId)) : null;
    },
    async saveSite(userId: string, pageId: string, page: StudioDocument, expectedRevision: string): Promise<{ status: 'saved'; record: PageRecord } | { status: 'conflict' | 'missing' }> {
      const existing = await this.findOwned(userId, pageId);
      if (!existing) return { status: 'missing' };
      const now = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
      const rows = await typed.update(schema.studioPages).set({ page: JSON.stringify(page), name: page.name, updatedAt: ts(now) }).where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId), eq(schema.studioPages.updatedAt as never, ts(expectedRevision)))).returning();
      if (!rows[0]) return { status: 'conflict' };
      const record = await this.findOwned(userId, pageId);
      return record ? { status: 'saved', record } : { status: 'missing' };
    },
    async remove(userId: string, pageId: string): Promise<boolean> {
      const rows = await typed.delete(schema.studioPages).where(and(eq(schema.studioPages.id as never, pageId), eq(schema.studioPages.userId as never, userId))).returning({ id: schema.studioPages.id });
      return rows.length > 0;
    },
    async publish(userId: string, pageId: string, token: string, request: PublishRequest): Promise<PublishStatus> {
      return writePublication({ userId, pageId, token, ...request });
    },
    async rollback(userId: string, pageId: string, token: string, sourceVersion: number, expectedPublishedVersion: number): Promise<PublishStatus> {
      return writePublication({ userId, pageId, token, sourceVersion, expectedPublishedVersion });
    },
    async unpublish(userId: string, pageId: string): Promise<boolean> {
      const rows = await typed.delete(schema.studioPageShare).where(and(eq(schema.studioPageShare.pageId as never, pageId), eq(schema.studioPageShare.userId as never, userId))).returning({ pageId: schema.studioPageShare.pageId });
      return rows.length > 0;
    },
    async findPublished(token: string): Promise<{ page: PageDocumentLike; publishedAt: string; publishedVersion: number } | null> {
      const rows = await typed.select().from(schema.studioPageShare).where(eq(schema.studioPageShare.token as never, token)).limit(1) as unknown as Row[];
      const row = rows[0];
      return row ? { page: JSON.parse(String(row.snapshot)), publishedAt: iso(row.publishedAt), publishedVersion: Number(row.activeVersion) } : null;
    },
    listVersions: versions,
    async findVersion(userId: string, pageId: string, version: number): Promise<PublishVersionDetail | null> {
      const row = await readVersion(typed, userId, pageId, version);
      return row ? { ...toVersion(row), page: JSON.parse(String(row.snapshot)) } : null;
    },
    async getPreferences(userId: string): Promise<{ version: 1; studioTheme: 'light' | 'dark'; inspectorDisclosures: InspectorDisclosurePreferences; updatedAt: string | null }> {
      const rows = await typed.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId as never, userId)).limit(1) as unknown as Row[];
      const row = rows[0];
      let inspectorDisclosures: InspectorDisclosurePreferences = {};
      try { inspectorDisclosures = validateInspectorDisclosures(JSON.parse(String(row?.inspectorDisclosures ?? '{}'))) ?? {}; } catch { /* Invalid stored values fall back to the defaults. */ }
      return { version: 1, studioTheme: row?.studioTheme === 'dark' ? 'dark' : 'light', inspectorDisclosures, updatedAt: row ? iso(row.updatedAt) : null };
    },
    async setPreferences(userId: string, patch: WorkbenchPreferencesPatch): Promise<{ version: 1; studioTheme: 'light' | 'dark'; inspectorDisclosures: InspectorDisclosurePreferences; updatedAt: string }> {
      const now = new Date().toISOString();
      const rows = await typed.insert(schema.userPreferences).values({ userId, studioTheme: patch.studioTheme ?? 'light', inspectorDisclosures: JSON.stringify(patch.inspectorDisclosures ?? {}), updatedAt: ts(now) }).onConflictDoUpdate({ target: schema.userPreferences.userId, set: {
        ...(patch.studioTheme !== undefined ? { studioTheme: patch.studioTheme } : {}),
        ...(patch.inspectorDisclosures !== undefined ? { inspectorDisclosures: JSON.stringify(patch.inspectorDisclosures) } : {}),
        updatedAt: ts(now),
      } }).returning();
      const row = rows[0];
      let inspectorDisclosures: InspectorDisclosurePreferences = {};
      try { inspectorDisclosures = validateInspectorDisclosures(JSON.parse(String(row.inspectorDisclosures ?? '{}'))) ?? {}; } catch { /* Invalid stored values fall back to the defaults. */ }
      return { version: 1, studioTheme: row.studioTheme === 'dark' ? 'dark' : 'light', inspectorDisclosures, updatedAt: iso(row.updatedAt) };
    },
  };
}
