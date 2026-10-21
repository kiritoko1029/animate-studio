import { createContext } from 'react';

/** Preview-only theme changes never mutate the saved document or workbench theme. */
export const PagePreviewTheme = createContext<{
  scheme: 'light' | 'dark';
  setScheme: (scheme: 'light' | 'dark') => void;
} | null>(null);
