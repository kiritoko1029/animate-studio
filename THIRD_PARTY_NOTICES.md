# Third-party notices

Animate Studio's project license is in [LICENSE.md](LICENSE.md). The notice below preserves the upstream terms for the embedded Animate UI source; other dependencies retain their respective licenses.

## Animate UI

Animate Studio uses the official `@animate-ui/react` npm package **2.0.0**, the latest package release checked on 2026-10-21, with Motion **14.5.0**. The upstream repository/site release is **v2.1.2**: v2.1.1 and v2.1.2 update the upstream AI skill, while the React package retains its 2.0.0 version.

Source project: https://github.com/imskyleen/animate-ui

Release: https://github.com/imskyleen/animate-ui/tree/v2.1.2

Pinned source commit: `e6cea6b5ae5a4985d3bf3cc0ebea173555eafd72`

The 9 background, 4 styled-button, Code Block, and Page Transition registry sources in `src/components/animate-ui/registry/` were retrieved from that commit on 2026-10-21. Local adaptations include the `cn` import and, for canvas backgrounds, component-local sizing/pointer coordinates so editor zoom does not scale the drawing twice. Exact source URLs, upstream/local SHA-256 hashes, and adaptation notes are in [the version manifest](docs/animate-ui-version.json), and every registry file retains an attribution header. The Motion Grid demo frames and animation controls also derive from this pinned source.

The styled wrappers in `src/components/animate-ui/components/` derive from the previously embedded v1 Button, Tabs, Dialog, DropdownMenu, Switch and Tooltip sources (retrieved 2026-10-19/20). Their animation primitives now come from the v2 npm package. The embedded v1 primitive and helper files have been removed. Original wrapper copyrights and license terms remain applicable.

Application compositions, low-code property mapping, theme tokens, fixed-canvas placement, and the standalone HTML/Vue/React export runtime are maintained by Animate Studio. The current download path bundles the same official rendering runtime used by the canvas. Low-code controls expose supported serializable settings, rather than the full React API. See [component coverage](docs/animate-ui-coverage.md).

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
