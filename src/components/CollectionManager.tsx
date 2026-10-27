import { useEffect, useState } from 'react';
import { Copy, Database, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import type { SiteDocument } from '../../shared/site-document.mjs';
import { validateDataSources, type DataSource } from '../../shared/data-sources.mjs';
import type { CollectionField, CollectionRecord } from '../../shared/collections.mjs';
import type { Block } from '../model';
import { t } from '../i18n';
import { MediaField } from './MediaField';
import { StudioButton } from './StudioUI';
import '../collection-manager.css';

export type CollectionSource = DataSource & { kind: 'collection'; fields: CollectionField[]; records: CollectionRecord[] };
function isCollectionSource(source: DataSource): source is CollectionSource { return source.kind === 'collection' && Array.isArray(source.fields) && Array.isArray(source.records); }
function createCollection(sources: DataSource[]): CollectionSource {
  let index = sources.length + 1, id = `collection${index}`;
  while (sources.some(source => source.id === id)) id = `collection${++index}`;
  return { id, name: t('内容集合'), kind: 'collection', mode: 'collection', fields: [{ key: 'title', label: t('标题'), type: 'text' }, { key: 'text', label: t('正文'), type: 'longText' }, { key: 'cover', label: t('封面图'), type: 'image' }], records: [{ id: 'example', values: { title: t('第一条内容'), text: t('可以直接在这里维护内容。'), cover: '' } }], pageSize: 5 };
}
function emptyRecord(fields: CollectionField[], id = `record-${crypto.randomUUID().slice(0, 8)}`): CollectionRecord {
  return { id, values: Object.fromEntries(fields.map(field => [field.key, field.type === 'number' ? 0 : field.type === 'boolean' ? false : ''])) };
}
function sourceReferences(site: SiteDocument, id: string, field?: string) {
  const references: string[] = [];
  const visit = (block: Block, name: string) => {
    if ((block.props.sourceId === id || block.props.submitSourceId === id) && (!field || JSON.stringify(block.props).includes(field))) references.push(`${name} / ${block.type}`);
    for (const child of block.children ?? []) visit(child, name);
  };
  for (const entry of site.pages) for (const block of entry.page.blocks) visit(block, entry.name);
  for (const [region, page] of Object.entries(site.sharedLayout)) for (const block of page.blocks) visit(block, region);
  return references;
}
export function CollectionManager({ site, onChange }: { site: SiteDocument; onChange: (site: SiteDocument) => void }) {
  const sources = (site.dataSources ?? []).filter(isCollectionSource);
  const [selected, setSelected] = useState(sources[0]?.id ?? '');
  const source = sources.find(item => item.id === selected) ?? sources[0];
  const [draft, setDraft] = useState<CollectionSource | null>(source ? structuredClone(source) : null);
  const [recordId, setRecordId] = useState(''), [record, setRecord] = useState<CollectionRecord | null>(null);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [fieldKey, setFieldKey] = useState(''), [fieldLabel, setFieldLabel] = useState(''), [fieldType, setFieldType] = useState<CollectionField['type']>('text');
  const [fieldOpen, setFieldOpen] = useState(false);
  useEffect(() => { const next = source ? structuredClone(source) : null, first = next?.records[0]; setDraft(next); setRecordId(first?.id ?? ''); setRecord(first ? structuredClone(first) : null); }, [source?.id]);
  const dirty = !!record && JSON.stringify(record) !== JSON.stringify(draft?.records.find(item => item.id === record.id));
  const sourceDirty = !!draft && JSON.stringify(draft) !== JSON.stringify(source);
  const discard = () => !dirty || window.confirm(t('当前记录尚未应用，确定放弃这次修改吗？'));
  const discardSource = () => !sourceDirty && !dirty || window.confirm(t('当前集合有未应用的修改，确定放弃吗？'));
  const startCollection = () => {
    if (!discardSource()) return;
    const next = createCollection(site.dataSources ?? []);
    setSelected(next.id); setDraft(next); setRecordId(next.records[0].id); setRecord(structuredClone(next.records[0])); setMessage(''); setError('');
  };
  const selectSource = (id: string) => {
    if (!discardSource()) return;
    const next = sources.find(item => item.id === id), first = next?.records[0];
    setSelected(id); setDraft(next ? structuredClone(next) : null); setRecordId(first?.id ?? ''); setRecord(first ? structuredClone(first) : null); setMessage(''); setError('');
  };
  const selectRecord = (id: string) => { if (discard()) { setRecordId(id); setRecord(structuredClone(draft?.records.find(item => item.id === id) ?? null)); } };
  const changeSource = (patch: Partial<CollectionSource>) => { setDraft(current => current ? { ...current, ...patch } : current); setMessage(''); setError(''); };
  const changeRecord = (patch: Partial<CollectionRecord>) => { setRecord(current => current ? { ...current, ...patch } : current); setMessage(''); setError(''); };
  const save = () => {
    if (!draft) return;
    try {
      const next: CollectionSource = { ...draft, records: record ? [...draft.records.filter(item => item.id !== record.id), record] : draft.records };
      const nextSources = validateDataSources([...(site.dataSources ?? []).filter(item => item.id !== next.id), next]);
      onChange({ ...site, dataSources: nextSources });
      setDraft(structuredClone(next)); setRecordId(record?.id ?? next.records[0]?.id ?? ''); setRecord(record ? structuredClone(record) : null);
      setSelected(next.id); setMessage(t('内容已应用，正在自动保存站点，可撤销。')); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('内容或字段设置无效。')); }
  };
  const addRecord = () => {
    if (!draft || draft.records.length >= 500 || !discard()) return;
    const next = emptyRecord(draft.fields); setRecordId(next.id); setRecord(next); setMessage(''); setError('');
  };
  const duplicateRecord = () => {
    if (!record || !draft || draft.records.length >= 500 || !discard()) return;
    let id = `${record.id}-copy`, index = 2;
    while (draft.records.some(item => item.id === id)) id = `${record.id}-copy-${index++}`;
    setRecordId(id); setRecord({ ...structuredClone(record), id }); setMessage(''); setError('');
  };
  const removeRecord = () => {
    if (!record || !window.confirm(t('删除这条内容？可在应用前通过撤销恢复。'))) return;
    changeSource({ records: draft!.records.filter(item => item.id !== record.id) }); setRecordId(''); setRecord(null); setMessage(t('记录已移除，点击“应用内容”确认保存。'));
  };
  const addField = () => {
    if (!draft || !fieldKey.trim() || !fieldLabel.trim()) { setError(t('请填写字段 key 和显示名称。')); return; }
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(fieldKey.trim()) || ['constructor', 'prototype'].includes(fieldKey.trim()) || draft.fields.some(field => field.key === fieldKey.trim())) { setError(t('字段 key 需以字母开头、仅含字母数字或下划线，且不能重复。')); return; }
    changeSource({ fields: [...draft.fields, { key: fieldKey.trim(), label: fieldLabel.trim(), type: fieldType }] });
    setFieldKey(''); setFieldLabel(''); setFieldType('text'); setFieldOpen(false); setError('');
  };
  const removeField = (key: string) => {
    if (!draft || draft.fields.length <= 1) return;
    if (draft.detailField === key || sourceReferences(site, draft.id, key).length) { setError(t('该字段仍被组件映射或详情设置使用，请先解除引用。')); return; }
    changeSource({ fields: draft.fields.filter(field => field.key !== key), records: draft.records.map(item => ({ ...item, values: Object.fromEntries(Object.entries(item.values).filter(([name]) => name !== key)) })) });
    if (record) changeRecord({ values: Object.fromEntries(Object.entries(record.values).filter(([name]) => name !== key)) });
  };
  const removeSource = () => {
    if (!draft) return;
    const references = sourceReferences(site, draft.id);
    if (references.length && !window.confirm(t('这个集合被 {0} 个组件使用：\n{1}\n删除后将解除这些组件的绑定。', { 0: references.length, 1: references.join('\n') }))) return;
    const clean = (block: Block): Block => ({ ...block, props: { ...block.props, ...(block.props.sourceId === draft.id ? { sourceId: '' } : {}), ...(block.props.submitSourceId === draft.id ? { submitSourceId: '' } : {}) }, ...(block.children ? { children: block.children.map(clean) } : {}) });
    onChange({ ...site, dataSources: (site.dataSources ?? []).filter(item => item.id !== draft.id), pages: site.pages.map(entry => ({ ...entry, page: { ...entry.page, blocks: entry.page.blocks.map(clean) } })), sharedLayout: Object.fromEntries(Object.entries(site.sharedLayout).map(([region, page]) => [region, { ...page, blocks: page.blocks.map(clean) }])) });
    setDraft(null); setSelected(''); setRecord(null); setMessage(t('集合已删除，相关组件已解除绑定。'));
  };
  if (!draft) return <div className="collection-empty" role="tabpanel" id="logic-panel" aria-labelledby="logic-tab-collections"><Database size={30}/><h3>{t('用内容集合维护站点内容')}</h3><p>{t('添加字段和记录后，可绑定动态列表、表格、详情和图表。无需编辑 JSON。')}</p><StudioButton className="primary-button" disabled={(site.dataSources ?? []).length >= 20} onClick={startCollection}><Plus size={14}/>{t('新建内容集合')}</StudioButton></div>;
  const fields = draft.fields, limitReached = (site.dataSources ?? []).length >= 20;
  const fieldTypes = <><option value="text">{t('单行文本')}</option><option value="longText">{t('多行文本')}</option><option value="number">{t('数字')}</option><option value="boolean">{t('布尔值')}</option><option value="url">{t('链接')}</option><option value="image">{t('图片')}</option></>;
  return <div className="collection-manager" role="tabpanel" id="logic-panel" aria-labelledby="logic-tab-collections">
    <div className="collection-intro"><div><Database size={18}/><h3>{t('内容集合')}</h3></div><p>{t('用字段和记录维护内容，再绑定到页面组件。编辑后点击“应用内容”，可撤销。')}</p></div>
    <div className="collection-source-row"><label><span>{t('内容集合')}</span><select aria-label={t('内容集合')} value={selected} onChange={event => selectSource(event.target.value)}><option value="">{t('选择集合')}</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><StudioButton disabled={limitReached} onClick={startCollection}><Plus size={13}/>{t('新建集合')}</StudioButton></div>
    <div className="collection-source-settings"><label><span>{t('集合名称')}</span><input aria-label={t('集合名称')} maxLength={80} value={draft.name} onChange={event => changeSource({ name: event.target.value })}/></label><label><span>{t('集合用途')}</span><select aria-label={t('集合用途')} value={draft.mode} onChange={event => changeSource({ mode: event.target.value as DataSource['mode'] })}><option value="collection">{t('记录列表')}</option><option value="single">{t('单条详情')}</option></select></label><label><span>{t('每页条数')}</span><input aria-label={t('集合每页条数')} type="number" min={1} max={100} value={draft.pageSize ?? 5} onChange={event => changeSource({ pageSize: Number(event.target.value) })}/></label></div>
    {draft.mode === 'single' && <div className="collection-source-settings"><label><span>{t('详情匹配字段')}</span><select aria-label={t('详情匹配字段')} value={draft.detailField ?? 'id'} onChange={event => changeSource({ detailField: event.target.value })}><option value="id">{t('记录 ID')}</option>{fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label><span>{t('详情路由参数')}</span><input aria-label={t('详情路由参数')} value={draft.detailParameter ?? 'id'} onChange={event => changeSource({ detailParameter: event.target.value })}/><small>{t('使用 {0} 查找记录，不匹配时显示提示。', { 0: `{{route.${draft.detailParameter ?? 'id'}}}` })}</small></label></div>}
    <details className="collection-fields"><summary><Settings2 size={13}/>{t('字段设置')}<span>{fields.length}/20</span></summary><div className="collection-field-list">{fields.map(field => <div className="collection-field-row" key={field.key}><code>{field.key}</code><input aria-label={t('字段名称 {0}', { 0: field.key })} value={field.label} maxLength={80} onChange={event => changeSource({ fields: fields.map(item => item.key === field.key ? { ...item, label: event.target.value } : item) })}/><select aria-label={t('字段类型 {0}', { 0: field.key })} value={field.type} onChange={event => changeSource({ fields: fields.map(item => item.key === field.key ? { ...item, type: event.target.value as CollectionField['type'] } : item) })}>{fieldTypes}</select><StudioButton aria-label={t('删除字段 {0}', { 0: field.key })} disabled={fields.length <= 1} onClick={() => removeField(field.key)}><Trash2 size={12}/></StudioButton></div>)}</div>{fieldOpen ? <div className="collection-new-field"><input aria-label={t('新字段 key')} placeholder={t('英文 key，如 summary')} value={fieldKey} onChange={event => setFieldKey(event.target.value)}/><input aria-label={t('新字段名称')} placeholder={t('显示名称')} value={fieldLabel} onChange={event => setFieldLabel(event.target.value)}/><select aria-label={t('新字段类型')} value={fieldType} onChange={event => setFieldType(event.target.value as CollectionField['type'])}>{fieldTypes}</select><StudioButton disabled={fields.length >= 20} onClick={addField}><Plus size={12}/>{t('添加字段')}</StudioButton></div> : <StudioButton disabled={fields.length >= 20} onClick={() => setFieldOpen(true)}><Plus size={12}/>{t('添加字段')}</StudioButton>}</details>
    <div className="collection-record-heading"><h4>{t('内容记录')} <span>{draft.records.length + Number(dirty && !draft.records.some(item => item.id === record?.id))}/500</span></h4><StudioButton disabled={draft.records.length >= 500} onClick={addRecord}><Plus size={13}/>{t('新增记录')}</StudioButton></div>
    <div className="collection-record-tabs" role="list" aria-label={t('内容记录列表')}>{draft.records.map(item => <StudioButton key={item.id} role="listitem" aria-pressed={recordId === item.id} className={recordId === item.id ? 'active' : ''} onClick={() => selectRecord(item.id)}>{String(item.values.title ?? item.id)}</StudioButton>)}</div>
    {record ? <section className="collection-record-editor"><div className="collection-record-id"><code>{record.id}</code><StudioButton disabled={draft.records.length >= 500} aria-label={t('复制当前记录')} onClick={duplicateRecord}><Copy size={13}/>{t('复制')}</StudioButton><StudioButton className="danger" aria-label={t('删除当前记录')} onClick={removeRecord}><Trash2 size={13}/>{t('删除')}</StudioButton></div>{!draft.records.some(item => item.id === record.id) && <label className="collection-field"><span>{t('记录 ID')}</span><input aria-label={t('记录 ID')} value={record.id} maxLength={100} onChange={event => changeRecord({ id: event.target.value })}/></label>}{fields.map(field => <div key={field.key}>{field.type === 'longText' ? <label className="collection-field"><span>{field.label}<code>{field.key}</code></span><textarea aria-label={t('记录字段 {0}', { 0: field.label })} rows={4} maxLength={10000} value={String(record.values[field.key] ?? '')} onChange={event => changeRecord({ values: { ...record.values, [field.key]: event.target.value } })}/></label> : field.type === 'boolean' ? <label className="collection-field collection-boolean"><span>{field.label}</span><select aria-label={t('记录字段 {0}', { 0: field.label })} value={String(record.values[field.key] ?? false)} onChange={event => changeRecord({ values: { ...record.values, [field.key]: event.target.value === 'true' } })}><option value="false">{t('否')}</option><option value="true">{t('是')}</option></select></label> : field.type === 'image' ? <MediaField label={field.label} ariaLabel={t('记录字段 {0}', { 0: field.label })} value={String(record.values[field.key] ?? '')} onChange={value => changeRecord({ values: { ...record.values, [field.key]: value } })}/> : <label className="collection-field"><span>{field.label}<code>{field.key}</code></span><input aria-label={t('记录字段 {0}', { 0: field.label })} type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'} value={String(record.values[field.key] ?? '')} onChange={event => changeRecord({ values: { ...record.values, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value } })}/></label>}</div>)}</section> : <div className="collection-record-empty"><p>{t(draft.records.length ? '选择一条记录继续编辑。' : '先新增一条内容记录。')}</p><StudioButton disabled={draft.records.length >= 500} onClick={addRecord}><Plus size={13}/>{t('新增记录')}</StudioButton></div>}
    {(error || message) && <p className={error ? 'collection-error' : 'collection-message'} role={error ? 'alert' : 'status'}>{error || message}</p>}
    <div className="collection-actions"><StudioButton className="primary-button" disabled={!sourceDirty && !dirty} onClick={save}><Save size={13}/>{t('应用内容')}</StudioButton><StudioButton className="danger" onClick={removeSource}><Trash2 size={13}/>{t('删除集合')}</StudioButton></div>
  </div>;
}
