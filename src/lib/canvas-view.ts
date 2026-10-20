export type CanvasView = { x: number; y: number; scale: number; mode: 'fit' | 'manual' };
export type ViewportSize = { width: number; height: number };
export const minCanvasScale = .05;
export const maxCanvasScale = 4;
export const canvasZoomSteps = [.1, .25, .5, .75, 1, 1.5, 2, 3, 4];
export const clampCanvasScale = (scale: number) => Math.min(maxCanvasScale, Math.max(minCanvasScale, Number.isFinite(scale) ? scale : 1));

export function fitCanvasView(viewport: ViewportSize, design: ViewportSize, mobile = false): CanvasView {
  const width = Math.max(1, Math.min(mobile ? 375 : Infinity, viewport.width - 64));
  const height = Math.max(1, viewport.height - 80);
  const scale = clampCanvasScale(Math.min(1, width / design.width, height / design.height));
  return { scale, x: (viewport.width - design.width * scale) / 2, y: (viewport.height - design.height * scale) / 2, mode: 'fit' };
}

/** Keep the same design-space point beneath the cursor, including at zoom limits. */
export function zoomCanvasAt(view: CanvasView, scale: number, point: { x: number; y: number }): CanvasView {
  const nextScale = clampCanvasScale(scale);
  const ratio = nextScale / view.scale;
  return { scale: nextScale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio, mode: 'manual' };
}

export function wheelPixels(delta: number, mode: number, viewportHeight: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? viewportHeight : 1);
}
