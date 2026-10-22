import { RotateCcw } from 'lucide-react';
import type { Block, PageDocument } from '../model';
import { componentScale, componentScaleBounds, scaleComponent } from '../lib/component-scale';
import { DimensionInput } from './CanvasSizeControls';
import { StudioButton } from './StudioUI';
import '../component-scale.css';

export function ComponentScaleControls({ block, settings, onChange, variant = 'panel' }: {
  block: Block; settings: PageDocument['settings']; onChange: (block: Block) => void; variant?: 'panel' | 'menu';
}) {
  const value = componentScale(block);
  const { min, max } = componentScaleBounds(block, settings);
  const change = (percent: number) => {
    const next = scaleComponent(block, settings, percent);
    if (next !== block) onChange(next);
  };
  return <div className={`component-scale-controls component-scale-controls--${variant}`} role="group" aria-label="组件整体缩放"
    onKeyDown={event => { if (variant === 'menu' && event.key !== 'Escape') event.stopPropagation(); }}>
    <h3>整体缩放 <StudioButton className="text-button" aria-label="恢复组件缩放至 100%" disabled={value === 100 || min > 100 || max < 100} onClick={() => change(100)}><RotateCcw size={12}/>重置</StudioButton></h3>
    <div className="component-scale-inputs">
      <input type="range" aria-label="组件整体缩放滑杆" min={min} max={max} step={1} value={value} onChange={event => change(Number(event.target.value))}/>
      <span className="component-scale-value"><DimensionInput label="组件整体缩放百分比" value={value} min={min} max={max} onChange={change}/><span>%</span></span>
    </div>
  </div>;
}
