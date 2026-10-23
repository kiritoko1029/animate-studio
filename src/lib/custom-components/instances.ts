import { customFieldKeys, type CustomComponentDefinition, type CustomComponentSnapshot, type CustomComponentSource, type CustomFieldKey } from '../../../shared/custom-components.mjs';
import type { Block, PageDocument } from '../../model.ts';
import { contrastingText, getTheme } from '../themes.ts';
import { fallbackComponentTheme, type ComponentProps, type ComponentTheme } from './document.ts';

/** Copy only the contract fields, so editor-only metadata never reaches a page. */
export function snapshotDefinition(definition: CustomComponentDefinition, source?: CustomComponentSource): CustomComponentSnapshot {
  const snapshot: CustomComponentSnapshot = { name: definition.name, html: definition.html, css: definition.css, js: definition.js };
  if (definition.description) snapshot.description = definition.description;
  if (definition.fields && Object.keys(definition.fields).length) snapshot.fields = { ...definition.fields };
  if (definition.size) snapshot.size = { ...definition.size };
  if (source) snapshot.source = { ...source };
  return snapshot;
}

/**
 * A page instance owns a copy of the definition. Editing, deleting or
 * unsharing the library component never changes pages that already use it.
 */
export function createCustomBlock(definition: CustomComponentDefinition, source?: CustomComponentSource): Block {
  const props: Block['props'] = { custom: snapshotDefinition(definition, source) };
  for (const key of customFieldKeys) if (definition.fields?.[key] !== undefined) props[key] = definition.fields[key];
  return { id: crypto.randomUUID(), type: 'custom', props };
}

export function declaredFields(block: Pick<Block, 'props'>): CustomFieldKey[] {
  const fields = block.props.custom?.fields ?? {};
  return customFieldKeys.filter(key => Object.hasOwn(fields, key));
}

/** Values the component receives: instance overrides, else the definition defaults. */
export function instanceProps(block: Pick<Block, 'props'>): ComponentProps {
  const fields = block.props.custom?.fields ?? {};
  return Object.fromEntries(declaredFields(block).map(key => [key, String(block.props[key] ?? fields[key] ?? '')]));
}

/** Theme values for the frame: component theme or page theme, then explicit overrides. */
export function customComponentTheme(block: Pick<Block, 'props'>, settings: PageDocument['settings']): ComponentTheme {
  const p = block.props;
  const theme = getTheme(p.theme ?? settings.theme, settings.customThemes);
  const accent = p.accent ?? (p.theme ? theme.accent : settings.accent) ?? fallbackComponentTheme.accent;
  return {
    accent, onAccent: contrastingText(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(accent) ? accent : fallbackComponentTheme.accent),
    text: p.color ?? theme.text, muted: theme.muted, surface: p.background ?? theme.surface, panel: theme.panel,
    canvas: settings.background ?? theme.canvas, border: theme.border, radius: `${p.radius ?? theme.radius}px`,
    font: theme.headingFont, scheme: theme.scheme === 'dark' ? 'dark' : 'light',
  };
}

/**
 * Explicitly replace an instance's copy with a newer library version. Instance
 * field values the new version still declares, the frame, bindings, events and
 * appearance are kept; fields it no longer declares are dropped.
 */
export function updateInstanceDefinition(block: Block, definition: CustomComponentDefinition, source?: CustomComponentSource): Block {
  const props: Block['props'] = { ...block.props, custom: snapshotDefinition(definition, source) };
  for (const key of customFieldKeys) {
    if (definition.fields?.[key] === undefined) delete props[key];
    else if (props[key] === undefined) props[key] = definition.fields[key];
  }
  const kept = new Set(customFieldKeys.filter(key => definition.fields?.[key] !== undefined));
  const bindings = block.bindings ? Object.fromEntries(Object.entries(block.bindings).filter(([key]) => !(customFieldKeys as readonly string[]).includes(key) || kept.has(key as CustomFieldKey))) : undefined;
  return { ...block, props, ...(bindings ? { bindings } : {}) };
}

/** Restore the instance fields to the copied definition's defaults (keeps geometry and appearance). */
export function resetCustomInstance(block: Block): Block {
  const props: Block['props'] = { ...block.props };
  for (const key of customFieldKeys) {
    const value = block.props.custom?.fields?.[key];
    if (value === undefined) delete props[key]; else props[key] = value;
  }
  return { ...block, props };
}

/** The definition carried by a page instance, without its provenance. */
export function definitionFromInstance(block: Pick<Block, 'props'>): CustomComponentDefinition | null {
  const snapshot = block.props.custom;
  if (!snapshot) return null;
  const { source: _source, ...definition } = snapshot;
  return JSON.parse(JSON.stringify(definition)) as CustomComponentDefinition;
}

export function countSourceInstances(page: PageDocument | null | undefined, source: Pick<CustomComponentSource, 'kind' | 'id'>) {
  return page?.blocks.filter(block => block.type === 'custom' && block.props.custom?.source?.kind === source.kind && block.props.custom.source.id === source.id).length ?? 0;
}
