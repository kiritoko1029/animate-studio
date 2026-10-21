import type { BlockFrame, PageDocument } from '../model.ts';

export type HorizontalAlignment = 'left' | 'center' | 'right';
export type CanvasBounds = ReturnType<typeof canvasBounds>;

/** Frames use page coordinates; margins constrain them without adding a render offset. */
export function canvasBounds(settings: PageDocument['settings']) {
  const pageWidth = Math.max(40, settings.maxWidth);
  const pageHeight = Math.max(32, settings.canvasHeight ?? 1400);
  const margin = Math.max(0, Math.min(120, settings.padding || 0, (pageWidth - 40) / 2, (pageHeight - 32) / 2));
  return { margin, left: margin, top: margin, right: pageWidth - margin, bottom: pageHeight - margin, width: pageWidth - margin * 2, height: pageHeight - margin * 2 };
}

export function clampFrame(frame: BlockFrame, settings: PageDocument['settings']): BlockFrame {
  const bounds = canvasBounds(settings);
  const width = Math.min(bounds.width, Math.max(40, frame.width));
  const height = Math.min(bounds.height, 3000, Math.max(32, frame.height));
  return { width, height, x: Math.max(bounds.left, Math.min(frame.x, bounds.right - width)), y: Math.max(bounds.top, Math.min(frame.y, bounds.bottom - height)) };
}

export function alignFrame(frame: BlockFrame, settings: PageDocument['settings'], alignment: HorizontalAlignment): BlockFrame {
  const bounds = canvasBounds(settings);
  const next = clampFrame(frame, settings);
  return { ...next, x: alignment === 'left' ? bounds.left : alignment === 'right' ? bounds.right - next.width : bounds.left + (bounds.width - next.width) / 2 };
}
