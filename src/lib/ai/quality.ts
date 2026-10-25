import { defaultFrame, extendedCatalog, isExtendedComponent, type Block, type BlockFrame, type PageDocument } from '../../model.ts';
import { pageAnchorNames } from '../page-anchors.ts';

export type AiQualityIssue = { kind: 'bounds' | 'overlap' | 'link' | 'overflow' | 'contrast'; blockIds: string[]; detail?: string };
export type AiQualityReport = { issues: AiQualityIssue[]; measured: boolean };
type Color = { r: number; g: number; b: number; a: number };

function intersects(a: BlockFrame, b: BlockFrame) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
}
function backdrop(block: Block) {
  return isExtendedComponent(block.type) && extendedCatalog[block.type].group === '动态背景'
    && ![block.props.title, block.props.text, block.props.label, block.props.items].some(value => value?.trim());
}
function color(value: string): Color | null {
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map(part => part + part).join('') : hex[1];
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4), 16), a: 1 };
  }
  const match = /^(rgba?|color)\((.*)\)$/.exec(value.trim());
  if (!match || match[1] === 'color' && !match[2].startsWith('srgb ')) return null;
  const parts = match[2].replace(/^srgb /, '').split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const values = parts.map((part, i) => parseFloat(part) * (part.endsWith('%') ? (i === 3 ? .01 : 2.55) : i < 3 && match[1] === 'color' ? 255 : 1));
  if (values.some(value => !Number.isFinite(value))) return null;
  return { r: Math.min(255, Math.max(0, values[0])), g: Math.min(255, Math.max(0, values[1])), b: Math.min(255, Math.max(0, values[2])), a: Math.min(1, Math.max(0, values[3] ?? 1)) };
}
function over(front: Color, back: Color): Color {
  const a = front.a + back.a * (1 - front.a);
  if (!a) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (key: 'r' | 'g' | 'b') => (front[key] * front.a + back[key] * back.a * (1 - front.a)) / a;
  return { r: channel('r'), g: channel('g'), b: channel('b'), a };
}
function luminance(value: Color) {
  const channel = (component: number) => { const n = component / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; };
  return .2126 * channel(value.r) + .7152 * channel(value.g) + .0722 * channel(value.b);
}
function visible(element: Element, surface: HTMLElement, style: (node: Element) => CSSStyleDeclaration) {
  if (!element.getClientRects().length || element.closest('[hidden], [aria-hidden="true"], script, style, svg')) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const value = style(node);
    if (value.display === 'none' || value.visibility === 'hidden' || value.visibility === 'collapse' || value.opacity !== '' && Number(value.opacity) < .99) return false;
    if (node === surface) break;
  }
  return true;
}
/** Unknown painted layers are skipped rather than guessing a contrast result. */
function background(element: Element, frame: HTMLElement, surface: HTMLElement, uncertainBehind: boolean, style: (node: Element) => CSSStyleDeclaration): Color | null {
  let result: Color = { r: 0, g: 0, b: 0, a: 0 };
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node === frame && uncertainBehind) return null;
    const value = style(node);
    if (value.backgroundImage && value.backgroundImage !== 'none' || value.filter && value.filter !== 'none' || value.mixBlendMode && value.mixBlendMode !== 'normal') return null;
    const layer = color(value.backgroundColor);
    if (!layer) return null;
    result = over(result, layer);
    if (result.a >= .999) return result;
    if (node === surface) break;
  }
  return null;
}

