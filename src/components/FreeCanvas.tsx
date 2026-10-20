import { useCanvasViewport } from './useCanvasViewport';
import { canvasZoomSteps, minCanvasScale, maxCanvasScale } from '../lib/canvas-view';
import { canvasModifierLabel } from '../lib/canvas-shortcuts';
import { StudioButton } from './StudioUI';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Copy, Grid3X3, Magnet, Move, MousePointer2, Plus, Minus, Hand, Scan, Ruler, Trash2 } from 'lucide-react';
import { blockName, type Block, type PageDocument } from '../model';
import { pageThemeStyle } from '../lib/themes';
import { BlockRenderer } from './PageRenderer';
import '../free-canvas.css';

export type CanvasFrame = { x: number; y: number; width: number; height: number };
export type FreeCanvasProps = {
  document: PageDocument;
  revealKey?: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onFrameChange: (id: string, frame: CanvasFrame) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onInsertAfter?: (id: string) => void;
  isDragging: boolean;
  device: 'desktop' | 'mobile';
};

type GridPreferences = { showGrid: boolean; snapToGrid: boolean; gridSize: 8 | 16 | 24 | 32 };
const gridPreferenceKey = 'animate-studio-grid-preferences';
const defaultGridPreferences: GridPreferences = { showGrid: true, snapToGrid: true, gridSize: 8 };

function readGridPreferences(): GridPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(gridPreferenceKey) || 'null');
    if (!saved || typeof saved !== 'object') return defaultGridPreferences;
    return {
      showGrid: typeof saved.showGrid === 'boolean' ? saved.showGrid : true,
      snapToGrid: typeof saved.snapToGrid === 'boolean' ? saved.snapToGrid : true,
      gridSize: [8, 16, 24, 32].includes(saved.gridSize) ? saved.gridSize : 8,
    };
  } catch {
    return defaultGridPreferences;
  }
}

type ResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type Gesture = {
  id: string;
  mode: 'move' | ResizeDirection;
  pointerId: number;
  startX: number;
  startY: number;
  scale: number;
  initial: CanvasFrame;
  latest: CanvasFrame;
  capture: HTMLElement;
};

const handles: { direction: ResizeDirection; label: string }[] = [
  { direction: 'nw', label: '左上角' }, { direction: 'n', label: '上边' },
  { direction: 'ne', label: '右上角' }, { direction: 'e', label: '右边' },
  { direction: 'se', label: '右下角' }, { direction: 's', label: '下边' },
  { direction: 'sw', label: '左下角' }, { direction: 'w', label: '左边' },
];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const sameFrame = (a: CanvasFrame, b: CanvasFrame) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function boundedFrame(frame: CanvasFrame, width: number, height: number): CanvasFrame {
  const w = clamp(frame.width, Math.min(40, width), width);
  const h = clamp(frame.height, Math.min(32, height), Math.min(3000, height));
  return { x: clamp(frame.x, 0, width - w), y: clamp(frame.y, 0, height - h), width: w, height: h };
}

function defaultFrame(block: Block, index: number, width: number, height: number): CanvasFrame {
  return boundedFrame(block.frame ?? { x: 0, y: index * 200, width, height: 200 }, width, height);
}

