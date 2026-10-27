import type { Block, BlockFrame, PageDocument } from '../model.ts';
import { canvasLimits } from '../../shared/canvas-sizes.mjs';
import { clampFrame } from './canvas-bounds.ts';

export type ResponsiveDevice = 'desktop' | 'tablet' | 'mobile';
export type ResponsiveBreakpoint = { maxWidth: number; width: number; canvasHeight: number; frames: Record<string, BlockFrame | null | undefined> };
export type ResponsiveSettings = { mode: 'fixed' } | { mode: 'adaptive'; breakpoints: Record<Exclude<ResponsiveDevice, 'desktop'>, ResponsiveBreakpoint> };
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const devices = ['tablet', 'mobile'] as const;
const fail = (message: string): never => { throw new Error(message); };
const plain = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function object(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!plain(value)) fail(`${label} 必须是普通对象`);
  for (const key of Object.keys(value as object)) if (forbidden.has(key) || !keys.includes(key)) fail(`${label} 包含不支持的属性`);
}
function finite(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} 必须在 ${min}–${max} 之间`);
}
function checkFrame(value: unknown, label: string) {
  if (value === null) return;
  object(value, ['x', 'y', 'width', 'height'], label);
  const frame = value as BlockFrame;
  finite(frame.x, 0, canvasLimits.maxWidth, `${label}.x`);
  finite(frame.y, 0, canvasLimits.maxHeight, `${label}.y`);
  finite(frame.width, 40, canvasLimits.maxWidth * 2, `${label}.width`);
  finite(frame.height, 32, 6000, `${label}.height`);
}
export function validateResponsive(page: PageDocument) {
  const responsive = page.settings.responsive;
  if (responsive === undefined) return;
  object(responsive, ['mode', 'breakpoints'], 'page.settings.responsive');
  if (responsive.mode === 'fixed') {
    if ('breakpoints' in responsive && responsive.breakpoints !== undefined) fail('固定画布不需要断点覆盖');
    return;
  }
  if (responsive.mode !== 'adaptive') fail('响应式模式无效');
  object(responsive.breakpoints, devices, 'page.settings.responsive.breakpoints');
  const ids = new Set(page.blocks.map(block => block.id));
  let mobileMax = 0, previousWidth = 0;
  for (const device of ['mobile', 'tablet'] as const) {
    const breakpoint = responsive.breakpoints[device];
    object(breakpoint, ['maxWidth', 'width', 'canvasHeight', 'frames'], `page.settings.responsive.breakpoints.${device}`);
    finite(breakpoint.maxWidth, 320, 1920, `${device} 触发宽度`);
    finite(breakpoint.width, 320, breakpoint.maxWidth, `${device} 设计宽度`);
    finite(breakpoint.canvasHeight, canvasLimits.minHeight, canvasLimits.maxHeight, `${device} 页面高度`);
    if (device === 'mobile') mobileMax = breakpoint.maxWidth;
    else if (breakpoint.maxWidth <= mobileMax || breakpoint.width <= previousWidth) fail('手机和平板的触发宽度、设计宽度必须递增');
    previousWidth = breakpoint.width;
    if (!plain(breakpoint.frames)) fail(`${device} 组件布局必须是普通对象`);
    for (const [id, frame] of Object.entries(breakpoint.frames)) {
      if (forbidden.has(id)) fail(`${device} 组件布局包含不支持的属性`);
      if (!ids.has(id)) fail(`${device} 布局引用了已删除的组件 ${id}`);
      checkFrame(frame, `${device}.${id}`);
    }
  }
}

export function createResponsiveCandidate(page: PageDocument): PageDocument {
  const width = page.settings.maxWidth, margin = Math.min(24, Math.max(0, page.settings.padding));
  const usable = (target: number) => Math.max(40, target - margin * 2);
  const layout = (device: Exclude<ResponsiveDevice, 'desktop'>): ResponsiveBreakpoint => {
    const target = device === 'tablet' ? 768 : 390;
    let cursor = margin;
    const ordered = page.blocks.map((block, index) => ({ block, index })).sort((a, b) => (a.block.frame?.y ?? 0) - (b.block.frame?.y ?? 0) || (a.block.frame?.x ?? 0) - (b.block.frame?.x ?? 0) || a.index - b.index);
    const frames: ResponsiveBreakpoint['frames'] = {};
    for (const { block } of ordered) {
      if (!block.frame) continue;
      if (device === 'tablet') {
        const ratio = target / width;
        frames[block.id] = clampFrame({ x: Math.round(block.frame.x * ratio), y: block.frame.y, width: Math.max(40, Math.round(block.frame.width * ratio)), height: block.frame.height }, { ...page.settings, maxWidth: target, canvasHeight: canvasLimits.maxHeight, padding: margin }, block.props.contentScale);
      } else {
        const available = usable(target), frameWidth = Math.min(available, Math.max(40, block.frame.width));
        const height = Math.min(3000, Math.max(32, Math.ceil(block.frame.height * Math.min(2, Math.max(1, block.frame.width / available)))));
        frames[block.id] = { x: margin, y: cursor, width: frameWidth, height };
        cursor += height + Math.max(16, margin);
      }
    }
    const bottom = Math.max(0, ...Object.values(frames).map(frame => frame ? frame.y + frame.height : 0));
    const canvasHeight = device === 'tablet' ? Math.max(canvasLimits.minHeight, Math.ceil(bottom + margin)) : Math.max(canvasLimits.minHeight, Math.ceil(cursor));
    if (canvasHeight > canvasLimits.maxHeight) fail(`${device === 'tablet' ? '平板' : '手机'}候选布局超过 6000 px，请拆分页面或隐藏部分组件`);
    return { maxWidth: device === 'tablet' ? 1024 : 640, width: target, canvasHeight, frames };
  };
  return { ...page, settings: { ...page.settings, responsive: { mode: 'adaptive', breakpoints: { tablet: layout('tablet'), mobile: layout('mobile') } } } };
}

export function responsiveDevice(settings: PageDocument['settings'], containerWidth?: number): ResponsiveDevice {
  const responsive = settings.responsive;
  if (responsive?.mode !== 'adaptive' || containerWidth === undefined || !Number.isFinite(containerWidth)) return 'desktop';
  if (containerWidth <= responsive.breakpoints.mobile.maxWidth) return 'mobile';
  if (containerWidth <= responsive.breakpoints.tablet.maxWidth) return 'tablet';
  return 'desktop';
}

function inheritedFrame(page: PageDocument, block: Block, device: ResponsiveDevice, ignoreOwn = false): BlockFrame | null | undefined {
  const responsive = page.settings.responsive;
  if (device === 'desktop' || responsive?.mode !== 'adaptive') return block.frame;
  const target = responsive.breakpoints[device];
  if (!ignoreOwn && Object.hasOwn(target.frames, block.id)) return target.frames[block.id];
  if (device === 'mobile' && Object.hasOwn(responsive.breakpoints.tablet.frames, block.id)) {
    const frame = responsive.breakpoints.tablet.frames[block.id];
    if (frame) return clampFrame({ ...frame, x: Math.round(frame.x * target.width / responsive.breakpoints.tablet.width), width: Math.max(40, Math.round(frame.width * target.width / responsive.breakpoints.tablet.width)) }, { ...page.settings, ...target }, block.props.contentScale);
    if (!ignoreOwn) return frame;
  }
  return block.frame ? clampFrame(block.frame, { ...page.settings, ...target }, block.props.contentScale) : undefined;
}

export function pageAtDevice(page: PageDocument, device: ResponsiveDevice): PageDocument {
  const responsive = page.settings.responsive;
  if (device === 'desktop' || responsive?.mode !== 'adaptive') return page;
  const breakpoint = responsive.breakpoints[device];
  return { ...page, settings: { ...page.settings, maxWidth: breakpoint.width, canvasHeight: breakpoint.canvasHeight, responsive: undefined }, blocks: page.blocks.flatMap(block => {
    const frame = inheritedFrame(page, block, device);
    return frame ? [{ ...block, frame }] : [];
  }) };
}

export function pageAtWidth(page: PageDocument, containerWidth?: number): PageDocument {
  return pageAtDevice(page, responsiveDevice(page.settings, containerWidth));
}

export function updateDeviceFrame(page: PageDocument, id: string, frame: BlockFrame, device: ResponsiveDevice): PageDocument {
  return updateDeviceFrames(page, { [id]: frame }, device);
}
export function updateDeviceFrames(page: PageDocument, frames: Record<string, BlockFrame>, device: ResponsiveDevice): PageDocument {
  if (device === 'desktop') return { ...page, blocks: page.blocks.map(block => frames[block.id] ? { ...block, frame: clampFrame(frames[block.id], page.settings, block.props.contentScale) } : block) };
  const responsive = page.settings.responsive;
  if (responsive?.mode !== 'adaptive') return updateDeviceFrames(page, frames, 'desktop');
  const layout = pageAtDevice(page, device), breakpoint = responsive.breakpoints[device], overrides = { ...breakpoint.frames };
  for (const block of page.blocks) if (frames[block.id]) overrides[block.id] = clampFrame(frames[block.id], layout.settings, block.props.contentScale);
  const bottom = Math.max(0, ...Object.values(overrides).map(frame => frame ? frame.y + frame.height : 0));
  if (bottom + layout.settings.padding > canvasLimits.maxHeight) fail('当前断点的内容超过 6000 px，请调整位置或拆分页面');
  return { ...page, settings: { ...page.settings, responsive: { ...responsive, breakpoints: { ...responsive.breakpoints, [device]: { ...breakpoint, canvasHeight: Math.max(breakpoint.canvasHeight, Math.ceil(bottom + layout.settings.padding)), frames: overrides } } } } };
}

export function updateDeviceCanvas(page: PageDocument, size: { width: number; height: number }, device: ResponsiveDevice): PageDocument {
  if (device === 'desktop') return { ...page, settings: { ...page.settings, maxWidth: size.width, canvasHeight: size.height }, blocks: page.blocks.map(block => block.frame ? { ...block, frame: clampFrame(block.frame, { ...page.settings, maxWidth: size.width, canvasHeight: size.height }, block.props.contentScale) } : block) };
  const responsive = page.settings.responsive;
  if (responsive?.mode !== 'adaptive') return updateDeviceCanvas(page, size, 'desktop');
  const breakpoint = responsive.breakpoints[device];
  if (size.width < 320 || size.width > breakpoint.maxWidth || size.height < canvasLimits.minHeight || size.height > canvasLimits.maxHeight) fail('断点设计宽度或页面高度超出允许范围');
  const settings = { ...page.settings, maxWidth: size.width, canvasHeight: size.height }, frames = Object.fromEntries(Object.entries(breakpoint.frames).map(([id, frame]) => {
    const block = page.blocks.find(item => item.id === id);
    return [id, frame && block ? clampFrame(frame, settings, block.props.contentScale) : frame];
  }));
  return { ...page, settings: { ...page.settings, responsive: { ...responsive, breakpoints: { ...responsive.breakpoints, [device]: { ...breakpoint, ...size, frames } } } } };
}

export function setDeviceBlockHidden(page: PageDocument, id: string, hidden: boolean, device: ResponsiveDevice): PageDocument {
  if (device === 'desktop' || page.settings.responsive?.mode !== 'adaptive') return page;
  const responsive = page.settings.responsive, breakpoint = responsive.breakpoints[device], frames = { ...breakpoint.frames };
  const block = page.blocks.find(item => item.id === id);
  if (!block) return page;
  if (hidden) frames[id] = null;
  else {
    const restored = inheritedFrame(page, block, device, true);
    if (restored) frames[id] = restored;
    else delete frames[id];
  }
  return { ...page, settings: { ...page.settings, responsive: { ...responsive, breakpoints: { ...responsive.breakpoints, [device]: { ...breakpoint, frames } } } } };
}

export function pruneResponsiveFrames(page: PageDocument): PageDocument {
  const responsive = page.settings.responsive;
  if (responsive?.mode !== 'adaptive') return page;
  const ids = new Set(page.blocks.map(block => block.id));
  const frames = (device: Exclude<ResponsiveDevice, 'desktop'>) => Object.fromEntries(Object.entries(responsive.breakpoints[device].frames).filter(([id]) => ids.has(id)));
  return { ...page, settings: { ...page.settings, responsive: { ...responsive, breakpoints: { tablet: { ...responsive.breakpoints.tablet, frames: frames('tablet') }, mobile: { ...responsive.breakpoints.mobile, frames: frames('mobile') } } } } };
}

export function resetDeviceLayout(page: PageDocument, device: ResponsiveDevice): PageDocument {
  if (device === 'desktop') return { ...page, settings: { ...page.settings, responsive: { mode: 'fixed' } } };
  const responsive = page.settings.responsive;
  if (responsive?.mode !== 'adaptive') return page;
  const candidate = createResponsiveCandidate({ ...page, settings: { ...page.settings, responsive: undefined } });
  if (candidate.settings.responsive?.mode !== 'adaptive') return page;
  return { ...page, settings: { ...page.settings, responsive: { ...responsive, breakpoints: { ...responsive.breakpoints, [device]: candidate.settings.responsive.breakpoints[device] } } } };
}
