import { defaultFrame, type Block, type BlockFrame, type PageDocument } from '../model.ts';

const GRID = 8;
const GAP = 16;
const MAX_HEIGHT = 6000;

export type PlacementResult = { page: PageDocument; block: Block; expanded: boolean };

function overlaps(a: BlockFrame, b: BlockFrame) {
  return a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x
    && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y;
}

function bottom(frame: BlockFrame) { return frame.y + frame.height; }
function roundUp(value: number) { return Math.ceil(value / GRID) * GRID; }

function context(doc: PageDocument, block: Block) {
  if (doc.blocks.length >= 200) throw new Error('每个页面最多支持 200 个组件，请先删除不需要的组件。');
  if (doc.blocks.some(existing => existing.id === block.id)) throw new Error('组件标识重复，请重新添加组件。');
  const width = doc.settings.maxWidth;
  if (!Number.isFinite(width) || width < 320 || width > 1600) throw new Error('请将画布宽度设置在 320–1600 px 之间。');
  // Legacy documents should be migrated by the importer. Match the renderer's
  // fallback bounds without mutating any missing frame in the original page.
  const entries = doc.blocks.map((existing, index) => ({
    block: existing,
    frame: existing.frame ?? { x: 0, y: index * 200, width, height: 200 },
  }));
  const existingBottom = Math.max(0, ...entries.map(entry => bottom(entry.frame)));
  const height = Math.max(320, doc.settings.canvasHeight ?? 1400, roundUp(existingBottom));
  if (!Number.isFinite(height) || height > MAX_HEIGHT) throw new Error('已有组件超出 6000 px 画布高度，请先调整位置后再添加。');
  const base = defaultFrame(block.type, width);
  const size = { width: Math.min(width, Math.max(40, base.width)), height: Math.min(3000, Math.max(32, base.height)) };
  return { width, height, entries, size };
}

function coordinates(limit: number) {
  const points: number[] = [];
  for (let point = 0; point <= limit; point += GRID) points.push(point);
  // An exact edge can be usable even when the canvas width or block size is
  // not divisible by eight. Never discard that last valid position.
  if (limit >= 0 && points.at(-1) !== limit) points.push(limit);
  return points;
}

function findSpace(width: number, height: number, size: { width: number; height: number }, frames: BlockFrame[], preferred?: { x: number; y: number }) {
  if (size.height > height) return undefined;
  const xs = coordinates(width - size.width);
  const ys = coordinates(height - size.height);
  let best: BlockFrame | undefined;
  let bestDistance = Infinity;
  for (const y of ys) {
    for (const x of xs) {
      const distance = preferred ? (x - preferred.x) ** 2 + (y - preferred.y) ** 2 : 0;
      if (preferred && distance >= bestDistance) continue;
      const candidate = { x, y, ...size };
      if (frames.some(frame => overlaps(candidate, frame))) continue;
      if (!preferred) return candidate;
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function result(doc: PageDocument, block: Block, frame: BlockFrame, blocks: Block[], originalHeight: number): PlacementResult {
  const height = Math.max(320, originalHeight, roundUp(Math.max(bottom(frame), ...blocks.map((existing, index) => bottom(existing.frame ?? { x: 0, y: index * 200, width: doc.settings.maxWidth, height: 200 })))));
  if (height > MAX_HEIGHT) throw new Error('画布已达到 6000 px 高度上限，无法容纳新组件；请释放空位或缩小组件。');
  const placed = { ...block, props: { ...block.props }, frame: { ...frame } };
  return {
    page: { ...doc, settings: { ...doc.settings, layout: 'free', canvasHeight: height }, blocks },
    block: placed,
    expanded: height > (doc.settings.canvasHeight ?? 1400),
  };
}

/** Find a free position without moving or resizing existing components. */
export function placeBlock(doc: PageDocument, block: Block, preferred?: { x: number; y: number }): PlacementResult {
  const { width, height, entries, size } = context(doc, block);
  const frames = entries.map(entry => entry.frame);
  const point = preferred && Number.isFinite(preferred.x) && Number.isFinite(preferred.y)
    ? { x: Math.max(0, Math.min(preferred.x, width - size.width)), y: Math.max(0, Math.min(preferred.y, MAX_HEIGHT - size.height)) }
    : undefined;
  const frame = findSpace(width, height, size, frames, point)
    ?? findSpace(width, MAX_HEIGHT, size, frames, point);
  if (!frame) throw new Error('画布已满，6000 px 范围内没有可用空位；请释放空位或缩小组件。');
  const placed = { ...block, props: { ...block.props }, frame: { ...frame } };
  return result(doc, placed, frame, [...doc.blocks, placed], height);
}

/**
 * Insert below the anchor. Components beginning at or below its bottom move
 * down as one group, preserving their relative positions. Earlier components
 * (including adjacent columns crossing that line) stay fixed. Reject an
 * insertion that would collide with a fixed component, rather than rearrange it.
 */
export function insertBlockAfter(doc: PageDocument, block: Block, afterId: string): PlacementResult {
  const { width, height, entries, size } = context(doc, block);
  const index = entries.findIndex(entry => entry.block.id === afterId);
  if (index < 0) throw new Error('找不到要插入到下方的组件，请重新选择。');
  const anchor = entries[index];
  const line = bottom(anchor.frame);
  const frame = { x: Math.max(0, Math.min(anchor.frame.x, width - size.width)), y: line + GAP, ...size };
  const moving = entries.filter(entry => entry !== anchor && entry.frame.y >= line - 1);
  const fixed = entries.filter(entry => !moving.includes(entry));
  if (fixed.some(entry => overlaps(frame, entry.frame))) {
    throw new Error('插入位置与同排或跨行组件冲突，请选择其他组件，或使用空位添加。');
  }
  let offset = size.height + GAP;
  // A document may have touching rows. Add enough shared offset to maintain
  // the new component's 16px gap without changing the group's relative layout.
  for (const entry of moving) {
    const sharesColumn = frame.x < entry.frame.x + entry.frame.width + GAP && frame.x + frame.width + GAP > entry.frame.x;
    if (sharesColumn) offset = Math.max(offset, bottom(frame) + GAP - entry.frame.y);
  }
  const moved = new Map(moving.map(entry => [entry.block.id, { ...entry.frame, y: entry.frame.y + offset }]));
  for (const entry of moving) {
    const next = moved.get(entry.block.id)!;
    if (bottom(next) > MAX_HEIGHT) throw new Error('插入会使下方组件超出 6000 px 高度上限，请先释放空间。');
    if (fixed.some(other => overlaps(next, other.frame) && !overlaps(entry.frame, other.frame))) {
      throw new Error('下方组件移动后会与跨行组件冲突，请选择其他插入位置。');
    }
  }
  const placed = { ...block, props: { ...block.props }, frame: { ...frame } };
  const blocks = doc.blocks.map(existing => moved.has(existing.id) ? { ...existing, frame: moved.get(existing.id)! } : existing);
  blocks.splice(index + 1, 0, placed);
  return result(doc, placed, frame, blocks, height);
}
