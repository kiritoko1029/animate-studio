import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { fitPanelWidths, panelMinimums, panelStorageKey, panelWidthLimit, readPanelWidths, type PanelSide, type PanelWidths } from '../lib/studio-panels';

type ResizeGesture = { side: PanelSide; pointerId: number; startX: number; initial: PanelWidths; previous: Partial<PanelWidths>; capture: HTMLElement };

export function ResizableStudioLayout({ inspectorOpen, disabled = false, children }: { inspectorOpen: boolean; disabled?: boolean; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null), gesture = useRef<ResizeGesture | null>(null);
  const [width, setWidth] = useState(window.innerWidth);
  const [preferences, setPreferences] = useState<Partial<PanelWidths>>(() => {
    try { return readPanelWidths(localStorage.getItem(panelStorageKey)); } catch { return {}; }
  });
  const [resizing, setResizing] = useState<PanelSide | null>(null);
  const widths = fitPanelWidths(preferences, width, inspectorOpen);
  useLayoutEffect(() => {
    const node = element.current!;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(entries => { if (entries[0]) setWidth(entries[0].contentRect.width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (resizing) return;
    try { localStorage.setItem(panelStorageKey, JSON.stringify(preferences)); } catch { /* Resizing works without persistent storage. */ }
  }, [preferences, resizing]);
  const finish = (cancel = false) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    if (cancel) setPreferences(active.previous);
    if (active.capture.hasPointerCapture(active.pointerId)) active.capture.releasePointerCapture(active.pointerId);
    setResizing(null);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); finish(true); }
    };
    const cancel = () => finish(true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', cancel); };
  }, []);
  useEffect(() => {
    if (disabled || width <= 600 || resizing === 'right' && (!inspectorOpen || width <= 800)) finish(true);
  }, [disabled, width, inspectorOpen]);
  const change = (side: PanelSide, value: number, initial = widths) => {
    setPreferences({ ...initial, [side]: Math.max(panelMinimums[side], Math.min(panelWidthLimit(side, initial, width, inspectorOpen), Math.round(value))) });
  };
  const reset = (side: PanelSide) => setPreferences(current => { const next = { ...current }; delete next[side]; return next; });
  const start = (event: PointerEvent<HTMLDivElement>, side: PanelSide) => {
    if (event.button !== 0 || disabled || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { side, pointerId: event.pointerId, startX: event.clientX, initial: widths, previous: preferences, capture: event.currentTarget };
    setResizing(side);
  };
  return <div ref={element} className={`studio-body ${inspectorOpen ? 'with-inspector' : ''} ${resizing ? 'studio-body--resizing' : ''}`} style={{ '--studio-left-width': `${widths.left}px`, '--studio-right-width': `${widths.right}px` } as CSSProperties}>
    {children}
    {(['left', 'right'] as const).filter(side => side === 'left' ? width > 600 : inspectorOpen && width > 800).map(side => <div key={side}
      className={`studio-panel-resizer studio-panel-resizer--${side}${resizing === side ? ' is-resizing' : ''}`}
      role="separator" tabIndex={disabled ? -1 : 0} aria-label={side === 'left' ? '调整组件库宽度' : '调整属性面板宽度'} aria-orientation="vertical"
      aria-controls={side === 'left' ? 'component-sidebar-panel' : 'inspector-sidebar-panel'} aria-disabled={disabled}
      aria-valuemin={panelMinimums[side]} aria-valuemax={panelWidthLimit(side, widths, width, inspectorOpen)} aria-valuenow={widths[side]} aria-valuetext={`${widths[side]} 像素`}
      title="拖动调整宽度；双击恢复默认；方向键微调，Shift 加速，Esc 取消拖动"
      onPointerDown={event => start(event, side)}
      onPointerMove={event => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        change(side, active.initial[side] + (event.clientX - active.startX) * (side === 'left' ? 1 : -1), active.initial);
      }}
      onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) finish(); }}
      onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }}
      onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }}
      onDoubleClick={() => { if (!disabled) reset(side); }}
      onKeyDown={event => {
        if (disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Enter') reset(side);
        else if (event.key === 'Home') change(side, panelMinimums[side]);
        else if (event.key === 'End') change(side, panelWidthLimit(side, widths, width, inspectorOpen));
        else change(side, widths[side] + (event.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1) * (event.shiftKey ? 40 : 8));
      }} />)}
    {resizing && <div className="studio-resize-shield" aria-hidden="true" />}
  </div>;
}
