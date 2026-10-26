import { createContext, useContext } from 'react';

export type SiteNavigation = {
  navigate: (url: string) => boolean;
  href: (url: string) => string;
  isCurrent: (url: string) => boolean;
  back: () => void;
  params: Record<string, string>;
};
export const SiteNavigationContext = createContext<SiteNavigation | null>(null);
export function useSiteNavigation() { return useContext(SiteNavigationContext); }
