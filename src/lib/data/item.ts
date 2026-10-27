import { readDataPath } from '../../../shared/data-sources.mjs';
import type { JsonValue } from '../interactions/types';

export function itemField(template: string | undefined, item: Record<string, JsonValue>, index: number): JsonValue | undefined {
  if (!template) return undefined;
  if (!template.includes('{{')) return readDataPath(item, template);
  let valid = true;
  const value = template.replace(/\{\{\s*(item|index)((?:\.[A-Za-z_$][\w$]*|\[\d+\])*)\s*\}\}/g, (_match, root: string, suffix: string) => {
    const value = root === 'index' ? index : root === 'item' && !suffix && Object.keys(item).length === 1 && Object.hasOwn(item, 'value') ? item.value : readDataPath(item, suffix.replace(/^\./, ''));
    if (value === undefined) valid = false;
    return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  });
  return valid && !/\{\{|\}\}/.test(value) ? value : undefined;
}
