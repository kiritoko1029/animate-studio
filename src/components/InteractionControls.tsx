import { StudioButton } from './StudioUI';
import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, Link2, Database, Code2, Pencil } from 'lucide-react';
import type { InteractionStudioTarget } from './InteractionStudio';
import type { Block, PageDocument } from '../model';
import type { Action, Bindings, Variable } from '../lib/interactions/types';
import { bindingKeys, bindingLabels, eventNames, bindingVariableTypes } from '../../shared/interaction-schema.mjs';
import { ExpressionInput } from './ExpressionInput';
import { expressionEvent } from '../lib/interactions/expression-assistance';
import type { ExpressionContext } from '../lib/interactions/expression-assistance';

export function DraftInput({ value, onCommit, validate, label, multiline = false, placeholder }: { value: string; onCommit: (value: string) => void; validate?: (value: string) => void; label: string; multiline?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('');
  useEffect(() => { setDraft(value); setError(''); }, [value]);
  const commit = () => { try { validate?.(draft); onCommit(draft); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '格式不正确'); } };
  const props = { value: draft, 'aria-label': label, 'aria-invalid': !!error, placeholder, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value), onBlur: commit };
  return <><label className="logic-field"><span>{label}</span>{multiline ? <textarea {...props} rows={3} /> : <input {...props} onKeyDown={e => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } }} />}</label>{error && <p className="logic-error" role="alert">{error}</p>}</>;
}
const actionLabels = { set: '设置变量', toggle: '切换开关', condition: '条件分支', notify: '显示提示', navigate: '跳转链接', reset: '重置页面数据', script: '执行脚本' };
function defaultAction(type: Action['type'], page: PageDocument): Action {
  switch (type) {
    case 'set': { const variable = page.variables?.[0]; return { type, variable: variable?.name || '', expression: variable ? `state.${variable.name}` : '0' }; }
    case 'toggle': return { type, variable: page.variables?.find(v => v.type === 'boolean')?.name || '' };
    case 'script': return { type, scriptId: page.scripts?.[0]?.id || '' };
    case 'condition': return { type, expression: 'true', then: [], else: [] };
    case 'notify': return { type, expression: '"操作成功"' };
    case 'navigate': return { type, expression: '"#"' };
    case 'reset': return { type };
  }
}
export function ActionList({ actions, page, onChange, eventContext, onOpenStudio, depth = 0 }: { actions: Action[]; page: PageDocument; onChange: (actions: Action[]) => void; eventContext?: ExpressionContext['event']; onOpenStudio: (target: InteractionStudioTarget) => void; depth?: number }) {
  const [addType, setAddType] = useState<Action['type']>('notify');
  const patch = (index: number, action: Action) => onChange(actions.map((item, i) => i === index ? action : item));
  const allowed = (type: Action['type']) => type === 'set' ? !!page.variables?.length : type === 'toggle' ? !!page.variables?.some(v => v.type === 'boolean') : type === 'script' ? !!page.scripts?.length : type === 'condition' ? depth < 4 : true;
  return <div className="action-list">{actions.map((action, index) => <div className="logic-action" key={index}><div className="logic-action-heading"><span>{index + 1}</span><strong>{actionLabels[action.type]}</strong><StudioButton aria-label="上移动作" disabled={index === 0} onClick={() => { const next = [...actions]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}><ArrowUp size={13} /></StudioButton><StudioButton aria-label="删除动作" onClick={() => onChange(actions.filter((_, i) => i !== index))}><Trash2 size={13} /></StudioButton></div>
    {('variable' in action) && <label className="logic-field"><span>目标变量</span><select aria-label="目标变量" value={action.variable} onChange={e => patch(index, { ...action, variable: e.target.value })}>{(page.variables ?? []).filter(v => action.type !== 'toggle' || v.type === 'boolean').map(v => <option key={v.name} value={v.name}>{v.name} · {v.type}</option>)}</select></label>}
    {'expression' in action && <ExpressionInput context={{ variables: page.variables ?? [], event: eventContext, purpose: action.type === 'condition' ? 'boolean' : action.type === 'navigate' ? 'url' : action.type === 'notify' ? 'text' : action.type === 'set' && page.variables?.find(v => v.name === action.variable)?.type === 'boolean' ? 'boolean' : 'value', expectedTypes: action.type === 'condition' ? ['boolean'] : action.type === 'set' ? page.variables?.filter(v => v.name === action.variable).map(v => v.type) : undefined, targetVariable: action.type === 'set' ? action.variable : undefined }} value={action.expression} onChange={expression => patch(index, { ...action, expression })} label={action.type === 'condition' ? '成立条件' : action.type === 'set' ? '新值表达式' : '内容表达式'} />}
    {action.type === 'script' && <div className="logic-script-field"><label className="logic-field"><span>运行脚本</span><select value={action.scriptId} onChange={e => patch(index, { ...action, scriptId: e.target.value })}>{page.scripts?.map(script => <option value={script.id} key={script.id}>{script.name}</option>)}</select></label><StudioButton className="text-button" aria-haspopup="dialog" disabled={!page.scripts?.some(script => script.id === action.scriptId)} onClick={() => onOpenStudio({ tab: 'scripts', scriptId: action.scriptId })}><Pencil size={12} />编辑脚本</StudioButton></div>}
    {action.type === 'condition' && <div className="condition-branches"><div><h5>条件成立</h5><ActionList onOpenStudio={onOpenStudio} page={page} eventContext={eventContext} actions={action.then} depth={depth + 1} onChange={then => patch(index, { ...action, then })} /></div><div><h5>否则</h5><ActionList onOpenStudio={onOpenStudio} page={page} eventContext={eventContext} actions={action.else} depth={depth + 1} onChange={otherwise => patch(index, { ...action, else: otherwise })} /></div></div>}
  </div>)}<div className="action-add"><select aria-label="添加的动作类型" value={addType} onChange={e => setAddType(e.target.value as Action['type'])}>{Object.entries(actionLabels).map(([type, name]) => <option key={type} value={type} disabled={!allowed(type as Action['type'])}>{name}</option>)}</select><StudioButton className="secondary-button" disabled={actions.length >= 20 || !allowed(addType)} onClick={() => onChange([...actions, defaultAction(addType, page)])}><Plus size={13} />动作</StudioButton></div></div>;
}
export function ComponentInteractions({ block, page, onChange, onOpenStudio }: { block: Block; page: PageDocument; onChange: (block: Block) => void; onOpenStudio: (target: InteractionStudioTarget) => void }) {
  const [section, setSection] = useState<'bindings' | 'events'>('bindings');
  const [event, setEvent] = useState<'click' | 'change'>('click');
  const changeBinding = (key: keyof Bindings, binding?: Bindings[keyof Bindings]) => { const bindings = { ...block.bindings }; if (binding) bindings[key] = binding; else delete bindings[key]; onChange({ ...block, bindings }); };
  const suitable = (key: keyof Bindings, variable: Variable) => bindingVariableTypes(block, key).includes(variable.type);
  return <div className="component-interactions"><div className="logic-intro"><Link2 size={20} /><strong>让组件协同工作</strong><p>绑定页面变量，或为事件添加动作。</p><div className="logic-resource-actions"><StudioButton className="secondary-button" aria-haspopup="dialog" onClick={() => onOpenStudio({ tab: 'data' })}><Database size={13} />页面数据</StudioButton><StudioButton className="secondary-button" aria-haspopup="dialog" onClick={() => onOpenStudio({ tab: 'scripts' })}><Code2 size={13} />脚本管理</StudioButton></div></div>
    <div className="logic-segments"><StudioButton className={section === 'bindings' ? 'active' : ''} onClick={() => setSection('bindings')}>属性绑定</StudioButton><StudioButton className={section === 'events' ? 'active' : ''} onClick={() => setSection('events')}>事件动作</StudioButton></div>
    {section === 'bindings' ? <>{bindingKeys(block).map(key => { const binding = block.bindings?.[key]; const variables = (page.variables ?? []).filter(v => suitable(key, v)); return <div className="binding-row" key={key}><div className="binding-heading"><strong>{bindingLabels[key]}</strong><select aria-label={`${bindingLabels[key]}来源`} value={binding?.kind || 'fixed'} onChange={e => { const kind = e.target.value; changeBinding(key, kind === 'fixed' ? undefined : { kind: kind as 'variable' | 'expression', value: kind === 'variable' ? variables[0].name : ['visible', 'disabled', 'checked'].includes(key) ? 'true' : key === 'value' && !bindingVariableTypes(block, key).includes('string') ? '0' : '""' }); }}><option value="fixed">固定值</option><option value="variable" disabled={!variables.length}>页面变量</option><option value="expression">表达式</option></select></div>
      {binding?.kind === 'variable' && <select aria-label={`${bindingLabels[key]}绑定变量`} value={binding.value} onChange={e => changeBinding(key, { ...binding, value: e.target.value })}>{variables.map(variable => <option key={variable.name} value={variable.name}>{variable.name} · {variable.type}</option>)}</select>}
      {binding?.kind === 'expression' && <ExpressionInput key={`${block.id}-${key}`} context={{ variables: page.variables ?? [], purpose: ['visible', 'disabled', 'checked'].includes(key) ? 'boolean' : key === 'value' ? 'value' : 'text', expectedTypes: bindingVariableTypes(block, key) }} label={`${bindingLabels[key]}表达式`} value={binding.value} onChange={value => changeBinding(key, { ...binding, value })} />}
      {['value', 'checked'].includes(key) && binding && <p className="field-hint">{binding.kind === 'variable' && block.type !== 'progress' ? '用户操作会同步写入此变量。' : '按表达式或变量展示，修改数据后自动更新。'}</p>}
    </div>; })}<p className="field-hint">表达式支持 state.变量、算术、比较、逻辑与三元运算。固定值在“组件属性”中编辑。</p></> : <><label className="logic-field"><span>触发事件</span><select aria-label="触发事件" value={event} onChange={e => setEvent(e.target.value as 'click' | 'change')}>{eventNames(block.type).map(name => <option key={name} value={name}>{name === 'click' ? '点击组件时' : '值变化时'}</option>)}</select></label><p className="field-hint">{event === 'change' ? '动作依次执行。event.value 是这次操作的新值；先同步绑定变量，再执行动作。' : '动作依次执行。点击时可读取 state.变量；点击动作会替代组件原有链接跳转。'}</p><ActionList onOpenStudio={onOpenStudio} eventContext={expressionEvent(block, page.variables ?? [], event)} key={`${block.id}-${event}`} actions={block.events?.[event] ?? []} page={page} onChange={actions => onChange({ ...block, events: { ...block.events, [event]: actions } })} /></>}
  </div>;
}
