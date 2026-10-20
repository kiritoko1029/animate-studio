import { StudioButton } from './StudioUI';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, BookOpen, Undo2 } from 'lucide-react';
import { expressionCompletions, expressionExamples, expressionSuggestions, expressionTypeLabels, formatExpressionValue, insertExpression, inspectExpression } from '../lib/interactions/expression-assistance';
import type { ExpressionContext } from '../lib/interactions/expression-assistance';

export function ExpressionInput({ value, onChange, label = '表达式', context }: { value: string; onChange: (value: string) => void; label?: string; context: ExpressionContext }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selection = useRef({ from: value.length, to: value.length });
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState(value.length);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [help, setHelp] = useState(false);
  const [helpTab, setHelpTab] = useState<'examples' | 'variables' | 'syntax'>('examples');
  const [attempted, setAttempted] = useState(false);
  useEffect(() => { setDraft(value); setAttempted(false); setDismissed(true); }, [value]);
  const suggestions = useMemo(() => expressionSuggestions(context), [context]);
  const examples = useMemo(() => expressionExamples(context), [context]);
  const result = useMemo(() => inspectExpression(draft, context), [draft, context]);
  const completion = focused && !dismissed ? expressionCompletions(draft, cursor, suggestions) : null;
  const selected = completion ? Math.min(active, completion.items.length - 1) : 0;
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected, draft]);
  const rememberSelection = () => {
    if (!input.current) return;
    const from = input.current.selectionStart ?? draft.length, to = input.current.selectionEnd ?? from;
    selection.current = { from, to };
    setCursor(from);
  };
  const commit = () => { setAttempted(true); if (result.valid && draft !== value) onChange(draft); };
  const insert = (text: string, from = selection.current.from, to = selection.current.to) => {
    const next = insertExpression(draft, from, to, text);
    setDraft(next.source); setCursor(next.cursor); setActive(0); setDismissed(true); setAttempted(false);
    selection.current = { from: next.cursor, to: next.cursor };
    // The new selection must be applied after React writes the controlled value.
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next.cursor, next.cursor); });
  };
  const chooseExample = (source: string) => { insert(source, 0, draft.length); if (inspectExpression(source, context).valid) onChange(source); };
  return <div className="expression-editor" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setFocused(false); setDismissed(true); commit(); }
  }}>
    <label className="logic-field" htmlFor={id}><span>{label}</span>
      <input data-escape-local id={id} ref={input} value={draft} className="expression-source" role="combobox" aria-autocomplete="list" aria-expanded={!!completion} aria-controls={completion ? `${id}-options` : undefined} aria-activedescendant={completion ? `${id}-option-${selected}` : undefined} aria-invalid={!result.valid && !!draft} aria-describedby={`${id}-result ${id}-hint`} autoComplete="off" spellCheck={false} placeholder="输入 state. 选择变量" onBlur={() => setFocused(false)} onFocus={() => { setFocused(true); rememberSelection(); }} onSelect={rememberSelection} onChange={event => {
        setDraft(event.target.value); setCursor(event.target.selectionStart ?? event.target.value.length); setActive(0); setDismissed(false); setAttempted(false);
        selection.current = { from: event.target.selectionStart ?? 0, to: event.target.selectionEnd ?? 0 };
      }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDismissed(true); return; }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && completion) {
          event.preventDefault(); setActive((selected + (event.key === 'ArrowDown' ? 1 : -1) + completion.items.length) % completion.items.length); return;
        }
        if (event.key === 'ArrowDown' && !completion) { setDismissed(false); return; }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (completion) { insert(completion.items[selected].source, completion.from, completion.to); return; }
          commit(); setDismissed(true);
        }
      }} />
    </label>
    {completion && <div className="expression-completion"><div className="expression-completion-hint">↑ ↓ 选择 · Enter 插入 · Esc 收起</div><div id={`${id}-options`} ref={list} role="listbox" aria-label="表达式补全" className="expression-options">
      {completion.items.map((item, index) => <div key={item.source} id={`${id}-option-${index}`} role="option" aria-selected={index === selected} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => insert(item.source, completion.from, completion.to)}>
        <code>{item.source}</code><small>{expressionTypeLabels[item.type]} · {formatExpressionValue(item.value)}</small>
      </div>)}
    </div></div>}
    <div id={`${id}-result`} className={`expression-result ${!result.valid ? 'invalid' : result.message ? 'warning' : ''}`} role="status" aria-live="polite" aria-atomic="true">
      {result.valid && result.value !== undefined && <><span className="expression-result-label">初始数据预览 <small>{expressionTypeLabels[result.type]}</small></span><output>{formatExpressionValue(result.value)}</output></>}
      {result.message && <p>{result.message}</p>}
      {context.event?.type === 'change' && <small className="expression-event-sample">新值样本：{formatExpressionValue(context.event.value)}；实际使用用户操作后的值。</small>}
      {!result.valid && attempted && <small>尚未保存，已保留原表达式。</small>}
    </div>
    <div className="expression-toolbar"><StudioButton type="button" aria-expanded={help} aria-controls={`${id}-help`} onClick={() => setHelp(!help)}><BookOpen size={12} />变量与示例<ChevronDown size={12} className={help ? 'expanded' : ''} /></StudioButton>
      {draft !== value && <StudioButton type="button" title="恢复已应用的表达式" onClick={() => { insert(value, 0, draft.length); setAttempted(false); }}><Undo2 size={12} />恢复</StudioButton>}
    </div>
    <p id={`${id}-hint`} className="expression-save-hint">{draft !== value ? 'Enter 或离开此区域保存；预览使用初始数据。' : '输入 state. 可选变量；预览使用初始数据。'}</p>
    {help && <div id={`${id}-help`} className="expression-help">
      <div className="expression-help-tabs" aria-label="表达式帮助">{([['examples', '常用写法'], ['variables', '可用变量'], ['syntax', '写法速查']] as const).map(([tab, name]) => <StudioButton key={tab} type="button" aria-pressed={helpTab === tab} onClick={() => setHelpTab(tab)}>{name}</StudioButton>)}</div>
      {helpTab === 'variables' && <><p>点击插入到光标位置；可先选中文字再替换。</p>{suggestions.length ? <div className="expression-variable-list">{suggestions.map(item => <StudioButton type="button" key={item.source} onClick={() => insert(item.source)}><code>{item.source}</code><small>{expressionTypeLabels[item.type]} · {formatExpressionValue(item.value)}</small></StudioButton>)}</div> : <p>还没有页面变量。可在“管理页面数据与脚本”中添加，或试试“常用写法”中的常量。</p>}</>}
      {helpTab === 'examples' && <><p>点击写法，替换当前表达式并应用。</p><div className="expression-examples">{examples.map(example => <StudioButton type="button" key={example.source} onClick={() => chooseExample(example.source)}><span>{example.label}</span><code>{example.source}</code></StudioButton>)}</div></>}
      {helpTab === 'syntax' && <div className="expression-syntax"><dl>
        <dt>文字要加引号</dt><dd><code>"你好"</code> 是文字，<code>100</code> 是数字。</dd>
        <dt>比较与组合条件</dt><dd><code>&gt; &gt;= &lt; &lt;= === !==</code><br /><code>&amp;&amp;</code> 都成立 · <code>||</code> 任一成立 · <code>!</code> 取反</dd>
        <dt>根据条件选择结果</dt><dd><code>条件 ? 成立时的值 : 否则的值</code></dd>
        <dt>计算与默认值</dt><dd><code>+ - * / %</code> 计算，<code>+</code> 也可拼接文字。<code>??</code> 在 null 或无值时使用右侧的值。</dd>
      </dl><p>函数调用、循环和赋值请使用“执行脚本”动作。</p></div>}
    </div>}
  </div>;
}
