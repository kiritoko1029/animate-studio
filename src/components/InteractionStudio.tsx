import { t, getLocale, translateMessage } from '../i18n';
import { Tabs, TabsList, TabsTrigger } from './animate-ui/components/radix/tabs';
import { StudioButton, StudioDialog } from './StudioUI';
import { variableIsUsed } from '../../shared/interaction-schema.mjs';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Braces, Database, Plus, Play, Trash2, X, Check, FlaskConical, Code2 } from 'lucide-react';
import type { PageDocument, SiteDocument } from '../model';
import { DataSourceManager } from './DataSourceManager';
import { DataRuntimeProvider } from './data/DataRuntime';
import type { JsonValue, Script, Variable } from '../lib/interactions/types';
import { createInteractionRuntime } from '../../shared/interactions.mjs';
import { DraftInput } from './InteractionControls';
import { InteractivePreview, type PreviewHandle } from './InteractivePreview';
import type { ScriptEditorHandle } from './ScriptEditor';
import { scriptExamples, scriptFunctions, scriptTimerFunctions } from '../lib/interactions/script-assistance';
import { ScriptPicker } from './ScriptPicker';
import '../interactions.css';
const ScriptEditor = lazy(() => import('./ScriptEditor'));
const types: Record<Variable['type'], string> = { string: '文本', number: '数字', boolean: '布尔值', object: '对象', array: '数组' };
const initial: Record<Variable['type'], JsonValue> = { string: '', number: 0, boolean: false, object: {}, array: [] };

