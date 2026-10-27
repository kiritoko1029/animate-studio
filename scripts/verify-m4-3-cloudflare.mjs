import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const out = resolve('artifacts/m4-3-media');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'cloudflare-'));
const migrations = join(work, 'migrations');
await mkdir(migrations, { recursive: true });
const files = (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort();
for (const name of files) await copyFile(join('db/migrations', name), join(migrations, name));
await writeFile(join(work, 'wrangler.jsonc'), JSON.stringify({
  name: 'm4-3-local-media', main: 'worker.mjs', compatibility_date: '2026-10-19', compatibility_flags: ['nodejs_compat'],
  d1_databases: [{ binding: 'DB', database_name: 'm4-3-local-media', database_id: 'local', migrations_dir: './migrations' }],
  r2_buckets: [{ binding: 'STORAGE', bucket_name: 'm4-3-local-media' }],
}, null, 2));
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: work, env: { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_LOG: 'error' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout = `${stdout}${data}`.slice(-12000); });
    child.stderr.on('data', data => { stderr = `${stderr}${data}`.slice(-12000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`wrangler ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`)));
  });
}
await run(['d1', 'migrations', 'apply', 'DB', '--local', '--config', join(work, 'wrangler.jsonc'), '--persist-to', work]);
await build({
  stdin: { contents: `
    import { drizzle } from 'drizzle-orm/d1';
    import * as schema from './db/schema.ts';
    import { createPageRepository } from './db/page-repository.ts';
    import { createMediaRepository } from './db/media-repository.ts';
    import { createR2MediaStorage } from './server/media-storage.ts';
    import { handleMediaAccountApi } from './server/media-account-api.ts';
    import { createDocument } from './src/model.ts';
    import { createSiteDocument } from './shared/site-document.mjs';
    const token = 'm4-3-local-share-token';
    const check = (value, message) => { if (!value) throw new Error(message); };
    const response = result => result.body instanceof Uint8Array ? new Response(result.body, result) : Response.json(result.body, result);
    const run = async (env) => {
      const pages = createPageRepository(drizzle(env.DB, { schema }), schema);
      const repository = createMediaRepository(drizzle(env.DB, { schema }), schema);
      const storage = createR2MediaStorage(env.STORAGE);
      const context = { pages, repository, storage, newId: () => crypto.randomUUID() };
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)').bind('owner','Owner','m4-3@local.test',now,now).run();
      const assetId = crypto.randomUUID(), pageId = crypto.randomUUID();
      const page = createDocument(true);
      page.blocks = [{ id: 'picture', type: 'image', props: { imageUrl: 'asset:' + assetId, title: 'R2 image', text: '', padding: 20 }, frame: { x: 48, y: 48, width: 440, height: 340 } }];
      const site = createSiteDocument(page); site.pages[0].seo = { imageUrl: 'asset:' + assetId };
      const record = await pages.create('owner', site, pageId);
      const bytes = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
      const upload = await handleMediaAccountApi(new Request('https://local.test/api/account/sites/' + pageId + '/media?name=campus.png', { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Media-Id': assetId, Origin: 'https://local.test' }, body: bytes }), context, '/api/account/sites/' + pageId + '/media', 'owner');
      check(upload.status === 201, JSON.stringify(upload.body));
      const first = await pages.publish('owner', pageId, token, { expectedRevision: record.savedAt, expectedPublishedVersion: null });
      check(first.status === 'published', JSON.stringify(first));
      const shared = await handleMediaAccountApi(new Request('https://local.test/api/shared/' + token + '/media/' + assetId), context, '/api/shared/' + token + '/media/' + assetId);
      check(shared.status === 200 && new Uint8Array(shared.body).length === bytes.length, 'R2 public read failed');
      const next = structuredClone(site); next.pages[0].page.blocks[0].props.imageUrl = ''; next.pages[0].seo = {};
      const saved = await pages.saveSite('owner', pageId, next, record.savedAt);
      const second = await pages.publish('owner', pageId, token, { expectedRevision: saved.record.savedAt, expectedPublishedVersion: 1 });
      check(second.status === 'published', JSON.stringify(second));
      const removed = await handleMediaAccountApi(new Request('https://local.test/api/account/sites/' + pageId + '/media/' + assetId, { method: 'DELETE' }), context, '/api/account/sites/' + pageId + '/media/' + assetId, 'owner');
      check(removed.status === 200 && removed.body.retained, JSON.stringify(removed.body));
      const hidden = await handleMediaAccountApi(new Request('https://local.test/api/shared/' + token + '/media/' + assetId), context, '/api/shared/' + token + '/media/' + assetId);
      check(hidden.status === 404, 'removed current reference remained public');
      check(await storage.get(pageId + '/' + assetId) !== null, 'retained R2 object was deleted');
      const rolledBack = await pages.rollback('owner', pageId, token, 1, 2);
      check(rolledBack.status === 'published' && rolledBack.result.sourceVersion === 1, JSON.stringify(rolledBack));
      const restored = await handleMediaAccountApi(new Request('https://local.test/api/shared/' + token + '/media/' + assetId), context, '/api/shared/' + token + '/media/' + assetId);
      check(restored.status === 200, 'rollback did not restore public media');
      const quota = await repository.create('owner', pageId, { id: crypto.randomUUID(), name: 'quota', mime: 'image/png', size: 50 * 1024 * 1024 - bytes.length, hash: crypto.randomUUID(), storageKey: pageId + '/quota' });
      check(quota.status === 'created', JSON.stringify(quota));
      const over = await repository.create('owner', pageId, { id: crypto.randomUUID(), name: 'over', mime: 'image/png', size: 1, hash: crypto.randomUUID(), storageKey: pageId + '/over' });
      check(over.status === 'limit', 'D1 media quota trigger was not applied');
      const bad = await handleMediaAccountApi(new Request('https://local.test/api/account/sites/' + pageId + '/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: new TextEncoder().encode('<html>') }), context, '/api/account/sites/' + pageId + '/media', 'owner');
      check(bad.status === 415, 'disguised upload was accepted');
      return Response.json({ ok: true, upload: upload.status, shared: shared.status, removed: removed.body, hidden: hidden.status, restored: restored.status, quota: over.status, migrations: true });
    };
    let task;
    export default { fetch(_request, env) { task ??= run(env); return task; } };
  `, loader: 'ts', resolveDir: resolve('.') },
  bundle: true, write: true, outfile: join(work, 'worker.mjs'), format: 'esm', platform: 'neutral', target: 'es2024', logLevel: 'silent',
});
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let child, workerLog = '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function untilValue(fn, description, timeout = 45000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last?.fatal) throw new Error(last.error); if (last) return last; } catch (error) { last = error; } await delay(100); }
  throw new Error(`Timed out: ${description}${last === undefined ? '' : ` (${last})`}`);
}
try {
  child = spawn(process.execPath, [wrangler, 'dev', '--local', '--config', join(work, 'wrangler.jsonc'), '--persist-to', work, '--ip', '127.0.0.1', '--port', String(port)], { cwd: work, env: { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_LOG: 'error' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { workerLog = `${workerLog}${data}`.slice(-12000); });
  child.stderr.on('data', data => { workerLog = `${workerLog}${data}`.slice(-12000); });
  const result = await untilValue(async () => {
    const response = await fetch(origin);
    if (response.status === 500) return { fatal: true, error: await response.text() };
    if (!response.ok) return null;
    const body = await response.json();
    return body.ok ? body : null;
  }, 'local D1/R2 media flow');
  assert.equal(result.ok, true);
  assert.equal(result.restored, 200);
  assert.equal(result.hidden, 404);
  const { version: wranglerVersion } = JSON.parse(await readFile(new URL('../node_modules/wrangler/package.json', import.meta.url), 'utf8'));
  const report = { ok: true, runtime: 'isolated local Wrangler/D1/R2', wrangler: wranglerVersion, migrations: files, origin, result, remote: false };
  await writeFile(join(out, 'cloudflare-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, wrangler: wranglerVersion, migrations: files.length, result, artifacts: out }, null, 2));
} catch (error) {
  await writeFile(join(out, 'cloudflare-report.json'), JSON.stringify({ ok: false, error: String(error), workerLog, remote: false }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([exited, delay(3000)]); }
  }
}
