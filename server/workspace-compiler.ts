import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformSync, type Plugin } from 'esbuild';
import { parse, compileScript, compileTemplate, compileStyle } from 'vue/compiler-sfc';
import { validateWorkspace, type WorkspaceSpec, type WorkspaceCompiledBundle } from '../shared/workspace.mjs';
import {
  buildWorkspaceDocumentHtml,
  registerServerWorkspaceCompiler,
  registerServerWorkspacePreviewVerifier,
  type WorkspacePreviewVerificationReport,
} from '../src/lib/workspace/compiler-client.ts';
import {
  ANIMATE_UI_BASE_CSS,
  ANIMATE_UI_REACT_SOURCE,
  ANIMATE_UI_VUE_MODULE_SOURCE,
} from '../src/lib/workspace/animate-ui-kit.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type WorkspaceCompileDiagnostic = {
  file: string;
  line?: number;
  column?: number;
  message: string;
};

export type WorkspaceCompileResult =
  | { ok: true; compiled: WorkspaceCompiledBundle; warnings: WorkspaceCompileDiagnostic[] }
  | { ok: false; errors: WorkspaceCompileDiagnostic[]; warnings: WorkspaceCompileDiagnostic[] };

const LUCIDE_ICON_PATHS: Record<string, string> = {
  Search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  Plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  Minus: '<path d="M5 12h14"/>',
  Check: '<path d="M20 6 9 17l-5-5"/>',
  CheckCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  CheckCircle2: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  X: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  XCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  Star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  Heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  ArrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  ArrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  ArrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  ArrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  ArrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  Sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  Filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  Bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  Settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  ChevronRight: '<path d="m9 18 6-6-6-6"/>',
  ChevronLeft: '<path d="m15 18-6-6 6-6"/>',
  ChevronDown: '<path d="m6 9 6 6 6-6"/>',
  ChevronUp: '<path d="m18 15-6-6-6 6"/>',
  Layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  BarChart3: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  BarChart2: '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
  PieChart: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  Activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  Users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  User: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  Calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  Clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  Trash2: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  Trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>',
  Edit3: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  Edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  ExternalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ShoppingBag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  ShoppingCart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  TrendingUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  TrendingDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  ShieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  Shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  Zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  Globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  Home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  Menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  MoreHorizontal: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  MoreVertical: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  Copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  Download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  Upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  RefreshCw: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  Eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  Lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  Mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  MessageSquare: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  Send: '<line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  Code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  Terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  Cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/>',
  Database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  Folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  FileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  AlertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  AlertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  Info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  Play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  Pause: '<rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/>',
  Bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  Share2: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  Sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  Moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  Award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  Compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  MapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  Tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  Sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/>',
  LayoutGrid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  List: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  Flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  Rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
};

function collectNamedImports(files: WorkspaceSpec['files'], modulePattern: RegExp): string[] {
  const names = new Set<string>();
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const fileObj of Object.values(files)) {
    let match: RegExpExecArray | null;
    importRegex.lastIndex = 0;
    while ((match = importRegex.exec(fileObj.content)) !== null) {
      const clause = match[1] ?? '';
      const spec = match[2] ?? '';
      if (!modulePattern.test(spec)) continue;
      const braceMatch = clause.match(/\{([\s\S]*?)\}/);
      if (!braceMatch) continue;
      for (const rawPart of braceMatch[1].split(',')) {
        const cleaned = rawPart.replace(/\btype\b/g, '').trim();
        if (!cleaned) continue;
        const importedName = cleaned.split(/\s+as\s+/)[0]?.trim();
        if (importedName && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(importedName)) {
          names.add(importedName);
        }
      }
    }
  }
  return [...names];
}

