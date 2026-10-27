import { useEffect, useState } from 'react';
import { Check, Database, Link2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import type { SiteDocument } from '../../shared/site-document.mjs';
import { inferDataFields, validateDataSource, validateDataSources, type DataField, type DataSource } from '../../shared/data-sources.mjs';
import type { JsonValue } from '../lib/interactions/types';
import { requestDataSource } from '../lib/data/runtime';
import { useAccount } from './AccountProvider';
import { StudioButton } from './StudioUI';
import { DraftInput } from './InteractionControls';
import type { CredentialMetadata } from '../lib/data/credentials';
import './data-source-manager.css';

function createSource(sources: DataSource[], kind: DataSource['kind']): DataSource {
  let id = kind === 'static' ? 'items' : 'books', index = 2;
  while (sources.some(source => source.id === id)) id = `${kind === 'static' ? 'items' : 'books'}${index++}`;
  return kind === 'static' ? { id, name: '静态示例', kind, mode: 'collection', items: [{ id: 'example', title: '第一条记录', text: '可以在列表中选择这些字段。' }], pageSize: 5 } : { id, name: '公开 REST 数据', kind, mode: 'collection', url: 'https://api.example.com/books', method: 'GET', responsePath: '', pageSize: 5, timeoutMs: 10000, transport: 'direct' };
}
function sourceReferences(site: SiteDocument, id: string) {
  const references: string[] = [];
  const documents = [...site.pages.map(entry => [entry.name, entry.page] as const), ...Object.values(site.sharedLayout).map(page => ['共享布局', page] as const)];
  const visit = (block: import('../model').Block, page: string) => {
    if (block.props.sourceId === id || block.props.submitSourceId === id) references.push(`${page} / ${block.type}`);
    for (const child of block.children ?? []) visit(child, page);
  };
  for (const [name, page] of documents) for (const block of page.blocks) visit(block, name);
  return references;
}
export function DataSourceManager({ site, onChange, dataPageId }: { site: SiteDocument; onChange: (site: SiteDocument) => void; dataPageId?: string }) {
  const sources = site.dataSources ?? [];
  const [selected, setSelected] = useState(sources[0]?.id ?? ''), [draft, setDraft] = useState<DataSource | null>(sources[0] ? structuredClone(sources[0]) : null);
  const [testing, setTesting] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [fields, setFields] = useState<DataField[]>([]), [sample, setSample] = useState<JsonValue | null>(null);
  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]), [secret, setSecret] = useState('');
  const [credentialName, setCredentialName] = useState(''), [credentialHost, setCredentialHost] = useState(''), [credentialKind, setCredentialKind] = useState<'bearer' | 'api-key'>('bearer');
  const { user } = useAccount();
  const loadCredentials = async (signal?: AbortSignal) => {
    if (!user) { setCredentials([]); return; }
    try { const response = await fetch('/api/account/data/credentials', { signal }); const body = await response.json(); if (response.ok && Array.isArray(body.credentials)) setCredentials(body.credentials); }
    catch (cause) { if ((cause as Error).name !== 'AbortError') setError('凭据列表暂时不可用。'); }
  };
  useEffect(() => { const controller = new AbortController(); void loadCredentials(controller.signal); return () => controller.abort(); }, [user?.id]);
  const select = (id: string) => { const source = sources.find(item => item.id === id); setSelected(id); setDraft(source ? structuredClone(source) : null); setFields([]); setSample(null); setMessage(''); setError(''); };
  const change = (patch: Partial<DataSource>) => { setDraft(previous => previous ? { ...previous, ...patch } : previous); setFields([]); setSample(null); setMessage(''); setError(''); };
  const save = () => {
    if (!draft) return;
    try { const next = validateDataSources([...sources.filter(source => source.id !== draft.id), draft]); onChange({ ...site, dataSources: next }); setSelected(draft.id); setMessage('数据源已保存，正在自动保存站点。'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '数据源配置无效。'); }
  };
  const test = async () => {
    if (!draft) return;
    setTesting(true); setError(''); setMessage(''); setFields([]);
    try {
      validateDataSource(draft);
      if (draft.kind === 'rest' && (draft.method ?? 'GET') !== 'GET') throw new Error('测试连接只执行公开 GET。写入配置会在实际表单提交并确认后执行。');
      const value = await requestDataSource(draft, { context: { route: { id: 'example' }, state: {}, form: {} }, access: { scope: 'editor', pageId: dataPageId } });
      const first = Array.isArray(value) ? value[0] : value;
      setSample(first ?? null); setFields(inferDataFields(first));
      setMessage(Array.isArray(value) ? `连接成功，返回 ${value.length} 条记录。` : '连接成功，已读取详情对象。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '连接失败，请检查配置。'); }
    finally { setTesting(false); }
  };
  const remove = (clear: boolean) => {
    if (!draft) return;
    const references = sourceReferences(site, draft.id);
    if (references.length && !window.confirm(`这个数据源被 ${references.length} 个组件使用：\n${references.join('\n')}\n${clear ? '将同时解除这些组件的绑定。' : '将保留为未绑定组件，之后可重新选择数据源。'}`)) return;
    const clean = (block: import('../model').Block): import('../model').Block => ({ ...block, props: { ...block.props, ...(clear && block.props.sourceId === draft.id ? { sourceId: '' } : {}), ...(clear && block.props.submitSourceId === draft.id ? { submitSourceId: '' } : {}) }, ...(block.children ? { children: block.children.map(clean) } : {}) });
    onChange({ ...site, dataSources: sources.filter(source => source.id !== draft.id), pages: clear ? site.pages.map(entry => ({ ...entry, page: { ...entry.page, blocks: entry.page.blocks.map(clean) } })) : site.pages, sharedLayout: clear ? Object.fromEntries(Object.entries(site.sharedLayout).map(([key, page]) => [key, { ...page, blocks: page.blocks.map(clean) }])) : site.sharedLayout });
    setDraft(null); setSelected(''); setFields([]); setSample(null); setMessage('数据源已删除。');
  };
  const json = (key: 'items' | 'headers' | 'query' | 'body', value: string) => { try { change({ [key]: value.trim() ? JSON.parse(value) : key === 'items' ? [] : undefined }); setError(''); } catch { setError('JSON 格式无效，请检查引号、逗号和括号。'); } };
  const addCredential = async () => {
    setError('');
    try {
      const response = await fetch('/api/account/data/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: credentialName, kind: credentialKind, allowedHosts: credentialHost.split(/[,\n]/).map(value => value.trim()).filter(Boolean), secret }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || '凭据保存失败。');
      setCredentials(items => [...items, body]); change({ credentialId: body.id, transport: 'proxy' }); setSecret(''); setCredentialName(''); setCredentialHost(''); setMessage('凭据已安全保存。页面中只保留引用，不保存密钥。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '凭据保存失败。'); }
  };
  const deleteCredential = async (id: string) => {
    if (!window.confirm('删除这个凭据？引用它的数据源将无法再读取，请随后关联新的凭据。')) return;
    const response = await fetch(`/api/account/data/credentials/${id}`, { method: 'DELETE' });
    if (!response.ok) { setError('凭据删除失败，请稍后重试。'); return; }
    setCredentials(items => items.filter(item => item.id !== id)); if (draft?.credentialId === id) change({ credentialId: undefined });
  };
  return <div className="data-source-manager" role="tabpanel" id="logic-panel" aria-labelledby="logic-tab-sources">
    <div className="data-source-intro"><div><Database size={18}/><h3>站点数据源</h3></div><p>粘贴接口 → 测试并连接 → 在组件中选择字段。列表与详情可共用这里的数据源。</p><div className="data-source-actions"><StudioButton disabled={sources.length >= 20} onClick={() => { const source = createSource(sources, 'rest'); setDraft(source); setSelected(source.id); setFields([]); setSample(null); }}><Link2 size={13}/>公开 REST</StudioButton><StudioButton disabled={sources.length >= 20} onClick={() => { const source = createSource(sources, 'static'); setDraft(source); setSelected(source.id); setFields([]); setSample(null); }}><Plus size={13}/>静态 JSON</StudioButton></div></div>
    {!!sources.length && <label className="data-source-field"><span>已保存的数据源</span><select aria-label="已保存的数据源" value={sources.some(source => source.id === selected) ? selected : ''} onChange={event => select(event.target.value)}><option value="">新建或未保存的配置</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name} · {source.id}</option>)}</select></label>}
    {draft ? <>
      <div className="data-source-grid"><label className="data-source-field"><span>名称</span><input aria-label="数据源名称" maxLength={80} value={draft.name} onChange={event => change({ name: event.target.value })}/></label><label className="data-source-field"><span>返回内容</span><select aria-label="返回内容" value={draft.mode} onChange={event => change({ mode: event.target.value as DataSource['mode'], ...(draft.kind === 'static' ? { items: event.target.value === 'collection' ? [] : {} } : {}) })}><option value="collection">记录数组（列表）</option><option value="single">单个对象（详情）</option></select></label></div>
      {draft.kind === 'static' ? <DraftInput label="静态 JSON 数据" multiline value={JSON.stringify(draft.items ?? [], null, 2)} onCommit={value => json('items', value)}/> : <>
        <label className="data-source-field"><span>接口地址</span><input aria-label="接口地址" value={draft.url ?? ''} onChange={event => change({ url: event.target.value })} placeholder="https://api.example.com/books 或 /books/{{route.id}}"/><small>详情路径可写 {'{{route.id}}'}；不要在这里填写密钥。</small></label>
        <div className="data-source-grid"><label className="data-source-field"><span>请求方法</span><select aria-label="请求方法" value={draft.method ?? 'GET'} onChange={event => change({ method: event.target.value as DataSource['method'], ...(event.target.value === 'GET' ? { body: undefined } : { body: draft.body ?? {} }) })}>{['GET', 'POST', 'PUT', 'PATCH'].map(method => <option key={method}>{method}</option>)}</select></label><label className="data-source-field"><span>响应路径（可选）</span><input aria-label="响应路径" value={draft.responsePath ?? ''} onChange={event => change({ responsePath: event.target.value })} placeholder="data.items"/></label><label className="data-source-field"><span>每页条数</span><input aria-label="每页条数" type="number" min={1} max={100} value={draft.pageSize ?? 5} onChange={event => change({ pageSize: Number(event.target.value) })}/></label><label className="data-source-field"><span>超时（毫秒）</span><input aria-label="超时（毫秒）" type="number" min={100} max={15000} value={draft.timeoutMs ?? 10000} onChange={event => change({ timeoutMs: Number(event.target.value) })}/></label></div>
        <details className="data-source-advanced"><summary>请求与凭据（高级）</summary><label className="data-source-field"><span>读取方式</span><select aria-label="读取方式" value={draft.transport ?? 'direct'} onChange={event => change({ transport: event.target.value as DataSource['transport'], ...(event.target.value === 'direct' ? { credentialId: undefined } : {}) })}><option value="direct">浏览器直接请求（接口需允许 CORS）</option><option value="proxy">服务端受控代理（需先保存站点）</option></select></label><div className="data-source-grid"><DraftInput label="查询参数 JSON" multiline value={JSON.stringify(draft.query ?? {}, null, 2)} onCommit={value => json('query', value)}/><DraftInput label="公开请求头 JSON" multiline value={JSON.stringify(draft.headers ?? {}, null, 2)} onCommit={value => json('headers', value)}/></div>{draft.method !== 'GET' && draft.method !== undefined && <div className="data-source-field"><DraftInput label="提交内容 JSON" multiline value={JSON.stringify(draft.body ?? {}, null, 2)} onCommit={value => json('body', value)}/><small>使用 {'{{form.title}}'}、{'{{route.id}}'} 或 {'{{state.name}}'} 映射字段。</small></div>}
          <label className="data-source-field"><span>关联凭据</span><select aria-label="关联凭据" value={draft.credentialId ?? ''} onChange={event => change({ credentialId: event.target.value || undefined, transport: event.target.value ? 'proxy' : draft.transport })}><option value="">不使用凭据</option>{credentials.map(item => <option value={item.id} key={item.id}>{item.name} · {item.kind === 'bearer' ? 'Bearer' : 'API Key'}</option>)}</select><small>密钥只保存在服务端，分享和导出不能使用私有数据。</small></label>
          {user ? <div className="data-credential-create"><h4>新增服务端凭据</h4><div className="data-source-grid"><label className="data-source-field"><span>凭据名称</span><input aria-label="凭据名称" value={credentialName} maxLength={80} onChange={event => setCredentialName(event.target.value)}/></label><label className="data-source-field"><span>类型</span><select aria-label="凭据类型" value={credentialKind} onChange={event => setCredentialKind(event.target.value as typeof credentialKind)}><option value="bearer">Bearer Token</option><option value="api-key">API Key</option></select></label><label className="data-source-field"><span>允许的主机</span><input aria-label="允许的主机" value={credentialHost} onChange={event => setCredentialHost(event.target.value)} placeholder="api.example.com"/></label><label className="data-source-field"><span>密钥（不会再次显示）</span><input aria-label="凭据密钥" type="password" autoComplete="new-password" value={secret} onChange={event => setSecret(event.target.value)}/></label></div><StudioButton disabled={!credentialName.trim() || !credentialHost.trim() || !secret} onClick={addCredential}>保存到服务端</StudioButton></div> : <p className="data-source-hint">登录后可添加服务端凭据。公开读取无需账号。</p>}
          {credentials.map(item => <div className="data-credential-row" key={item.id}><span>{item.name}<small>{item.allowedHosts.join('、')}</small></span><StudioButton aria-label={`删除凭据 ${item.name}`} onClick={() => void deleteCredential(item.id)}><Trash2 size={12}/></StudioButton></div>)}
        </details>
      </>}
      <label className="data-source-field"><span>响应路径（静态数据也可用）</span><input aria-label="数据响应路径" value={draft.responsePath ?? ''} onChange={event => change({ responsePath: event.target.value })} placeholder="例如 data.items；留空读取整个返回值"/></label>
      <div className="data-source-actions"><StudioButton className="primary-button" disabled={testing} onClick={() => void test()}>{testing ? <RefreshCw size={13} className="spin"/> : <Check size={13}/>}测试并连接</StudioButton><StudioButton disabled={testing} onClick={save}><Save size={13}/>保存数据源</StudioButton><StudioButton className="danger" disabled={testing || !sources.some(source => source.id === draft.id)} onClick={() => remove(false)}><Trash2 size={13}/>删除</StudioButton>{sources.some(source => source.id === draft.id) && <StudioButton onClick={() => remove(true)}>删除并解除绑定</StudioButton>}</div>
      {(message || error) && <p className={error ? 'data-source-error' : 'data-source-success'} role={error ? 'alert' : 'status'}>{error || message}</p>}
      {fields.length > 0 && <section className="data-source-fields"><h4>可选择的字段</h4>{fields.map(field => <div key={field.path}><code>{field.path}</code><span>{field.type}</span><small>{JSON.stringify(field.sample)?.slice(0, 100)}</small></div>)}</section>}
      {sample !== null && <details className="data-source-sample"><summary>查看第一条样例</summary><pre>{JSON.stringify(sample, null, 2)}</pre></details>}
      {fields.length > 0 && <p className="data-source-hint">详情绑定示例：<code>{`data.${draft.id}.${fields[0].path}`}</code>；列表字段直接在组件属性中选择。</p>}
    </> : <div className="data-source-empty"><Database size={30}/><h3>先连接一份数据</h3><p>不知道接口地址？先创建静态 JSON，马上就能体验列表和字段选择。</p></div>}
  </div>;
}