function nextGestureFrame(gesture: Gesture, clientX: number, clientY: number, width: number, height: number, shiftKey: boolean, gridSize: number, snapToGrid: boolean): CanvasFrame {
  const { initial, mode } = gesture;
  const dx = (clientX - gesture.startX) / gesture.scale;
  const dy = (clientY - gesture.startY) / gesture.scale;
  const align = shiftKey || !snapToGrid ? Math.round : (value: number) => Math.round(value / gridSize) * gridSize;
  if (mode === 'move') {
    return { ...initial, x: clamp(align(initial.x + dx), 0, width - initial.width), y: clamp(align(initial.y + dy), 0, height - initial.height) };
  }
  let left = initial.x;
  let right = initial.x + initial.width;
  let top = initial.y;
  let bottom = initial.y + initial.height;
  if (mode.includes('w')) left = clamp(align(initial.x + dx), 0, right - 40);
  if (mode.includes('e')) right = clamp(align(initial.x + initial.width + dx), left + 40, width);
  if (mode.includes('n')) top = clamp(align(initial.y + dy), Math.max(0, bottom - 3000), bottom - 32);
  if (mode.includes('s')) bottom = clamp(align(initial.y + initial.height + dy), top + 32, Math.min(height, top + 3000));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function FreeCanvas({ document, selected, onSelect, onFrameChange, onDelete, onDuplicate, onInsertAfter, isDragging, device, revealKey = 0 }: FreeCanvasProps) {
  const designWidth = Math.max(40, document.settings.maxWidth);
  const designHeight = Math.max(32, document.settings.canvasHeight ?? 1200);
  const gestureRef = useRef<Gesture | null>(null);
  const [grid, setGrid] = useState<GridPreferences>(readGridPreferences);
  const [live, setLive] = useState<{ id: string; frame: CanvasFrame; mode: Gesture['mode'] } | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' });
  const camera = useCanvasViewport({ width: designWidth, height: designHeight }, device === 'mobile', isDragging || !!live);
  const { scale } = camera.view;
  useEffect(() => {
    const index = document.blocks.findIndex(block => block.id === selected);
    if (index >= 0) camera.reveal(defaultFrame(document.blocks[index], index, designWidth, designHeight));
  }, [selected, revealKey]);
  // Keep the drawn grid legible without changing the actual snapping interval.
  const gridDisplayMultiple = 2 ** Math.max(0, Math.ceil(Math.log2(8 / (grid.gridSize * scale))));
  const displayGridSize = grid.gridSize * gridDisplayMultiple;

  useEffect(() => {
    try { localStorage.setItem(gridPreferenceKey, JSON.stringify(grid)); } catch { /* Canvas controls remain usable if storage is unavailable. */ }
  }, [grid]);

  useEffect(() => {
    const gesture = gestureRef.current;
    if (!gesture || document.blocks.some(block => block.id === gesture.id)) return;
    gestureRef.current = null;
    if (gesture.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
    setLive(null);
  }, [document.blocks]);

  const begin = (event: PointerEvent<HTMLElement>, block: Block, frame: CanvasFrame, mode: Gesture['mode']) => {
    if (event.button !== 0 || isDragging || gestureRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(block.id);
    const element = event.currentTarget;
    element.closest<HTMLElement>('[data-block-id]')?.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    gestureRef.current = { id: block.id, mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scale, initial: frame, latest: frame, capture: element };
    setLive({ id: block.id, frame, mode });
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const frame = nextGestureFrame(gesture, event.clientX, event.clientY, designWidth, designHeight, event.shiftKey, grid.gridSize, grid.snapToGrid);
    gesture.latest = frame;
    setLive({ id: gesture.id, frame, mode: gesture.mode });
  };

  const finish = (event: PointerEvent<HTMLElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    gestureRef.current = null;
    if (gesture.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
    setLive(null);
    if (!cancelled && !sameFrame(gesture.initial, gesture.latest)) onFrameChange(gesture.id, gesture.latest);
  };

  const keydown = (event: KeyboardEvent<HTMLDivElement>, block: Block, frame: CanvasFrame) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Escape' && gestureRef.current) {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
      setLive(null);
      event.stopPropagation();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(block.id);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 8 : 1;
    const next = boundedFrame({ ...frame, x: frame.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: frame.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }, designWidth, designHeight);
    if (!sameFrame(frame, next)) onFrameChange(block.id, next);
  };

  const stageStyle = {
    width: designWidth, height: designHeight, transform: `translate(${camera.view.x}px, ${camera.view.y}px) scale(${scale})`,
    ...pageThemeStyle(document.settings),
    '--canvas-scale': scale, '--canvas-grid-size': `${displayGridSize}px`,
  } as CSSProperties;

  return <div className={`free-canvas ${device === 'mobile' ? 'free-canvas--mobile' : ''} ${camera.canPan ? 'free-canvas--hand' : ''} ${camera.panning ? 'free-canvas--panning' : ''} ${live ? 'free-canvas--manipulating' : ''}`}>
    <div className="free-canvas-meta">
      <span><Ruler size={13} /><strong>{designWidth} × {designHeight}</strong><span>设计画布</span></span>
      <div className="free-canvas-meta-controls" role="toolbar" aria-label="画布辅助工具">
        <div className="free-canvas-grid-controls">
          <StudioButton type="button" aria-label="平移画布工具" aria-pressed={camera.handTool} title="平移画布；也可按住空格拖动或使用鼠标中键" className={camera.handTool ? 'is-active' : ''} onClick={() => camera.setHandTool(!camera.handTool)}><Hand size={13}/><span>平移</span></StudioButton>
          <StudioButton type="button" className={grid.showGrid ? 'is-active' : ''} aria-label="显示网格" title="显示网格" aria-pressed={grid.showGrid} onClick={() => setGrid(current => ({ ...current, showGrid: !current.showGrid }))}><Grid3X3 size={13} /><span>网格</span></StudioButton>
          <StudioButton type="button" className={grid.snapToGrid ? 'is-active' : ''} aria-label="网格吸附" title="网格吸附" aria-pressed={grid.snapToGrid} onClick={() => setGrid(current => ({ ...current, snapToGrid: !current.snapToGrid }))}><Magnet size={13} /><span>吸附</span></StudioButton>
          <select aria-label="网格间距" title={`实际网格与吸附间距；缩小视图仅显示主网格，当前显示 ${displayGridSize} px 间隔`} value={grid.gridSize} onChange={event => setGrid(current => ({ ...current, gridSize: Number(event.target.value) as GridPreferences['gridSize'] }))}>{[8, 16, 24, 32].map(size => <option key={size} value={size}>{size} px</option>)}</select>
        </div>
        <div className="free-canvas-zoom-controls">
          <StudioButton aria-label="缩小画布" title="缩小画布（−）" disabled={scale <= minCanvasScale || !!live || isDragging} onClick={() => camera.zoomTo(scale / 1.2)}><Minus size={13}/></StudioButton>
          <select className="free-canvas-zoom" aria-label="画布缩放" disabled={!!live || isDragging} value={camera.view.mode === 'fit' ? 'fit' : String(scale)} onChange={event => event.target.value === 'fit' ? camera.fit() : camera.zoomTo(Number(event.target.value))}>
            <option value="fit">适应画布{camera.view.mode === 'fit' ? ` · ${Math.round(scale * 100)}%` : ''}</option>
            {!canvasZoomSteps.includes(scale) && camera.view.mode !== 'fit' && <option value={String(scale)}>当前 {Math.round(scale * 1000) / 10}%</option>}
            {canvasZoomSteps.map(step => <option key={step} value={String(step)}>{Math.round(step * 100)}%</option>)}
          </select>
          <StudioButton aria-label="放大画布" title="放大画布（+）" disabled={scale >= maxCanvasScale || !!live || isDragging} onClick={() => camera.zoomTo(scale * 1.2)}><Plus size={13}/></StudioButton>
          <StudioButton aria-label="适应画布" title={`适应画布（${canvasModifierLabel} + 0）`} disabled={!!live || isDragging} onClick={camera.fit}><Scan size={14}/></StudioButton>
        </div>
      </div>
    </div>
    <div className="free-canvas-viewport" ref={camera.viewportRef} data-canvas-viewport tabIndex={0} role="region" aria-label="画布视野" {...camera.handlers}>
          <div
            ref={setNodeRef}
            data-free-stage
            data-scale={scale}
            className={`free-canvas-stage page-surface ${grid.showGrid ? 'free-canvas-stage--grid' : ''} ${isOver && isDragging ? 'free-canvas-stage--over' : ''}`}
            style={stageStyle}
            aria-label="自由编辑画布"
            onPointerDown={event => { if (event.target === event.currentTarget) onSelect(null); }}
          >
            {!document.blocks.length && <div className="free-canvas-empty"><div><Plus size={25} strokeWidth={1.4} /></div><h3>从一个组件开始</h3><p>从左侧拖入组件，放在你想要的位置</p><span><Move size={13} /> 自由移动 <span>·</span> 拖动边角调整大小</span></div>}
            {document.blocks.map((block, index) => {
              const frame = live?.id === block.id ? live.frame : defaultFrame(block, index, designWidth, designHeight);
              const active = selected === block.id;
              const name = blockName(block.type);
              return <div
                key={block.id}
                data-block-id={block.id}
                className={`free-canvas-frame ${active ? 'free-canvas-frame--selected' : ''} ${live?.id === block.id ? 'free-canvas-frame--active' : ''}`}
                style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, zIndex: active ? document.blocks.length + 1 : index + 1 }}
                role="group"
                aria-label={`${name}，位置 ${Math.round(frame.x)}, ${Math.round(frame.y)}，尺寸 ${Math.round(frame.width)} × ${Math.round(frame.height)}。方向键移动，Shift 加方向键移动 8 像素。`}
                tabIndex={0}
                onFocus={event => { if (event.target === event.currentTarget) onSelect(block.id); }}
                onPointerDown={event => begin(event, block, frame, 'move')}
                onPointerMove={move}
                onPointerUp={event => finish(event)}
                onPointerCancel={event => finish(event, true)}
                onLostPointerCapture={event => finish(event, true)}
                onKeyDown={event => keydown(event, block, frame)}
              >
                <div className="free-canvas-block-content"><BlockRenderer block={block} settings={document.settings} interactive={false} bounded /></div>
                {active && <>
                  <div className={`free-canvas-selection-bar ${frame.x + 200 / scale > designWidth ? 'free-canvas-selection-bar--right' : ''}`} onPointerDown={event => begin(event, block, frame, 'move')}>
                    <span className="free-canvas-selection-label"><Move size={12} /><strong>{name}</strong></span>
                    <span className="free-canvas-selection-actions">
                      {onInsertAfter && <StudioButton type="button" title="在此组件后插入" aria-label="在此组件后插入" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onInsertAfter(block.id); }}><Plus size={13} /></StudioButton>}
                      <StudioButton type="button" title={`复制${name}`} aria-label={`复制${name}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onDuplicate(block.id); }}><Copy size={12} /></StudioButton>
                      <StudioButton type="button" title={`删除${name}`} aria-label={`删除${name}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onDelete(block.id); }}><Trash2 size={12} /></StudioButton>
                    </span>
                  </div>
                  <div className="free-canvas-measure"><strong>{Math.round(frame.width)} × {Math.round(frame.height)}</strong><span>X {Math.round(frame.x)} · Y {Math.round(frame.y)}</span></div>
                  {handles.map(handle => <button
                    key={handle.direction}
                    type="button"
                    tabIndex={-1}
                    aria-label={`拖动${name}${handle.label}调整大小`}
                    title={`拖动${handle.label}调整大小`}
                    className={`free-canvas-resize-handle free-canvas-resize-handle--${handle.direction}`}
                    onPointerDown={event => begin(event, block, frame, handle.direction)}
                  />)}
                </>}
              </div>;
            })}
            {live && <div className="free-canvas-guides" aria-hidden="true"><i className="free-canvas-guide-v" style={{ left: live.frame.x }} /><i className="free-canvas-guide-v" style={{ left: live.frame.x + live.frame.width }} /><i className="free-canvas-guide-h" style={{ top: live.frame.y }} /><i className="free-canvas-guide-h" style={{ top: live.frame.y + live.frame.height }} /></div>}
            {isDragging && <div className={`free-canvas-drop-hint ${isOver ? 'is-over' : ''}`}><Plus size={14} />{isOver ? '松开，放置在这里' : '拖入画布，自由放置'}</div>}
          </div>
    </div>
    <div className="free-canvas-footnote"><MousePointer2 size={12}/><span>{canvasModifierLabel} + 滚轮缩放 · 空格拖动 / 中键平移 · {canvasModifierLabel} + 0 适应 · {canvasModifierLabel} + 1 原始大小</span></div>
  </div>;
}
