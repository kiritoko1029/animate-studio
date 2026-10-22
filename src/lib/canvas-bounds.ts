import type { BlockFrame, PageDocument } from '../model.ts';
import { componentScaleLimits } from '../../shared/component-scale.mjs';

export type HorizontalAlignment = 'left' | 'center' | 'right';
export type CanvasBounds = ReturnType<typeof canvasBounds>;

/** Frames use page coordinates; margins constrain them without adding a render offset. */
export function canvasBounds(settings: PageDocument['settings']) {
  const pageWidth = Math.max(40, settings.maxWidth);
  const pageHeight = Math.max(32, settings.canvasHeight ?? 1400);
  const margin = Math.max(0, Math.min(120, settings.padding || 0, (pageWidth - 40) / 2, (pageHeight - 32) / 2));
  return { margin, left: margin, top: margin, right: pageWidth - margin, bottom: pageHeight - margin, width: pageWidth - margin * 2, height: pageHeight - margin * 2 };
}

/** Scaled components may extend beyond the page without changing the page size. */
export function frameSizeLimits(settings: PageDocument['settings'], contentScale = 100) {
  const bounds = canvasBounds(settings);
  const factor = Math.max(1, Math.min(componentScaleLimits.max, contentScale) / 100);
  return { width: bounds.width * factor, height: Math.min(bounds.height, 3000) * factor };
}

export function clampFrame(frame: BlockFrame, settings: PageDocument['settings'], contentScale = 100): BlockFrame {
  const bounds = canvasBounds(settings);
  const limits = frameSizeLimits(settings, contentScale);
  const width = Math.min(limits.width, Math.max(40, frame.width));
  const height = Math.min(limits.height, Math.max(32, frame.height));
  return { width, height, x: Math.max(bounds.left, Math.min(frame.x, bounds.right - width)), y: Math.max(bounds.top, Math.min(frame.y, bounds.bottom - height)) };
}

export function alignFrame(frame: BlockFrame, settings: PageDocument['settings'], alignment: HorizontalAlignment, contentScale = 100): BlockFrame {
  const bounds = canvasBounds(settings);
  const next = clampFrame(frame, settings, contentScale);
  return { ...next, x: Math.max(bounds.left, alignment === 'left' ? bounds.left : alignment === 'right' ? bounds.right - next.width : bounds.left + (bounds.width - next.width) / 2) };
}
