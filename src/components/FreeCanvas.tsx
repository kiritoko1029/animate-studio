import { useCanvasViewport } from './useCanvasViewport';
import { canvasZoomSteps, minCanvasScale, maxCanvasScale } from '../lib/canvas-view';
import { canvasModifierLabel } from '../lib/canvas-shortcuts';
import { StudioButton } from './StudioUI';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { Copy, Grid3X3, Magnet, Move, MousePointer2, Plus, Minus, Hand, Scan, Ruler, SquareDashed, Trash2, Play, Square, RotateCcw, Settings2 } from 'lucide-react';
import { blockName, type Block, type PageDocument } from '../model';
import { pageThemeStyle } from '../lib/themes';
import { BlockRenderer } from './PageRenderer';
import { CanvasSizeSelect, DimensionInput } from './CanvasSizeControls';
import { CanvasComponentMenu, type InspectorTab } from './CanvasComponentMenu';
import { CanvasPageMenu, type CanvasGridPreferences, type PageSettingsSection } from './CanvasPageMenu';
import { canvasBounds, clampFrame, frameSizeLimits, type CanvasBounds, type HorizontalAlignment } from '../lib/canvas-bounds';
import { componentScale } from '../lib/component-scale';
import '../free-canvas.css';
import { CanvasScrollProgress } from './PageScrollProgress';
import { scrollPercentage } from '../lib/scroll-progress';
import type { LayerAction } from '../lib/layers';
import { frameUnion, isSelectionInput, selectionFrames, translateSelection } from '../lib/component-selection';

export type CanvasFrame = { x: number; y: number; width: number; height: number };
export type FreeCanvasProps = {
  document: PageDocument;
  revealKey?: number;
  selected: string | null;
  selectedIds?: string[];
  onSelect: (id: string | null, additive?: boolean) => void;
  onSelectAll?: () => void;
  onFramesChange?: (frames: Record<string, CanvasFrame>) => void;
  onFrameChange: (id: string, frame: CanvasFrame) => void;
  onBlockChange: (block: Block) => void;
  onCanvasSizeChange: (size: { width: number; height: number }) => void;
  onPageMarginChange: (margin: number) => void;
  onPageSettings: (section: PageSettingsSection) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onInspect: (id: string, tab: InspectorTab) => void;
  onCreateVariable: (id: string) => void;
  onAlign: (id: string, alignment: HorizontalAlignment) => void;
  onFillWidth: (id: string) => void;
  onLayerChange: (id: string, action: LayerAction) => void;
  onInsertAfter?: (id: string) => void;
  isDragging: boolean;
  device: 'desktop' | 'mobile';
};

type GridPreferences = CanvasGridPreferences;
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
  groupFrames?: Record<string, CanvasFrame>;
  sizeLimits: { width: number; height: number };
};

const handles: { direction: ResizeDirection; label: string }[] = [
  { direction: 'nw', label: '左上角' }, { direction: 'n', label: '上边' },
  { direction: 'ne', label: '右上角' }, { direction: 'e', label: '右边' },
  { direction: 'se', label: '右下角' }, { direction: 's', label: '下边' },
  { direction: 'sw', label: '左下角' }, { direction: 'w', label: '左边' },
];
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const sameFrame = (a: CanvasFrame, b: CanvasFrame) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function defaultFrame(block: Block, index: number, settings: PageDocument['settings']): CanvasFrame {
  return clampFrame(block.frame ?? { x: 0, y: index * 200, width: settings.maxWidth, height: 200 }, settings, block.props.contentScale);
}

