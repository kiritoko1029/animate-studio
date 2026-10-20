import * as fileSystem from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validatePage } from './validation.mjs';

/** Serialize writes and atomically replace a complete document on the same filesystem. */
export function createPageStore({ dataDir, fs = fileSystem }) {
  const filePath = join(dataDir, 'page.json');
  let pending = Promise.resolve();

  async function read() {
    await pending;
    let data;
    try { data = await fs.readFile(filePath, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') return { page: null, savedAt: null };
      throw error;
    }
    const record = JSON.parse(data);
    validatePage(record.page);
    if (typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) throw new Error('Invalid saved timestamp');
    return { page: record.page, savedAt: record.savedAt };
  }

  function save(page) {
    // Snapshot before joining the queue so callers cannot mutate a queued document.
    const snapshot = structuredClone(validatePage(page));
    const operation = pending.then(async () => {
      const record = { page: snapshot, savedAt: new Date().toISOString() };
      const temporaryPath = join(dataDir, `.page-${randomUUID()}.tmp`);
      await fs.mkdir(dataDir, { recursive: true });
      let handle;
      try {
        handle = await fs.open(temporaryPath, 'wx', 0o600);
        await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await fs.rename(temporaryPath, filePath);
        return record;
      } finally {
        if (handle) await handle.close().catch(() => {});
        await fs.unlink(temporaryPath).catch(() => {});
      }
    });
    // A failed save must not prevent the next save or read from proceeding.
    pending = operation.catch(() => {});
    return operation;
  }

  return { read, save };
}
