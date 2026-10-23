import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { accountApi, type AccountCapabilities, type AccountUser } from '../lib/account-api';

const unavailable: AccountCapabilities = { cloudEnabled: false, emailEnabled: false, githubEnabled: false };
type AccountState = { user: AccountUser | null; loading: boolean; capabilities: AccountCapabilities; refresh: () => Promise<void>; announceChange: () => void };
const AccountContext = createContext<AccountState | null>(null);
export function useAccount() { const value = useContext(AccountContext); if (!value) throw new Error('AccountProvider is required'); return value; }

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState(unavailable);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const session = await accountApi<{ user?: AccountUser } | null>('/api/auth/get-session', { signal: AbortSignal.timeout(8000) });
      if (request === revision.current) setUser(session?.user ?? null);
    } catch { /* A transient auth failure must not erase the active session or guest work. */ }
    finally { if (request === revision.current) setLoading(false); }
  }, []);
  const announceChange = useCallback(() => { try { localStorage.setItem('animate-studio:account-change', crypto.randomUUID()); } catch { /* Other tabs recheck on focus. */ } }, []);
  useEffect(() => {
    const controller = new AbortController();
    void accountApi<AccountCapabilities>('/api/account/config', { signal: controller.signal }).then(setCapabilities).catch(() => {});
    void refresh();
    const onFocus = () => { void refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === 'animate-studio:account-change') void refresh(); };
    window.addEventListener('focus', onFocus); window.addEventListener('storage', onStorage);
    return () => { controller.abort(); revision.current++; window.removeEventListener('focus', onFocus); window.removeEventListener('storage', onStorage); };
  }, [refresh]);
  return <AccountContext.Provider value={{ user, loading, capabilities, refresh, announceChange }}>{children}</AccountContext.Provider>;
}
