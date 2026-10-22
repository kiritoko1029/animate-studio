import { useEffect, useState, type ReactNode } from 'react';
import { Copy, Layers, RotateCcw, Trash2, X } from 'lucide-react';
import { blockName, isExtendedComponent, type Block, type BlockProps, type PageDocument } from '../model';
import { patchBlockSetting, sharedValue } from '../lib/component-selection';
import { componentScale, componentScaleBounds, scaleComponent } from '../lib/component-scale';
import { frameSizeLimits, clampFrame } from '../lib/canvas-bounds';
import { getTheme, themePresets, type ThemeId } from '../lib/themes';
import { StudioButton } from './StudioUI';
import { AnimationSettings } from './AnimationSettings';
import { catalogEffects } from '../lib/catalog-effects';
import '../batch-inspector.css';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>;
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
  return <Field label={label}><span className="batch-number"><input aria-label={label} type="number" value={draft} placeholder={mixed ? '多种值' : ''} min={min} max={max} disabled={min > max} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => {
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
    <div className="inspector-heading"><span><Layers size={15}/>批量编辑 · {blocks.length} 个组件</span><StudioButton className="icon-button" aria-label="收起属性面板" onClick={onClose}><X size={15}/></StudioButton></div>
    <div className="inspector-scroll" role="region" aria-label="批量组件属性">
      <div className="batch-selection-summary">{sameType ? blockName(blocks[0].type) : `${new Set(blocks.map(block => block.type)).size} 种组件`}<span>不同值显示为“多种值”</span></div>
      <div className="property-section"><h3>主题</h3><Field label="批量组件主题"><select aria-label="批量组件主题" value={theme.mixed ? '__mixed' : theme.value ?? ''} onChange={event => onTheme((event.target.value || undefined) as ThemeId | undefined)}>
        {theme.mixed && <option value="__mixed" disabled>多种值</option>}<option value="">跟随页面</option>
        {themePresets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        {(document.settings.customThemes ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field><StudioButton className="text-button" onClick={onDesignTheme}>设计主题…</StudioButton></div>
      <div className="property-section"><h3>尺寸与缩放</h3>
        <BatchNumber label="整体缩放" unit="%" values={blocks.map(componentScale)} min={Math.max(...scaleBounds.map(value => value.min))} max={Math.min(...scaleBounds.map(value => value.max))} onChange={value => onBlocksChange(blocks.map(block => scaleComponent(block, document.settings, value)))}/>
        <div className="geometry-fields">{(['width', 'height'] as const).map(key => <BatchNumber key={key} label={key === 'width' ? '宽度 W' : '高度 H'} values={blocks.map(block => block.frame?.[key] ?? 0)} min={key === 'width' ? 40 : 32} max={Math.min(...sizeLimits.map(limits => limits[key]))} onChange={value => onBlocksChange(blocks.map(block => block.frame ? { ...block, frame: clampFrame({ ...block.frame, [key]: value }, document.settings, block.props.contentScale) } : block))}/>)}</div>
      </div>
      <div className="property-section"><h3>外观</h3>
        <div className="geometry-fields"><BatchNumber label="内边距" values={blocks.map(block => block.props.padding ?? 20)} min={0} max={120} onChange={padding => onPatch({ padding })}/><BatchNumber label="圆角" values={blocks.map(block => block.props.radius ?? getTheme(block.props.theme ?? document.settings.theme, document.settings.customThemes).radius)} min={0} max={80} onChange={radius => onPatch({ radius })}/></div>
        {blocks.every(block => ['heading', 'text', 'statistic', 'pricing'].includes(block.type) || isExtendedComponent(block.type) && block.props.fontSize !== undefined) && <BatchNumber label="文字大小" values={blocks.map(block => block.props.fontSize ?? 16)} min={10} max={96} onChange={fontSize => onPatch({ fontSize })}/>}
        {(['accent', 'background', 'color'] as const).map((key, index) => { const values = sharedValue(colors(key)); const label = ['强调颜色', '背景颜色', '文字颜色'][index]; return <Field key={key} label={label}><span className="color-field"><input type="color" aria-label={label} value={values.value} onChange={event => onPatch({ [key]: event.target.value })}/><span>{values.mixed ? '多种值' : values.value?.toUpperCase()}</span></span></Field>; })}
        <Field label="对齐方式"><select aria-label="对齐方式" value={common('align').mixed ? '__mixed' : common('align').value ?? 'left'} onChange={event => onPatch({ align: event.target.value as BlockProps['align'] })}>{common('align').mixed && <option value="__mixed" disabled>多种值</option>}<option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></Field>
        <StudioButton className="text-button" onClick={() => onPatch({ background: undefined, color: undefined, accent: undefined, radius: undefined })}><RotateCcw size={12}/>恢复主题样式</StudioButton>
      </div>
      {sameType && <><div className="property-section"><h3>内容</h3>{(['title', 'label', 'text', 'items', 'url'] as const).filter(key => blocks.every(block => block.props[key] !== undefined)).map(key => { const values = common(key), label = { title: '标题', label: '标签文字', text: '描述文字', items: '内容项目', url: '跳转链接' }[key]; return <Field key={key} label={label}><textarea aria-label={label} rows={key === 'text' || key === 'items' ? 3 : 1} placeholder={values.mixed ? '多种值' : ''} value={values.mixed ? '' : values.value ?? ''} maxLength={key === 'items' ? 20000 : key === 'text' ? 10000 : key === 'url' ? 2048 : 300} onChange={event => onPatch({ [key]: event.target.value })}/></Field>; })}</div>
        <AnimationSettings type={blocks[0].type} value={blocks[0].props.motion} mixedKeys={mixedSettings('motion')} onChange={motion => onPatch({ motion })} onFieldChange={(key, value) => onBlocksChange(blocks.map(block => patchBlockSetting(block, 'motion', key, value)))}/>
      </>}
      <div className="property-section"><h3>入场动效</h3><Field label="入场动效"><select aria-label="入场动效" value={common('animation').mixed ? '__mixed' : common('animation').value ?? 'none'} onChange={event => onPatch({ animation: event.target.value as BlockProps['animation'] })}>{common('animation').mixed && <option value="__mixed" disabled>多种值</option>}<option value="none">无动效</option><option value="fade">轻柔渐入</option><option value="slide">向上浮现</option><option value="scale">弹性缩放</option></select></Field></div>
      <div className="property-section"><Field label="附加动效"><select aria-label="附加动效" value={common('effect').mixed ? '__mixed' : common('effect').value ?? 'none'} onChange={event => onPatch({ effect: event.target.value as BlockProps['effect'], effectOptions: {} })}>{common('effect').mixed && <option value="__mixed" disabled>多种值</option>}{catalogEffects.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
      {!common('effect').mixed && common('effect').value && common('effect').value !== 'none' && <AnimationSettings extra type={`effect:${common('effect').value}`} value={blocks[0].props.effectOptions} mixedKeys={mixedSettings('effectOptions')} onChange={effectOptions => onPatch({ effectOptions })} onFieldChange={(key, value) => onBlocksChange(blocks.map(block => patchBlockSetting(block, 'effectOptions', key, value)))}/>}
    </div>
    <div className="inspector-footer"><StudioButton className="secondary-button" onClick={onDuplicate}><Copy size={14}/>复制所选组件</StudioButton><StudioButton className="icon-button" aria-label="删除所选组件" onClick={onDelete}><Trash2 size={15}/></StudioButton></div>
  </aside>;
}
