import { useCallback, useRef, useState } from 'react';
import type { PageDocument, SiteDocument } from '../model';
import { getActiveDocument, replaceActiveDocument } from '../../shared/site-document.mjs';

type Snapshot = { site: SiteDocument; target: string };
export function useStudioSite(isLocked: () => boolean) {
  const [site, setSite] = useState<SiteDocument | null>(null);
  const [target, setTarget] = useState('');
  const [past, setPast] = useState<Snapshot[]>([]), [future, setFuture] = useState<Snapshot[]>([]);
  const siteRef = useRef(site), targetRef = useRef(target), aiRun = useRef(''), aiBases = useRef(new WeakSet<SiteDocument>());
  const document = site ? getActiveDocument(site, target) : null;
  const current = useRef(document); current.current = document;
  const install = useCallback((next: SiteDocument, nextTarget: string) => {
    siteRef.current = next; targetRef.current = nextTarget; setSite(next); setTarget(nextTarget);
    current.current = getActiveDocument(next, nextTarget);
  }, []);
  const activate = useCallback((next: SiteDocument, nextTarget = next.homePageId, resetHistory = true) => {
    install(next, nextTarget);
    if (resetHistory) { setPast([]); setFuture([]); aiRun.current = ''; }
  }, [install]);
  const updateSite = useCallback((next: SiteDocument, nextTarget = targetRef.current) => {
    const previous = siteRef.current, previousTarget = targetRef.current;
    if (isLocked() || !previous || JSON.stringify(previous) === JSON.stringify(next)) return;
    setPast(history => [...history.slice(-79), { site: previous, target: previousTarget }]); setFuture([]);
    install(next, nextTarget);
  }, [install, isLocked]);
  const update = useCallback((next: PageDocument) => {
    const previous = siteRef.current;
    if (previous) updateSite(replaceActiveDocument(previous, targetRef.current, next));
  }, [updateSite]);
  const commit = useCallback((next: PageDocument, runId: string) => {
    const previous = siteRef.current, previousTarget = targetRef.current;
    if (!previous || current.current?.id !== next.id) throw new Error('页面已切换，AI 已暂停。');
    if (aiRun.current !== runId) {
      aiRun.current = runId; aiBases.current.add(previous);
      setPast(history => [...history.slice(-79), { site: previous, target: previousTarget }]); setFuture([]);
    }
    install(replaceActiveDocument(previous, previousTarget, next), previousTarget);
  }, [install]);
  const selectTarget = useCallback((next: string) => {
    if (isLocked() || !siteRef.current || !getActiveDocument(siteRef.current, next)) return false;
    install(siteRef.current, next); setPast([]); setFuture([]); return true;
  }, [install, isLocked]);
  const undo = useCallback(() => {
    if (isLocked() || !past.length || !siteRef.current) return null;
    const previous = past[past.length - 1], outgoing = { site: siteRef.current, target: targetRef.current };
    setFuture(items => [outgoing, ...items]);
    setPast(items => items.slice(0, -1)); install(previous.site, previous.target);
    return aiBases.current.has(previous.site) ? 'ai' : 'edit';
  }, [past, install, isLocked]);
  const redo = useCallback(() => {
    if (isLocked() || !future.length || !siteRef.current) return;
    const next = future[0], outgoing = { site: siteRef.current, target: targetRef.current };
    setPast(items => [...items, outgoing]);
    setFuture(items => items.slice(1)); install(next.site, next.target);
  }, [future, install, isLocked]);
  return { site, document, target, siteRef, targetRef, current, past, future, activate, update, updateSite, commit, selectTarget, undo, redo };
}
