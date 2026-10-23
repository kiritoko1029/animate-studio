import { defineConfig } from 'void/config';

export default defineConfig({
  target: 'cloudflare',
  // The editor lives at /. 'none' keeps unknown /api/* paths as JSON 404s from
  // the worker; the scoped fallbacks serve the SPA shell for page (/p/*) and
  // component (/c/*) share deep links.
  // Use the canonical root asset: Cloudflare redirects /index.html to /,
  // which would otherwise discard the share token in the browser URL.
  routing: { notFound: 'none', fallbacks: { '/p/*': '/', '/c/*': '/' } },
  inference: {
    appType: 'void',
    bindings: { db: true },
  },
  worker: {
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat'],
  },
  cloudflare: {
    name: 'animate-studio',
    // Runtime configuration is managed in the Cloudflare dashboard.
    keep_vars: true,
    keep_secrets: true,
    workers_dev: true,
    preview_urls: true,
    routes: [{ pattern: 'animate-studio.vme5.de', custom_domain: true }],
    // Void replaces this local placeholder with a provisioned ID on deploy.
    d1_databases: [{ binding: 'DB', database_name: 'animate-studio-accounts', database_id: 'local', migrations_dir: './db/migrations' }],
  },
});