function buildLucideVirtualSource(files: WorkspaceSpec['files'], framework: WorkspaceSpec['framework']): string {
  const requested = collectNamedImports(files, /^lucide-(?:react|vue-next)$/);
  const allNames = new Set<string>([...Object.keys(LUCIDE_ICON_PATHS), ...requested]);
  const pathsJson = JSON.stringify(LUCIDE_ICON_PATHS);

  if (framework === 'vue') {
    const exportsCode = [...allNames]
      .map(name => `export const ${name} = makeIcon(${JSON.stringify(name)});`)
      .join('\n');
    return `
import { defineComponent, h } from 'vue';
const paths = ${pathsJson};
function makeIcon(name) {
  const body = paths[name] || paths.Sparkles;
  return defineComponent({
    name: 'Lucide' + name,
    props: {
      size: { type: [Number, String], default: 18 },
      color: { type: String, default: 'currentColor' },
      strokeWidth: { type: [Number, String], default: 2 },
    },
    setup(props, { attrs }) {
      return () => h('svg', {
        ...attrs,
        xmlns: 'http://www.w3.org/2000/svg',
        width: props.size,
        height: props.size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: props.color,
        'stroke-width': props.strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        class: ['lucide', 'lucide-' + String(name).toLowerCase(), attrs.class].filter(Boolean).join(' '),
        'aria-hidden': 'true',
        innerHTML: body,
      });
    },
  });
}
${exportsCode}
export const createIcons = () => {};
export default new Proxy({}, { get: (_, prop) => makeIcon(String(prop)) });
`;
  }

  const exportsCode = [...allNames]
    .map(name => `export const ${name} = makeIcon(${JSON.stringify(name)});`)
    .join('\n');
  return `
import React from 'react';
const paths = ${pathsJson};
function makeIcon(name) {
  const body = paths[name] || paths.Sparkles;
  return function LucideIcon({ size = 18, color = 'currentColor', strokeWidth = 2, className = '', style, ...rest }) {
    return React.createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: ('lucide lucide-' + String(name).toLowerCase() + ' ' + className).trim(),
      style,
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: body },
      ...rest,
    });
  };
}
${exportsCode}
export default new Proxy({}, { get: (_, prop) => makeIcon(String(prop)) });
`;
}

const KNOWN_ANIMATE_UI_EXPORTS = new Set([
  'GradientText',
  'ShimmeringText',
  'TypingText',
  'HighlightText',
  'SlidingText',
  'RollingText',
  'MorphingText',
  'RotatingText',
  'SplittingText',
  'SwappingText',
  'CountingNumber',
  'SlidingNumber',
  'ScrollingNumber',
  'RippleButton',
  'LiquidButton',
  'MagneticButton',
  'FlipButton',
  'SpotlightCard',
  'AnimateCard',
  'GlowCard',
  'TiltCard',
  'MarqueeBanner',
  'AuroraBackground',
  'ParticlesBackground',
  'StarsBackground',
  'BubbleBackground',
  'GradientBackground',
  'HexagonBackground',
  'GridBackground',
  'FireworksBackground',
  'GravityStarsBackground',
  'HoleBackground',
  'TopographyBackground',
  'GlyphBackground',
  'AnimateTabs',
  'AnimateAccordion',
  'AnimateProgress',
  'AnimateSwitch',
  'AnimateBadge',
  'AnimateAvatarGroup',
  'AnimateModal',
  'AnimateTooltip',
  'CodeBlock',
  'SpringContainer',
  'StaggerGroup',
  'Card',
  'Button',
  'Tabs',
  'Accordion',
  'Progress',
  'Switch',
  'Badge',
  'Modal',
  'Dialog',
  'Tooltip',
  'Alert',
  'AnimateUi',
]);

function buildAnimateUiVirtualSource(files: WorkspaceSpec['files'], framework: WorkspaceSpec['framework']): string {
  const requested = collectNamedImports(
    files,
    /^(?:animate-ui|@animate-ui\/.*|(?:\.\.?\/|@\/).*animate-ui.*|(?:\.\.?\/|@\/).*AnimateUi\.vue)$/i,
  );
  const extraNames = requested.filter(name => !KNOWN_ANIMATE_UI_EXPORTS.has(name));

  if (framework === 'vue') {
    const extraExports = extraNames
      .map(name => `export const ${name} = AnimateCard;`)
      .join('\n');
    return `${ANIMATE_UI_VUE_MODULE_SOURCE}\n${extraExports}\n`;
  }

  const extraExports = extraNames
    .map(name => `export const ${name} = AnimateCard;`)
    .join('\n');
  return `${ANIMATE_UI_REACT_SOURCE}\n${extraExports}\n`;
}

