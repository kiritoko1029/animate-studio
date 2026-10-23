import { t, translateMessage } from '../../i18n';
import { useEffect, useState } from 'react';
import { ChevronRight, CircleAlert, Cloud, HardDrive, Link2, LoaderCircle, Pencil, Puzzle, RefreshCw, RotateCcw, Save, Sparkles } from 'lucide-react';
import { StudioButton, StudioTooltip } from '../StudioUI';
import { ComponentScaleControls } from '../ComponentScaleControls';
import { ThemePicker } from '../ThemePicker';
import { useAccount } from '../AccountProvider';
import { customFieldLabels, customFieldLimits, isSafeCustomUrl, type CustomFieldKey } from '../../../shared/custom-components.mjs';
import type { Block, BlockFrame, PageDocument } from '../../model';
import type { ThemeId } from '../../lib/themes';
import { canvasBounds, frameSizeLimits } from '../../lib/canvas-bounds';
import { customComponentTheme, declaredFields, definitionFromInstance, updateInstanceDefinition } from '../../lib/custom-components/instances';
import { pickDefinition } from '../../lib/custom-components/library';
import type { DesignerRequest } from './ComponentDesigner';
import { useLibrary } from './useCustomLibrary';

type Props = {
  block: Block;
  document: PageDocument;
  onChange: (block: Block) => void;
  onFrame: (frame: BlockFrame) => void;
  onReset: () => void;
  onOpenDesigner: (request: DesignerRequest) => void;
  onDesignTheme: (scope: 'component' | 'page', theme?: ThemeId) => void;
  onDeleteTheme: (theme: ThemeId) => void;
  notify: (message: string) => void;
};