function ScriptWorkspace({ script, page, onChange, onRun, onDelete }: { script: Script; page: PageDocument; onChange: (script: Script) => void; onRun: () => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(script.code), [error, setError] = useState('');
  const editor = useRef<ScriptEditorHandle>(null);
  useEffect(() => { setDraft(script.code); setError(''); }, [script.id, script.code]);
  function check() {
    try { if (draft.length > 20000) throw new Error(t("脚本最多 20000 字符")); new (Object.getPrototypeOf(async function () {}).constructor)('ctx', draft); setError(''); return true; }
    catch (e) { setError(e instanceof Error ? e.message : t("脚本语法无效")); return false; }
  }
  const dirty = draft !== script.code;
  return <div className="script-workspace">
    <div className="script-toolbar"><StudioButton className="secondary-button" onClick={check}>{t("检查语法")}</StudioButton><StudioButton className="primary-button" disabled={!dirty} onClick={() => { if (check()) onChange({ ...script, code: draft }); }}><Check size={13} />{t("应用脚本")}</StudioButton><StudioButton className="secondary-button" disabled={dirty} onClick={onRun}><Play size={12} />{t("测试运行")}</StudioButton><span className={`script-save-state${dirty ? ' dirty' : ''}`}>{dirty ? t("未应用") : t("已应用")}</span><StudioButton className="logic-delete" title={t("删除脚本并清理事件引用")} onClick={onDelete}><Trash2 size={14} /></StudioButton></div>
    <Suspense fallback={<p>{t("正在打开代码编辑器…")}</p>}><ScriptEditor ref={editor} value={draft} variables={page.variables ?? []} onChange={setDraft} /></Suspense>
    {error && <p className="logic-error" role="alert">{translateMessage(error)}</p>}

    <details className="script-help"><summary>{t("示例与函数说明")}<span>{t("脚本 15 秒 · 请求默认 10 秒")}</span></summary><div className="script-help-content"><p className="field-hint">{t("修改后先应用，再测试运行；关闭前请应用草稿。")}</p>
    <div className="script-examples"><h4>{t("插入示例")}<span>{t("插入光标处或替换选中文字")}</span></h4><div>{scriptExamples(page.variables ?? []).map(example => <StudioButton className="secondary-button" key={example.label} disabled={example.disabled} title={example.disabled ? t("请先创建页面变量") : t("插入{0}示例", { 0: t(example.label) })} onClick={() => editor.current?.insert(t(example.code))}>{t(example.label)}</StudioButton>)}</div><p>{t("将示例 URL 换成你的接口地址。请求从隔离环境发出，接口需允许跨域（CORS），相对地址也一样；相对地址以当前页面地址为基准。")}</p></div>
    <div className="script-api"><h4>{t("可用接口")}<span>{t("输入 ctx. 获取补全")}</span></h4><code>ctx.state.name</code><p>{t("读取页面变量；输入 ctx.state. 选择变量，setState 的变量名也可补全。")}</p><code>ctx.event.value</code><p>{t("读取触发事件的新值；手动测试时为空。")}</p>{scriptFunctions.map(item => <div key={item.name}><code>{item.signature}</code><p>{t(item.description)}</p></div>)}<h4>{t("JavaScript 定时器")}</h4>{scriptTimerFunctions.map(item => <div key={item.name}><code>{item.signature}</code><p>{t(item.description)}</p></div>)}<p>{t("也可以直接使用 fetch(url, options)。await 等待请求完成；fetchJSON 自动检查 HTTP 状态并读取 JSON。")}</p></div></div></details>
  </div>;
}
export type InteractionStudioTarget = { tab: 'data' | 'sources' } | { tab: 'scripts'; scriptId?: string };

export default function InteractionStudio({ page, site, onSiteChange, dataPageId, onChange, onClose, onDemo, initialTarget = { tab: 'data' } }: { initialTarget?: InteractionStudioTarget; page: PageDocument; site?: SiteDocument; onSiteChange?: (site: SiteDocument) => void; dataPageId?: string; onChange: (page: PageDocument) => void; onClose: () => void; onDemo: () => void }) {
  const preview = useRef<PreviewHandle>(null);
  const [tab, setTab] = useState<'data' | 'sources' | 'scripts'>(initialTarget.tab);
  const [selectedScript, setSelectedScript] = useState((initialTarget.tab === 'scripts' ? initialTarget.scriptId : undefined) ?? page.scripts?.[0]?.id ?? '');
  const [name, setName] = useState(''), [type, setType] = useState<Variable['type']>('string'), [error, setError] = useState('');
  const scripts = page.scripts ?? [], variables = page.variables ?? [];
  const script = scripts.find(item => item.id === selectedScript) ?? scripts[0];
  const updateScript = (next: Script) => onChange({ ...page, scripts: scripts.map(item => item.id === next.id ? next : item) });
  const updateVariables = (next: Variable[]) => onChange({ ...page, variables: next });
  const addVariable = () => {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) || ['constructor', 'prototype'].includes(name) || variables.some(v => v.name === name)) { setError(t("使用唯一的英文名称，以字母开头，最长 40 字符。")); return; }
    updateVariables([...variables, { name, type, initial: initial[type] }]); setName(''); setError('');
  };
  const removeScript = (id: string) => {
    const clean = (actions: import('../lib/interactions/types').Action[]): import('../lib/interactions/types').Action[] => actions.filter(action => action.type !== 'script' || action.scriptId !== id).map(action => action.type === 'condition' ? { ...action, then: clean(action.then), else: clean(action.else) } : action);
    onChange({ ...page, scripts: scripts.filter(item => item.id !== id), blocks: page.blocks.map(block => block.events ? { ...block, events: Object.fromEntries(Object.entries(block.events).map(([name, actions]) => [name, clean(actions)])) } : block) });
  };
  return <DataRuntimeProvider sources={site?.dataSources ?? []} access={{ scope: 'editor', pageId: dataPageId }}><StudioDialog title={t("交互工作台")} className={`interaction-studio${tab === 'scripts' ? ' interaction-studio--scripts' : ''}`} onClose={onClose} dismissOutside={false}><header className="interaction-header"><h2 id="interaction-studio-title"><Braces size={17} />{t("交互工作台")}</h2><StudioButton aria-label={t("关闭交互工作台")} className="icon-button" onClick={onClose}><X size={18} /></StudioButton></header>
    <div className="interaction-body"><section className={`interaction-config${tab === 'scripts' ? ' interaction-config--scripts' : ''}`}><Tabs value={tab} onValueChange={value=>setTab(value as typeof tab)} className="studio-tab-root"><TabsList className="studio-tabs logic-studio-tabs" aria-label={t("数据与脚本")}><TabsTrigger value="data" id="logic-tab-data" aria-controls="logic-panel"><Database size={15} />{t("页面数据")}<small>{variables.length}</small></TabsTrigger><TabsTrigger value="sources" id="logic-tab-sources" aria-controls="logic-panel" disabled={!site || !onSiteChange}><Database size={15}/>{t("数据源")}<small>{site?.dataSources?.length ?? 0}</small></TabsTrigger><TabsTrigger value="scripts" id="logic-tab-scripts" aria-controls="logic-panel"><Code2 size={15} />{t("脚本")}<small>{scripts.length}</small></TabsTrigger></TabsList></Tabs>
    {tab === 'sources' && site && onSiteChange ? <DataSourceManager site={site} onChange={onSiteChange} dataPageId={dataPageId}/> : tab === 'data' ? <div className="variables-editor" role="tabpanel" id="logic-panel" aria-labelledby="logic-tab-data"><p className="logic-description">{t("定义共享变量，在“组件联动”中绑定属性或设置事件。")}</p><div className="variable-create"><input aria-label={t("新变量名称")} placeholder={t("变量名，如 progress")} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariable(); } }} /><select aria-label={t("新变量类型")} value={type} onChange={e => setType(e.target.value as Variable['type'])}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select><StudioButton className="primary-button" disabled={variables.length >= 50} onClick={addVariable}><Plus size={14} />{t("添加")}</StudioButton></div>{error && <p className="logic-error" role="alert">{translateMessage(error)}</p>}
      {!!variables.length && <div className="variables-columns"><span>{t("变量 / 类型")}</span><span>{t("初始值")}</span><span /></div>}
      {variables.map((variable, index) => {
        const used = variableIsUsed(page, variable.name);
        const parse = (value: string) => variable.type === 'string' ? value : JSON.parse(value);
        const validate = (value: string) => { const runtime = createInteractionRuntime({ variables: [variable], blocks: [] }); runtime.setState(variable.name, parse(value)); };
        return <div className="variable-card" key={variable.name}><div className="variable-identity"><code title={variable.name}>{variable.name}</code><span>{t(types[variable.type])}</span><label className="variable-persistence"><input type="checkbox" aria-label={t("{0} 记住上次的值", { 0: variable.name })} checked={variable.persistent !== false} onChange={e => updateVariables(variables.map((v, i) => i === index ? { ...v, persistent: e.target.checked } : v))} />{t("记住上次的值")}</label></div><div className="variable-value">{variable.type === 'boolean' ? <label className="logic-field"><span>{variable.name} {t("初始值")}</span><select aria-label={t("{0} 初始值", { 0: variable.name })} value={String(variable.initial)} onChange={e => updateVariables(variables.map((v, i) => i === index ? { ...v, initial: e.target.value === 'true' } : v))}><option value="false">{t("false · 关闭")}</option><option value="true">{t("true · 开启")}</option></select></label> : <DraftInput label={t("{0} 初始值", { 0: variable.name })} value={variable.type === 'string' ? String(variable.initial) : JSON.stringify(variable.initial, null, 2)} multiline={variable.type === 'object' || variable.type === 'array'} validate={validate} onCommit={value => updateVariables(variables.map((v, i) => i === index ? { ...v, initial: parse(value) } : v))} />}</div><StudioButton className="variable-delete" aria-label={t("删除变量 {0}", { 0: variable.name })} disabled={used} title={used ? t("先移除属性、事件或脚本中的引用，再删除变量") : t("删除变量")} onClick={() => updateVariables(variables.filter((_, i) => i !== index))}><Trash2 size={14} /></StudioButton></div>;
      })}
      {!variables.length && <div className="logic-empty"><Database size={28} /><h3>{t("从一个变量开始")}</h3><p>{t("例如 progress，用它连接滑块和进度条。")}</p><StudioButton className="secondary-button" onClick={onDemo}><FlaskConical size={14} />{t("载入四个联动示例")}</StudioButton><small>{t("替换当前页面，可撤销恢复。")}</small></div>}
      <p className="field-hint">{t("开启“记住上次的值”后，运行值保存在当前浏览器，重新打开自动恢复。修改初始值或点击“重置”会重新开始。对象和数组使用 JSON。")}</p>
    </div> : <div className="scripts-editor" role="tabpanel" id="logic-panel" aria-labelledby="logic-tab-scripts"><div className="script-selector"><ScriptPicker scripts={scripts} script={script} onSelect={setSelectedScript} onRename={(id, name) => { const item = scripts.find(item => item.id === id); if (item) updateScript({ ...item, name }); }} /><StudioButton className="secondary-button" disabled={scripts.length >= 30} onClick={() => { const id = crypto.randomUUID(); onChange({ ...page, scripts: [...scripts, { id, name: t("页面脚本 {0}", { 0: scripts.length + 1 }), code: t("// 使用 ctx.state 读取变量，用 ctx.setState 写入结果\nctx.log(\"脚本运行成功\");") }] }); setSelectedScript(id); }}><Plus size={13} />{t("新建脚本")}</StudioButton></div>{script ? <ScriptWorkspace key={script.id} script={script} page={page} onChange={updateScript} onRun={() => preview.current?.runScript(script.id)} onDelete={() => removeScript(script.id)} /> : <div className="logic-empty"><Code2 size={28} /><h3>{t("为页面编写一段逻辑")}</h3><p>{t("创建脚本后，在组件事件中添加“执行脚本”动作。")}</p></div>}</div>}
    </section><section className="interaction-live"><div className="interaction-preview-heading"><span><Play size={13} />{t("运行预览")}</span><small>{t("与导出页面使用相同逻辑")}</small></div><div className="interaction-preview-scroll"><InteractivePreview document={page} translate={t} locale={getLocale()} debug ref={preview} /></div></section></div>
    <footer className="interaction-footer"><span>{t("配置自动保存 · 支持撤销 / 重做")}</span><StudioButton className="secondary-button" onClick={onClose}>{t("返回画布，配置组件联动")}</StudioButton></footer>
  </StudioDialog></DataRuntimeProvider>;
}
