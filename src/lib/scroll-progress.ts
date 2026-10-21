/** Zero-length pages start at zero; keep overscroll and panning outside the page bounded. */
export function scrollPercentage(offset: number, contentHeight: number, viewportHeight: number) {
  const range = contentHeight - viewportHeight;
  return range > 0 ? Math.max(0, Math.min(100, offset / range * 100)) : 0;
}

/** Find the page's scrolling surface, skipping the component's own fixed frame. */
export function pageScrollContainer(element: HTMLElement): HTMLElement {
  const surface = element.closest('.page-surface');
  for (let parent = (surface ?? element).parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(element.ownerDocument.defaultView!.getComputedStyle(parent).overflowY)) return parent;
  }
  return (element.ownerDocument.scrollingElement ?? element.ownerDocument.documentElement) as HTMLElement;
}
