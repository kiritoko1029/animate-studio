import { useContext, useState } from 'react';
import type { Block } from '../../model';
import type { JsonValue } from '../../lib/interactions/types';
import { prepareDataSource } from '../../../shared/data-sources.mjs';
import { requestDataSource } from '../../lib/data/runtime';
import { NativeRuntimeContext } from '../NativeInteractions';
import { useSiteNavigation } from '../../lib/site-navigation';
import { useDataStore } from './DataRuntime';

function fieldError(field: Block, value: JsonValue): string {
  const props = field.props, text = typeof value === 'string' ? value.trim() : value;
  const invalid = props.error || (props.format === 'email' ? '请输入有效的邮箱地址。' : props.format === 'url' ? '请输入有效的 http(s) 地址。' : props.format === 'number' ? '请输入有效的数字。' : props.required ? `请填写${props.label || '此字段'}。` : '字段内容不符合要求。');
  if (props.required && (text === '' || text === false || text === null)) return invalid;
  if (text === '') return '';
  if (typeof text === 'string') {
    if (props.minLength !== undefined && text.length < props.minLength || props.maxLength !== undefined && text.length > props.maxLength) return props.error || `请输入 ${props.minLength ?? 0}–${props.maxLength ?? 10000} 个字符。`;
    if (props.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return invalid;
    if (props.format === 'number' && !Number.isFinite(Number(text))) return invalid;
    if (props.format === 'url') { try { const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol)) return invalid; } catch { return invalid; } }
  }
  return '';
}
export function FormBlock({ block, interactive, confirm = message => window.confirm(message) }: { block: Block; interactive: boolean; confirm?: (message: string) => boolean | Promise<boolean> }) {
  const fields = (block.children ?? []).filter(child => child.type !== 'button');
  const [values, setValues] = useState<Record<string, JsonValue>>(() => Object.fromEntries(fields.map(field => [field.props.name ?? field.id, field.type === 'checkbox' ? Boolean(field.props.checked) : ''])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<{ before: Record<string, JsonValue>; result: JsonValue } | null>(null);
  const runtime = useContext(NativeRuntimeContext)?.runtime, store = useDataStore(), navigation = useSiteNavigation();
  const source = store?.sourceFor(block.props.submitSourceId ?? '');
  const busy = phase === 'confirming' || phase === 'submitting';
  const update = (name: string, value: JsonValue) => { setValues(previous => ({ ...previous, [name]: value })); setErrors(previous => ({ ...previous, [name]: '' })); if (phase !== 'idle') { setPhase('idle'); setMessage(''); } };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !interactive) return;
    if (!source || source.kind !== 'rest' || !['POST', 'PUT', 'PATCH'].includes(source.method ?? 'GET')) { setPhase('error'); setMessage('请先选择 POST、PUT 或 PATCH 的 REST 提交数据源。'); return; }
    const next = Object.fromEntries(fields.map(field => [field.props.name ?? field.id, field.props.format === 'number' && values[field.props.name ?? field.id] !== '' ? Number(values[field.props.name ?? field.id]) : values[field.props.name ?? field.id] ?? '']));
    const nextErrors = Object.fromEntries(fields.map(field => [field.props.name ?? field.id, fieldError(field, next[field.props.name ?? field.id])]).filter(([, message]) => message));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setPhase('error'); setMessage('请检查标记的字段后再提交。'); return; }
    let prepared;
    try { prepared = prepareDataSource(source, { route: navigation?.params ?? {}, state: runtime?.getState() ?? {}, form: next }); }
    catch (cause) { setPhase('error'); setMessage(cause instanceof Error ? cause.message : '提交配置无效。'); return; }
    const host = new URL(prepared.url!, window.location.href).host;
    setPhase('confirming'); setMessage('');
    if (!await confirm(`确认以 ${source.method ?? 'GET'} 向 ${host} 提交这些表单内容吗？\n此操作可能创建或修改数据。`)) { setPhase('idle'); return; }
    setPhase('submitting');
    try {
      const result = await requestDataSource(source, { allowWrite: true, context: { route: navigation?.params ?? {}, state: runtime?.getState() ?? {}, form: next }, access: store?.access });
      setReceipt({ before: next, result });
      setPhase('success'); setMessage(block.props.successText || '提交成功。'); store?.refreshAll();
      if (block.props.successUrl) navigation?.navigate(block.props.successUrl);
    } catch (cause) { setPhase('error'); setMessage(cause instanceof Error ? cause.message : block.props.errorText || '提交失败，请稍后重试。'); }
  };
  return <form className="data-form" noValidate onSubmit={submit} aria-label={block.props.title || '数据表单'}>{block.props.title && <h3>{block.props.title}</h3>}{block.props.text && <p>{block.props.text}</p>}<div className="data-form-fields">{fields.map(field => {
    const props = field.props, name = props.name ?? field.id, value = values[name] ?? '', error = errors[name], id = `${block.id}-${field.id}`;
    const common = { id, name, disabled: !interactive || busy, required: props.required, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': error ? `${id}-error` : undefined };
    return <label className={`data-form-field${props.required ? ' is-required' : ''}`} key={field.id} htmlFor={id}><span>{props.label || name}{props.required && <small>必填</small>}</span>{field.type === 'textarea' ? <textarea {...common} placeholder={props.text} maxLength={props.maxLength} value={String(value)} onChange={event => update(name, event.target.value)}/> : field.type === 'select' ? <select {...common} value={String(value)} onChange={event => update(name, event.target.value)}><option value="">请选择</option>{(props.items ?? '').split('\n').filter(Boolean).map(item => <option key={item} value={item.split('|')[0]}>{item.split('|')[0]}</option>)}</select> : field.type === 'checkbox' ? <span className="data-form-checkbox"><input {...common} type="checkbox" checked={Boolean(value)} onChange={event => update(name, event.target.checked)}/>{props.text}</span> : <input {...common} type={props.format === 'email' ? 'email' : props.format === 'url' ? 'url' : props.format === 'number' ? 'number' : 'text'} placeholder={props.text} maxLength={props.maxLength} value={String(value)} onChange={event => update(name, event.target.value)}/>}<span className="data-form-error" id={`${id}-error`}>{error}</span></label>;
  })}</div>{(block.children ?? []).filter(child => child.type === 'button').map(child => <button key={child.id} type="submit" className="page-button page-button--primary" disabled={!interactive || busy}>{phase === 'submitting' ? '正在提交…' : phase === 'confirming' ? '等待确认…' : child.props.label || '提交'}</button>)}<div className={`data-form-status${phase === 'error' ? ' is-error' : ''}`} role={phase === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</div>{receipt && <details className="data-form-receipt"><summary>查看返回结果</summary><pre>{JSON.stringify(receipt.result, null, 2)}</pre><button type="button" disabled={!interactive} onClick={() => { setValues(receipt.before); setPhase('idle'); setMessage('已恢复提交前的输入；外部创建或修改不会自动撤销。'); }}>恢复提交前内容</button><small>只恢复输入，不会自动撤销外部写入。</small></details>}</form>;
}