function nextGestureFrame(gesture: Gesture, clientX: number, clientY: number, bounds: CanvasBounds, shiftKey: boolean, gridSize: number, snapToGrid: boolean): CanvasFrame {
  const { initial, mode } = gesture;
  const dx = (clientX - gesture.startX) / gesture.scale;
  const dy = (clientY - gesture.startY) / gesture.scale;
  const align = shiftKey || !snapToGrid ? Math.round : (value: number) => Math.round(value / gridSize) * gridSize;
  if (mode === 'move') {
    return { ...initial, x: clamp(align(initial.x + dx), bounds.left, bounds.right - initial.width), y: clamp(align(initial.y + dy), bounds.top, bounds.bottom - initial.height) };
  }
  let left = initial.x;
  let right = initial.x + initial.width;
  let top = initial.y;
  let bottom = initial.y + initial.height;
  if (mode.includes('w')) left = clamp(align(initial.x + dx), Math.max(bounds.left, right - gesture.sizeLimits.width), right - 40);
  if (mode.includes('e')) right = clamp(align(initial.x + initial.width + dx), left + 40, Math.max(bounds.right, bounds.left + gesture.sizeLimits.width));
  if (mode.includes('n')) top = clamp(align(initial.y + dy), Math.max(bounds.top, bottom - gesture.sizeLimits.height), bottom - 32);
  if (mode.includes('s')) bottom = clamp(align(initial.y + initial.height + dy), top + 32, Math.min(Math.max(bounds.bottom, bounds.top + gesture.sizeLimits.height), top + gesture.sizeLimits.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function FreeCanvas({ document, selected, selectedIds, onSelect, onSelectAll, onFramesChange, onFrameChange, onBlockChange, onCanvasSizeChange, onPageMarginChange, onPageSettings, onDelete, onDuplicate, onInspect, onCreateVariable, onAlign, onFillWidth, onLayerChange, onInsertAfter, isDragging, device, revealKey = 0 }: FreeCanvasProps) {
  const designWidth = Math.max(40, document.settings.maxWidth);
  const designHeight = Math.max(32, document.settings.canvasHeight ?? 1400);
  const bounds = canvasBounds(document.settings);
  const gestureRef = useRef<Gesture | null>(null);
  const [grid, setGrid] = useState<GridPreferences>(readGridPreferences);
  const [interactingId, setInteractingId] = useState<string | null>(null);
  const [replays, setReplays] = useState<Record<string, number>>({});
  const replay = (id: string) => setReplays(current => ({ ...current, [id]: (current[id] || 0) + 1 }));
  const interact = (id: string) => { setMenuId(null); onSelect(id); setInteractingId(id); camera.setHandTool(false); replay(id); };
  const [menuId, setMenuId] = useState<string | null>(null);
  const [live, setLive] = useState<{ id: string; frame: CanvasFrame; mode: Gesture['mode']; frames?: Record<string, CanvasFrame> } | null>(null);
  const selection = new Set(selectedIds ?? (selected ? [selected] : []));
  const selectedBlocks = document.blocks.filter(block => selection.has(block.id));
  const multiple = selectedBlocks.length > 1;
  const selectedScales = new Set(selectedBlocks.map(componentScale));
  const groupFrames = multiple ? live?.frames ?? selectionFrames(selectedBlocks, document.settings) : {};
  const groupFrame = multiple ? frameUnion(groupFrames) : null;
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' });
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const stageRef = useCallback((node: HTMLDivElement | null) => { setNodeRef(node); setStageElement(node); }, [setNodeRef]);
  const camera = useCanvasViewport({ width: designWidth, height: designHeight }, device === 'mobile', isDragging || !!live);
  const { scale } = camera.view;
  useEffect(() => {
    const index = document.blocks.findIndex(block => block.id === selected);
    if (index >= 0 && !multiple) camera.reveal(defaultFrame(document.blocks[index], index, document.settings));
  }, [selected, revealKey]);
  useEffect(() => {
    if (interactingId && (multiple || selected !== interactingId || isDragging || !document.blocks.some(block => block.id === interactingId))) setInteractingId(null);
  }, [selected, multiple, isDragging, interactingId, document.blocks]);
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
    if (event.button !== 0 || event.ctrlKey || isDragging || gestureRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setInteractingId(null);
    if (!selection.has(block.id)) onSelect(block.id);
    const element = event.currentTarget;
    stageElement?.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`)?.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    const frames = mode === 'move' && multiple && selection.has(block.id) ? selectionFrames(selectedBlocks, document.settings) : undefined;
    const initial = frames ? frameUnion(frames)! : frame;
    gestureRef.current = { id: block.id, mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scale, initial, latest: initial, capture: element, groupFrames: frames, sizeLimits: frameSizeLimits(document.settings, block.props.contentScale) };
    setLive({ id: block.id, frame: initial, mode, frames });
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const frame = nextGestureFrame(gesture, event.clientX, event.clientY, bounds, event.shiftKey, grid.gridSize, grid.snapToGrid);
    gesture.latest = frame;
    const frames = gesture.groupFrames ? translateSelection(gesture.groupFrames, document.settings, frame.x - gesture.initial.x, frame.y - gesture.initial.y) : undefined;
    setLive({ id: gesture.id, frame, mode: gesture.mode, frames });
  };

  const finish = (event: PointerEvent<HTMLElement>, cancelled = false) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    gestureRef.current = null;
    if (gesture.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
    setLive(null);
    if (!cancelled && gesture.groupFrames && sameFrame(gesture.initial, gesture.latest) && gesture.capture.classList.contains('free-canvas-frame')) onSelect(gesture.id);
    if (!cancelled && !sameFrame(gesture.initial, gesture.latest)) {
      if (gesture.groupFrames) onFramesChange?.(translateSelection(gesture.groupFrames, document.settings, gesture.latest.x - gesture.initial.x, gesture.latest.y - gesture.initial.y));
      else onFrameChange(gesture.id, gesture.latest);
    }
  };

  const keydown = (event: KeyboardEvent<HTMLDivElement>, block: Block, frame: CanvasFrame) => {
    if (interactingId === block.id) {
      event.stopPropagation();
      if (event.key === 'Escape' && !event.defaultPrevented && !(event.target as HTMLElement).closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) {
        event.preventDefault(); setInteractingId(null); event.currentTarget.focus({ preventScroll: true });
      }
      return;
    }
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
      if (multiple) onInspect(block.id, 'component');
      else if (selected === block.id) interact(block.id);
      else onSelect(block.id);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 8 : 1;
    if (multiple) {
      onFramesChange?.(translateSelection(selectionFrames(selectedBlocks, document.settings), document.settings, event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0, event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0));
      return;
    }
    const next = clampFrame({ ...frame, x: frame.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: frame.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }, document.settings, block.props.contentScale);
    if (!sameFrame(frame, next)) onFrameChange(block.id, next);
  };

  const stageStyle = {
    width: designWidth, height: designHeight, transform: `translate(${camera.view.x}px, ${camera.view.y}px) scale(${scale})`,
    ...pageThemeStyle(document.settings),
    '--canvas-scale': scale, '--canvas-grid-size': `${displayGridSize}px`, '--canvas-margin': `${bounds.margin}px`,
  } as CSSProperties;

  return <CanvasScrollProgress.Provider value={scrollPercentage(-camera.view.y, designHeight * scale, camera.viewportRef.current?.clientHeight ?? 0)}><div className={`free-canvas ${device === 'mobile' ? 'free-canvas--mobile' : ''} ${camera.canPan ? 'free-canvas--hand' : ''} ${camera.panning ? 'free-canvas--panning' : ''} ${live ? 'free-canvas--manipulating' : ''}`}>
    <div className="free-canvas-meta">
      <span><Ruler size={13} /><CanvasSizeSelect width={designWidth} height={designHeight} onChange={onCanvasSizeChange} disabled={!!live||isDragging||camera.panning}/></span>
      <div className="free-canvas-meta-controls" role="toolbar" aria-label="画布辅助工具">
        <div className="free-canvas-grid-controls">
          <StudioButton type="button" aria-label="平移画布工具" aria-pressed={camera.handTool} title="平移画布；也可按住空格拖动或使用鼠标中键" className={camera.handTool ? 'is-active' : ''} onClick={() => camera.setHandTool(!camera.handTool)}><Hand size={13}/><span>平移</span></StudioButton>
          <StudioButton type="button" className={grid.showGrid ? 'is-active' : ''} aria-label="显示网格" title="显示网格" aria-pressed={grid.showGrid} onClick={() => setGrid(current => ({ ...current, showGrid: !current.showGrid }))}><Grid3X3 size={13} /><span>网格</span></StudioButton>
          <StudioButton type="button" className={grid.snapToGrid ? 'is-active' : ''} aria-label="网格吸附" title="网格吸附" aria-pressed={grid.snapToGrid} onClick={() => setGrid(current => ({ ...current, snapToGrid: !current.snapToGrid }))}><Magnet size={13} /><span>吸附</span></StudioButton>
          <select aria-label="网格间距" title={`实际网格与吸附间距；缩小视图仅显示主网格，当前显示 ${displayGridSize} px 间隔`} value={grid.gridSize} onChange={event => setGrid(current => ({ ...current, gridSize: Number(event.target.value) as GridPreferences['gridSize'] }))}>{[8, 16, 24, 32].map(size => <option key={size} value={size}>{size} px</option>)}</select>
        </div>
        <label className="canvas-margin-control" title="全局页边距（0–120 px）；Enter 或移开焦点应用，Esc 取消">
          <SquareDashed size={13} aria-hidden="true"/><span>页边距</span>
          <DimensionInput label="全局页边距" value={document.settings.padding} min={0} max={120} onChange={onPageMarginChange} disabled={!!live || isDragging || camera.panning}/><span className="canvas-margin-unit">px</span>
        </label>
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
    <CanvasPageMenu disabled={isDragging || !!live || camera.panning} settings={document.settings} grid={grid}
      onSelectCanvas={() => { setMenuId(null); onSelect(null); }} onSizeChange={onCanvasSizeChange} onMarginChange={onPageMarginChange}
      onPageSettings={onPageSettings} onGridChange={patch => setGrid(current => ({ ...current, ...patch }))} onFit={camera.fit} onActualSize={() => camera.zoomTo(1)}>
    <div className="free-canvas-viewport" ref={camera.viewportRef} data-canvas-viewport tabIndex={0} role="region" aria-label="画布视野" {...camera.handlers}
      onKeyDownCapture={event => {
        if (event.defaultPrevented || isSelectionInput(event.target) || isDragging || camera.panning) return;
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'a' && onSelectAll) {
          event.preventDefault(); event.stopPropagation(); setInteractingId(null); setMenuId(null); onSelectAll();
        } else if (event.key === 'Escape' && !gestureRef.current) {
          event.preventDefault(); event.stopPropagation(); onSelect(null); camera.viewportRef.current?.focus({ preventScroll: true });
        }
      }}
      onKeyDown={event => { if (event.target === event.currentTarget && selectedBlocks.length) keydown(event, selectedBlocks[0], defaultFrame(selectedBlocks[0], document.blocks.indexOf(selectedBlocks[0]), document.settings)); }}
      onPointerDown={event => { if (event.button === 0 && event.target === event.currentTarget && !isDragging) { onSelect(null); event.currentTarget.focus({ preventScroll: true }); } }}>
          <div
            ref={stageRef}
            data-free-stage
            data-scale={scale}
            className={`free-canvas-stage page-surface ${grid.showGrid ? 'free-canvas-stage--grid' : ''} ${document.blocks.some(block => block.id === selected) ? 'free-canvas-stage--has-selection' : ''} ${isOver && isDragging ? 'free-canvas-stage--over' : ''}`}
            style={stageStyle}
            aria-label="自由编辑画布"
            onPointerDown={event => { if (event.button === 0 && event.target === event.currentTarget && !isDragging) { onSelect(null); camera.viewportRef.current?.focus({ preventScroll: true }); } }}
          >
            {bounds.margin > 0 && <div className="free-canvas-margin" aria-hidden="true" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} />}
            {!document.blocks.length && <div className="free-canvas-empty"><div><Plus size={25} strokeWidth={1.4} /></div><h3>从一个组件开始</h3><p>从左侧拖入组件，放在你想要的位置</p><span><Move size={13} /> 自由移动 <span>·</span> 拖动边角调整大小</span></div>}
            {document.blocks.map((block, index) => {
              const frame = live?.frames?.[block.id] ?? (live?.id === block.id && !live.frames ? live.frame : defaultFrame(block, index, document.settings));
              const active = selection.has(block.id);
              const interacting = active && interactingId === block.id;
              const name = blockName(block.type);
              return <CanvasComponentMenu key={block.id} block={block} selectionCount={active ? selectedBlocks.length : 1} settings={document.settings} onBlockChange={onBlockChange} layerIndex={index} layerCount={document.blocks.length} onLayerChange={onLayerChange} open={menuId === block.id && active} disabled={interacting || isDragging || !!live || camera.panning}
                onOpenChange={open => { setMenuId(open ? block.id : null); if (open && !active) onSelect(block.id); }}
                onInspect={onInspect} onCreateVariable={onCreateVariable} onAlign={onAlign} onFillWidth={onFillWidth} onDuplicate={onDuplicate} onDelete={onDelete}><div
                data-block-id={block.id}
                data-selected={active || undefined}
                data-canvas-interactive={interacting || undefined}
                className={`free-canvas-frame ${active ? 'free-canvas-frame--selected' : ''} ${interacting ? 'free-canvas-frame--interactive' : ''} ${live?.id === block.id ? 'free-canvas-frame--active' : ''}`}
                style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, zIndex: index + 1 }}
                role="group"
                aria-label={`${name}，位置 ${Math.round(frame.x)}, ${Math.round(frame.y)}，尺寸 ${Math.round(frame.width)} × ${Math.round(frame.height)}。方向键移动，Shift 加方向键移动 8 像素；右键或 Shift + F10 打开组件菜单；双击或 Enter 预览交互，Esc 返回编辑。`}
                tabIndex={0}
                onFocus={event => { if (event.target === event.currentTarget && !active) onSelect(block.id); }}
                onPointerDown={event => {
                  if (interacting) event.stopPropagation();
                  else if (event.button === 0 && (event.shiftKey || event.metaKey || event.ctrlKey) && !isDragging) {
                    event.preventDefault(); event.stopPropagation(); setInteractingId(null); onSelect(block.id, true); camera.viewportRef.current?.focus({ preventScroll: true });
                  } else begin(event, block, frame, 'move');
                }}
                onDoubleClick={event => { if (!interacting && !isDragging) { event.preventDefault(); event.stopPropagation(); interact(block.id); } }}
                onPointerMove={move}
                onPointerUp={event => finish(event)}
                onPointerCancel={event => finish(event, true)}
                onLostPointerCapture={event => finish(event, true)}
                onKeyDown={event => keydown(event, block, frame)}
              >
                <div className="free-canvas-block-content"><BlockRenderer key={replays[block.id] || 0} block={block} settings={document.settings} interactive={interacting} bounded /></div>
                {active && !multiple && stageElement && createPortal(<div className="free-canvas-selection-overlay" data-selection-for={block.id} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, zIndex: document.blocks.length + 1 }}>
                  <div className={`free-canvas-selection-bar ${frame.x + 280 / scale > designWidth ? 'free-canvas-selection-bar--right' : ''}`} onPointerDown={event => begin(event, block, frame, 'move')}>
                    <span className="free-canvas-selection-label"><Move size={12} /><strong>{name}</strong></span>
                    <span className="free-canvas-selection-actions">
                      <StudioButton className="canvas-interaction-toggle" type="button" aria-label={interacting ? `结束${name}交互预览` : `预览${name}交互`} title={interacting ? '结束交互预览（Esc）' : '测试组件自身交互（也可双击）；页面联动请使用预览页面'} aria-pressed={interacting} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (interacting) setInteractingId(null); else interact(block.id); }}>{interacting ? <Square size={12}/> : <Play size={12}/>}<span>{interacting ? '结束' : '交互'}</span></StudioButton>
                      <StudioButton type="button" aria-label={`重播${name}动效`} title="重播组件动效" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); replay(block.id); }}><RotateCcw size={12}/></StudioButton>
                      {onInsertAfter && <StudioButton type="button" title="在此组件后插入" aria-label="在此组件后插入" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onInsertAfter(block.id); }}><Plus size={13} /></StudioButton>}
                      <StudioButton type="button" title={`复制${name}`} aria-label={`复制${name}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onDuplicate(block.id); }}><Copy size={12} /></StudioButton>
                      <StudioButton type="button" title={`删除${name}`} aria-label={`删除${name}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onDelete(block.id); }}><Trash2 size={12} /></StudioButton>
                    </span>
                  </div>
                  <div className="free-canvas-measure"><strong>{Math.round(frame.width)} × {Math.round(frame.height)}</strong><span>缩放 {componentScale(block)}%</span><span>X {Math.round(frame.x)} · Y {Math.round(frame.y)}</span></div>
                  {!interacting && handles.map(handle => <button
                    key={handle.direction}
                    type="button"
                    tabIndex={-1}
                    aria-label={`拖动${name}${handle.label}调整大小`}
                    title={`拖动${handle.label}调整大小`}
                    className={`free-canvas-resize-handle free-canvas-resize-handle--${handle.direction}`}
                    onPointerDown={event => begin(event, block, frame, handle.direction)}
                  />)}
                </div>, stageElement)}
              </div></CanvasComponentMenu>;
            })}
            {groupFrame && <div className="free-canvas-selection-overlay" data-selection-count={selectedBlocks.length} style={{ left: groupFrame.x, top: groupFrame.y, width: groupFrame.width, height: groupFrame.height, zIndex: document.blocks.length + 1 }}
              onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
              <div className="free-canvas-selection-bar" onPointerDown={event => begin(event, selectedBlocks[0], groupFrame, 'move')}>
                <span className="free-canvas-selection-label"><Move size={12}/><strong>已选 {selectedBlocks.length} 个组件</strong></span>
                <span className="free-canvas-selection-actions">
                  <StudioButton aria-label="批量编辑组件属性" title="批量编辑组件属性" onPointerDown={event => event.stopPropagation()} onClick={() => onInspect(selectedBlocks[0].id, 'component')}><Settings2 size={12}/></StudioButton>
                  <StudioButton aria-label="复制所选组件" title="复制所选组件" onPointerDown={event => event.stopPropagation()} onClick={() => onDuplicate(selectedBlocks[0].id)}><Copy size={12}/></StudioButton>
                  <StudioButton aria-label="删除所选组件" title="删除所选组件" onPointerDown={event => event.stopPropagation()} onClick={() => onDelete(selectedBlocks[0].id)}><Trash2 size={12}/></StudioButton>
                </span>
              </div>
              <div className="free-canvas-measure"><strong>{Math.round(groupFrame.width)} × {Math.round(groupFrame.height)}</strong><span>{selectedScales.size === 1 ? `缩放 ${componentScale(selectedBlocks[0])}%` : '多种缩放'}</span></div>
            </div>}
            {live && <div className="free-canvas-guides" aria-hidden="true"><i className="free-canvas-guide-v" style={{ left: live.frame.x }} /><i className="free-canvas-guide-v" style={{ left: live.frame.x + live.frame.width }} /><i className="free-canvas-guide-h" style={{ top: live.frame.y }} /><i className="free-canvas-guide-h" style={{ top: live.frame.y + live.frame.height }} /></div>}

          </div>
      {isDragging && <div className="free-canvas-drop-status" role="status"><Plus size={14}/>{isOver ? '松开鼠标后放置组件' : '拖入画布，松开鼠标后放置'}</div>}
    </div></CanvasPageMenu>
    <div className="free-canvas-footnote"><MousePointer2 size={12}/><span>⌘ / Ctrl + A 全选 · Shift 点击多选 · {canvasModifierLabel} + 滚轮缩放 · 空格 / 中键平移 · 双击预览交互，Esc 返回编辑</span></div>
  </div></CanvasScrollProgress.Provider>;
}
