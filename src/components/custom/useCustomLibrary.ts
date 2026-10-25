import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CustomComponentDefinition, CustomComponentSource } from '../../../shared/custom-components.mjs';
import type { ComponentFolder } from '../../../shared/component-folders.mjs';
import type { AccountUser } from '../../lib/account-api';
import { createLocalFolder, deleteLocalFolder, renameLocalFolder, moveLocalComponent, deleteLocalComponent, readLocalLibrary, resetDamagedLibrary, saveLocalComponent, saveAiComponent, subscribeLocalLibrary, type SaveLocalOptions, type LocalLibrary } from '../../lib/custom-components/library';
import { clearDesignerDraft, designerDraftKey, listDesignerDrafts, type DesignerDraft, type DesignerTarget } from '../../lib/custom-components/drafts';
import { createCloudFolder, deleteCloudFolder, renameCloudFolder, moveCloudComponent, listCloudFolders, createCloudComponent, deleteCloudComponent, getCloudComponent, listCloudComponents, publishCloudComponent, unpublishCloudComponent, updateCloudComponent, type CloudComponentRecord, type CloudComponentSummary } from '../../lib/custom-components/cloud';

export type CloudState = { status: 'signed-out' | 'idle' | 'loading' | 'ready' | 'error'; items: CloudComponentSummary[]; folders: ComponentFolder[]; error: string };
const signedOut: CloudState = { status: 'signed-out', items: [], folders: [], error: '' };

