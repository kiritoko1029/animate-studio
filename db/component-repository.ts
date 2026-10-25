import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { CustomComponentDefinition } from '../shared/custom-components.mjs';
import { componentFolderLimits, validateComponentFolderName, type ComponentFolder } from '../shared/component-folders.mjs';

/**
 * Account custom components and their share snapshots, for D1/SQLite and
 * PostgreSQL. Like the page repository, every private query pairs the
 * component id with the owner id in the WHERE clause, so another account's
 * component is indistinguishable from a missing one. The public lookup reads
 * only the share table and returns the published snapshot, never the owner.
 */
type AnyTable = SQLiteTable | PgTable;
type ComponentSchema = {
  studioComponents: AnyTable & { id: unknown; userId: unknown; folderId: unknown; name: unknown; description: unknown; definition: unknown; revision: unknown; createdAt: unknown; updatedAt: unknown };
  studioComponentShare: AnyTable & { componentId: unknown; userId: unknown; token: unknown; snapshot: unknown; revision: unknown; publishedAt: unknown };
  studioComponentFolders: AnyTable & { id: unknown; userId: unknown; name: unknown; createdAt: unknown; updatedAt: unknown };
};

export type ComponentSummary = {
  id: string; name: string; description: string; revision: number; folderId: string | null;
  createdAt: string; updatedAt: string;
  shareToken: string | null; publishedAt: string | null; sharedRevision: number | null;
};
export type ComponentRecord = ComponentSummary & { component: CustomComponentDefinition };
export type PublishedComponent = { component: CustomComponentDefinition; publishedAt: string; revision: number };

type Row = Record<string, unknown>;
type Limited = { limit: (n: number) => Promise<Row[]> };
type Where = Limited & { orderBy: (o: unknown) => Promise<Row[]> } & Promise<Row[]>;
type Chain = { where: (c: unknown) => Where; leftJoin: (t: unknown, c: unknown) => { where: (c: unknown) => Where } };
type Database = {
  select: (fields?: unknown) => { from: (t: unknown) => Chain };
  insert: (t: unknown) => { values: (v: unknown) => { returning: () => Promise<Row[]>; onConflictDoUpdate: (o: unknown) => { returning: () => Promise<Row[]> } } };
  update: (t: unknown) => { set: (v: unknown) => { where: (c: unknown) => { returning: () => Promise<Row[]> } } };
  delete: (t: unknown) => { where: (c: unknown) => { returning: (v: unknown) => Promise<Row[]> } };
};

