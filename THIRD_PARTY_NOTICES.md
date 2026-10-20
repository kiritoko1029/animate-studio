# Third-party notices

Animate Studio's project license is in [LICENSE.md](LICENSE.md). The notice below preserves the upstream terms for the embedded Animate UI source; other dependencies retain their respective licenses.

## Animate UI

Animate Studio embeds the following official Animate UI v1 registry primitives and their helper modules as part of this application. These files are original upstream source with local import paths adapted. The accordion import uses the equivalent individual `@radix-ui/react-accordion` package. Styling and the simplified public API in `src/components/animate-ui/index.tsx` are application-specific wrappers.

Source project: https://github.com/imskyleen/animate-ui

Documentation: https://animate-ui.com/docs

Retrieved: 2026-10-19; platform controls added 2026-10-20

- `primitives/buttons/button.tsx`: https://animate-ui.com/r/primitives-buttons-button.json
- `primitives/animate/slot.tsx`: https://animate-ui.com/r/primitives-animate-slot.json
- `primitives/effects/fade.tsx`: https://animate-ui.com/r/primitives-effects-fade.json
- `primitives/texts/highlight.tsx`: https://animate-ui.com/r/primitives-texts-highlight.json
- `primitives/radix/accordion.tsx`: https://animate-ui.com/r/primitives-radix-accordion.json
- `hooks/use-is-in-view.ts`: https://animate-ui.com/r/hooks-use-is-in-view.json
- `hooks/use-controlled-state.ts`: https://animate-ui.com/r/hooks-use-controlled-state.json
- `lib/get-strict-context.tsx`: https://animate-ui.com/r/lib-get-strict-context.json

Additional official v1 registry components used by the workbench (2026-10-20):

- `components/buttons/button.tsx`: https://animate-ui.com/r/components-buttons-button.json
- `components/radix/tabs.tsx`: https://animate-ui.com/r/components-radix-tabs.json
- `components/radix/dialog.tsx`: https://animate-ui.com/r/components-radix-dialog.json
- `components/radix/dropdown-menu.tsx`: https://animate-ui.com/r/components-radix-dropdown-menu.json
- `components/radix/switch.tsx`: https://animate-ui.com/r/components-radix-switch.json
- `components/radix/tooltip.tsx`: https://animate-ui.com/r/components-radix-tooltip.json
- Corresponding `primitives/radix/` modules, `primitives/effects/highlight.tsx`, `primitives/effects/auto-height.tsx`, and hooks `use-auto-height.tsx` / `use-data-state.tsx` come from the registry dependencies. Full source URLs are retained in their file headers.

New registry sources preserve their upstream interaction model. Switch state props are kept on Radix Root rather than forwarded to the DOM button (avoids a React unknown-handler warning). Local utility/helper imports are adapted; `WithAsChild` uses a type-only import for this project's strict TypeScript configuration. The application wrapper supplies its own monochrome tokens, editor spacing, restrained animation, and Escape handling for code/expression editors. These are source-distributed v1 components, not the v2 npm package. Existing portable HTML/Vue/React exports do not include these platform controls.

License source: https://github.com/imskyleen/animate-ui/blob/main/LICENSE.md

MIT + Commons Clause License Condition

Copyright (c) 2025 Elliot Sutton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell or redistribute the components themselves in their original form—whether alone or in a bundle.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
