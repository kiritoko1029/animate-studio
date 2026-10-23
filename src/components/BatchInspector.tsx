import { blockName } from '../i18n/catalog';
import { t } from '../i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Copy, Layers, RotateCcw, Trash2, X } from 'lucide-react';
import { isExtendedComponent, type Block, type BlockProps, type PageDocument } from '../model';
import { patchBlockSetting, sharedValue } from '../lib/component-selection';
import { componentScale, componentScaleBounds, scaleComponent } from '../lib/component-scale';
import { frameSizeLimits, clampFrame } from '../lib/canvas-bounds';
import { getTheme, themePresets, type ThemeId } from '../lib/themes';
import { StudioButton } from './StudioUI';
import { AnimationSettings } from './AnimationSettings';
import { catalogEffects } from '../lib/catalog-effects';
import '../batch-inspector.css';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{t(label)}</span>{children}</label>;
}

function BatchNumber({ label, values, min, max, onChange, unit }: { label: string; values: number[]; min: number; max: number; unit?: string; onChange: (value: number) => void }) {
  const { mixed, value } = sharedValue(values);
  const shown = mixed ? '' : String(Math.round(value ?? min));
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    if (!draft.trim() || !Number.isFinite(Number(draft))) { setDraft(shown); return; }
    const next = Math.max(min, Math.min(max, Math.round(Number(draft))));
    setDraft(String(next));
    if (mixed || next !== value) onChange(next);
  };
  return <Field label={t(label)}><span className="batch-number"><input aria-label={t(label)} type="number" value={draft} placeholder={mixed ? t("多种值") : ''} min={min} max={max} disabled={min > max} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(shown); }
  }}/>{unit && <span>{unit}</span>}</span></Field>;
}

