# Animate Studio

**Current release: [v2026.10.23](https://github.com/kiritoko1029/animate-studio/releases/tag/v2026.10.23)** · [Changelog (中文 / English)](CHANGELOG.md)

**A visual page builder with a free-form canvas, interactive scripts, and portable code exports.**

[Live demo](https://animate-studio.vme5.de/) · **English** · [简体中文](README.zh-CN.md) · [User guide (中文)](docs/user-guide.zh-CN.md)

See the [brand guidelines](docs/brand-guidelines.md) for the Keyframe A mark, its design provenance, downloadable assets, and generation workflow.

![Animate Studio workbench](docs/images/studio.png)

Build a page by placing components on the canvas, editing their properties, and connecting them through shared state and events. Preview interactions as you work, then export HTML, Vue, React, or editable page JSON.

## Features

- **Free-form canvas** — drag, resize, align to a configurable grid, pan, and zoom from 5% to 400% around the pointer. Includes layers, undo/redo, and desktop/mobile previews.
- **85 components** — layouts, forms, cards, navigation, overlays, buttons, animated text, and backgrounds. Search by Chinese or English names.
- **Custom components** — write HTML, CSS and JavaScript with starter templates, live sandboxed previews and an in-editor guide. Save locally or to an account, share a published snapshot, and add independent copies to pages. [Component designer guide (中文)](docs/custom-components.zh-CN.md).
- **Themes** — a monochrome light/dark workbench, eight page presets, independent component themes, and a custom theme designer.
- **Component interactions** — shared variables, property bindings, expressions, conditional actions, and click/change events. Expression suggestions use the variables defined in your page.
- **JavaScript editor** — syntax highlighting, autocomplete, syntax checks, test runs, and runtime logs. Built-in helpers include `ctx.fetchJSON`, `ctx.setState`, `ctx.notify`, and `ctx.sleep`.
- **Portable exports** — standalone HTML, Vue/React wrappers around an embedded page, and JSON for continued editing. Exported pages do not require Animate UI, Motion, Radix, or Tailwind.
- **Accounts and saved pages** — email OTP and GitHub sign-in, multiple saved pages, read-only share links, and synced appearance. Guests can keep editing and exporting.
- **Local or Cloudflare hosting** — Express with SQLite/PostgreSQL, or a Cloudflare Worker with D1. See [account and storage setup](docs/accounts-and-storage.md).

Workbench controls and canvas primitives use `@animate-ui/react` 2.0.0 (the latest npm release), Motion 14.5.0, and registry backgrounds/buttons pinned to Animate UI v2.1.2. Canvas, plain previews, and previews with bindings/scripts use the same official React primitives and default motion. The property panel exposes supported effect settings. HTML downloads embed this runtime; Vue/React downloads wrap the same isolated page in an iframe. See the [version record](docs/animate-ui-version.json) and [component coverage reference](docs/animate-ui-coverage.md).

## Quick start

Requires **Node.js 24.21.0+**. The repository's `.nvmrc` and CI use Node.js 24.22.0.

```sh
git clone https://github.com/kiritoko1029/animate-studio.git
cd animate-studio
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. The local server binds to the loopback address by default. Guest drafts are saved in the browser. Configure sign-in to save multiple pages to an account database and restore them across devices.

`npm run dev` watches the server and its imported validation/schema files and restarts the backend when they change. Vite handles frontend hot updates. This keeps new editor properties in sync with the save API during development. `npm start` runs without the watcher.

To run the local production build:

```sh
npm run build
NODE_ENV=production npm start
```

## Build your first page

1. Add a component from the library, then drag and resize it on the canvas.
2. Edit its content, appearance, layout, and theme in the inspector.
3. Open **Data & scripts / 数据与脚本** above the canvas to define variables. Use **Component interactions / 组件联动** to connect properties and events.
4. Test the result in the preview, then use **Export / 导出** to download code or page JSON.

The workbench currently uses a Chinese interface. The [detailed user guide](docs/user-guide.zh-CN.md) covers expressions, event actions, scripts, themes, and export integration.

| Canvas action | macOS | Windows / Linux |
| --- | --- | --- |
| Zoom around the pointer | `⌘` + wheel | `Alt` + wheel |
| Fit canvas | `⌘` + `0` | `Alt` + `0` |
| Restore 100% | `⌘` + `1` | `Alt` + `1` |
| Pan | Space + drag, or middle-button drag | Space + drag, or middle-button drag |
| Undo / redo | `⌘ Z` / `⌘ ⇧ Z` | `Ctrl Z` / `Ctrl Shift Z` |

## Export formats

| Format | Output | Target requirements |
| --- | --- | --- |
| HTML | A single `.html` file with CSS and JavaScript | A browser or static host; no build step |
| Vue | `GeneratedPage.vue` | Vue 3.5+ with SFC support |
| React | `GeneratedPage.jsx` | React 18+ with JSX support |
| JSON | Editable page definition | Import back into Animate Studio |

Exports preserve layout, themes, bindings, events, and scripts. The design canvas scales proportionally to its container; it does not automatically reflow into a mobile layout. Custom images retain their URLs, so those assets must remain available. Code exports cannot be imported back into the editor; keep the JSON when you need to continue editing.

Scripts run in an isolated iframe/Worker environment with a 15-second execution limit. HTTP requests follow browser CORS rules. Scripts have no DOM access and do not import npm packages.

## Deploy to Cloudflare

[Void](https://void.cloud/guide/quickstart) builds and deploys the frontend, API, and persistent storage together:

```sh
npm run cloudflare:login
npm run deploy:cloudflare
```

Cloudflare simulation and build commands:

```sh
npm run dev:cloudflare      # local development on port 4174
npm run build:cloudflare    # Worker + frontend production build
npm run preview:cloudflare # run that build locally
```

Guest drafts stay in the browser; account pages, published snapshots, and preferences use D1. Existing anonymous Durable Object drafts can be restored, and their resource history is preserved. See [account and storage setup](docs/accounts-and-storage.md) for Resend, GitHub OAuth, PostgreSQL, and migrations. Local pages are not uploaded automatically.

The [GitHub Actions workflow](.github/workflows/cloudflare.yml) tests and builds pull requests and `main`. Production deployment runs on `main` after verification when the `CLOUDFLARE_API_TOKEN` repository secret is configured. Without the token, verification still runs and deployment is explicitly skipped. Automatic deployment can be enabled later; browser login is sufficient for local CLI deployment.

Keep `void.lock.json` in Git to preserve resource identities and migration history. See the [deployment guide (中文)](docs/cloudflare-deployment.md) for account variables, token permissions, storage behavior, and troubleshooting.

## Development

```sh
npm test             # tests for the editor, runtime, APIs, and exports
npm run typecheck    # separate browser and Cloudflare type checks
npm run build        # local Node.js frontend build
npm run build:cloudflare
```

Tests use isolated DOMs, temporary directories, and temporary servers; they do not modify `data/page.json`. Both builds share `dist/`, so run the appropriate build before starting its production preview.

| Path | Purpose |
| --- | --- |
| `src/components/` | Canvas, inspector, script editor, and workbench components |
| `src/lib/code-export/` | Shared export model and HTML/Vue/React generators |
| `shared/` | Page schemas, theme definitions, and interaction runtime |
| `server/` | Local Express API, validation, and cloud API adapter |
| `routes/`, `durable-objects/` | Void routes and browser-specific persistent state |
| `tests/` | Automated behavior and integration tests |

## License and attribution

This project uses the **MIT + Commons Clause License Condition**, following [Animate UI's license](https://github.com/imskyleen/animate-ui/blob/main/LICENSE.md). See [LICENSE.md](LICENSE.md) for the complete terms.

Use, modification, and distribution as part of an application, website, or product are permitted, including commercial use. **Selling or redistributing the original components themselves, individually or as a bundle, is restricted.** This is not an unmodified MIT license.

Animate UI source retains its original copyright and license notice. Other third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
