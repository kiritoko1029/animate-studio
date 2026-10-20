import { defineConfig } from 'void/config';

export default defineConfig({
  target: 'cloudflare',
  // The editor lives at /. Unknown API paths must keep their JSON 404 response.
  routing: { notFound: 'none' },
  inference: {
    appType: 'void',
    build: 'npm run build:cloudflare',
  },
  worker: {
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat'],
  },
  cloudflare: {
    name: 'animate-studio',
    workers_dev: true,
    preview_urls: true,
  },
});
