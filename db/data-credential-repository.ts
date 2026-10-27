import { and, eq } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PgTable } from 'drizzle-orm/pg-core';

export type DataCredentialKind = 'bearer' | 'api-key';
export type DataCredentialMetadata = { id: string; name: string; kind: DataCredentialKind; allowedHosts: string[]; createdAt: string; updatedAt: string };
export type DataCredentialRecord = DataCredentialMetadata & { encryptedSecret: string };
type CredentialTable = (SQLiteTable | PgTable) & { id: unknown; userId: unknown; name: unknown; kind: unknown; allowedHosts: unknown; encryptedSecret: unknown; createdAt: unknown; updatedAt: unknown };
export function createDataCredentialRepository(db: unknown, table: CredentialTable, dialect: 'sqlite' | 'pg' = 'sqlite') {
  const typed = db as {
    select: () => { from: (table: unknown) => { where: (condition: unknown) => Promise<Record<string, unknown>[]> } };
    insert: (table: unknown) => { values: (value: unknown) => { returning: () => Promise<Record<string, unknown>[]> } };
    delete: (table: unknown) => { where: (condition: unknown) => { returning: () => Promise<Record<string, unknown>[]> } };
  };
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
  const timestamp = (value: string) => dialect === 'pg' ? new Date(value) : value;
  const metadata = (row: Record<string, unknown>): DataCredentialMetadata => ({ id: String(row.id), name: String(row.name), kind: row.kind === 'api-key' ? 'api-key' : 'bearer', allowedHosts: JSON.parse(String(row.allowedHosts)), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) });
  return {
    async list(userId: string): Promise<DataCredentialMetadata[]> {
      const rows = await typed.select().from(table).where(eq(table.userId as never, userId));
      return rows.map(metadata);
    },
    async findOwned(userId: string, id: string): Promise<DataCredentialRecord | null> {
      const rows = await typed.select().from(table).where(and(eq(table.userId as never, userId), eq(table.id as never, id)));
      return rows[0] ? { ...metadata(rows[0]), encryptedSecret: String(rows[0].encryptedSecret) } : null;
    },
    async create(userId: string, input: { name: string; kind: DataCredentialKind; allowedHosts: string[]; encryptedSecret: string }): Promise<DataCredentialMetadata | 'limit'> {
      if ((await this.list(userId)).length >= 10) return 'limit';
      const now = new Date().toISOString();
      const [row] = await typed.insert(table).values({ id: crypto.randomUUID(), userId, ...input, allowedHosts: JSON.stringify(input.allowedHosts), createdAt: timestamp(now), updatedAt: timestamp(now) }).returning();
      return metadata(row);
    },
    async remove(userId: string, id: string): Promise<boolean> {
      return (await typed.delete(table).where(and(eq(table.userId as never, userId), eq(table.id as never, id))).returning()).length > 0;
    },
  };
}