// SQLite/D1 and PostgreSQL triggers use the same marker. Drizzle wraps driver errors in cause.
function folderLimitError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if ((current as { message?: unknown }).message === 'studio_component_folder_limit') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function createComponentRepository(db: unknown, schema: ComponentSchema, dialect: 'sqlite' | 'pg' = 'sqlite') {
  const typed = db as Database;
  const { studioComponents: components, studioComponentShare: shares, studioComponentFolders: folders } = schema;
  const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
  // PostgreSQL timestamp columns bind Date objects; SQLite text columns bind strings.
  const ts = (value: string): Date | string => (dialect === 'pg' ? new Date(value) : value);
  const owned = (userId: string, id: string) => and(eq(components.id as never, id), eq(components.userId as never, userId));
  const ownedFolder = (userId: string, id: string) => and(eq(folders.id as never, id), eq(folders.userId as never, userId));
  const folder = (row: Row): ComponentFolder => ({ id: String(row.id), name: String(row.name), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) });
  const findFolder = async (userId: string, id: string) => (await typed.select().from(folders).where(ownedFolder(userId, id)).limit(1))[0] ?? null;
  const findFolderName = async (userId: string, name: string) => (await typed.select().from(folders).where(and(eq(folders.userId as never, userId), eq(folders.name as never, name))).limit(1))[0] ?? null;
  const summary = (row: Row, share?: Row | null): ComponentSummary => ({
    id: String(row.id), name: String(row.name), description: String(row.description ?? ''), revision: Number(row.revision),
    folderId: row.folderId === null || row.folderId === undefined ? null : String(row.folderId),
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt),
    shareToken: share?.token ? String(share.token) : null,
    publishedAt: share?.publishedAt ? iso(share.publishedAt) : null,
    sharedRevision: share?.revision === undefined || share?.revision === null ? null : Number(share.revision),
  });
  const record = (row: Row, share?: Row | null): ComponentRecord => ({ ...summary(row, share), component: JSON.parse(String(row.definition)) });
  const shareOf = async (id: string) => (await typed.select().from(shares).where(eq(shares.componentId as never, id)).limit(1))[0] ?? null;
  const values = (definition: CustomComponentDefinition) => ({ name: definition.name, description: definition.description ?? '', definition: JSON.stringify(definition) });

  return {
    async list(userId: string): Promise<ComponentSummary[]> {
      const rows = await typed.select({
        id: components.id, name: components.name, description: components.description, revision: components.revision, folderId: components.folderId,
        createdAt: components.createdAt, updatedAt: components.updatedAt,
        token: shares.token, publishedAt: shares.publishedAt, sharedRevision: shares.revision,
      }).from(components)
        .leftJoin(shares, eq(shares.componentId as never, components.id as never))
        .where(eq(components.userId as never, userId))
        .orderBy(desc(components.updatedAt as never));
      return rows.map(row => summary(row, row.token ? { token: row.token, publishedAt: row.publishedAt, revision: row.sharedRevision } : null));
    },

    async count(userId: string): Promise<number> {
      const rows = await (typed.select({ value: count() }).from(components).where(eq(components.userId as never, userId)) as Promise<Row[]>);
      return Number(rows[0]?.value ?? 0);
    },

    async create(userId: string, definition: CustomComponentDefinition, id: string, folderId: string | null = null): Promise<ComponentRecord | null> {
      if (folderId !== null && !await findFolder(userId, folderId)) return null;
      const now = new Date().toISOString();
      try {
        const [row] = await typed.insert(components).values({ id, userId, folderId, ...values(definition), revision: 1, createdAt: ts(now), updatedAt: ts(now) }).returning();
        return record(row, null);
      } catch (error) {
        // A folder may be deleted after the ownership check but before INSERT.
        if (folderId !== null && !await findFolder(userId, folderId)) return null;
        throw error;
      }
    },

    async findOwned(userId: string, id: string): Promise<ComponentRecord | null> {
      const [row] = await typed.select().from(components).where(owned(userId, id)).limit(1);
      return row ? record(row, await shareOf(id)) : null;
    },

    /**
     * Save only if the stored revision is still `baseRevision`. The check and
     * the increment happen in one UPDATE, so two saves cannot both win.
     */
    async update(userId: string, id: string, definition: CustomComponentDefinition, baseRevision: number): Promise<{ record: ComponentRecord } | { conflict: number } | null> {
      const now = new Date().toISOString();
      const [row] = await typed.update(components)
        .set({ ...values(definition), revision: sql`${components.revision} + 1`, updatedAt: ts(now) })
        .where(and(owned(userId, id), eq(components.revision as never, baseRevision)))
        .returning();
      if (row) return { record: record(row, await shareOf(id)) };
      const [current] = await typed.select({ revision: components.revision }).from(components).where(owned(userId, id)).limit(1);
      return current ? { conflict: Number(current.revision) } : null;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      // Share rows cascade on delete in both dialects, which revokes the link.
      const rows = await typed.delete(components).where(owned(userId, id)).returning({ id: components.id });
      return rows.length > 0;
    },

    async listFolders(userId: string): Promise<ComponentFolder[]> {
      const rows = await typed.select().from(folders).where(eq(folders.userId as never, userId)).orderBy(desc(folders.updatedAt as never));
      return rows.map(folder);
    },

    async createFolder(userId: string, rawName: string, id: string): Promise<{ folder: ComponentFolder } | { error: 'duplicate' | 'limit' }> {
      const name = validateComponentFolderName(rawName);
      if (await findFolderName(userId, name)) return { error: 'duplicate' };
      const counts = await typed.select({ value: count() }).from(folders).where(eq(folders.userId as never, userId));
      if (Number(counts[0]?.value ?? 0) >= componentFolderLimits.perLibrary) return { error: 'limit' };
      const now = new Date().toISOString();
      try {
        const [row] = await typed.insert(folders).values({ id, userId, name, createdAt: ts(now), updatedAt: ts(now) }).returning();
        return { folder: folder(row) };
      } catch (error) {
        // The unique owner/name index also protects simultaneous creates.
        if (await findFolderName(userId, name)) return { error: 'duplicate' };
        if (folderLimitError(error)) return { error: 'limit' };
        throw error;
      }
    },

    async renameFolder(userId: string, id: string, rawName: string): Promise<{ folder: ComponentFolder } | { error: 'duplicate' } | null> {
      const name = validateComponentFolderName(rawName);
      if (!await findFolder(userId, id)) return null;
      const duplicate = await findFolderName(userId, name);
      if (duplicate && duplicate.id !== id) return { error: 'duplicate' };
      try {
        const [row] = await typed.update(folders).set({ name, updatedAt: ts(new Date().toISOString()) }).where(ownedFolder(userId, id)).returning();
        return row ? { folder: folder(row) } : null;
      } catch (error) {
        if (await findFolderName(userId, name)) return { error: 'duplicate' };
        throw error;
      }
    },

    async removeFolder(userId: string, id: string): Promise<boolean> {
      // ON DELETE SET NULL preserves the component and every published snapshot.
      const rows = await typed.delete(folders).where(ownedFolder(userId, id)).returning({ id: folders.id });
      return rows.length > 0;
    },

    async moveToFolder(userId: string, id: string, folderId: string | null): Promise<ComponentRecord | null> {
      if (folderId !== null && !await findFolder(userId, folderId)) return null;
      try {
        const [row] = await typed.update(components).set({ folderId, updatedAt: ts(new Date().toISOString()) }).where(owned(userId, id)).returning();
        return row ? record(row, await shareOf(id)) : null;
      } catch (error) {
        if (folderId !== null && !await findFolder(userId, folderId)) return null;
        throw error;
      }
    },

    /** Publish the persisted definition, never request data. Re-publishing keeps the token. */
    async publish(userId: string, id: string, token: string): Promise<{ token: string; publishedAt: string; revision: number } | null> {
      const existing = await this.findOwned(userId, id);
      if (!existing) return null;
      const now = new Date().toISOString();
      const snapshot = JSON.stringify(existing.component);
      const [row] = await typed.insert(shares)
        .values({ componentId: id, userId, token, snapshot, revision: existing.revision, publishedAt: ts(now) })
        .onConflictDoUpdate({ target: shares.componentId, set: { snapshot, revision: existing.revision, publishedAt: ts(now) } })
        .returning();
      return { token: String(row.token), publishedAt: iso(row.publishedAt), revision: Number(row.revision) };
    },

    async unpublish(userId: string, id: string): Promise<boolean> {
      const rows = await typed.delete(shares).where(and(eq(shares.componentId as never, id), eq(shares.userId as never, userId))).returning({ componentId: shares.componentId });
      return rows.length > 0;
    },

    async findPublished(token: string): Promise<PublishedComponent | null> {
      const [row] = await typed.select({ snapshot: shares.snapshot, publishedAt: shares.publishedAt, revision: shares.revision }).from(shares).where(eq(shares.token as never, token)).limit(1);
      return row ? { component: JSON.parse(String(row.snapshot)), publishedAt: iso(row.publishedAt), revision: Number(row.revision) } : null;
    },
  };
}
