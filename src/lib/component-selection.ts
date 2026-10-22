import { defaultFrame, type Block, type BlockFrame, type BlockProps, type PageDocument } from '../model.ts';
import { canvasBounds, clampFrame } from './canvas-bounds.ts';
import { resetThemeOverrides, type ThemeId } from './themes.ts';
import type { AnimationValue } from '../../shared/animation-settings.mjs';

export function selectComponentIds(current: string[], id: string | null, additive = false) {
  if (!id) return [];
  if (!additive) return [id];
  return current.includes(id) ? current.filter(value => value !== id) : [...current, id];
}

export function sharedValue<T>(values: T[]): { mixed: boolean; value: T | undefined } {
  const value = values[0];
  return { value, mixed: values.some(item => JSON.stringify(item) !== JSON.stringify(value)) };
}

export function selectionFrames(blocks: Block[], settings: PageDocument['settings']): Record<string, BlockFrame> {
  return Object.fromEntries(blocks.map(block => [block.id, clampFrame(block.frame ?? defaultFrame(block.type, settings.maxWidth), settings, block.props.contentScale)]));
}

export function frameUnion(frames: Record<string, BlockFrame>): BlockFrame | null {
  const list = Object.values(frames);
  if (!list.length) return null;
  const x = Math.min(...list.map(frame => frame.x)), y = Math.min(...list.map(frame => frame.y));
  return { x, y, width: Math.max(...list.map(frame => frame.x + frame.width)) - x, height: Math.max(...list.map(frame => frame.y + frame.height)) - y };
}

/** Clamp the whole group, preserving distances between its components. */
export function translateSelection(frames: Record<string, BlockFrame>, settings: PageDocument['settings'], dx: number, dy: number) {
  const group = frameUnion(frames);
  if (!group) return frames;
  const bounds = canvasBounds(settings);
  const x = Math.max(bounds.left - group.x, Math.min(dx, bounds.right - group.x - group.width));
  const y = Math.max(bounds.top - group.y, Math.min(dy, bounds.bottom - group.y - group.height));
  return Object.fromEntries(Object.entries(frames).map(([id, frame]) => [id, { ...frame, x: frame.x + x, y: frame.y + y }]));
}

/** Batch edits touch only the explicit fields; unrelated props and bindings stay intact. */
export function patchSelection(page: PageDocument, ids: string[], patch: Partial<BlockProps>): PageDocument {
  const selected = new Set(ids);
  return { ...page, blocks: page.blocks.map(block => selected.has(block.id) ? { ...block, props: { ...block.props, ...patch } } : block) };
}

export function themeSelection(page: PageDocument, ids: string[], theme?: ThemeId): PageDocument {
  const selected = new Set(ids);
  return { ...page, blocks: page.blocks.map(block => selected.has(block.id)
    ? { ...block, props: { ...resetThemeOverrides(block.props), theme } } : block) };
}

export function replaceSelectedBlocks(page: PageDocument, blocks: Block[]): PageDocument {
  const replacements = new Map(blocks.map(block => [block.id, block]));
  return { ...page, blocks: page.blocks.map(block => replacements.get(block.id) ?? block) };
}

export function patchBlockSetting(block: Block, property: 'motion' | 'effectOptions', key: string, value: AnimationValue | undefined): Block {
  const settings = { ...block.props[property] };
  if (value === undefined) delete settings[key]; else settings[key] = value;
  return { ...block, props: { ...block.props, [property]: settings } };
}

export function duplicateSelection(page: PageDocument, ids: string[]): { page: PageDocument; ids: string[] } {
  const selected = new Set(ids), originals = page.blocks.filter(block => selected.has(block.id));
  if (page.blocks.length + originals.length > 200) throw new Error('复制后将超过 200 个组件上限');
  const frames = translateSelection(selectionFrames(originals, page.settings), page.settings, 24, 24);
  const copies = new Map(originals.map(block => [block.id, { ...structuredClone(block), id: crypto.randomUUID(), frame: frames[block.id] }]));
  return { page: { ...page, blocks: page.blocks.flatMap(block => copies.has(block.id) ? [block, copies.get(block.id)!] : [block]) }, ids: [...copies.values()].map(block => block.id) };
}

export function isSelectionInput(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, [role="textbox"], [role="menu"], [role="dialog"], [role="alertdialog"], [data-canvas-interactive]');
}
