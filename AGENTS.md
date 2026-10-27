# AGENTS.md

This file provides guidance to Codex (claude.ai/code) when working with code in this repository.

## Overview

Animate Studio is a visual page builder: a React 19 + Vite 8 SPA where users place components on a fixed-size free-form canvas, wire them to page variables/events/scripts, and export HTML, Vue, React or JSON. It runs either as an Express server (Node, SQLite/PostgreSQL) or as a Cloudflare Worker (D1) deployed through [Void](https://void.cloud). The workbench UI and every user-facing string (including API and validation errors) are Simplified Chinese; code, comments and identifiers are English. `README.md` is the product overview; `docs/` (mostly Chinese) covers accounts/storage, Cloudflare deployment and Animate UI coverage.

## Commands

Requires Node >= 24.21 (`.nvmrc` pins 24.22.0). Install with `npm ci`.

```sh
npm run dev                # Express + Vite middleware on http://127.0.0.1:4173; node --watch restarts the server when any file it imports changes
npm test                   # node --test tests/*.test.mjs
node --test tests/server.test.mjs                                          # one file
node --test --test-name-pattern='API reports health' tests/server.test.mjs # one test, by name regex
npm run typecheck          # two passes: tsconfig.json (browser + server) and tsconfig.cloudflare.json (worker; no DOM lib)
npm run build              # tsc -b && vite build --mode node -> dist/ (run it with: NODE_ENV=production npm start)
npm run build:cloudflare   # void prepare + typecheck + vite build -> dist/
npm run dev:cloudflare     # Void dev server on :4174 (preview:cloudflare serves the built Worker)
npm run db:migrate:node    # apply db/migrations-node to SQLite/PostgreSQL
npm run brand:generate     # regenerate logo/favicon/manifest assets (see Generated files)
```

- No linter or formatter is configured. CI (`.github/workflows/cloudflare.yml`) runs `npm test`, `npm run build`, `npm run build:cloudflare`, then deploys from `main` only when `CLOUDFLARE_API_TOKEN` is set.
- Both builds write to `dist/`; rebuild for the target you are about to preview.
- Tests create their own temp dirs, servers and JSDOM and never touch `data/page.json`. Account tests use a temp SQLite file; set `TEST_DATABASE_URL=postgresql://…` (a disposable database) to run `tests/account-api.test.mjs` and `tests/account-security.test.mjs` against PostgreSQL.

## Architecture

### The page and site documents are the contract

Canvas, preview, shared pages, persistence and exports consume JSON documents. `PageDocument` (`src/model.ts`, `version: 1`) contains `settings`, `blocks[]` (`{id, type, props, frame, children?, bindings, events}`), and optional page `variables[]` / `scripts[]`. The default is a fixed design canvas (`settings.maxWidth × canvasHeight`) of absolutely positioned `frame`s scaled uniformly with a CSS transform (`FreePage` / `useFitScale`). Optional `settings.responsive` keeps the desktop document and adds tablet/mobile frames, heights and `null` visibility overrides; `src/lib/responsive.ts` owns candidates, inheritance, write-back and validation. Runtime selection uses the observed container, not `window.innerWidth`. Older flow-layout documents are upgraded by `toFreeDocument` and never opt in automatically. `children` is limited to 12 non-nested template/form fields and requires matching validation in `server/validation.mjs`.

`SiteDocument` (`shared/site-document.mjs`, `version: 1`, `kind: "site"`) contains ordered page entries, a home page, optional shared header/footer/sidebar documents, and optional site-level `dataSources[]` validated by `shared/data-sources.mjs`. Each entry owns an independent `PageDocument`, a route and shared-layout references; it does not nest another site. `validateSite` in `server/validation.mjs` checks the complete document, including every nested page and source. `SitePreview.tsx` resolves static/dynamic routes and `composeSitePage` combines shared regions for preview, share and multi-page HTML export. Legacy single-page exports keep the original `InteractivePreview` entry. Guests migrate from `guest-draft:v1` to `guest-site-draft:v1` without deleting the old key. Cloud `/api/account/sites` stores a whole site in the existing `studio_page` JSON column with `expectedRevision` protection; the old page endpoints, record IDs and share tokens remain valid.

`server/validation.mjs` (`validatePage`) is a strict allowlist and the gate for every save: Express, the Cloudflare handler, the Durable Object and the account API all call it. Adding a `BlockProps` field, page setting, component type or action therefore means changing `src/model.ts` **and** `validation.mjs` (and `shared/interaction-schema.mjs` for variables/bindings/actions), or saves fail with a 400 "不支持的属性".

`shared/*.mjs` and `server/validation.mjs` / `cloud-api.mjs` are plain JS shared by browser, server and tests. `allowJs` is off, so each has a hand-written sibling `.d.mts`; update it when you change the exports.

### TypeScript is run directly by Node

Tests and the server import `.ts` files directly (e.g. `import … from '../src/model.ts'`) via Node's native type stripping, with no loader. Any module Node loads that way (`server/`, `db/`, `src/model.ts`, and the `src/lib/**` logic that tests import) must use erasable-only syntax (no `enum`, `namespace` or constructor parameter properties), explicit `.ts` extensions on runtime relative imports, and `with { type: 'json' }` on JSON imports. Modules that only Vite/esbuild ever bundle (`src/components/**`, anything touching `?raw` or `import.meta.env`, and what they import) are exempt; tests cover those by bundling with esbuild and running in JSDOM (see `tests/account-editor.test.mjs` and `tests/helpers/`).

### Rendering

One React renderer serves editing, preview, shared pages and exports. `FreeCanvas.tsx` (the edit surface: selection, drag/resize, zoom/pan) renders `BlockRenderer` from `PageRenderer.tsx`; `PageRenderer` switches to `InteractivePreview` (which owns an interaction runtime) when the page has variables, scripts, bindings, events, effects or data sources. The editor derives the active breakpoint through `pageAtDevice` and writes only that breakpoint; preview/share/export derive it through `pageAtWidth`. `composeSitePage` resolves body and shared regions before combining them, moves a sidebar above narrow content when side-by-side cannot fit, and preserves prefixed IDs, offsets and the 6000 px limit.

The 88 component types are 33 hand-coded ones (the `BlockContent` switch in `PageRenderer.tsx`, falling through to `LibraryBlocks.tsx`) plus 55 "extended" ones declared in `shared/extended-components.json` (default props, frame, doc link) and rendered by `CatalogBlock.tsx` → lazy `NativeCatalogBlock.tsx` on official `@animate-ui/react` primitives. Files under `src/components/animate-ui/registry/` are vendored from a pinned upstream commit; record any local edit in `docs/animate-ui-version.json` (`localAdaptations`).

Per-part official animation options are stored in `props.motion['Part.prop']` / `props.effectOptions[...]` and validated by `shared/animation-settings.mjs` against the generated `shared/official-*.json` schemas.

### Interaction runtime

`createInteractionRuntime(config, options)` in `shared/interactions.mjs` is framework-neutral: variable store, a hand-written expression parser/evaluator (no `eval`), actions (`set`/`toggle`/`notify`/`navigate`/`script`/`condition`/`reset`) and a script sandbox (hidden `sandbox="allow-scripts"` iframe → blob Worker, 15 s limit). React binds to it through `NativeInteractions.tsx` (`NativeRuntimeContext`, `useBlockValue`).

**The factory and its inner `scriptWorker` are serialized with `Function.prototype.toString()`** (into the Worker, and into the legacy generator), so they must stay self-contained: no imports or module-scope references inside them.

Variables persist to `localStorage` under `variableStorageKey(page, scope)` (`src/lib/interactions/persistence.ts`; scopes `preview`, `published`, `shared:<token>`) unless a variable sets `persistent: false`.

### Site data and forms

`DataRuntimeProvider` / `createDataStore` deduplicate reads, cancel stale requests and expose loading/empty/error/page state. Sources live at the site root and use safe `{{route.*}}`, `{{state.*}}` and `{{form.*}}` templates, not executable JavaScript. Expressions additionally have a read-only `data` root (`data.book.title`, `data.books[0].title`); `bindingDataRoots` subscribes detail bindings and `onData` refreshes their preview without remounting form inputs. Repeater/table field mappings use `{{item.*}}` and `{{index}}`, with image mappings through `dataFields[child].imageUrl`; old static table `items` remain unchanged. `shared/collections.mjs` validates embedded `kind:"collection"` schemas and records (20 fields, 500 records), local pagination and explicit route-matched detail lookup. `CollectionManager.tsx` edits them without JSON; collections share site persistence, publication and rollback rather than a public write database. Form POST/PUT/PATCH requests require an explicit method+host confirmation and never run on generation, autosave, publish or export.

`chart` renders five native-SVG chart types (line, area, column, horizontal bar and pie/donut) from the same sources as tables and lists, without a third-party chart runtime. `src/lib/data/chart.ts` owns aggregation and geometry; static sources aggregate all records while REST sources aggregate the current page and disclose that scope. `chartType` switches preserve `sourceId`, `categoryField` and `dataColumns` (up to four metrics with sum/count/avg/min/max). `src/lib/data/filter.ts` uses a string `filterVariable` to filter loaded records and to configure same-source links in one site commit without replacing existing events. `ChartBlock.tsx` exposes structured `{category,series,value}` change events, a data-table alternative and a theme-preserving focus dialog for small screens. `chart-export.ts` serializes real SVG with computed styles and rasterizes PNG locally on explicit user action; these operations never issue external writes.

Optional credentials use AES-256-GCM in `db/data-credential-repository.ts`, derived from the existing account secret; only references enter site JSON. `/api/account/data/query` resolves an owned saved source, never an arbitrary browser URL, and validates hosts, redirects, private addresses, size and timeout. Node and Cloudflare transports connect to the validated address instead of resolving it again. Private/proxy reads are editor-only; public direct reads continue in share/export. Mirror every credential schema change in SQLite, PostgreSQL and generated D1 migrations.

### Site media and SEO

`shared/media.mjs` defines `asset:<uuid>` references, image signatures, site quotas (100 images / 50 MiB, 5 MiB each) and reference collection across blocks, SEO and content sources. `studio_media` stores only metadata; Node stores bytes under the selected `dataDir`, Cloudflare uses the inferred `STORAGE` R2 binding (`inference.bindings.storage` in `void.config.ts`). Guest images use per-site IndexedDB records, never localStorage base64. The 0008 SQLite/PostgreSQL/D1 migrations include count and total-size triggers.

`server/media-account-api.ts` accepts bounded raw image bytes, never JSON-serialized uploads, and enforces ownership plus current published-snapshot references for public reads. `db/media-repository.ts` hides historical assets without deleting objects needed by rollback; unused assets and site deletion remove storage. `MediaProvider` resolves guest/cloud/public URLs, revokes stale object URLs, migrates referenced guest assets on explicit cloud save, and expands only used assets to data URLs for self-contained exports. Publishing rejects missing asset uploads. AI may reuse only existing approved references and cannot upload or fabricate assets.

### Exports

The Export button calls `src/lib/code-export/download.ts` → `generateNativeCode` (`native.ts`): the HTML embeds a prebuilt IIFE of `src/export-runtime.tsx` (the same renderer) plus the page JSON, and the React/Vue downloads are `<iframe srcDoc>` wrappers around that HTML. The bundle arrives as the virtual module `virtual:animate-studio-native-export` from `scripts/native-export-plugin.ts`, which runs a nested Vite `build()` and prepends `THIRD_PARTY_NOTICES.md` (licensing requirement; keep it).

`generateCode` (`generate.ts` and the files only it reaches: `blocks.ts`, `runtime.ts`, `catalog-runtime.ts`, `interaction-source.ts`) is a legacy dependency-free generator that no UI path calls; it is kept for export-contract tests (`tests/code-export.test.mjs`). `nodes.ts` and `catalog-blocks.ts` in the same folder are **not** legacy: `CatalogBlock.tsx` uses them for its static fallback.

### Server: one API, two runtimes

- Node: `server/index.mjs` (`createApp`) serves Vite middleware in dev, static `dist/` in production.
- Cloudflare: the Void file routes `routes/api/[...path].ts` and `routes/p/[...path].ts`.

`shared/seo.mjs` owns page SEO defaults, safe metadata and sitemap generation. Node and Cloudflare inject the published snapshot's title, description, canonical URL, social tags and robots rules into public HTML before serving the SPA; `/p/<token>/sitemap.xml` includes only published static pages. Dynamic detail and 404 routes are not indexable. Client navigation updates the same tags, and exported single-file HTML uses conservative `noindex`. SEO edits remain draft content until normal publication.

The account API is written once as `handleAccountApi(Request, context, path)` in `server/account-api.ts`, returning plain payloads; Express adapts it with `toWebRequest` / `sendApiResult`, the Worker through `server/cloud-account-api.ts`. Better Auth (`server/auth-factory.ts`: email OTP via Resend, GitHub OAuth, mounted at `/api/auth/*`) and the Drizzle-based `db/page-repository.ts` run unchanged on both. Every page query is scoped by `userId`. Sharing stores a snapshot taken at publish time (later draft edits don't change it until re-published), served at `/api/shared/:token` and viewed at `/p/:token` (`SharedPage.tsx`; `void.config.ts` has the SPA fallback for `/p/*`). `studio_page_version` retains the latest 20 immutable publish snapshots; `studio_page_share.activeVersion` points to the current one. Publishing checks the saved draft revision and current published version, public rollback creates a new version with `sourceVersion`, and restoring a historical draft is a separate editor operation that never publishes implicitly. Accounts degrade gracefully: `createAccountStack` returns `null` (guest editing only) when production lacks `BETTER_AUTH_SECRET` or startup fails, and without Resend/GitHub credentials `/api/account/config` reports `cloudEnabled: false`.

Guests need no account: drafts live in `localStorage` (`src/lib/guest-draft.ts`). The legacy single-page endpoints (`/api/page`, `/api/validate`, `/api/health`) remain only to migrate old drafts: Node stores `data/page.json` (`store.mjs`; 404 in production unless `STUDIO_ALLOW_LEGACY_PAGE_API=1`), and Cloudflare uses the `PageStore` Durable Object keyed by an `X-Studio-Workspace` UUID (`server/cloud-api.mjs`, `durable-objects/page-store.ts`). `VITE_STUDIO_CLOUD`, injected by `vite.config.ts` (true for `cloudflare`/`production` modes, false for `--mode node`), only makes `fetchPageApi` send that header.

**Schema changes must be mirrored in every database layer:** `db/schema.ts` (SQLite/D1, from `void/schema-d1`), `db/schema-pg.ts`, a D1 migration in `db/migrations/` (generate with `npx void db generate`; Void applies it), and hand-written `db/migrations-node/sqlite-NNNN-*.sql` + `pg-NNNN-*.sql` registered in `db/migrations-node/index.json` (applied at Node startup). Keep `void.lock.json` committed, and never rename the `page-store` Durable Object or reorder existing migrations.

## Generated files (don't hand-edit)

- `shared/official-animation-controls.json` ← `node scripts/sync-official-controls.mjs <upstream demos dir> [--check]`, which parses (never executes) the upstream commit pinned in `docs/animate-ui-version.json`, then layers the hand-maintained `shared/official-animation-overrides.json` on top. Edit the overrides, then regenerate.
- `shared/official-api-controls.json`, `shared/official-css-properties.json` ← `node scripts/generate-official-api.mjs [--check]` (reads the installed `@animate-ui/react` type declarations). `--check` fails when the files are stale.
- Brand assets (`public/brand/*`, `public/favicon.*`, `apple-touch-icon.png`, `site.webmanifest`, `docs/brand-board.*`) ← `npm run brand:generate`. The only geometry source is `shared/brand-mark.json`, which `src/components/Brand.tsx` also reads.

## UI conventions (from DESIGN.md)

- Workbench colors come only from the `--studio-*` tokens in `src/studio-tokens.css` (monochrome, light/dark); `src/studio-ui.css` sets control density. Build new workbench controls from `src/components/StudioUI.tsx` (`StudioButton`, `StudioDialog`, `StudioTooltip`) and the wrappers in `src/components/animate-ui/components/` before adding new primitives.
- Workbench theme and page theme are separate systems. Page content uses `--page-*` / `src/lib/themes.ts`; toggling the workbench light/dark must not alter page content or exports, and page colors must not be grayscaled.
- Canvas zoom/pan is editor-only view state and must never change block `frame`s or the exported design canvas.

## Releases and repo hygiene

- The version is date-based (`YYYY.M.D` in `package.json`), shown in the UI header (`App.tsx` imports it) and used as the release tag `vYYYY.M.D`. A release updates `package.json` + lockfile, the bilingual `CHANGELOG.md` (中文 + English, with a validation note), and the "current release" line in both `README.md` and `README.zh-CN.md`. Commits use Conventional Commit prefixes (`feat:`, `fix:`).
- `.env` holds real credentials (gitignored; template at `docs/env.example`): don't read or commit it. `data/`, `artifacts/`, `.agents/`, `.void/`, `.wrangler/` and `.studio-*.html` are local or generated and gitignored.
