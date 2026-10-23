import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CustomComponentDefinition } from '../../../shared/custom-components.mjs';
import type { AccountUser } from '../../lib/account-api';
import { deleteLocalComponent, readLocalLibrary, resetDamagedLibrary, saveLocalComponent, subscribeLocalLibrary, type LocalComponent, type LocalLibrary } from '../../lib/custom-components/library';
import { clearDesignerDraft, designerDraftKey, listDesignerDrafts, type DesignerDraft, type DesignerTarget } from '../../lib/custom-components/drafts';
import { createCloudComponent, deleteCloudComponent, getCloudComponent, listCloudComponents, publishCloudComponent, unpublishCloudComponent, updateCloudComponent, type CloudComponentRecord, type CloudComponentSummary } from '../../lib/custom-components/cloud';

export type CloudState = { status: 'signed-out' | 'idle' | 'loading' | 'ready' | 'error'; items: CloudComponentSummary[]; error: string };
const signedOut: CloudState = { status: 'signed-out', items: [], error: '' };

const readLocal = (): LocalLibrary => { try { return readLocalLibrary(); } catch { return { components: [], damaged: true, hidden: 0 }; } };
const readDrafts = (ownerId: string | null = null): DesignerDraft[] => { try { return listDesignerDrafts(undefined, ownerId); } catch { return []; } };

/**
 * Component library state for the editor: this browser's components, the
 * signed-in account's components (loaded on demand, never merged with local
 * ones) and unsaved designer drafts. Account operations check that the same
 * user is still signed in when they finish.
 */
export function useCustomLibrary(user: AccountUser | null) {
  const [local, setLocal] = useState<LocalLibrary>(readLocal);
  const [drafts, setDrafts] = useState<DesignerDraft[]>(() => readDrafts(user?.id ?? null));
  const [cloud, setCloud] = useState<CloudState>(user ? { status: 'idle', items: [], error: '' } : signedOut);
  const userRef = useRef(user?.id ?? null);
  userRef.current = user?.id ?? null;
  const cloudRequest = useRef(0);

  const refreshLocal = useCallback(() => { setLocal(readLocal()); setDrafts(readDrafts(userRef.current)); }, []);
  useEffect(() => {
    const unsubscribe = subscribeLocalLibrary(refreshLocal);
    const onStorage = (event: StorageEvent) => { if (event.key === designerDraftKey) setDrafts(readDrafts(userRef.current)); };
    window.addEventListener('storage', onStorage);
    return () => { unsubscribe(); window.removeEventListener('storage', onStorage); };
  }, [refreshLocal]);

  useEffect(() => {
    cloudRequest.current++;
    setDrafts(readDrafts(user?.id ?? null));
    setCloud(user ? { status: 'idle', items: [], error: '' } : signedOut);
  }, [user?.id]);

  const refreshCloud = useCallback(async () => {
    const owner = userRef.current;
    if (!owner) { setCloud(signedOut); return; }
    const request = ++cloudRequest.current;
    setCloud(state => ({ ...state, status: 'loading', error: '' }));
    try {
      const items = await listCloudComponents();
      if (request === cloudRequest.current && owner === userRef.current) setCloud({ status: 'ready', items, error: '' });
    } catch (error) {
      if (request === cloudRequest.current && owner === userRef.current) setCloud(state => ({ ...state, status: 'error', error: error instanceof Error ? error.message : '暂时无法读取账号组件。' }));
    }
  }, []);
  const ensureCloud = useCallback(() => { if (userRef.current && cloud.status === 'idle') void refreshCloud(); }, [cloud.status, refreshCloud]);

  const requireOwner = () => {
    const owner = userRef.current;
    if (!owner) throw new Error('请先登录，再使用账号组件。');
    return owner;
  };
  const checkOwner = (owner: string) => { if (userRef.current !== owner) throw new Error('登录状态已改变，请重新打开组件后再试。'); };
  const remember = (record: CloudComponentRecord) => {
    setCloud(state => state.status === 'signed-out' ? state : { ...state, items: [toSummary(record), ...state.items.filter(item => item.id !== record.id)] });
    return record;
  };

  const api = {
    local, drafts: drafts.filter(draft => draft.target?.kind !== 'cloud' || draft.ownerId === user?.id), cloud, signedIn: Boolean(user),
    refreshLocal, refreshCloud, ensureCloud,
    findLocal: (id: string) => local.components.find(item => item.id === id) ?? null,
    findCloud: (id: string) => cloud.items.find(item => item.id === id) ?? null,
    saveLocal(definition: CustomComponentDefinition, options: { id?: string; baseRevision?: number | null; origin?: LocalComponent['origin'] } = {}) {
      const saved = saveLocalComponent(definition, options);
      refreshLocal();
      return saved;
    },
    deleteLocal(id: string) {
      const removed = deleteLocalComponent(id);
      clearDesignerDraft({ kind: 'local', id });
      refreshLocal();
      return removed;
    },
    resetDamaged() { const raw = resetDamagedLibrary(); refreshLocal(); return raw; },
    discardDraft(target: DesignerTarget) { clearDesignerDraft(target, undefined, userRef.current); setDrafts(readDrafts(userRef.current)); },
    refreshDrafts: () => setDrafts(readDrafts(userRef.current)),
    async loadCloud(id: string) {
      const owner = requireOwner();
      const record = await getCloudComponent(id);
      checkOwner(owner);
      return remember(record);
    },
    async createCloud(definition: CustomComponentDefinition) {
      const owner = requireOwner();
      const record = await createCloudComponent(definition);
      checkOwner(owner);
      return remember(record);
    },
    async updateCloud(id: string, definition: CustomComponentDefinition, baseRevision: number) {
      const owner = requireOwner();
      const record = await updateCloudComponent(id, definition, baseRevision);
      checkOwner(owner);
      return remember(record);
    },
    async deleteCloud(id: string) {
      const owner = requireOwner();
      await deleteCloudComponent(id);
      checkOwner(owner);
      clearDesignerDraft({ kind: 'cloud', id }, undefined, owner);
      setDrafts(readDrafts(userRef.current));
      setCloud(state => ({ ...state, items: state.items.filter(item => item.id !== id) }));
    },
    async publishCloud(id: string) {
      const owner = requireOwner();
      const share = await publishCloudComponent(id);
      checkOwner(owner);
      setCloud(state => ({ ...state, items: state.items.map(item => item.id === id ? { ...item, shareToken: share.token, publishedAt: share.publishedAt, sharedRevision: share.revision } : item) }));
      return share;
    },
    async unpublishCloud(id: string) {
      const owner = requireOwner();
      await unpublishCloudComponent(id);
      checkOwner(owner);
      setCloud(state => ({ ...state, items: state.items.map(item => item.id === id ? { ...item, shareToken: null, publishedAt: null, sharedRevision: null } : item) }));
    },
  };
  return useMemo(() => api, [local, drafts, cloud, user?.id]);
}

const toSummary = ({ component: _component, ...summary }: CloudComponentRecord): CloudComponentSummary => summary;

export type CustomLibrary = ReturnType<typeof useCustomLibrary>;
export const CustomLibraryContext = createContext<CustomLibrary | null>(null);
export function useLibrary() {
  const value = useContext(CustomLibraryContext);
  if (!value) throw new Error('CustomLibraryContext is required');
  return value;
}
