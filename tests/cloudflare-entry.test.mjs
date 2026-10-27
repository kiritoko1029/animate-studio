import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/d1';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as schema from '../db/schema.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createDocument } from '../src/model.ts';
import { createSiteDocument } from '../shared/site-document.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('production Worker starts and serves public HEAD through GET', { timeout: 120_000 }, async () => {
  const built = spawnSync('npm', ['run', 'build:cloudflare'], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1' }, timeout: 90_000 });
  assert.ifError(built.error);
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  const output = resolve(root, 'dist/ssr');
  const shell = readFileSync(resolve(root, 'dist/client/index.html'), 'utf8');
  const worker = new Miniflare(convertV4MiniflareOptions({
    name: 'worker-head-test',
    rootPath: output,
    modules: [
      { type: 'ESModule', path: 'index.js' },
      ...readdirSync(resolve(output, 'assets')).filter(name => name.endsWith('.js')).map(name => ({ type: 'ESModule', path: `assets/${name}` })),
    ],
    compatibilityDate: '2026-10-19',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { PAGE_STORE: { className: 'PageStoreDurableObject' } },
    d1Databases: { DB: 'worker-head-test' },
    r2Buckets: ['STORAGE'],
    serviceBindings: { ASSETS: async () => new Response(shell, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) },
  }));
  try {
    const database = await worker.getD1Database('DB');
    for (const name of readdirSync(resolve(root, 'db/migrations')).filter(name => name.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(root, 'db/migrations', name), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) await database.prepare(statement).run();
      }
    }
    const now = new Date().toISOString();
    await database.prepare('INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)').bind('owner', 'Owner', 'worker-head@local.test', now, now).run();
    const site = createSiteDocument(createDocument(true), 'Worker HEAD 验证');
    site.pages[0].seo = { title: '公开页 HEAD 验证', description: '真实 Worker 路由' };
    const repository = createPageRepository(drizzle(database, { schema }), schema);
    const record = await repository.create('owner', site, crypto.randomUUID());
    const published = await repository.publish('owner', record.id, 'worker-head-token', { expectedRevision: record.savedAt, expectedPublishedVersion: null });
    assert.equal(published.status, 'published');

    const response = await worker.dispatchFetch('http://local.test/p/worker-head-token', { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'index,follow');
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(await response.text(), '');
    const getResponse = await worker.dispatchFetch('http://local.test/p/worker-head-token');
    assert.match(await getResponse.text(), /公开页 HEAD 验证/);
  } finally {
    await worker.dispose();
  }
});
