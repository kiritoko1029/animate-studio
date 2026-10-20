import { createInteractionRuntime } from '../../../shared/interactions.mjs';
import type { PageDocument } from '../../model';
import { js } from './nodes.ts';

export function interactionSource(document: PageDocument) {
  const config = { variables: document.variables ?? [], scripts: document.scripts ?? [], blocks: document.blocks.map(block => ({ id: block.id, type: block.type, name: block.props.label || block.props.title || block.type, bindings: block.bindings, events: block.events })) };
  return {
    config: js(config),
    initial: js(createInteractionRuntime(config).getState()),
    factory: createInteractionRuntime.toString().replace(/<\/script/gi, '<\\/script'),
    helpers: `function readProp(id, key, fallback, snapshot) {
  const block = interactionConfig.blocks.find(block => block.id === id);
  const value = logic.read(block?.bindings?.[key], fallback, snapshot);
  if (['title', 'text', 'label'].includes(key)) return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  if (typeof fallback === 'boolean') return Boolean(value);
  if (typeof fallback === 'number') return Number.isFinite(Number(value)) ? Number(value) : fallback;
  return value;
}
function showNotice(root, message) {
  if (!root) return;
  const notice = root.querySelector('.as-runtime-notice');
  if (!notice) return;
  notice.querySelector('.as-runtime-notice-message').textContent = message;
  if (!notice.open) notice.showModal();
}
function followLink(root, url) {
  if (url.startsWith('#')) {
    const target = url === '#' ? root : Array.from(root.querySelectorAll('[data-anchor], [id]')).find(node => '#' + (node.dataset.anchor || node.id) === url);
    target?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  } else window.open(url, '_blank', 'noopener,noreferrer');
}`,
  };
}
