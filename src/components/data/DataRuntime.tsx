import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { DataSource } from '../../../shared/data-sources.mjs';
import { createDataStore, type DataAccess, type DataResult, type DataStore } from '../../lib/data/runtime';
import { NativeRuntimeContext } from '../NativeInteractions';
import { bindingDataRoots } from '../../lib/data/bindings';
import type { Block } from '../../model';

const Context = createContext<DataStore | null>(null);
const emptySubscribe = () => () => {};
const emptyRevision = () => 0;
export function DataRuntimeProvider({ sources, access, route = {}, state = {}, fetcher, children }: { sources: DataSource[]; access: DataAccess; route?: Record<string, string>; state?: Record<string, import('../../lib/interactions/types').JsonValue>; fetcher?: typeof fetch; children: ReactNode }) {
  const parent = useContext(Context);
  const store = useMemo(() => parent ?? createDataStore(sources, access, fetcher), [parent, sources, access.pageId, access.scope, fetcher]);
  const contextKey = JSON.stringify([route, state]);
  useMemo(() => { if (!parent) store.setContext({ route, state }); }, [parent, store, contextKey]);
  useSyncExternalStore(store.subscribe, store.getRevision, store.getRevision);
  useEffect(() => () => { if (!parent) store.dispose(); }, [parent, store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useDataSource(id?: string): DataResult & { source?: DataSource } {
  const store = useContext(Context);
  const key = store?.keyFor(id ?? '') ?? 'missing';
  const result = useSyncExternalStore(store?.subscribe ?? emptySubscribe, () => store?.get(id ?? ''), () => undefined);
  useEffect(() => { if (store && id) void store.load(id, key); }, [store, id, key]);
  const empty = useMemo<DataResult>(() => ({ status: 'error', value: null, items: [], error: '请在站点数据源中选择数据。', page: 1, pageCount: 1, refresh: () => {}, setPage: () => {} }), []);
  return { ...(result ?? empty), source: store?.sourceFor(id ?? '') };
}
export function useDataValues() {
  const store = useContext(Context);
  useSyncExternalStore(store?.subscribe ?? emptySubscribe, store?.getRevision ?? (() => 0), store?.getRevision ?? (() => 0));
  return store?.values() ?? {};
}
function useDataBindings(blocks?: Block[]) {
  const store = useContext(Context);
  const ids = useMemo(() => bindingDataRoots(blocks ?? []), [blocks]);
  const key = ids.join(',');
  useEffect(() => {
    if (!store) return;
    for (const id of ids) {
      const source = store.sourceFor(id);
      if (source && (source.kind === 'static' || (source.method ?? 'GET') === 'GET')) void store.load(id, store.keyFor(id));
    }
  }, [store, key]);
  return useDataValues();
}
export function RuntimeDataBridge({ route = {}, state = {}, blocks }: { route?: Record<string, string>; state?: Record<string, import('../../lib/interactions/types').JsonValue>; blocks?: Block[] }) {
  const context = useContext(NativeRuntimeContext), store = useDataStore();
  const key = JSON.stringify([route, state]);
  useMemo(() => { store?.setContext({ route, state }); }, [store, key]);
  const values = useDataBindings(blocks);
  const serialized = JSON.stringify(values);
  useEffect(() => { context?.runtime.setData(JSON.parse(serialized)); }, [context?.runtime, serialized]);
  return null;
}
export function useDataStore() { return useContext(Context); }