export function BatchInspector({ blocks, document, onPatch, onBlocksChange, onTheme, onDesignTheme, onClose, onDelete, onDuplicate }: {
  blocks: Block[]; document: PageDocument; onPatch: (patch: Partial<BlockProps>) => void;
  onBlocksChange: (blocks: Block[]) => void; onTheme: (theme?: ThemeId) => void; onDesignTheme: () => void;
  onClose: () => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const sameType = blocks.every(block => block.type === blocks[0].type);
  const common = <K extends keyof BlockProps>(key: K) => sharedValue(blocks.map(block => block.props[key]));
  const theme = common('theme');
  const mixedSettings = (property: 'motion' | 'effectOptions') => [...new Set(blocks.flatMap(block => Object.keys(block.props[property] ?? {})))].filter(key => sharedValue(blocks.map(block => block.props[property]?.[key])).mixed);
  const sizeLimits = blocks.map(block => frameSizeLimits(document.settings, block.props.contentScale));
  const scaleBounds = blocks.map(block => componentScaleBounds(block, document.settings));
  const colors = (key: 'accent' | 'background' | 'color') => blocks.map(block => {
    const t = getTheme(block.props.theme ?? document.settings.theme, document.settings.customThemes);
    return block.props[key] ?? (key === 'accent' ? block.props.theme ? t.accent : document.settings.accent : key === 'color' ? t.text : ['statistic', 'testimonial', 'pricing', 'card'].includes(block.type) ? t.panel : t.canvas);
  });
  return <aside id="inspector-sidebar-panel" className="inspector batch-inspector">
    <div className="inspector-heading"><span><Layers size={15}/>{t("批量编辑 ·")}{blocks.length} {t("个组件")}</span><StudioButton className="icon-button" aria-label={t("收起属性面板")} onClick={onClose}><X size={15}/></StudioButton></div>
    <div className="inspector-scroll" role="region" aria-label={t("批量组件属性")}>
      <div className="batch-selection-summary">{sameType ? blockName(blocks[0].type) : t("{0} 种组件", { 0: new Set(blocks.map(block => block.type)).size })}<span>{t("不同值显示为“多种值”")}</span></div>
      <div className="property-section"><h3>{t("主题")}</h3><Field label={t("批量组件主题")}><select aria-label={t("批量组件主题")} value={theme.mixed ? '__mixed' : theme.value ?? ''} onChange={event => onTheme((event.target.value || undefined) as ThemeId | undefined)}>
        {theme.mixed && <option value="__mixed" disabled>{t("多种值")}</option>}<option value="">{t("跟随页面")}</option>
        {themePresets.map(item => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
        {(document.settings.customThemes ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field><StudioButton className="text-button" onClick={onDesignTheme}>{t("设计主题…")}</StudioButton></div>
      <div className="property-section"><h3>{t("尺寸与缩放")}</h3>
        <BatchNumber label={t("整体缩放")} unit="%" values={blocks.map(componentScale)} min={Math.max(...scaleBounds.map(value => value.min))} max={Math.min(...scaleBounds.map(value => value.max))} onChange={value => onBlocksChange(blocks.map(block => scaleComponent(block, document.settings, value)))}/>
        <div className="geometry-fields">{(['width', 'height'] as const).map(key => <BatchNumber key={key} label={key === 'width' ? t("宽度 W") : t("高度 H")} values={blocks.map(block => block.frame?.[key] ?? 0)} min={key === 'width' ? 40 : 32} max={Math.min(...sizeLimits.map(limits => limits[key]))} onChange={value => onBlocksChange(blocks.map(block => block.frame ? { ...block, frame: clampFrame({ ...block.frame, [key]: value }, document.settings, block.props.contentScale) } : block))}/>)}</div>
      </div>
      <div className="property-section"><h3>{t("外观")}</h3>
        <div className="geometry-fields"><BatchNumber label={t("内边距")} values={blocks.map(block => block.props.padding ?? 20)} min={0} max={120} onChange={padding => onPatch({ padding })}/><BatchNumber label={t("圆角")} values={blocks.map(block => block.props.radius ?? getTheme(block.props.theme ?? document.settings.theme, document.settings.customThemes).radius)} min={0} max={80} onChange={radius => onPatch({ radius })}/></div>
        {blocks.every(block => ['heading', 'text', 'statistic', 'pricing'].includes(block.type) || isExtendedComponent(block.type) && block.props.fontSize !== undefined) && <BatchNumber label={t("文字大小")} values={blocks.map(block => block.props.fontSize ?? 16)} min={10} max={96} onChange={fontSize => onPatch({ fontSize })}/>}
        {(['accent', 'background', 'color'] as const).map((key, index) => { const values = sharedValue(colors(key)); const label = [t("强调颜色"), t("背景颜色"), t("文字颜色")][index]; return <Field key={key} label={t(label)}><span className="color-field"><input type="color" aria-label={t(label)} value={values.value} onChange={event => onPatch({ [key]: event.target.value })}/><span>{values.mixed ? t("多种值") : values.value?.toUpperCase()}</span></span></Field>; })}
        <Field label={t("对齐方式")}><select aria-label={t("对齐方式")} value={common('align').mixed ? '__mixed' : common('align').value ?? 'left'} onChange={event => onPatch({ align: event.target.value as BlockProps['align'] })}>{common('align').mixed && <option value="__mixed" disabled>{t("多种值")}</option>}<option value="left">{t("左对齐")}</option><option value="center">{t("居中")}</option><option value="right">{t("右对齐")}</option></select></Field>
        <StudioButton className="text-button" onClick={() => onPatch({ background: undefined, color: undefined, accent: undefined, radius: undefined })}><RotateCcw size={12}/>{t("恢复主题样式")}</StudioButton>
      </div>
      {sameType && <><div className="property-section"><h3>{t("内容")}</h3>{(['title', 'label', 'text', 'items', 'url'] as const).filter(key => blocks.every(block => block.props[key] !== undefined)).map(key => { const values = common(key), label = { title: t("标题"), label: t("标签文字"), text: t("描述文字"), items: t("内容项目"), url: t("跳转链接") }[key]; return <Field key={key} label={t(label)}><textarea aria-label={t(label)} rows={key === 'text' || key === 'items' ? 3 : 1} placeholder={values.mixed ? t("多种值") : ''} value={values.mixed ? '' : values.value ?? ''} maxLength={key === 'items' ? 20000 : key === 'text' ? 10000 : key === 'url' ? 2048 : 300} onChange={event => onPatch({ [key]: event.target.value })}/></Field>; })}</div>
        <AnimationSettings type={blocks[0].type} value={blocks[0].props.motion} mixedKeys={mixedSettings('motion')} onChange={motion => onPatch({ motion })} onFieldChange={(key, value) => onBlocksChange(blocks.map(block => patchBlockSetting(block, 'motion', key, value)))}/>
      </>}
      <div className="property-section"><h3>{t("入场动效")}</h3><Field label={t("入场动效")}><select aria-label={t("入场动效")} value={common('animation').mixed ? '__mixed' : common('animation').value ?? 'none'} onChange={event => onPatch({ animation: event.target.value as BlockProps['animation'] })}>{common('animation').mixed && <option value="__mixed" disabled>{t("多种值")}</option>}<option value="none">{t("无动效")}</option><option value="fade">{t("轻柔渐入")}</option><option value="slide">{t("向上浮现")}</option><option value="scale">{t("弹性缩放")}</option></select></Field></div>
      <div className="property-section"><Field label={t("附加动效")}><select aria-label={t("附加动效")} value={common('effect').mixed ? '__mixed' : common('effect').value ?? 'none'} onChange={event => onPatch({ effect: event.target.value as BlockProps['effect'], effectOptions: {} })}>{common('effect').mixed && <option value="__mixed" disabled>{t("多种值")}</option>}{catalogEffects.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></Field></div>
      {!common('effect').mixed && common('effect').value && common('effect').value !== 'none' && <AnimationSettings extra type={`effect:${common('effect').value}`} value={blocks[0].props.effectOptions} mixedKeys={mixedSettings('effectOptions')} onChange={effectOptions => onPatch({ effectOptions })} onFieldChange={(key, value) => onBlocksChange(blocks.map(block => patchBlockSetting(block, 'effectOptions', key, value)))}/>}
    </div>
    <div className="inspector-footer"><StudioButton className="secondary-button" onClick={onDuplicate}><Copy size={14}/>{t("复制所选组件")}</StudioButton><StudioButton className="icon-button" aria-label={t("删除所选组件")} onClick={onDelete}><Trash2 size={15}/></StudioButton></div>
  </aside>;
}
