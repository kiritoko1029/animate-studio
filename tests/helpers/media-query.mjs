/** JSDOM lacks matchMedia; each test window owns its media-query listeners. */
export function installMatchMedia(window, { reducedMotion = false } = {}) {
  // v2 draws SVG checks via attributes; JSDOM exposes the shapes as SVGElement.
  window.SVGGeometryElement ??= window.SVGElement;
  const queries = new Map();
  window.matchMedia = media => {
    if (!queries.has(media)) {
      const query = new window.EventTarget();
      Object.assign(query, { media, matches: reducedMotion && media.includes('prefers-reduced-motion'), onchange: null });
      query.addListener = listener => query.addEventListener('change', listener);
      query.removeListener = listener => query.removeEventListener('change', listener);
      queries.set(media, query);
    }
    return queries.get(media);
  };
}
