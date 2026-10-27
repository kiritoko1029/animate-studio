import type { DataField, DataSource, DataTemplateContext } from './data-sources.mjs';
import type { JsonValue } from '../src/lib/interactions/types.ts';
export type CollectionFieldType = 'text' | 'longText' | 'number' | 'boolean' | 'url' | 'image';
export type CollectionField = { key: string; label: string; type: CollectionFieldType };
export type CollectionRecord = { id: string; values: Record<string, JsonValue> };
export const collectionLimits: { fields: number; records: number };
export function validateCollectionSource(source: DataSource): DataSource;
export function prepareCollection(source: DataSource, context?: DataTemplateContext): { value: import('../src/lib/interactions/types.ts').JsonValue };
export function collectionFields(source: DataSource): DataField[];