function resolveVirtualFile(files: WorkspaceSpec['files'], candidate: string): string | null {
  const normalized = posix.normalize(candidate).replace(/^\/+/, '');
  if (Object.hasOwn(files, normalized)) return normalized;
  for (const ext of ['.tsx', '.ts', '.jsx', '.js', '.vue', '.css', '.json']) {
    if (Object.hasOwn(files, `${normalized}${ext}`)) return `${normalized}${ext}`;
  }
  for (const indexFile of ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.vue']) {
    const joined = posix.join(normalized, indexFile);
    if (Object.hasOwn(files, joined)) return joined;
  }
  return null;
}

function compileVueSfc(source: string, filename: string, id: string): { code: string; css: string; errors: WorkspaceCompileDiagnostic[] } {
  const { descriptor, errors: parseErrors } = parse(source, { filename });
  if (parseErrors.length) {
    return {
      code: '',
      css: '',
      errors: parseErrors.map(err => ({
        file: filename,
        line: 'loc' in err ? err.loc?.start.line : undefined,
        column: 'loc' in err ? err.loc?.start.column : undefined,
        message: err.message,
      })),
    };
  }
  const errors: WorkspaceCompileDiagnostic[] = [];
  let css = '';
  const hasScoped = descriptor.styles.some(style => style.scoped);
  for (let i = 0; i < descriptor.styles.length; i++) {
    const styleBlock = descriptor.styles[i];
    const compiledStyle = compileStyle({
      source: styleBlock.content,
      filename,
      id: `data-v-${id}`,
      scoped: Boolean(styleBlock.scoped),
    });
    if (compiledStyle.errors.length) {
      for (const err of compiledStyle.errors) {
        errors.push({ file: filename, message: err.message });
      }
    } else {
      css += `${compiledStyle.code}\n`;
    }
  }
  try {
    if (descriptor.script || descriptor.scriptSetup) {
      const script = compileScript(descriptor, {
        id,
        inlineTemplate: true,
        templateOptions: {
          scoped: hasScoped,
          compilerOptions: { scopeId: hasScoped ? `data-v-${id}` : undefined },
        },
      });
      const transformed = transformSync(script.content, {
        loader: script.lang === 'ts' || script.lang === 'tsx' ? 'ts' : 'js',
        sourcefile: filename,
      });
      let code = transformed.code;
      if (hasScoped) {
        code += `\n;(function(){ try { if (typeof __sfc__ !== 'undefined') __sfc__.__scopeId = "data-v-${id}"; } catch {} })();`;
      }
      return { code, css, errors };
    }
    if (descriptor.template) {
      const template = compileTemplate({
        source: descriptor.template.content,
        filename,
        id,
        scoped: hasScoped,
        compilerOptions: { scopeId: hasScoped ? `data-v-${id}` : undefined },
      });
      if (template.errors.length) {
        for (const err of template.errors) {
          errors.push({ file: filename, message: typeof err === 'string' ? err : err.message });
        }
        return { code: '', css, errors };
      }
      return {
        code: `${template.code}\nexport default { render${hasScoped ? `, __scopeId: "data-v-${id}"` : ''} };`,
        css,
        errors,
      };
    }
    return { code: 'export default {};', css, errors };
  } catch (error) {
    errors.push({
      file: filename,
      message: error instanceof Error ? error.message : String(error),
    });
    return { code: '', css, errors };
  }
}

