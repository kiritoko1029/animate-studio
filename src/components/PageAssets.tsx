import { createContext, useContext } from 'react';
import { safeUrl } from '../model';

/** Only the export generator supplies embedded bundled assets; document URLs stay validated. */
export const PageAssets = createContext<Record<string,string>>({});
export function usePageImage(value?: string) {
  const assets = useContext(PageAssets);
  return value && Object.hasOwn(assets,value) ? assets[value] : safeUrl(value);
}
