type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
type Collision = { id: string | number; data?: { pointerCoordinates?: Point } };

export function palettePointer(activator: { clientX?: unknown; clientY?: unknown }, delta: Point, translated: Rect | null): Point | null {
  if (typeof activator.clientX === 'number' && typeof activator.clientY === 'number') return { x: activator.clientX + delta.x, y: activator.clientY + delta.y };
  return translated ? { x: translated.left + translated.width / 2, y: translated.top + translated.height / 2 } : null;
}

/** DnD event.delta includes ancestor scroll changes when leaving the palette.
 * Collision coordinates remain in viewport pixels, just like the canvas rect. */
export function paletteDropPointer(collisions: Collision[] | null, translated: Rect | null): Point | null {
  const canvas = collisions?.find(collision => collision.id === 'canvas');
  if (!canvas) return null;
  // Keyboard drags have no pointer; their translated rectangle is the target.
  return canvas.data?.pointerCoordinates ?? palettePointer({}, { x: 0, y: 0 }, translated);
}

export function canvasDropPosition(point: Point, stage: Pick<Rect, 'left' | 'top'>, scale: number, blockWidth: number): Point {
  return { x: (point.x - stage.left) / scale - blockWidth / 2, y: (point.y - stage.top) / scale - 24 };
}

export function pointInViewport(point: Point, viewport: Rect) {
  return point.x >= viewport.left && point.x <= viewport.left + viewport.width && point.y >= viewport.top && point.y <= viewport.top + viewport.height;
}
