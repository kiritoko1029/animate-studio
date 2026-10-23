import { blockName } from '../i18n/catalog';
import { t } from '../i18n';
import { useState } from 'react';
import { Database, X } from 'lucide-react';
import { bindingKeys, bindingLabels, bindingVariableTypes } from '../../shared/interaction-schema.mjs';
import { type Block, type PageDocument } from '../model';
import type { Variable } from '../lib/interactions/types';
import { preferredBindingKey, suggestComponentVariable, variableDefaults, type BindingKey } from '../lib/interactions/component-variable';
import { expressionTypeLabels } from '../lib/interactions/expression-assistance';
import { StudioButton, StudioDialog } from './StudioUI';

const formatInitial = (variable: Variable) => variable.type === 'string' ? String(variable.initial) : JSON.stringify(variable.initial, null, 2);

export function ComponentVariableDialog({ page, block, onCreate, onClose }: { page: PageDocument; block: Block; onCreate: (key: BindingKey, variable: Variable) => void; onClose: () => void }) {
  const [key, setKey] = useState(() => preferredBindingKey(block));
  const [draft, setDraft] = useState(() => suggestComponentVariable(page, block, key));
  const [initial, setInitial] = useState(() => formatInitial(draft));
  const [error, setError] = useState('');
  const full = (page.variables?.length ?? 0) >= 50;
  const chooseProperty = (key: BindingKey) => {
    const next = suggestComponentVariable(page, block, key);
    setKey(key); setDraft(next); setInitial(formatInitial(next)); setError('');
  };
  const chooseType = (type: Variable['type']) => {
    const next = { ...draft, type, initial: variableDefaults[type] };
    setDraft(next); setInitial(formatInitial(next)); setError('');
  };
  const submit = () => {
    try {
      if (draft.type !== 'string' && !initial.trim()) throw new Error(t("请填写初始值。"));
      const value = draft.type === 'string' ? initial : JSON.parse(initial);
      onCreate(key, { ...draft, name: draft.name.trim(), initial: value });
    } catch (error) { setError(error instanceof SyntaxError ? t("初始值格式不正确，请填写有效的数字或 JSON。") : error instanceof Error ? error.message : t("无法创建变量")); }
  };
  return <StudioDialog title={t("为组件创建变量")} className="component-variable-dialog" onClose={onClose}>
    <header className="interaction-header"><h2><Database size={17} />{t("为组件创建变量")}</h2><StudioButton className="icon-button" aria-label={t("关闭创建变量")} onClick={onClose}><X size={17} /></StudioButton></header>
    <form onSubmit={event => { event.preventDefault(); submit(); }} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
      <div className="component-variable-fields">
        <p className="logic-description">{t("创建页面变量并绑定到「")}{blockName(block.type)}{t("」，其他组件也可使用此变量。")}</p>
        <label className="logic-field"><span>{t("变量名称")}</span><input autoFocus aria-label={t("变量名称")} maxLength={40} value={draft.name} onFocus={event => event.currentTarget.select()} onChange={event => setDraft({ ...draft, name: event.target.value })} /><small className="field-hint">{t("以英文字母开头，可包含数字和下划线。")}</small></label>
        <label className="logic-field"><span>{t("绑定到属性")}</span><select aria-label={t("绑定到属性")} value={key} onChange={event => chooseProperty(event.target.value as BindingKey)}>{bindingKeys(block).map(key => <option key={key} value={key}>{t(bindingLabels[key])}</option>)}</select></label>
        <label className="logic-field"><span>{t("变量类型")}</span><select aria-label={t("变量类型")} value={draft.type} onChange={event => chooseType(event.target.value as Variable['type'])}>{bindingVariableTypes(block, key).map(type => <option key={type} value={type}>{t(expressionTypeLabels[type])}</option>)}</select></label>
        <label className="logic-field"><span>{t("初始值")}</span>{draft.type === 'boolean' ? <select aria-label={t("初始值")} value={initial} onChange={event => setInitial(event.target.value)}><option value="false">{t("false · 关闭")}</option><option value="true">{t("true · 开启")}</option></select> : <textarea aria-label={t("初始值")} rows={draft.type === 'number' ? 1 : 3} value={initial} onChange={event => setInitial(event.target.value)} spellCheck={false} />}<small className="field-hint">{draft.type === 'object' || draft.type === 'array' ? t("使用 JSON 格式。") : t("已带入该属性在页面初始数据下的值，可按需修改。")}</small></label>
        {block.bindings?.[key] && <p className="field-hint">{t("此属性已有绑定，创建后将改为使用新变量；原变量会保留。")}</p>}
        {(error || full) && <p className="logic-error" role="alert">{error || t("每个页面最多支持 50 个变量。")}</p>}
      </div>
      <footer className="component-variable-footer"><StudioButton className="secondary-button" onClick={onClose}>{t("取消")}</StudioButton><StudioButton type="submit" className="primary-button" disabled={full}>{t("创建并绑定")}</StudioButton></footer>
    </form>
  </StudioDialog>;
}
