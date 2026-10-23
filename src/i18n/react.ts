import { useEffect, useSyncExternalStore } from 'react';
import { getLocale, initializeLocale, localeStorageKey, subscribeLocale } from './index.ts';

export function useLocale() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'zh-CN' as const);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === localeStorageKey || event.key === null) initializeLocale();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return locale;
}
