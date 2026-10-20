import presets from '../../shared/themes.json' with { type: 'json' };
import type { CSSProperties } from 'react';
import type { Block, BlockProps, PageDocument } from '../model.ts';

export type PresetId = keyof typeof presets;
export type ThemeId = PresetId | `custom-${string}`;
export type ThemeDefinition = typeof presets.nature;
export type CustomTheme = ThemeDefinition & { id: `custom-${string}` };
export const themePresets = Object.entries(presets).map(([id, preset]) => ({ id: id as PresetId, ...preset }));
export const getTheme = (id?: ThemeId, customThemes: CustomTheme[] = []): ThemeDefinition =>
  customThemes.find(theme => theme.id === id) ?? (Object.hasOwn(presets, id ?? 'nature') ? presets[(id ?? 'nature') as PresetId] : presets.nature);
export const themeColorKeys = ['accent', 'canvas', 'surface', 'panel', 'text', 'muted', 'border'] as const;
export const isThemeColor = (value: string) => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value);

export function contrastingText(hex: string) {
  const full = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map(i => {
    const channel = parseInt(full.slice(i, i + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b > .179 ? '#000000' : '#ffffff';
}

function tokens(theme: ThemeDefinition, accent = theme.accent): CSSProperties & Record<`--${string}`, string | number | undefined> {
  return {
    '--page-accent': accent, '--page-accent-ink': accent, '--page-on-accent': contrastingText(accent),
    '--page-surface': theme.surface, '--page-panel': theme.panel, '--page-ink': theme.text,
    '--page-muted': theme.muted, '--page-border': theme.border,
    '--theme-radius': `${theme.radius}px`, '--theme-control-radius': `${theme.controlRadius}px`,
    '--theme-shadow': theme.shadow, '--page-heading-font': theme.headingFont,
    colorScheme: theme.scheme === 'dark' ? 'dark' : 'light',
  };
}

export function pageThemeStyle(settings: PageDocument['settings']) {
  return {
    ...(settings.theme ? tokens(getTheme(settings.theme, settings.customThemes), settings.accent) : {}),
    '--page-accent': settings.accent, '--page-bg': settings.background,
    background: settings.background,
  };
}

export function blockThemeStyle(block: Block, settings: PageDocument['settings']) {
  const p = block.props;
  const id = p.theme ?? settings.theme;
  const theme = getTheme(id, settings.customThemes);
  const accent = p.accent ?? (p.theme ? theme.accent : settings.accent);
  const panel = ['statistic', 'testimonial', 'pricing'].includes(block.type);
  return {
    ...(id ? tokens(theme, accent) : p.accent ? {
      '--page-accent': accent, '--page-accent-ink': accent, '--page-on-accent': contrastingText(accent),
    } : {}),
    '--block-radius': p.radius === undefined ? undefined : `${p.radius}px`,
    color: p.color ?? (id ? theme.text : undefined),
    background: block.type === 'card' ? (p.theme ? theme.canvas : undefined)
      : p.background ?? (panel ? (id ? theme.panel : '#f5f7f5') : p.theme ? theme.canvas : undefined),
    borderRadius: p.radius ?? (id ? theme.radius : undefined),
  };
}

/** Changing a preset starts from its colors and shape; content and geometry are retained. */
export function resetThemeOverrides(props: BlockProps): BlockProps {
  const { accent, background, color, radius, ...rest } = props;
  return rest;
}

export function applyPageTheme(document: PageDocument, theme: ThemeId): PageDocument {
  const preset = getTheme(theme, document.settings.customThemes);
  return {
    ...document,
    settings: { ...document.settings, theme, accent: preset.accent, background: preset.canvas },
    blocks: document.blocks.map(block => block.props.theme ? block : { ...block, props: resetThemeOverrides(block.props) }),
  };
}

export function prepareBlockForPage(block: Block, settings: PageDocument['settings']): Block {
  return settings.theme ? { ...block, props: resetThemeOverrides(block.props) } : block;
}

/** Save and apply in one history entry; editing a shared theme updates its existing users. */
export function saveCustomTheme(document: PageDocument, theme: CustomTheme, blockId?: string): PageDocument {
  const previous = getTheme(theme.id, document.settings.customThemes);
  const customThemes = [...(document.settings.customThemes ?? []).filter(item => item.id !== theme.id), theme];
  const settings = { ...document.settings, customThemes };
  if (settings.theme === theme.id) {
    if (settings.accent === previous.accent) settings.accent = theme.accent;
    if (settings.background === previous.canvas) settings.background = theme.canvas;
  }
  const next = { ...document, settings };
  return blockId ? { ...next, blocks: next.blocks.map(block => block.id === blockId
    ? { ...block, props: { ...resetThemeOverrides(block.props), theme: theme.id } } : block) }
    : applyPageTheme(next, theme.id);
}

export function deleteCustomTheme(document: PageDocument, id: ThemeId): PageDocument {
  const next = { ...document,
    settings: { ...document.settings, customThemes: (document.settings.customThemes ?? []).filter(theme => theme.id !== id) },
    blocks: document.blocks.map(block => {
      if (block.props.theme !== id) return block;
      const { theme, ...props } = resetThemeOverrides(block.props);
      return { ...block, props };
    }),
  };
  return document.settings.theme === id ? applyPageTheme(next, 'nature') : next;
}
