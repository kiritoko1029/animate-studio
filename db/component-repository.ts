import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { CustomComponentDefinition } from '../shared/custom-components.mjs';

/**
 * Account custom components and their share snapshots, for D1/SQLite and
 * PostgreSQL. Like the page repository, every private query pairs the
 * component id with the owner id in the WHERE clause, so another account's
 * component is indistinguishable from a missing one. The public lookup reads
 * only the share table and returns the published snapshot, never the owner.
 */
type AnyTable = SQLiteTable | PgTable;
type ComponentSchema = {
  studioComponents: AnyTable & { id: unknown; userId: unknown; name: unknown; description: unknown; definition: unknown; revision: unknown; createdAt: unknown; updatedAt: unknown };
  studioComponentShare: AnyTable & { componentId: unknown; userId: unknown; token: unknown; snapshot: unknown; revision: unknown; publishedAt: unknown };
};

export type ComponentSummary = {
  id: string; name: string; description: string; revision: number;
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

export function createComponentRepository(db: unknown, schema: ComponentSchema, dialect: 'sqlite' | 'pg' = 'sqlite') {
  const typed = db as Database;
  const { studioComponents: components, studioComponentShare: shares } = schema;
  const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
  // PostgreSQL timestamp columns bind Date objects; SQLite text columns bind strings.
  const ts = (value: string): Date | string => (dialect === 'pg' ? new Date(value) : value);
  const owned = (userId: string, id: string) => and(eq(components.id as never, id), eq(components.userId as never, userId));
  const summary = (row: Row, share?: Row | null): ComponentSummary => ({
    id: String(row.id), name: String(row.name), description: String(row.description ?? ''), revision: Number(row.revision),
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
        id: components.id, name: components.name, description: components.description, revision: components.revision,
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

    async create(userId: string, definition: CustomComponentDefinition, id: string): Promise<ComponentRecord> {
      const now = new Date().toISOString();
      const [row] = await typed.insert(components).values({ id, userId, ...values(definition), revision: 1, createdAt: ts(now), updatedAt: ts(now) }).returning();
      return record(row, null);
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