function FieldInput({ field, value, bound, onCommit }: { field: CustomFieldKey; value: string; bound: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const link = field === 'url' || field === 'imageUrl';
  const invalid = link && !isSafeCustomUrl(draft, field === 'imageUrl');
  const update = (next: string) => { setDraft(next); if (!link || isSafeCustomUrl(next, field === 'imageUrl')) onCommit(next); };
  const label = customFieldLabels[field];
  return <label className="field"><span className="field-label">{t(label)}</span>
    {field === 'text' ? <textarea rows={3} aria-label={t(label)} maxLength={customFieldLimits[field]} value={draft} onChange={event => update(event.target.value)}/>
      : <input aria-label={t(label)} maxLength={customFieldLimits[field]} value={draft} aria-invalid={invalid} placeholder={link ? 'https://example.com' : undefined} onChange={event => update(event.target.value)}/>}
    {invalid ? <span className="field-hint ccd-field-error">{t("请使用 https://、http://、站内 / 路径")}{field === 'url' ? t("、#锚点、mailto: 或 tel:") : ''}{t("；修正前不会应用。")}</span>
      : bound ? <span className="field-hint"><Link2 size={11} className="ccd-inline-icon"/> {t("已在“组件联动”中绑定，运行时显示绑定的值。")}</span> : null}
  </label>;
}

/** Inspector for one placed custom component: the page copy, never the library source. */
export function CustomBlockInspector({ block, document, onChange, onFrame, onReset, onOpenDesigner, onDesignTheme, onDeleteTheme, notify }: Props) {
  const library = useLibrary();
  const { user } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const snapshot = block.props.custom;
  const source = snapshot?.source;
  useEffect(() => { if (source?.kind === 'cloud') library.ensureCloud(); }, [source?.kind, user?.id]);
  if (!snapshot) return <div className="inspector-empty"><CircleAlert size={26}/><h3>{t("组件定义缺失")}</h3><p>{t("请删除此组件，再从“我的组件”重新添加。")}</p></div>;

  const p = block.props;
  const local = source?.kind === 'local' ? library.findLocal(source.id) : null;
  const cloud = source?.kind === 'cloud' ? library.findCloud(source.id) : null;
  const latest = local?.revision ?? cloud?.revision ?? null;
  const state = !source ? 'none' : source.kind === 'cloud' && !user ? 'signed-out'
    : source.kind === 'cloud' && library.cloud.status !== 'ready' ? (library.cloud.status === 'error' ? 'error' : 'checking')
      : latest === null ? 'missing' : latest > source.revision ? 'outdated' : 'current';
  const theme = customComponentTheme(block, document.settings);
  const fields = declaredFields(block);
  const bounds = canvasBounds(document.settings);
  const limits = frameSizeLimits(document.settings, p.contentScale);
  const frame = block.frame;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : t("操作失败，请重试。")); } finally { setBusy(false); }
  }
  async function latestSource() {
    if (!source) throw new Error(t("这个实例没有记录来源组件。"));
    if (source.kind === 'local') {
      const item = library.findLocal(source.id);
      if (!item) throw new Error(t("源组件已不在本机。"));
      return { definition: pickDefinition(item), revision: item.revision };
    }
    const record = await library.loadCloud(source.id);
    return { definition: record.component, revision: record.revision };
  }
  const updateInstance = () => run(async () => {
    const { definition, revision } = await latestSource();
    onChange(updateInstanceDefinition(block, definition, { kind: source!.kind, id: source!.id, revision }));
    notify(t("此实例已更新到 v{0}，保留了位置、尺寸和字段内容，可撤销", { 0: revision }));
  });
  const editSource = () => run(async () => {
    const { definition, revision } = await latestSource();
    onOpenDesigner({ target: { kind: source!.kind, id: source!.id }, definition, revision });
  });
  const saveToLibrary = () => run(async () => {
    const definition = definitionFromInstance(block);
    if (!definition) return;
    const saved = library.saveLocal(definition, { origin: 'page' });
    onChange({ ...block, props: { ...block.props, custom: { ...snapshot, source: { kind: 'local', id: saved.id, revision: saved.revision } } } });
    notify(t("已保存为本机组件「{0}」，此实例与它关联", { 0: saved.name }));
  });

  const sourceText = {
    none: t("这个实例没有记录来源组件。"),
    'signed-out': t("来自账号组件。登录同一账号后可检查更新。"),
    checking: t("来自账号组件，正在检查组件库中的版本…"),
    error: t("来自账号组件，暂时无法检查版本。"),
    missing: t("源组件已删除，或不在当前浏览器 / 账号中。页面中的副本仍可正常显示。"),
    outdated: t("组件库中已有 v{0}，此实例仍是 v{1}。", { 0: latest, 1: source?.revision }),
    current: t("与组件库中的 v{0} 一致。", { 0: latest }),
  }[state];

  return <>
    <div className="inspected-component"><span className="inspected-icon"><Puzzle size={18}/></span><span><strong title={snapshot.name}>{snapshot.name}</strong><small>{t("自定义组件")}{source ? ` · v${source.revision}` : ''}</small></span><StudioTooltip label={t("恢复实例字段为组件默认值，保留代码、位置、尺寸、外观和组件联动；支持撤销")}><StudioButton className="inspector-reset" aria-label={t("恢复实例字段默认值")} disabled={!fields.length} onClick={onReset}><RotateCcw size={13}/><span>{t("恢复默认")}</span></StudioButton></StudioTooltip></div>
    <div className="property-section custom-source-card">
      <h3>{source?.kind === 'cloud' ? <Cloud size={13}/> : <HardDrive size={13}/>} {t("组件来源")}</h3>
      <p className={`custom-source-state custom-source-state--${state}`}>{state === 'checking' && <LoaderCircle size={12} className="spin"/>}{sourceText}</p>
      <div className="custom-source-actions">
        {state === 'outdated' && <StudioButton className="primary-button" disabled={busy} onClick={() => void updateInstance()}><RefreshCw size={13}/>{t("更新此实例")}</StudioButton>}
        {(state === 'current' || state === 'outdated') && <StudioButton className="secondary-button" disabled={busy} onClick={() => void editSource()}><Pencil size={13}/>{t("编辑源组件")}</StudioButton>}
        {state === 'error' && <StudioButton className="secondary-button" disabled={busy} onClick={() => void library.refreshCloud()}><RefreshCw size={13}/>{t("重新检查")}</StudioButton>}
        {(state === 'missing' || state === 'none') && <StudioButton className="secondary-button" disabled={busy} onClick={() => void saveToLibrary()}><Save size={13}/>{t("保存为我的组件")}</StudioButton>}
      </div>
      <p className="field-hint">{t("页面中的组件是插入时的副本：编辑、删除或取消分享源组件都不会改变它，只有点击“更新此实例”才会替换为新版本。")}</p>
      {error && <p className="field-hint ccd-field-error" role="alert">{translateMessage(error)}</p>}
    </div>
    <ComponentScaleControls key={`scale-${block.id}`} block={block} settings={document.settings} onChange={onChange}/>
    <div className="property-section"><h3>{t("实例内容")}</h3>
      {fields.length ? fields.map(field => <FieldInput key={`${block.id}-${field}`} field={field} value={p[field] ?? snapshot.fields?.[field] ?? ''} bound={Boolean(block.bindings?.[field as 'title' | 'text' | 'label'])} onCommit={value => onChange({ ...block, props: { ...block.props, [field]: value } })}/>)
        : <p className="field-hint">{t("这个组件没有声明实例字段。可在设计器的“设置”中启用标题、正文等字段，再更新此实例。")}</p>}
    </div>
    {frame && <div className="property-section"><h3>{t("位置与尺寸")}<span className="precision-label">PX</span></h3><div className="geometry-fields">{(['x', 'y', 'width', 'height'] as const).map((key, index) => { const label = [t("横坐标 X"), t("纵坐标 Y"), t("宽度 W"), t("高度 H")][index]; return <label className="field" key={key}><span className="field-label">{t(label)}</span><input type="number" aria-label={t(label)} min={key === 'width' ? 40 : key === 'height' ? 32 : bounds.margin} max={key === 'width' ? limits.width : key === 'height' ? limits.height : key === 'x' ? Math.max(bounds.left, bounds.right - frame.width) : Math.max(bounds.top, bounds.bottom - frame.height)} value={Math.round(frame[key])} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) onFrame({ ...frame, [key]: value }); }}/></label>; })}</div><p className="field-hint">{t("组件代码会填满这个区域。拖动边框或角点调整大小。")}</p></div>}
    <div className="property-section"><h3>{t("外观")}</h3>
      <p className="field-hint">{t("以下颜色和圆角通过 --as-accent、--as-surface、--as-text、--as-radius 提供给组件，是否使用取决于组件代码。")}</p>
      {([['accent', t("强调颜色")], ['background', t("背景颜色")], ['color', t("文字颜色")]] as const).map(([key, label]) => <label className="field" key={key}><span className="field-label">{t(label)}</span><span className="color-field"><input type="color" aria-label={t(label)} value={key === 'accent' ? theme.accent : key === 'background' ? theme.surface : theme.text} onChange={event => onChange({ ...block, props: { ...block.props, [key]: event.target.value } })}/><span>{(key === 'accent' ? theme.accent : key === 'background' ? theme.surface : theme.text).toUpperCase()}</span></span></label>)}
      <label className="field"><span className="field-label">{t("圆角")}</span><span className="range-field"><input aria-label={t("圆角")} type="range" min={0} max={80} value={parseInt(theme.radius, 10) || 0} onChange={event => onChange({ ...block, props: { ...block.props, radius: Number(event.target.value) } })}/><span>{parseInt(theme.radius, 10) || 0}<small>px</small></span></span></label>
      {(p.accent || p.background || p.color || p.radius !== undefined) && <StudioButton className="text-button" onClick={() => { const { accent: _a, background: _b, color: _c, radius: _r, ...rest } = block.props; onChange({ ...block, props: rest }); }}><RotateCcw size={12}/>{t("恢复主题样式")}</StudioButton>}
    </div>
    <div className="property-section"><h3><Sparkles size={13}/> {t("入场动效")}</h3><select aria-label={t("入场动效")} value={p.animation || 'none'} onChange={event => onChange({ ...block, props: { ...block.props, animation: event.target.value as Block['props']['animation'] } })}><option value="none">{t("无动效")}</option><option value="fade">{t("轻柔渐入")}</option><option value="slide">{t("向上浮现")}</option><option value="scale">{t("弹性缩放")}</option></select><p className="field-hint">{t("动效作用于组件外框；组件内部的动画由组件代码控制。")}</p></div>
    <details className="component-theme-disclosure">
      <summary><ChevronRight size={14}/><strong>{t("组件主题")}</strong><span>{p.theme ? t("独立主题") : t("跟随页面")}</span></summary>
      <ThemePicker customThemes={document.settings.customThemes ?? []} onDesign={theme => onDesignTheme('component', theme)} onDelete={onDeleteTheme} scope="component" value={p.theme} pageTheme={document.settings.theme} onChange={theme => { const { accent: _a, background: _b, color: _c, radius: _r, ...rest } = block.props; onChange({ ...block, props: { ...rest, theme } }); }}/>
    </details>
  </>;
}
