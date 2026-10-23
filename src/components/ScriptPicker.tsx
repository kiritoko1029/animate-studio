import { t, translateMessage } from '../i18n';
import { StudioButton } from './StudioUI';
import { useLayoutEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Code2 } from 'lucide-react';
import type { Script } from '../lib/interactions/types';

export function ScriptPicker({ scripts, script, onSelect, onRename }: { scripts: Script[]; script?: Script; onSelect: (id: string) => void; onRename: (id: string, name: string) => void }) {
  const [name, setName] = useState(script?.name ?? ''), [open, setOpen] = useState(false), [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const focusedScript = useRef<string | undefined>(undefined);
  const id = useId();
  useLayoutEffect(() => { setName(script?.name ?? ''); setError(''); }, [script?.id, script?.name]);
  useLayoutEffect(() => {
    // Wait for the selected script's name to reach the input before selecting it.
    if (script && focusedScript.current !== script.id && name === script.name) {
      focusedScript.current = script.id;
      input.current?.focus(); input.current?.select();
    }
  }, [script?.id, script?.name, name]);
  const commit = () => {
    if (!script) return;
    const next = name.trim();
    if (!next || next.length > 80) { setError(t("请填写 1–80 字的脚本名称")); return; }
    setError(''); setName(next);
    if (next !== script.name) onRename(script.id, next);
  };
  const show = () => { setActive(Math.max(0, scripts.findIndex(item => item.id === script?.id))); setOpen(true); };
  const choose = (index: number) => { const item = scripts[index]; if (item) { commit(); onSelect(item.id); setOpen(false); input.current?.focus(); } };
  return <div className="script-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <div className="script-picker-field"><Code2 size={14} /><input data-escape-local ref={input} role="combobox" aria-label={t("脚本名称")} aria-autocomplete="none" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? `${id}-option-${active}` : undefined} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} placeholder={t("还没有脚本")} title={t("直接编辑名称，点击右侧箭头切换脚本")} disabled={!script} maxLength={80} value={name} onChange={event => { setName(event.target.value); setError(''); setOpen(false); }} onBlur={commit} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) show(); else setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + scripts.length) % scripts.length); }
      if (event.key === 'Enter') { event.preventDefault(); if (open) choose(active); else { commit(); input.current?.select(); } }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setName(script?.name ?? ''); setError(''); }
    }} /><StudioButton type="button" aria-label={t("选择脚本")} aria-expanded={open} disabled={!scripts.length} onMouseDown={event => event.preventDefault()} onClick={() => { if (open) setOpen(false); else show(); input.current?.focus(); }}><ChevronDown size={15} /></StudioButton></div>
    {open && <div className="script-picker-options" id={`${id}-list`} role="listbox" aria-label={t("脚本列表")}>{scripts.map((item, index) => <StudioButton type="button" role="option" id={`${id}-option-${index}`} key={item.id} aria-selected={index === active} tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}><span>{item.name}</span>{item.id === script?.id && <Check size={13} />}</StudioButton>)}</div>}
    {error && <p id={`${id}-error`} className="logic-error" role="alert">{translateMessage(error)}</p>}
  </div>;
}
