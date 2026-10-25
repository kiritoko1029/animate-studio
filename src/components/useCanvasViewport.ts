import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { fitCanvasView, minCanvasScale, zoomCanvasAt, wheelPixels, type CanvasView, type ViewportSize } from '../lib/canvas-view';
import { hasCanvasModifier } from '../lib/canvas-shortcuts';

type PanGesture = { pointerId: number; startX: number; startY: number; initial: CanvasView; capture: HTMLElement };
const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');

/** Camera state belongs to the editor, never to the saved page or its undo history. */
export function useCanvasViewport(design: ViewportSize, mobile: boolean, busy: boolean) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CanvasView>({ x: 32, y: 40, scale: 1, mode: 'fit' });
  const viewRef = useRef(view);
  const size = useRef<ViewportSize>({ width: 0, height: 0 });
  const settings = useRef({ design, mobile, busy });
  settings.current = { design, mobile, busy };
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const space = useRef(false), hover = useRef(false), pan = useRef<PanGesture | null>(null);
  const apply = (next: CanvasView) => { viewRef.current = next; setView(next); };
  const fit = () => { if (!settings.current.busy) apply(fitCanvasView(size.current, settings.current.design, settings.current.mobile)); };
  const zoomTo = (scale: number) => {
    if (settings.current.busy || pan.current) return;
    apply(zoomCanvasAt(viewRef.current, scale, { x: size.current.width / 2, y: size.current.height / 2 }));
  };
  const cancelPan = (restore = false) => {
    const current = pan.current;
    pan.current = null;
    if (current) {
      if (restore) apply(current.initial);
      if (current.capture.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
    }
    setPanning(false);
  };

  useEffect(() => { if (busy) { space.current = false; setSpaceHeld(false); cancelPan(true); } }, [busy]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const resize = (next: ViewportSize) => {
      const previous = size.current;
      size.current = next;
      const current = viewRef.current;
      apply(current.mode === 'fit' ? fitCanvasView(next, settings.current.design, settings.current.mobile)
        : { ...current, x: current.x + (next.width - previous.width) / 2, y: current.y + (next.height - previous.height) / 2 });
    };
    resize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) resize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (viewRef.current.mode === 'fit') apply(fitCanvasView(size.current, design, mobile));
  }, [design.width, design.height, mobile]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const zoom = hasCanvasModifier(event);
      if (!zoom && event.target instanceof Element && event.target.closest('[data-canvas-interactive]')) return;
      if (!zoom && (event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (settings.current.busy || pan.current) return;
      const dx = wheelPixels(event.deltaX, event.deltaMode, size.current.height);
      const dy = wheelPixels(event.deltaY, event.deltaMode, size.current.height);
      const current = viewRef.current;
      if (zoom) {
        const rect = element.getBoundingClientRect();
        apply(zoomCanvasAt(current, current.scale * Math.exp(-Math.max(-500, Math.min(500, dy)) * .002), { x: event.clientX - rect.left, y: event.clientY - rect.top }));
      } else {
        apply({ ...current, mode: 'manual', x: current.x - (event.shiftKey && !dx ? dy : dx), y: current.y - (event.shiftKey && !dx ? 0 : dy) });
      }
    };
    const release = () => { space.current = false; setSpaceHeld(false); cancelPan(); };
    const keydown = (event: KeyboardEvent) => {
      const inCanvas = hover.current || element.closest('.free-canvas')?.contains(document.activeElement);
      if (!inCanvas || editable(event.target) || event.target instanceof Element && event.target.closest('[data-canvas-interactive]') || document.querySelector('dialog[open], [data-slot="dialog-content"], [role="menu"]')) return;
      if (event.code === 'Space' && event.target instanceof HTMLElement && event.target.closest('button, a[href], [role=button]')) return;
      if (event.code === 'Space' && !event.altKey && !event.ctrlKey && !event.metaKey && !settings.current.busy) {
        event.preventDefault(); space.current = true; setSpaceHeld(true); return;
      }
      if (event.key === 'Escape' && pan.current) { event.preventDefault(); event.stopPropagation(); cancelPan(true); return; }
      if (settings.current.busy || pan.current) return;
      if (hasCanvasModifier(event) && event.code === 'Digit0') { event.preventDefault(); fit(); return; }
      if (hasCanvasModifier(event) && event.code === 'Digit1') { event.preventDefault(); zoomTo(1); return; }
      if (event.ctrlKey || event.metaKey) return;
      if (event.code === 'Equal' || event.code === 'NumpadAdd') { event.preventDefault(); zoomTo(viewRef.current.scale * 1.2); }
      else if (event.code === 'Minus' || event.code === 'NumpadSubtract') { event.preventDefault(); zoomTo(viewRef.current.scale / 1.2); }
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { space.current = false; setSpaceHeld(false); } };
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      element.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      const current = pan.current; pan.current = null;
      if (current?.capture.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
    };
  }, []);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('[data-canvas-interactive]')) return;
    if (settings.current.busy || pan.current || !(event.button === 1 || (event.button === 0 && (space.current || handTool)))) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, initial: viewRef.current, capture: event.currentTarget };
    setPanning(true);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = pan.current;
    if (!current || event.pointerId !== current.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    apply({ ...current.initial, mode: 'manual', x: current.initial.x + event.clientX - current.startX, y: current.initial.y + event.clientY - current.startY });
  };
  const pointerEnd = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (pan.current?.pointerId !== event.pointerId) return;
    event.stopPropagation(); cancelPan(cancelled);
  };
  const reveal = (frame: { x: number; y: number; width: number; height: number }, programmatic = false) => {
    if ((settings.current.busy && !programmatic) || pan.current) return;
    const previous = viewRef.current;
    const scale = programmatic && size.current.width > 64 && size.current.height > 64 ? Math.max(minCanvasScale, Math.min(previous.scale, (size.current.width - 64) / frame.width, (size.current.height - 64) / frame.height)) : previous.scale;
    const current = { ...previous, scale };
    const left = current.x + frame.x * current.scale, top = current.y + frame.y * current.scale;
    if (scale === previous.scale && left >= 32 && left + frame.width * current.scale <= size.current.width - 32 && top >= 32 && top + frame.height * current.scale <= size.current.height - 32) return;
    apply({ ...current, mode: 'manual', x: size.current.width / 2 - (frame.x + frame.width / 2) * current.scale, y: size.current.height / 2 - (frame.y + frame.height / 2) * current.scale });
  };

  return { view, viewportRef, fit, zoomTo, reveal, handTool, setHandTool, panning, canPan: handTool || spaceHeld,
    handlers: {
      onPointerEnter: () => { hover.current = true; }, onPointerLeave: () => { hover.current = false; },
      onPointerDownCapture: pointerDown, onPointerMoveCapture: pointerMove,
      onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => pointerEnd(event),
      onPointerCancelCapture: (event: PointerEvent<HTMLDivElement>) => pointerEnd(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => pointerEnd(event, true),
    },
  };
}
