import { createContext, useContext } from 'react';
import type { SitePageEntry } from '../../shared/site-document.mjs';

export type SiteRoute = { path: string; pageId: string; pattern: string; params: Record<string, string> };
export type SiteNavigation = {
  navigate: (url: string) => boolean;
  href: (url: string) => string;
  isCurrent: (url: string) => boolean;
  back: () => void;
  params: Record<string, string>;
  siteName?: string;
  pages?: SitePageEntry[];
  currentPageId?: string;
  currentPath?: string;
  route?: SiteRoute;
};
export function siteMenuPath(entry: Pick<SitePageEntry, 'path'>): string {
  return entry.path.replace(/:[A-Za-z][A-Za-z0-9_]*/g, 'example');
}
export const SiteNavigationContext = createContext<SiteNavigation | null>(null);
export function useSiteNavigation() { return useContext(SiteNavigationContext); }