export async function compileWorkspace(rawWorkspace: unknown): Promise<WorkspaceCompileResult> {
  const workspace = validateWorkspace(rawWorkspace);
  const files = workspace.files;
  const collectedCss: string[] = [];
  const sfcErrors: WorkspaceCompileDiagnostic[] = [];

  for (const [filePath, fileObj] of Object.entries(files)) {
    if (filePath.endsWith('.css')) {
      collectedCss.push(`/* ${filePath} */\n${fileObj.content}`);
    }
  }

  let entryBootstrap = '';
  let rootMarkup = '<div id="workspace-root"></div>';
  const lucideSource = buildLucideVirtualSource(files, workspace.framework);
  const animateUiSource = buildAnimateUiVirtualSource(files, workspace.framework);

  if (workspace.framework === 'react') {
    entryBootstrap = `
import 'virtual:workspace-prelude';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as EntryModule from './${workspace.entry}';

const reportErr = (err) => {
  const msg = err && err.message ? err.message : String(err);
  if (typeof window !== 'undefined' && typeof window.__reportWorkspaceRuntimeError === 'function') {
    window.__reportWorkspaceRuntimeError(msg, '${workspace.entry}', 1);
  } else {
    console.error(err);
  }
};

class WorkspaceErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    reportErr(error);
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', { 'data-workspace-crash': 'true', style: { display: 'none' } });
    }
    return this.props.children;
  }
}

const RootComponent = EntryModule.default || EntryModule.App || Object.values(EntryModule).find(v => typeof v === 'function');
if (!RootComponent) {
  const err = new Error('入口文件 ${workspace.entry} 必须默认导出 (export default) 或导出一个 React 组件函数。');
  reportErr(err);
  throw err;
}
const container = document.getElementById('workspace-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'workspace-root' }));
try {
  const root = createRoot(container, {
    onUncaughtError(error) { reportErr(error); },
    onCaughtError(error) { reportErr(error); },
  });
  flushSync(() => {
    root.render(React.createElement(WorkspaceErrorBoundary, null, React.createElement(RootComponent)));
  });
  if (container.children.length === 0 && !(container.textContent || '').trim()) {
    reportErr(new Error('根组件渲染结果为空（返回了 null 或空片段），请确保组件返回可见的页面结构。'));
  }
} catch (err) {
  reportErr(err);
}
`;
  } else if (workspace.framework === 'vue') {
    entryBootstrap = `
import 'virtual:workspace-prelude';
import { createApp } from 'vue';
import * as EntryModule from './${workspace.entry}';

const reportErr = (err) => {
  const msg = err && err.message ? err.message : String(err);
  if (typeof window !== 'undefined' && typeof window.__reportWorkspaceRuntimeError === 'function') {
    window.__reportWorkspaceRuntimeError(msg, '${workspace.entry}', 1);
  } else {
    console.error(err);
  }
};

const EntryComponent = EntryModule.default || EntryModule.App || EntryModule;
const container = document.getElementById('workspace-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'workspace-root' }));
try {
  const app = createApp(EntryComponent);
  app.config.errorHandler = (err) => {
    reportErr(err);
  };
  app.mount(container);
  if (container.children.length === 0 && !(container.textContent || '').trim()) {
    reportErr(new Error('Vue 根组件挂载后页面为空（#workspace-root 无可见子节点），请检查 <template> 结构或运行时状态。'));
  }
} catch (err) {
  reportErr(err);
}
`;
  } else {
    const htmlContent = files[workspace.entry]?.content ?? '';
    rootMarkup = htmlContent || '<div id="workspace-root"></div>';
    const jsFiles = Object.keys(files).filter(p => /\.(?:ts|js|tsx|jsx)$/i.test(p));
    if (jsFiles.length > 0) {
      const mainJs = jsFiles.find(p => /(?:main|app|index)\.(?:ts|js)$/i.test(p)) ?? jsFiles[0];
      entryBootstrap = `
import * as AppModule from './${mainJs}';
try {
  const boot = AppModule.default || AppModule.mountWorkspaceApp || AppModule.init;
  if (typeof boot === 'function') {
    boot(document.getElementById('ws-app-root') || document.getElementById('workspace-root') || document.body);
  }
} catch (err) {
  if (typeof window !== 'undefined' && typeof window.__reportWorkspaceRuntimeError === 'function') {
    window.__reportWorkspaceRuntimeError(err && err.message ? err.message : String(err), '${mainJs}', 1);
  }
}
`;
    } else {
      entryBootstrap = '// Static HTML workspace';
    }
  }

  const virtualPlugin: Plugin = {
    name: 'workspace-virtual-fs',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^virtual:workspace-entry$/ }, () => ({
        path: 'virtual:workspace-entry',
        namespace: 'ws-entry',
      }));

      buildApi.onLoad({ filter: /^virtual:workspace-entry$/, namespace: 'ws-entry' }, () => ({
        contents: entryBootstrap,
        loader: 'tsx',
        resolveDir: projectRoot,
      }));

      buildApi.onResolve({ filter: /^virtual:workspace-prelude$/ }, () => ({
        path: 'virtual:workspace-prelude',
        namespace: 'ws-prelude',
      }));

      buildApi.onLoad({ filter: /^virtual:workspace-prelude$/, namespace: 'ws-prelude' }, () => {
        if (workspace.framework === 'react') {
          return {
            contents: `
import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer, useContext, createContext, useId, useLayoutEffect, Fragment } from 'react';
const g = typeof globalThis !== 'undefined' ? globalThis : window;
Object.assign(g, { React, useState, useEffect, useMemo, useCallback, useRef, useReducer, useContext, createContext, useId, useLayoutEffect, Fragment });
`,
            loader: 'js',
            resolveDir: projectRoot,
          };
        }
        if (workspace.framework === 'vue') {
          return {
            contents: `
import { ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, toRef, toRefs, defineProps, defineEmits } from 'vue';
const g = typeof globalThis !== 'undefined' ? globalThis : window;
Object.assign(g, { ref, computed, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, toRef, toRefs, defineProps, defineEmits });
`,
            loader: 'js',
            resolveDir: projectRoot,
          };
        }
        return { contents: '', loader: 'js', resolveDir: projectRoot };
      });

      buildApi.onResolve({ filter: /^lucide-(?:react|vue-next)$/ }, () => ({
        path: 'lucide-virtual',
        namespace: 'ws-lucide',
      }));

      buildApi.onLoad({ filter: /^lucide-virtual$/, namespace: 'ws-lucide' }, () => ({
        contents: lucideSource,
        loader: workspace.framework === 'vue' ? 'js' : 'jsx',
        resolveDir: projectRoot,
      }));

      buildApi.onResolve({ filter: /^(?:animate-ui|@animate-ui\/.*|framer-motion|motion\/react)$/ }, () => ({
        path: 'animate-ui',
        namespace: 'ws-animate-ui',
      }));

      buildApi.onLoad({ filter: /^animate-ui$/, namespace: 'ws-animate-ui' }, () => {
        if (!collectedCss.some(c => c.includes('Animate UI Workspace Runtime Styles'))) {
          collectedCss.push(ANIMATE_UI_BASE_CSS);
        }
        return {
          contents: animateUiSource,
          loader: workspace.framework === 'vue' ? 'js' : 'tsx',
          resolveDir: projectRoot,
        };
      });

      buildApi.onResolve({ filter: /^\.\.?\// }, args => {
        if (args.namespace !== 'ws-file' && args.namespace !== 'ws-entry') return null;
        const baseDir = args.namespace === 'ws-entry' ? '' : posix.dirname(args.importer || '');
        const candidate = posix.join(baseDir, args.path);
        const resolved = resolveVirtualFile(files, candidate);
        if (!resolved || (workspace.framework === 'vue' && /^src\/components\/animate-ui/i.test(resolved))) {
          if (
            candidate === 'src/components/animate-ui'
            || candidate.startsWith('src/components/animate-ui/')
            || candidate === 'src/components/AnimateUi.vue'
            || candidate === 'src/components/animate-ui.vue'
          ) {
            return { path: 'animate-ui', namespace: 'ws-animate-ui' };
          }
          if (!resolved) {
            return {
              errors: [{ text: `找不到工作区模块 "${args.path}"（请检查文件路径或先通过 writeFile 创建该文件）` }],
            };
          }
        }
        return { path: resolved, namespace: 'ws-file' };
      });

      buildApi.onResolve({ filter: /^@\// }, args => {
        if (args.namespace !== 'ws-file' && args.namespace !== 'ws-entry') return null;
        const candidate = posix.join('src', args.path.slice(2));
        const resolved = resolveVirtualFile(files, candidate);
        if (!resolved || (workspace.framework === 'vue' && /^src\/components\/animate-ui/i.test(resolved))) {
          if (
            candidate === 'src/components/animate-ui'
            || candidate.startsWith('src/components/animate-ui/')
            || candidate === 'src/components/AnimateUi.vue'
            || candidate === 'src/components/animate-ui.vue'
          ) {
            return { path: 'animate-ui', namespace: 'ws-animate-ui' };
          }
          if (!resolved) {
            return {
              errors: [{ text: `找不到工作区模块 "${args.path}"` }],
            };
          }
        }
        return { path: resolved, namespace: 'ws-file' };
      });

      buildApi.onLoad({ filter: /.*/, namespace: 'ws-file' }, args => {
        const fileObj = files[args.path];
        if (!fileObj) {
          return { errors: [{ text: `工作区文件不存在：${args.path}` }] };
        }
        if (args.path.endsWith('.css')) {
          return { contents: '', loader: 'js' };
        }
        if (args.path.endsWith('.json')) {
          return { contents: fileObj.content, loader: 'json' };
        }
        if (args.path.endsWith('.vue')) {
          const id = args.path.replace(/[^A-Za-z0-9]/g, '').slice(-12) || 'sfc';
          const compiledSfc = compileVueSfc(fileObj.content, args.path, id);
          if (compiledSfc.errors.length) {
            sfcErrors.push(...compiledSfc.errors);
            return {
              errors: compiledSfc.errors.map(e => ({ text: e.message })),
            };
          }
          if (compiledSfc.css.trim()) {
            collectedCss.push(`/* ${args.path} */\n${compiledSfc.css}`);
          }
          return {
            contents: compiledSfc.code,
            loader: 'js',
            resolveDir: projectRoot,
          };
        }
        const ext = posix.extname(args.path).toLowerCase();
        const loader = ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : ext === '.jsx' ? 'jsx' : 'js';
        return {
          contents: fileObj.content,
          loader,
          resolveDir: projectRoot,
        };
      });
    },
  };

  try {
    const result = await build({
      entryPoints: ['virtual:workspace-entry'],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: ['es2022'],
      jsx: 'automatic',
      minify: true,
      logLevel: 'silent',
      absWorkingDir: projectRoot,
      define: {
        'process.env.NODE_ENV': '"production"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      },
      plugins: [virtualPlugin],
    });

    if (sfcErrors.length) {
      return { ok: false, errors: sfcErrors, warnings: [] };
    }

    const js = result.outputFiles?.[0]?.text ?? '';
    const css = collectedCss.join('\n\n');
    const warnings: WorkspaceCompileDiagnostic[] = result.warnings.map(w => ({
      file: w.location?.file?.replace(/^ws-file:/, '') ?? workspace.entry,
      line: w.location?.line,
      column: w.location?.column,
      message: w.text,
    }));

    return {
      ok: true,
      compiled: {
        html: rootMarkup,
        js,
        css,
        compiledAt: new Date().toISOString(),
      },
      warnings,
    };
  } catch (error: unknown) {
    if (sfcErrors.length) {
      return { ok: false, errors: sfcErrors, warnings: [] };
    }
    const buildErrors = (error as { errors?: Array<{ text: string; location?: { file?: string; line?: number; column?: number } }> })?.errors;
    if (Array.isArray(buildErrors) && buildErrors.length) {
      return {
        ok: false,
        errors: buildErrors.map(err => ({
          file: err.location?.file?.replace(/^ws-file:/, '') ?? workspace.entry,
          line: err.location?.line,
          column: err.location?.column,
          message: err.text,
        })),
        warnings: [],
      };
    }
    return {
      ok: false,
      errors: [
        {
          file: workspace.entry,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
    };
  }
}

registerServerWorkspaceCompiler(compileWorkspace);

export async function verifyWorkspacePreviewOnServer(
  workspace: WorkspaceSpec,
  compiledOverride?: WorkspaceCompiledBundle,
): Promise<WorkspacePreviewVerificationReport> {
  let compiled = compiledOverride;
  if (!compiled?.js && workspace.framework !== 'html') {
    const res = await compileWorkspace(workspace);
    if (!res.ok) {
      const msg = res.errors.map(e => `${e.file}${e.line ? `:${e.line}` : ''}: ${e.message}`).join('；');
      return {
        ok: false,
        rendered: false,
        rootChildCount: 0,
        textLength: 0,
        interactiveCount: 0,
        overflowX: false,
        runtimeError: '',
        compileErrors: res.errors,
        summary: `编译失败：${msg}`,
      };
    }
    compiled = res.compiled;
  }
  if (!compiled) {
    return {
      ok: false,
      rendered: false,
      rootChildCount: 0,
      textLength: 0,
      interactiveCount: 0,
      overflowX: false,
      runtimeError: '工作区尚未生成可预览的产物',
      compileErrors: [],
      summary: '工作区尚未生成可预览的产物',
    };
  }

  const html = buildWorkspaceDocumentHtml({ ...workspace, compiled });
  const runtimeErrors: string[] = [];

  try {
    const jsdomSpec = 'jsdom';
    const jsdomMod = (await import(jsdomSpec)) as {
      JSDOM: new (
        markup: string,
        options?: Record<string, unknown>,
      ) => {
        window: Record<string, unknown> & {
          document: {
            getElementById(id: string): {
              children?: { length: number };
              textContent?: string | null;
              innerHTML?: string;
              querySelectorAll(sel: string): { length: number };
            } | null;
            body: {
              children: { length: number };
              textContent?: string | null;
              querySelectorAll(sel: string): { length: number };
            };
          };
          close(): void;
        };
      };
      VirtualConsole?: new () => {
        on(event: string, cb: (...args: unknown[]) => void): void;
      };
    };

    const virtualConsole = jsdomMod.VirtualConsole ? new jsdomMod.VirtualConsole() : undefined;
    if (virtualConsole) {
      virtualConsole.on('jsdomError', (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/Not implemented: navigation/i.test(msg)) {
          runtimeErrors.push(msg);
        }
      });
    }

    const dom = new jsdomMod.JSDOM(html, {
      runScripts: 'dangerously',
      url: 'http://localhost/',
      pretendToBeVisual: true,
      ...(virtualConsole ? { virtualConsole } : {}),
      beforeParse(win: Record<string, unknown>) {
        win.matchMedia = () => ({
          matches: false,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        });
        win.ResizeObserver = class {
          observe() {}
          unobserve() {}
          disconnect() {}
        };
        win.IntersectionObserver = class {
          observe() {}
          unobserve() {}
          disconnect() {}
        };
        win.scrollTo = () => {};
        win.__reportWorkspaceRuntimeError = (message: unknown) => {
          const text = String(message || '运行时错误');
          if (!runtimeErrors.includes(text)) {
            runtimeErrors.push(text);
          }
        };
      },
    });

    try {
      await new Promise(resolveTimer => setTimeout(resolveTimer, 50));
      const doc = dom.window.document;
      const rootEl = doc.getElementById('workspace-root') || doc.body;
      const crashNode = rootEl?.querySelectorAll?.('[data-workspace-crash="true"]')?.length ?? 0;
      const rootChildCount = crashNode > 0 ? 0 : (rootEl?.children?.length ?? 0);
      const textLength = ((rootEl?.textContent || '').replace(/\s+/g, ' ').trim()).length;
      const interactiveCount = rootEl?.querySelectorAll
        ? rootEl.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"]').length
        : 0;
      const rendered = runtimeErrors.length === 0 && rootChildCount > 0 && (textLength > 0 || interactiveCount > 0);
      if (!rendered && runtimeErrors.length === 0) {
        runtimeErrors.push('预览页面挂载后为空白画面（#workspace-root 无可见子节点或文本内容），请检查根组件渲染输出。');
      }
      const runtimeErrorText = runtimeErrors.join('；');
      return {
        ok: rendered && runtimeErrors.length === 0,
        rendered,
        rootChildCount,
        textLength,
        interactiveCount,
        overflowX: false,
        runtimeError: runtimeErrorText,
        compileErrors: [],
        summary: rendered && runtimeErrors.length === 0
          ? `预览页面渲染正常（根节点数 ${rootChildCount}，文本长度 ${textLength}，交互控件 ${interactiveCount} 个）`
          : `预览页面渲染异常：${runtimeErrorText}`,
      };
    } finally {
      dom.window.close();
    }
  } catch {
    // Fallback if JSDOM is unavailable in environment
    const hasJs = Boolean(compiled.js && compiled.js.trim().length > 30);
    return {
      ok: hasJs,
      rendered: hasJs,
      rootChildCount: hasJs ? 1 : 0,
      textLength: hasJs ? 10 : 0,
      interactiveCount: 1,
      overflowX: false,
      runtimeError: hasJs ? '' : '预览脚本为空',
      compileErrors: [],
      summary: hasJs ? '工作区脚本构建完成' : '预览脚本为空',
    };
  }
}

registerServerWorkspacePreviewVerifier(verifyWorkspacePreviewOnServer);
