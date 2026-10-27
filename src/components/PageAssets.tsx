import { createContext, useContext, useEffect, useState } from 'react';
import { safeUrl } from '../model';
import { parseMediaReference } from '../../shared/media.mjs';
import { MediaContext } from '../lib/media/context.ts';

export const PageAssets = createContext<Record<string,string>>({});
export function usePageImage(value?: string) {
  const assets = useContext(PageAssets), media = useContext(MediaContext);
  const id = parseMediaReference(value), [resolved, setResolved] = useState('#');
  useEffect(() => {
    if (!id || !media) return;
    let active = true; setResolved('#');
    void media.resolve(id).then(url => { if (active) setResolved(url); }).catch(() => { if (active) setResolved('#'); });
    return () => { active = false; };
  }, [id, media?.resolve]);
  if (value && Object.hasOwn(assets,value)) return assets[value];
  if (id) return resolved;
  return safeUrl(value, true);
}
