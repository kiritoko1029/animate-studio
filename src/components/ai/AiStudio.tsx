import { useEffect, useRef, useState } from 'react';
import { Cloud, Code2, Plus, Puzzle } from 'lucide-react';
import { t, translateMessage } from '../../i18n';
import { createDocument, type Block, type PageDocument } from '../../model';
import type { CustomComponentDefinition, CustomComponentSource } from '../../../shared/custom-components.mjs';
import { readAiSessions } from '../../lib/ai/storage';
import { readComponentUploads, rememberComponentUpload, type AiComponentUpload } from '../../lib/ai/component-uploads';
import type { AiLibraryComponent } from '../../lib/ai/types';
import { definitionFromInstance, snapshotDefinition } from '../../lib/custom-components/instances';
import { getLocalComponent } from '../../lib/custom-components/library';
import { useLibrary } from '../custom/useCustomLibrary';
import type { DesignerRequest } from '../custom/ComponentDesigner';
import { FreePage } from '../PageRenderer';
import { StudioButton } from '../StudioUI';
import { AiAssistant, type AiAssistantProps } from './AiAssistant';

export type AiComponentRequest = { sequence: number; owner: string; kind: 'local' | 'cloud'; folderId: string | null };
type Props = AiAssistantProps & {
  pageRequest?: number;
  componentRequest?: AiComponentRequest | null;
  onAddComponent: (definition: CustomComponentDefinition, source: CustomComponentSource) => boolean;
  onOpenDesigner: (request: DesignerRequest) => void;
  onRequestLogin: () => void;
};
function emptyComponentPage(): PageDocument {
  const page = createDocument(true); page.name = t('AI 组件创作'); return page;
}
function restoreComponentPage(owner: string): PageDocument {
  try { return readAiSessions(owner).find(session => session.mode === 'component')?.page ?? emptyComponentPage(); }
  catch { return emptyComponentPage(); }
}

/** A separate component draft lets AI develop reusable code without replacing the user's page. */
export function AiStudio(props: Props) {
  const library = useLibrary();
  const [mode, setMode] = useState<'page' | 'component'>('page');
  const [componentPage, setComponentPage] = useState(() => restoreComponentPage(props.owner));
  const current = useRef(componentPage); current.current = componentPage;
  const [openRequest, setOpenRequest] = useState(0), [running, setRunning] = useState(false);
  const [uploads, setUploads] = useState<Record<string, AiComponentUpload>>(() => { try { return readComponentUploads(props.owner); } catch { return {}; } });
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [targetFolder, setTargetFolder] = useState<Pick<AiComponentRequest, 'kind' | 'folderId'>>({ kind: 'local', folderId: null });
  useEffect(() => { const page = restoreComponentPage(props.owner); current.current = page; setComponentPage(page); setTargetFolder({ kind: 'local', folderId: null }); }, [props.owner]);
  useEffect(() => {
    if (!props.pageRequest) return;
    setMode('page'); setOpenRequest(value => value + 1);
  }, [props.pageRequest]);
  useEffect(() => {
    const request = props.componentRequest;
    if (!request || request.owner !== props.owner) return;
    const page = emptyComponentPage(); current.current = page; setComponentPage(page);
    setTargetFolder(request); setMode('component'); setOpenRequest(request.sequence);
  }, [props.componentRequest?.sequence]);
  const catalog = (): AiLibraryComponent[] => [
    ...library.local.components.map(item => ({ ref: { kind: 'local' as const, id: item.id }, name: item.name, description: item.description, fields: item.fields, size: item.size })),
    ...library.cloud.items.map(item => ({ ref: { kind: 'cloud' as const, id: item.id }, name: item.name, description: item.description })),
  ];
  const shared: Partial<AiAssistantProps> = {
    creationMode: mode, initiallyOpen: openRequest > 0, openRequest,
    onOpenChange: open => { if (open && props.signedIn) library.ensureCloud(); },
    onCreationModeChange: next => { if (!running) { setMode(next); setOpenRequest(value => value + 1); } },
    onRunningChange: value => { setRunning(value); props.onRunningChange(value); },
    getComponents: catalog,
    resolveComponent: async ref => {
      if (ref.kind === 'local') {
        const record = getLocalComponent(ref.id);
        if (!record) throw new Error(t('这个组件已被删除。'));
        return snapshotDefinition(record, { kind: 'local', id: record.id, revision: record.revision });
      }
      const record = await library.loadCloud(ref.id);
      return snapshotDefinition(record.component, { kind: 'cloud', id: record.id, revision: record.revision });
    },
    prepareCustom: (page, before, op) => {
      const block = page.blocks.find(item => item.id === op.id);
      if (!block || block.type !== 'custom') return page;
      const definition = definitionFromInstance(block)!;
      const source = before.blocks.find(item => item.id === op.id)?.props.custom?.source;
      const record = library.saveAi(definition, `${page.id}:${block.id}`, source, !source && mode === 'component' && targetFolder.kind === 'local' ? targetFolder.folderId : undefined);
      return { ...page, blocks: page.blocks.map(item => item.id === block.id ? { ...item, props: { ...item.props, custom: snapshotDefinition(definition, { kind: 'local', id: record.id, revision: record.revision }) } } : item) };
    },
  };
  const setDraft = (page: PageDocument) => { current.current = page; setComponentPage(page); };
  const recordUpload = (target: string, upload: AiComponentUpload) => {
    if (active.current) setUploads(values => ({ ...values, [target]: upload }));
    rememberComponentUpload(props.owner, target, upload);
  };
  return <AiAssistant key={`${props.owner}:${mode}`} {...props} {...shared}
    {...(mode === 'component' ? {
      page: componentPage, cloudPageId: null, selectedBlockIds: [],
      getPage: () => current.current,
      getSurface: () => null, onRevealBlock: () => {},
      onCommit: (page: PageDocument) => setDraft(page), onRestorePage: setDraft,
      onOpenLocal: async (page: PageDocument) => setDraft(page),
      onOpenCloud: async () => {},
      onCreatePage: async () => { setDraft(emptyComponentPage()); return true; },
      componentResult: <div className="ai-component-results">{componentPage.blocks.filter(block => block.type === 'custom').map(block => <ComponentResult key={`${props.owner}:${componentPage.id}:${block.id}`} block={block} page={componentPage} owner={props.owner} signedIn={props.signedIn} cloudFolderId={targetFolder.kind === 'cloud' ? targetFolder.folderId : null} uploaded={uploads[`${componentPage.id}:${block.id}`]} onUploaded={upload => recordUpload(`${componentPage.id}:${block.id}`, upload)} onAdd={props.onAddComponent} onEdit={props.onOpenDesigner} onRequestLogin={props.onRequestLogin}/>)}</div>,
    } : {})}/>;
}

