import { canvasLimits, defaultCanvasSize } from '../../../shared/canvas-sizes.mjs';
import type { PageDocument } from '../../model.ts';
import type { SiteRegion } from '../../../shared/site-document.mjs';

export function normalizeAiPageDocument(page: PageDocument, region?: SiteRegion): PageDocument {
  if (!page.settings || !Array.isArray(page.blocks)) return page;
  const required = Math.ceil(Math.max(canvasLimits.minHeight, ...page.blocks.map(block => {
    if (!block.frame || !Number.isFinite(block.frame.y) || !Number.isFinite(block.frame.height)) return 0;
    return block.frame.y + block.frame.height + (Number.isFinite(page.settings.padding) ? page.settings.padding : 0);
  })));
  const shared = region === 'header' || region === 'footer';
  const maximum = shared ? 1000 : canvasLimits.maxHeight;
  if (required > maximum) {
    if (shared) throw new Error(`共享${region === 'header' ? '页头' : '页脚'}的内容高度不能超过 ${maximum} px，请减少布局内容。`);
    throw new Error(`AI 页面内容高度超过 ${maximum} px，请减少区块或拆分为多页后继续。`);
  }
  const raw: unknown = page.settings.canvasHeight;
  const candidate = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  const fallback = shared ? canvasLimits.minHeight : defaultCanvasSize.height;
  const height = Math.max(required, Math.min(maximum, Math.round(Number.isFinite(candidate) ? candidate : fallback)));
  return { ...page, settings: { ...page.settings, canvasHeight: height } };
}
