import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { MediaStorage } from './media-storage.ts';

export function createNodeMediaStorage(directory: string): MediaStorage {
  const root = resolve(directory);
  const path = (key: string) => {
    if (!/^[A-Za-z0-9/_-]+$/.test(key)) throw new Error('媒体对象键无效');
    const filename = resolve(root, key);
    if (!filename.startsWith(`${root}${sep}`)) throw new Error('媒体对象路径无效');
    return filename;
  };
  return {
    async put(key, bytes) { const filename = path(key); await mkdir(dirname(filename), { recursive: true }); await writeFile(filename, bytes, { flag: 'wx' }); },
    async get(key) { try { const bytes = await readFile(path(key)); return { bytes: new Uint8Array(bytes), mime: '' }; } catch (error) { if ((error as { code?: string }).code === 'ENOENT') return null; throw error; } },
    async remove(key) { await rm(path(key), { force: true }); },
  };
}
