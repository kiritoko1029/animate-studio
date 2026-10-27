import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const out = resolve('artifacts/m4-1-publish');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(out, 'd1-'));
const migrations = join(work, 'migrations');
await mkdir(migrations, { recursive: true });
const files = (await readdir('db/migrations-node')).filter(name => name.startsWith('sqlite-') && name.endsWith('.sql')).sort();
for (const name of files) await copyFile(join('db/migrations-node', name), join(migrations, name));
await writeFile(join(work, 'wrangler.jsonc'), JSON.stringify({
  name: 'm4-1-local-publish', main: 'worker.mjs', compatibility_date: '2026-10-19', compatibility_flags: ['nodejs_compat'],
  d1_databases: [{ binding: 'DB', database_name: 'm4-1-local-publish', database_id: 'local', migrations_dir: './migrations' }],
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
    import { createDocument } from './src/model.ts';
    import { createSiteDocument } from './shared/site-document.mjs';
    const check = (value, message) => { if (!value) throw new Error(message); };
    export default { async fetch(_request, env) {
      const repository = createPageRepository(drizzle(env.DB, { schema }), schema);
      const now = new Date().toISOString();
      await env.DB.prepare('INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)').bind('owner','Owner','d1@local.test',now,now).run();
      const site = createSiteDocument(createDocument(true));
      const record = await repository.create('owner', site, crypto.randomUUID()), id = record.id;
      const first = await repository.publish('owner', id, 'd1-local-token', { expectedRevision: record.savedAt, expectedPublishedVersion: null });
      check(first.status === 'published' && first.result.version === 1, JSON.stringify(first));
      site.name = 'D1 第二版';
      const saved = await repository.saveSite('owner', id, site, record.savedAt);
      const second = await repository.publish('owner', id, 'd1-local-token', { expectedRevision: saved.record.savedAt, expectedPublishedVersion: 1 });
      check(second.status === 'published' && second.result.version === 2, JSON.stringify(second));
      const rollback = await repository.rollback('owner', id, 'd1-local-token', 1, 2);
      check(rollback.status === 'published' && rollback.result.version === 3 && rollback.result.sourceVersion === 1, JSON.stringify(rollback));
      check((await repository.findPublished('d1-local-token')).page.name === record.page.name, 'published snapshot did not roll back');
      check((await repository.findOwned('owner', id)).page.name === 'D1 第二版', 'rollback changed the draft');
      const stale = await repository.publish('owner', id, 'd1-local-token', { expectedRevision: '2000-01-01T00:00:00.000Z', expectedPublishedVersion: 3 });
      check(stale.status === 'conflict', JSON.stringify(stale));
      check((await repository.listVersions('owner', id)).length === 3, 'stale publication created a version');
      await repository.unpublish('owner', id);
      check((await repository.rollback('owner', id, 'd1-local-token', 1, 3)).status === 'closed', 'rollback worked while sharing was closed');
      check((await repository.listVersions('owner', id)).length === 3, 'closing sharing removed history');
      const other = await repository.create('owner', createSiteDocument(createDocument(true)), crypto.randomUUID());
      const concurrent = await Promise.all([
        repository.publish('owner', other.id, 'other-token', { expectedRevision: other.savedAt, expectedPublishedVersion: null }),
        repository.publish('owner', other.id, 'other-token', { expectedRevision: other.savedAt, expectedPublishedVersion: null }),
      ]);
      check(concurrent.filter(result => result.status === 'published').length === 1, 'concurrent publication count mismatch');
      check(concurrent.filter(result => result.status === 'conflict').length === 1, 'concurrent conflict was not reported');
      check((await repository.listVersions('owner', other.id)).length === 1, 'concurrent publication duplicated history');
      return Response.json({ ok: true, first: first.result, second: second.result, rollback: rollback.result, concurrent: concurrent.map(result => result.status), history: (await repository.listVersions('owner', id)).map(({ page, ...metadata }) => metadata) });
    } };
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
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch { last = undefined; } await delay(100); }
  throw new Error(`Timed out: ${description}${last === undefined ? '' : ` (${last})`}`);
}
try {
  child = spawn(process.execPath, [wrangler, 'dev', '--local', '--config', join(work, 'wrangler.jsonc'), '--persist-to', work, '--ip', '127.0.0.1', '--port', String(port)], { cwd: work, env: { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_LOG: 'error' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { workerLog = `${workerLog}${data}`.slice(-12000); });
  child.stderr.on('data', data => { workerLog = `${workerLog}${data}`.slice(-12000); });
  const result = await untilValue(async () => {
    const response = await fetch(origin);
    if (response.status === 500) throw new Error(await response.text());
    if (!response.ok) return null;
    const body = await response.json();
    return body.ok ? body : null;
  }, 'local D1 worker publication flow');
  assert.equal(result.ok, true);
  assert.equal(result.rollback.version, 3);
  assert.deepEqual(result.concurrent.sort(), ['conflict', 'published']);
  const { readFile } = await import('node:fs/promises');
  const { version: wranglerVersion } = JSON.parse(await readFile(new URL('../node_modules/wrangler/package.json', import.meta.url), 'utf8'));
  const report = { ok: true, runtime: 'isolated local Wrangler/D1', wrangler: wranglerVersion, migrations: files, origin, result, remote: false };
  await writeFile(join(out, 'd1-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, wrangler: wranglerVersion, migrations: files.length, result, artifacts: out }, null, 2));
} catch (error) {
  await writeFile(join(out, 'd1-report.json'), JSON.stringify({ ok: false, error: String(error), workerLog, remote: false }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([exited, delay(3000)]); }
  }
}
