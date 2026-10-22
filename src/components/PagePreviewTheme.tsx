import { createContext, useSyncExternalStore, type CSSProperties } from 'react';

/** React context crosses portals, unlike inherited page CSS variables. */
export const PageBlockTheme = createContext<CSSProperties | undefined>(undefined);

export type PageThemeSelection = 'light' | 'dark' | 'system';
const subscribeScheme = (notify: () => void) => { const query=window.matchMedia('(prefers-color-scheme: dark)'); query.addEventListener('change',notify); return () => query.removeEventListener('change',notify); };
const readScheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
export function useSystemScheme(): 'light' | 'dark' { return useSyncExternalStore(subscribeScheme,readScheme,()=>false) ? 'dark' : 'light'; }

/** Preview-only theme changes never mutate the saved document or workbench theme. */
export const PagePreviewTheme = createContext<{
  scheme: 'light' | 'dark';
  selection?: PageThemeSelection;
  setScheme: (scheme: PageThemeSelection) => void;
} | null>(null);