function ComponentResult({ block, page, owner, signedIn, cloudFolderId, uploaded, onUploaded, onAdd, onEdit, onRequestLogin }: {
  block: Block; page: PageDocument; owner: string; signedIn: boolean; cloudFolderId: string | null;
  onAdd: Props['onAddComponent']; onEdit: Props['onOpenDesigner']; onRequestLogin: Props['onRequestLogin'];
  uploaded?: AiComponentUpload; onUploaded: (upload: AiComponentUpload) => void;
}) {
  const library = useLibrary();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const live = useRef(true), currentOwner = useRef(owner); currentOwner.current = owner;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const definition = definitionFromInstance(block)!;
  const source = block.props.custom!.source;
  const localKey = source ? `${source.kind}:${source.id}:${source.revision}` : null;
  const size = definition.size ?? { width: 360, height: 240 };
  const preview = { ...page, settings: { ...page.settings, padding: 0, maxWidth: size.width, canvasHeight: size.height }, blocks: [{ ...block, frame: { x: 0, y: 0, ...size } }] };
  const saved = source?.kind === 'local' ? library.findLocal(source.id) : null;
  const matching = source?.kind === 'cloud' || saved && saved.revision === source?.revision;
  async function upload() {
    if (!signedIn) { onRequestLogin(); return; }
    if (busy) return;
    const expectedOwner = owner; setBusy(true); setError('');
    try {
      const record = uploaded ? await library.updateCloud(uploaded.id, definition, uploaded.revision) : await library.createCloud(definition, cloudFolderId);
      if (currentOwner.current === expectedOwner) onUploaded({ id: record.id, revision: record.revision, localKey, updatedAt: Date.now() });
    } catch (failure) { if (live.current && currentOwner.current === expectedOwner) setError(failure instanceof Error ? failure.message : t('上传失败，本机组件仍保留。')); }
    finally { if (live.current && currentOwner.current === expectedOwner) setBusy(false); }
  }
  return <article className="ai-component-result">
    <strong><Puzzle size={14}/>{definition.name}</strong>
    <div className="ai-component-preview"><FreePage document={preview}/></div>
    <small>{t(matching ? '已保存到“我的组件”' : '生成结果已保存在对话检查点中')}</small>
    <div className="ai-component-actions">
      <StudioButton className="secondary-button" disabled={!source || busy} onClick={() => source && onAdd(definition, source)}><Plus size={12}/>{t('添加到页面')}</StudioButton>
      <StudioButton className="secondary-button" disabled={busy} onClick={() => onEdit({ target: matching && source ? { kind: source.kind, id: source.id } : null, definition, revision: matching && source ? source.revision : null, origin: 'ai' })}><Code2 size={12}/>{t('编辑代码')}</StudioButton>
      <StudioButton className="secondary-button" disabled={busy || source?.kind === 'cloud' || !!localKey && uploaded?.localKey === localKey} onClick={() => void upload()}><Cloud size={12}/>{t(busy ? '上传中…' : source?.kind === 'cloud' || !!localKey && uploaded?.localKey === localKey ? '已保存到云端' : uploaded ? '更新云端组件' : '上传到云端')}</StudioButton>
    </div>
    {error && <p className="ai-error" role="alert">{translateMessage(error)}</p>}
  </article>;
}