/** A bounded aid for the current design and rendered state, not a full visual or accessibility audit. */
export function inspectAiPage(page: PageDocument, surface?: HTMLElement | null): AiQualityReport {
  const issues: AiQualityIssue[] = [], keys = new Set<string>(), anchors = pageAnchorNames(page);
  const add = (issue: AiQualityIssue) => {
    const key = JSON.stringify(issue);
    if (!keys.has(key)) { keys.add(key); issues.push(issue); }
  };
  const checkLink = (blockId: string, url?: string) => {
    const hash = url?.trim();
    if (hash?.startsWith('#') && hash.length > 1 && !anchors.has(hash.slice(1))) add({ kind: 'link', blockIds: [blockId], detail: hash });
  };
  let nextY = 32;
  const positioned = page.blocks.map(block => {
    const frame = block.frame ?? defaultFrame(block.type, page.settings.maxWidth, 32, nextY);
    nextY = Math.max(nextY, frame.y + frame.height + 24);
    return { block, frame };
  });
  const margin = page.settings.padding, height = page.settings.canvasHeight ?? Math.max(1200, nextY);
  for (let i = 0; i < positioned.length; i++) {
    const { block, frame } = positioned[i];
    if (frame.x < margin || frame.y < margin || frame.x + frame.width > page.settings.maxWidth - margin || frame.y + frame.height > height - margin) add({ kind: 'bounds', blockIds: [block.id] });
    // One representative pair per upper block keeps dense layouts' reports useful and bounded.
    const lower = positioned.slice(0, i).find(item => !backdrop(item.block) && intersects(item.frame, frame));
    if (lower) add({ kind: 'overlap', blockIds: [lower.block.id, block.id] });
    checkLink(block.id, block.props.url);
    if (block.type === 'navbar' || block.type === 'breadcrumb') {
      const rows = (block.props.items ?? '').split(block.type === 'navbar' ? /[,，\n]/ : /\n/).map(value => value.trim()).filter(Boolean);
      rows.forEach((row, index) => {
        if (block.type === 'breadcrumb' && index === rows.length - 1) return;
        const href = row.split('|')[1]?.trim() || (block.type === 'navbar' ? ['#features', '#about', '#contact'][index % 3] : '#');
        checkLink(block.id, href);
      });
    }
  }
  const win = surface?.ownerDocument.defaultView;
  if (!surface || !win || !surface.getClientRects().length) return { issues, measured: false };
  const cache = new Map<Element, CSSStyleDeclaration>();
  const style = (node: Element) => { let value = cache.get(node); if (!value) { value = win.getComputedStyle(node); cache.set(node, value); } return value; };
  const frames = new Map(Array.from(surface.querySelectorAll<HTMLElement>('[data-block-id]')).map(node => [node.dataset.blockId, node]));
  let measured = page.blocks.length === 0, remainingText = 5000;
  for (let i = 0; i < positioned.length; i++) {
    const { block, frame: bounds } = positioned[i], frame = frames.get(block.id), content = frame?.querySelector<HTMLElement>('.page-block');
    if (!frame || !content || !content.clientWidth || !content.clientHeight || !visible(content, surface, style)) continue;
    measured = true;
    if (content.scrollWidth > content.clientWidth + 2 || content.scrollHeight > content.clientHeight + 2) add({ kind: 'overflow', blockIds: [block.id] });
    for (const link of content.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) checkLink(block.id, link.getAttribute('href') ?? undefined);
    const uncertainBehind = positioned.slice(0, i).some(item => intersects(item.frame, bounds));
    const walker = surface.ownerDocument.createTreeWalker(content, 4 /* SHOW_TEXT */), seen = new Set<Element>();
    let node: Node | null, count = 0;
    while ((node = walker.nextNode()) && count++ < 200 && remainingText-- > 0) {
      const element = node.parentElement;
      if (!node.textContent?.trim() || !element || seen.has(element) || !visible(element, surface, style)) continue;
      seen.add(element);
      const computed = style(element), foreground = color(computed.color), behind = background(element, frame, surface, uncertainBehind, style);
      if (!foreground || !behind || foreground.a === 0) continue;
      const text = luminance(over(foreground, behind)), back = luminance(behind);
      const ratio = (Math.max(text, back) + .05) / (Math.min(text, back) + .05);
      const size = parseFloat(computed.fontSize) * (block.props.contentScale ?? 100) / 100, weight = computed.fontWeight === 'bold' ? 700 : parseFloat(computed.fontWeight);
      const threshold = size >= 24 || size >= 18.66 && weight >= 700 ? 3 : 4.5;
      if (ratio + .01 < threshold) { add({ kind: 'contrast', blockIds: [block.id], detail: `${ratio.toFixed(1)}:1 / ${threshold}:1` }); break; }
    }
  }
  return { issues, measured };
}
