export type CustomFieldKey = 'title' | 'text' | 'label' | 'url' | 'imageUrl';
export type CustomComponentFields = Partial<Record<CustomFieldKey, string>>;
export type CustomComponentSize = { width: number; height: number };
/** Author-editable definition: the code contract of one reusable component. */
export type CustomComponentDefinition = {
  name: string;
  description?: string;
  html: string;
  css: string;
  js: string;
  fields?: CustomComponentFields;
  size?: CustomComponentSize;
};
export type CustomComponentSource = { kind: 'local' | 'cloud'; id: string; revision: number };
/** Definition embedded in a page block so pages never depend on the library copy. */
export type CustomComponentSnapshot = CustomComponentDefinition & { source?: CustomComponentSource };

export const customComponentLimits: Readonly<{
  name: number; description: number; code: number;
  minWidth: number; maxWidth: number; minHeight: number; maxHeight: number;
  perPage: number; perAccount: number; perLibrary: number;
}>;
export const customFieldKeys: readonly CustomFieldKey[];
export const customFieldLimits: Readonly<Record<CustomFieldKey, number>>;
export const customFieldLabels: Readonly<Record<CustomFieldKey, string>>;
export const customBlockPropKeys: readonly string[];
export const customComponentSandbox: 'allow-scripts';
export function isSafeCustomUrl(value: unknown, image?: boolean): boolean;
export function validateCustomFieldValue(key: string, value: unknown, path?: string): void;
export function validateCustomComponentDefinition(value: unknown, path?: string): CustomComponentDefinition;
export function validateCustomComponentSnapshot(value: unknown, path?: string): CustomComponentSnapshot;
export function validateCustomBlockProps(props: unknown, path?: string): void;
export function customComponentCodeSize(definition: unknown): number;
