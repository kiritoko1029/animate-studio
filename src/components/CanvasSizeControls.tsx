import { t } from '../i18n';
import { useEffect, useState } from 'react';
import { canvasLimits, canvasPresets, type CanvasSize } from '../../shared/canvas-sizes.mjs';
import { StudioButton } from './StudioUI';

export function CanvasSizeSelect({ width, height, onChange, disabled = false }: CanvasSize & { onChange: (size: CanvasSize) => void; disabled?: boolean }) {
  const selected = canvasPresets.find(preset => preset.width === width && preset.height === height);
  return <select className="canvas-size-select" aria-label={t("画布尺寸预设")} title={t("切换画布尺寸；自定义宽高可在页面设置中调整")} disabled={disabled} value={selected?.id ?? 'custom'} onChange={event => {
    const preset = canvasPresets.find(preset => preset.id === event.target.value);
    if (preset) onChange({ width: preset.width, height: preset.height });
  }}>
    {!selected && <option value="custom" disabled>{t("自定义 ·")}{width} × {height}</option>}
    {canvasPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.label} · {preset.width} × {preset.height}</option>)}
  </select>;
}

type DimensionInputProps = { label: string; value: number; min: number; max: number; onChange: (value: number) => void; disabled?: boolean };

export function DimensionInput({ label, value, min, max, onChange, disabled = false }: DimensionInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (disabled) return;
    const parsed = Number(draft);
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : value;
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return <input type="number" aria-label={t(label)} min={min} max={max} step={1} value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(String(value)); }
  }}/>;
}

export function DimensionField(props: DimensionInputProps) {
  return <label className="field"><span className="field-label">{props.label}</span><DimensionInput {...props}/></label>;
}

export function CanvasSizeControls({ width, height, onChange }: CanvasSize & { onChange: (size: CanvasSize) => void }) {
  return <div className="property-section" data-page-setting="size"><h3>{t("画布尺寸")}</h3>
    <div className="canvas-size-presets" role="group" aria-label={t("常用画布尺寸")}>
      {canvasPresets.map(preset => <StudioButton key={preset.id} className="secondary-button" aria-pressed={width === preset.width && height === preset.height} onClick={() => onChange({ width: preset.width, height: preset.height })}>
        <strong>{preset.label}</strong><small>{preset.width} × {preset.height}</small>
      </StudioButton>)}
    </div>
    <div className="geometry-fields">
      <DimensionField label={t("画布宽度")} value={width} min={canvasLimits.minWidth} max={canvasLimits.maxWidth} onChange={width => onChange({ width, height })}/>
      <DimensionField label={t("画布高度")} value={height} min={canvasLimits.minHeight} max={canvasLimits.maxHeight} onChange={height => onChange({ width, height })}/>
    </div>
    <p className="field-hint">{t("单位为 px。自定义尺寸输入完成后，按 Enter 或移开焦点应用；Esc 放弃输入。切换尺寸可撤销。")}</p>
  </div>;
}
