import { componentScaleLimits } from '../../shared/component-scale.mjs';
import { defaultFrame, type Block, type PageDocument } from '../model.ts';
import { canvasBounds, clampFrame } from './canvas-bounds.ts';

export function componentScale(block: Block) {
  const value = block.props.contentScale;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(componentScaleLimits.min, Math.min(componentScaleLimits.max, value))
    : componentScaleLimits.default;
}

/** The canvas size must not cap the component's scale percentage. */
export function componentScaleBounds(block: Block, settings: PageDocument['settings']) {
  const bounds = canvasBounds(settings);
  const frame = clampFrame(block.frame ?? defaultFrame(block.type, bounds.width, bounds.left, bounds.top), settings, componentScale(block));
  const current = componentScale(block);
  return {
    min: Math.max(componentScaleLimits.min, Math.ceil(current * 40 / frame.width - 1e-8), Math.ceil(current * 32 / frame.height - 1e-8)),
    max: componentScaleLimits.max,
  };
}

/** Content and its frame change in one history entry. Never mutate the old document. */
export function scaleComponent(block: Block, settings: PageDocument['settings'], requested: number): Block {
  if (!Number.isFinite(requested)) return block;
  const { min, max } = componentScaleBounds(block, settings);
  const next = Math.max(min, Math.min(max, Math.round(requested)));
  const current = componentScale(block);
  if (next === current) return block;
  const bounds = canvasBounds(settings);
  const frame = clampFrame(block.frame ?? defaultFrame(block.type, bounds.width, bounds.left, bounds.top), settings, current);
  const factor = next / current;
  return { ...block, props: { ...block.props, contentScale: next },
    frame: clampFrame({ ...frame, width: frame.width * factor, height: frame.height * factor }, settings, next) };
}

/** CSS zoom scales pixels, SVGs and spacing without competing with motion transforms. */
export function componentScaleStyle(block: Block): { zoom?: number } {
  const factor = componentScale(block) / 100;
  if (factor === 1) return {};
  // Percentage dimensions already account for zoom: 100% still fills the physical frame.
  return { zoom: factor };
}
