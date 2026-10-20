import { mountCatalogFeatures } from './catalog-runtime.ts';
/** Shared browser helpers, emitted as source so exported files have no runtime package. */
export const browserHelpers = `const mountCatalogFeatures = (${mountCatalogFeatures.toString()});
function moveFocus(event, selector, activate = false) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const group = event.currentTarget.closest('[data-keyboard-group]');
  const items = Array.from(group.querySelectorAll(selector));
  const current = items.indexOf(event.currentTarget);
  const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + step + items.length) % items.length;
  event.preventDefault();
  items[next]?.focus();
  if (activate) items[next]?.click();
}

function mountPage(root, width, height) {
  const shell = root.querySelector('.as-page-free-scaled-shell');
  const canvas = root.querySelector('.as-page-free-canvas');
  const measure = () => {
    const scale = Math.min(1, Math.max(0, root.getBoundingClientRect().width) / width);
    shell.style.width = width * scale + 'px';
    shell.style.height = height * scale + 'px';
    canvas.style.transform = 'scale(' + scale + ')';
  };
  measure();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  observer?.observe(root);
  window.addEventListener('resize', measure);
  const navigate = event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || !root.contains(link)) return;
    const href = link.getAttribute('href');
    if (!href.startsWith('#')) return;
    const target = href === '#' ? root : Array.from(root.querySelectorAll('[data-anchor], [id]')).find(node => '#' + (node.getAttribute('data-anchor') || node.id) === href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };
  root.addEventListener('click', navigate);
  const disposeCatalog = mountCatalogFeatures(root);
  return () => { disposeCatalog(); observer?.disconnect(); window.removeEventListener('resize', measure); root.removeEventListener('click', navigate); };
}`;

export const htmlAttributeHelper = `function setAttribute(node, name, value) {
  if (name === 'value' || name === 'checked') { node[name] = value; return; }
  if (['hidden', 'disabled', 'selected', 'open', 'inert'].includes(name)) { node.toggleAttribute(name, Boolean(value)); return; }
  if (value === null || value === undefined) node.removeAttribute(name);
  else node.setAttribute(name, String(value));
}`;
