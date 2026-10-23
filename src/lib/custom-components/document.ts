import { customComponentBootstrap } from '../../../shared/custom-component-runtime.mjs';
import type { CustomComponentDefinition, CustomFieldKey } from '../../../shared/custom-components.mjs';

/** Resolved page/theme values exposed to author CSS as --as-* variables. */
export type ComponentTheme = {
  accent: string; onAccent: string; text: string; muted: string; surface: string; panel: string;
  canvas: string; border: string; radius: string; font: string; scheme: 'light' | 'dark';
};
export type ComponentProps = Partial<Record<CustomFieldKey, string>>;
export type ComponentDocumentOptions = {
  channel: string;
  nonce: string;
  props: ComponentProps;
  theme: ComponentTheme;
  /** Designer previews instrument loops; saved code is always stored untouched. */
  transformScript?: (code: string) => string;
};

export const fallbackComponentTheme: ComponentTheme = {
  accent: '#408668', onAccent: '#ffffff', text: '#283a31', muted: '#607467', surface: '#ffffff', panel: '#f1f6f2',
  canvas: '#ffffff', border: '#dce7df', radius: '16px', font: "Inter, -apple-system, 'PingFang SC', sans-serif", scheme: 'light',
};

/**
 * The component document's policy. Scripts need this render's nonce, so only the
 * platform bootstrap and the JavaScript panel run; markup scripts, inline
 * handlers, eval, network requests, external scripts/stylesheets, forms,
 * plugins, nested frames and workers are refused. Images, media and fonts may
 * load from http(s)/data/blob URLs like page images.
 */
export function componentContentSecurityPolicy(nonce: string) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    'img-src https: http: data: blob:',
    'media-src https: http: data: blob:',
    'font-src https: data:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
  ].join('; ');
}

export function randomToken(bytes = 16) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, value => value.toString(16).padStart(2, '0')).join('');
}

const color = (value: string, fallback: string) => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value) ? value : fallback;
const length = (value: string, fallback: string) => /^\d{1,3}(?:\.\d+)?px$/.test(value) ? value : fallback;
const font = (value: string, fallback: string) => /^[\w\s,'".-]{1,200}$/.test(value) ? value : fallback;

/** Only well-formed values reach CSS, even when an unsaved editor state holds odd input. */
export function sanitizeComponentTheme(theme: ComponentTheme): ComponentTheme {
  const f = fallbackComponentTheme;
  return {
    accent: color(theme.accent, f.accent), onAccent: color(theme.onAccent, f.onAccent), text: color(theme.text, f.text),
    muted: color(theme.muted, f.muted), surface: color(theme.surface, f.surface), panel: color(theme.panel, f.panel),
    canvas: color(theme.canvas, f.canvas), border: color(theme.border, f.border), radius: length(theme.radius, f.radius),
    font: font(theme.font, f.font), scheme: theme.scheme === 'dark' ? 'dark' : 'light',
  };
}

/** JSON inside a <script> element: no character can close the element or open a comment. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
/**
 * Author JavaScript keeps its meaning; `\x3C` is `<` inside strings, templates and
 * regular expressions. The patterns avoid a literal comment opener: this module is
 * itself inlined into exported HTML, where one would change how `</script>` parses.
 */
export const escapeScriptText = (code: string) => code.replace(/\x3C\/(script)/gi, '\\x3C/$1').replace(/\x3C!--/g, '\\x3C!--');
/** A CSS escape keeps `</style` from closing the style element. */
export const escapeStyleText = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1');

const baseCss = (theme: ComponentTheme) => `:root{--as-accent:${theme.accent};--as-on-accent:${theme.onAccent};--as-text:${theme.text};--as-muted:${theme.muted};--as-surface:${theme.surface};--as-panel:${theme.panel};--as-canvas:${theme.canvas};--as-border:${theme.border};--as-radius:${theme.radius};--as-font:${theme.font};color-scheme:normal}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:var(--as-font);color:var(--as-text);background:transparent;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-wrap:anywhere}`;

/**
 * Build the sandboxed srcdoc for one run of a component. The author HTML is
 * passed to the bootstrap as data and inserted before the JavaScript panel
 * runs; `jsLine` is the document line on which the JavaScript panel starts.
 */
export function buildComponentDocument(definition: Pick<CustomComponentDefinition, 'name' | 'html' | 'css' | 'js'>, options: ComponentDocumentOptions): { html: string; jsLine: number } {
  const theme = sanitizeComponentTheme(options.theme);
  const nonce = options.nonce.replace(/[^A-Za-z0-9_-]/g, '');
  const props = Object.fromEntries(Object.entries(options.props).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const script = options.transformScript ? options.transformScript(definition.js) : definition.js;
  const config = { channel: options.channel, html: definition.html, props, theme, loopGuard: Boolean(options.transformScript) };
  let probeLine = 0;
  const prefix = (line: number) => `<!doctype html>
<html lang="zh-CN" data-scheme="${theme.scheme}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${componentContentSecurityPolicy(nonce)}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${baseCss(theme)}</style>
<style>${escapeStyleText(definition.css)}</style>
</head>
<body>
<script nonce="${nonce}">window.__asProbe=new Error().stack;</script>
<script nonce="${nonce}">(${escapeScriptText(customComponentBootstrap.toString())})(${scriptJson(config)}, ${line}, ${probeLine});</script>
<script nonce="${nonce}">
`;
  // Line counts do not depend on the numbers, so one measurement is exact.
  const measured = prefix(0).split('\n');
  const jsLine = measured.length;
  probeLine = measured.findIndex(text => text.includes('window.__asProbe=')) + 1;
  return { html: `${prefix(jsLine)}${escapeScriptText(script)}\n</script>\n</body>\n</html>`, jsLine };
}
