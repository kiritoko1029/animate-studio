export const inspectorDisclosureStorageKey = 'animate-studio:inspector-disclosures:v1';
export const inspectorDisclosureLimits = { maxEntries: 512, maxKeyLength: 160 } as const;

export type InspectorDisclosurePreferences = Record<string, boolean>;
export type WorkbenchPreferencesPatch = {
  studioTheme?: 'light' | 'dark';
  inspectorDisclosures?: InspectorDisclosurePreferences;
};

const disclosureKeyPattern = new RegExp(`^[A-Za-z0-9][A-Za-z0-9:._-]{0,${inspectorDisclosureLimits.maxKeyLength - 1}}$`);

export function validateInspectorDisclosures(value: unknown): InspectorDisclosurePreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return null;
  const entries = Object.entries(value);
  if (entries.length > inspectorDisclosureLimits.maxEntries) return null;
  if (entries.some(([key, open]) => !disclosureKeyPattern.test(key) || typeof open !== 'boolean')) return null;
  return Object.fromEntries(entries);
}
