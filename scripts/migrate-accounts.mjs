import { createNodeDatabase, applyNodeMigrations } from '../server/node-database.ts';

const database = await createNodeDatabase();
try {
  const migrations = await applyNodeMigrations(database);
  console.log(`Account database (${database.dialect}): ${migrations.length ? `applied ${migrations.join(', ')}` : 'up to date'}`);
} finally {
  await database.close();
}
