import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema.ts';

export function createD1Fixture(sqlite, { failAt = -1 } = {}) {
  function prepare(sql, params = []) {
    const execute = {
      runSync() {
        const statement = sqlite.prepare(sql), results = statement.reader ? statement.all(...params) : [];
        const result = statement.reader ? { changes: 0, lastInsertRowid: 0 } : statement.run(...params);
        return { results, success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
      },
      allSync() { return { results: sqlite.prepare(sql).all(...params), success: true }; },
      rawSync() { return sqlite.prepare(sql).raw().all(...params); },
    };
    return {
      bind(...values) { return prepare(sql, values); },
      async run() { return execute.runSync(); },
      async all() { return execute.allSync(); },
      async raw() { return execute.rawSync(); },
      execute,
    };
  }
  const client = {
    prepare(sql) { return prepare(sql); },
    async batch(statements) {
      return sqlite.transaction(() => statements.map((statement, index) => {
        if (index === failAt) throw new Error('injected D1 batch failure');
        return statement.execute.runSync();
      }))();
    },
    async exec(sql) { sqlite.exec(sql); return { count: 0 }; },
  };
  return { db: drizzle(client, { schema }), schema, client };
}