const readLocal = (): LocalLibrary => { try { return readLocalLibrary(); } catch { return { components: [], folders: [], damaged: true, hidden: 0 }; } };
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
  const [cloud, setCloud] = useState<CloudState>(user ? { status: 'idle', items: [], folders: [], error: '' } : signedOut);
  const userRef = useRef(user?.id ?? null);
  userRef.current = user?.id ?? null;
  const cloudRequest = useRef(0);
  const cloudMutation = useRef(0);

  const refreshLocal = useCallback(() => { setLocal(readLocal()); setDrafts(readDrafts(userRef.current)); }, []);
  useEffect(() => {
    const unsubscribe = subscribeLocalLibrary(refreshLocal);
    const onStorage = (event: StorageEvent) => { if (event.key === designerDraftKey) setDrafts(readDrafts(userRef.current)); };
    window.addEventListener('storage', onStorage);
    return () => { unsubscribe(); window.removeEventListener('storage', onStorage); };
  }, [refreshLocal]);

  useEffect(() => {
    cloudRequest.current++;
    cloudMutation.current++;
    setDrafts(readDrafts(user?.id ?? null));
    setCloud(user ? { status: 'idle', items: [], folders: [], error: '' } : signedOut);
  }, [user?.id]);

  const refreshCloud = useCallback(async (background = false) => {
    const owner = userRef.current;
    if (!owner) { setCloud(signedOut); return; }
    const request = ++cloudRequest.current;
    const mutation = cloudMutation.current;
    if (!background) setCloud(state => ({ ...state, status: 'loading', error: '' }));
    try {
      const [items, folders] = await Promise.all([listCloudComponents(), listCloudFolders()]);
      if (request === cloudRequest.current && mutation === cloudMutation.current && owner === userRef.current) setCloud({ status: 'ready', items, folders, error: '' });
    } catch (error) {
      if (request === cloudRequest.current && mutation === cloudMutation.current && owner === userRef.current) setCloud(state => ({ ...state, status: 'error', error: error instanceof Error ? error.message : '暂时无法读取账号组件。' }));
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
  const changedCloud = (update: (state: CloudState) => CloudState) => {
    // A list captured before a write cannot erase the write's local result. The
    // fresh background read also fills in items from a superseded initial load.
    cloudMutation.current++; cloudRequest.current++;
    setCloud(state => state.status === 'signed-out' ? state : { ...update(state), status: 'ready', error: '' });
    void refreshCloud(true);
  };

  const api = {
    local, drafts: drafts.filter(draft => draft.target?.kind !== 'cloud' || draft.ownerId === user?.id), cloud, signedIn: Boolean(user),
    refreshLocal, refreshCloud, ensureCloud,
    findLocal: (id: string) => local.components.find(item => item.id === id) ?? null,
    findCloud: (id: string) => cloud.items.find(item => item.id === id) ?? null,
    saveLocal(definition: CustomComponentDefinition, options: SaveLocalOptions = {}) {
      const saved = saveLocalComponent(definition, options);
      refreshLocal();
      return saved;
    },
    saveAi(definition: CustomComponentDefinition, key: string, source?: CustomComponentSource, folderId?: string | null) {
      const saved = saveAiComponent(definition, key, source, folderId); refreshLocal(); return saved;
    },
    createLocalFolder(name: string) { const folder = createLocalFolder(name); refreshLocal(); return folder; },
    renameLocalFolder(id: string, name: string) { const folder = renameLocalFolder(id, name); refreshLocal(); return folder; },
    deleteLocalFolder(id: string) { const removed = deleteLocalFolder(id); refreshLocal(); return removed; },
    moveLocal(id: string, folderId: string | null) { const item = moveLocalComponent(id, folderId); refreshLocal(); return item; },
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
      for (let attempt = 0; attempt < 2; attempt++) {
        const mutation = cloudMutation.current;
        const record = await getCloudComponent(id);
        checkOwner(owner);
        // Moves and shares do not change source revision, so a revision-only
        // guard would still restore stale folder or share metadata here.
        if (mutation === cloudMutation.current) return remember(record);
      }
      throw new Error('组件库已更新，请重新打开组件后再试。');
    },
    async createCloud(definition: CustomComponentDefinition, folderId?: string | null) {
      const owner = requireOwner();
      const record = await createCloudComponent(definition, folderId);
      checkOwner(owner);
      changedCloud(state => ({ ...state, items: [toSummary(record), ...state.items.filter(item => item.id !== record.id)] }));
      return record;
    },
    async createCloudFolder(name: string) {
      const owner = requireOwner(), folder = await createCloudFolder(name); checkOwner(owner);
      changedCloud(state => ({ ...state, folders: [...state.folders.filter(item => item.id !== folder.id), folder] })); return folder;
    },
    async renameCloudFolder(id: string, name: string) {
      const owner = requireOwner(), folder = await renameCloudFolder(id, name); checkOwner(owner);
      changedCloud(state => ({ ...state, folders: state.folders.map(item => item.id === id ? folder : item) })); return folder;
    },
    async deleteCloudFolder(id: string) {
      const owner = requireOwner(); await deleteCloudFolder(id); checkOwner(owner);
      changedCloud(state => ({ ...state, folders: state.folders.filter(item => item.id !== id), items: state.items.map(item => item.folderId === id ? { ...item, folderId: null } : item) }));
    },
    async moveCloud(id: string, folderId: string | null) {
      const owner = requireOwner(), record = await moveCloudComponent(id, folderId); checkOwner(owner);
      changedCloud(state => ({ ...state, items: state.items.some(item => item.id === id)
        ? state.items.map(item => item.id === id ? { ...item, folderId: record.folderId, updatedAt: record.updatedAt } : item)
        : [toSummary(record), ...state.items] })); return record;
    },
    async updateCloud(id: string, definition: CustomComponentDefinition, baseRevision: number) {
      const owner = requireOwner();
      const record = await updateCloudComponent(id, definition, baseRevision);
      checkOwner(owner);
      changedCloud(state => {
        const current = state.items.find(item => item.id === id);
        const summary = current ? { ...toSummary(record), folderId: current.folderId, shareToken: current.shareToken, publishedAt: current.publishedAt, sharedRevision: current.sharedRevision } : toSummary(record);
        return { ...state, items: [summary, ...state.items.filter(item => item.id !== id)] };
      }); return record;
    },
    async deleteCloud(id: string) {
      const owner = requireOwner();
      await deleteCloudComponent(id);
      checkOwner(owner);
      clearDesignerDraft({ kind: 'cloud', id }, undefined, owner);
      setDrafts(readDrafts(userRef.current));
      changedCloud(state => ({ ...state, items: state.items.filter(item => item.id !== id) }));
    },
    async publishCloud(id: string) {
      const owner = requireOwner();
      const share = await publishCloudComponent(id);
      checkOwner(owner);
      changedCloud(state => ({ ...state, items: state.items.map(item => item.id === id ? { ...item, shareToken: share.token, publishedAt: share.publishedAt, sharedRevision: share.revision } : item) }));
      return share;
    },
    async unpublishCloud(id: string) {
      const owner = requireOwner();
      await unpublishCloudComponent(id);
      checkOwner(owner);
      changedCloud(state => ({ ...state, items: state.items.map(item => item.id === id ? { ...item, shareToken: null, publishedAt: null, sharedRevision: null } : item) }));
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
