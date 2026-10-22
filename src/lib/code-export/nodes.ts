export type Format = 'html' | 'vue' | 'react';
type Scalar = string | number | boolean | null | undefined;
export type Binding = { expression: string; initial: Scalar };
export type Style = Record<string, string | number | undefined>;
type Attributes = Record<string, Scalar | Binding | Style>;
export type Element = { tag: string; attrs: Attributes; children: Content[]; events: Record<string, string> };
export type Content = Element | Binding | string | number;
type Child = Content | false | null | undefined;

/** Only exporter-owned expressions are executable. Page content always goes through js/escapeHtml. */
export const bind = (expression: string, initial: Scalar): Binding => ({ expression, initial });
export const js = (value: unknown) => JSON.stringify(value).replace(typeof value === 'string' ? /[<>&{}\u2028\u2029]/g : /[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const classes = (value: string) => value.replace(/\bpage-/g, 'as-page-');
export const h = (tag: string, attrs: Attributes = {}, children: Child[] = [], events: Record<string, string> = {}): Element => ({
  tag, attrs, children: children.filter((child): child is Content => child !== false && child !== null && child !== undefined), events,
});
const isBinding = (value: unknown): value is Binding => !!value && typeof value === 'object' && 'expression' in value;
const booleans = new Set(['checked', 'disabled', 'hidden', 'selected', 'multiple', 'open', 'inert']);
const voidTags = new Set(['input', 'img', 'hr', 'br', 'meta', 'link']);
const reactNames: Record<string, string> = { inputmode: 'inputMode', autocomplete: 'autoComplete', maxlength: 'maxLength', popover: 'popover', class: 'className', for: 'htmlFor', tabindex: 'tabIndex', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', viewbox: 'viewBox' };

function styleObject(style: Style) {
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined).map(([key, value]) => [key,
    typeof value === 'number' && !key.startsWith('--') && !['opacity', 'fontWeight', 'zIndex', 'flexGrow', 'flexShrink', 'zoom'].includes(key) ? `${value}px` : value,
  ]));
}
const styleText = (style: Style) => Object.entries(styleObject(style)).map(([key, value]) => `${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}:${value}`).join(';');

/** The same element tree emits real templates and native bindings for all three targets. */
export function render(tree: Element, format: Format) {
  const updates: string[] = [];
  const listeners: string[] = [];
  let sequence = 0;
  function node(content: Content, depth: number, preserveWhitespace = false): string {
    const indent = '  '.repeat(depth);
    if (typeof content === 'string' || typeof content === 'number') {
      return format === 'html' ? escapeHtml(content) : format === 'react' ? `{${js(content)}}` : `{{ ${js(content)} }}`;
    }
    if (isBinding(content)) {
      if (format === 'react') return `{${content.expression}}`;
      if (format === 'vue') return `{{ ${content.expression} }}`;
      const id = sequence++;
      updates.push(`nodes[${id}].textContent = ${content.expression};`);
      return `<span data-as-node="${id}">${escapeHtml(content.initial)}</span>`;
    }
    const { tag, attrs, children, events } = content;
    const id = sequence++;
    const attributes: string[] = [];
    if (format === 'html') attributes.push(`data-as-node="${id}"`);
    for (const [name, raw] of Object.entries(attrs)) {
      if (raw === undefined || raw === null) continue;
      if (name === 'ref') {
        if (format === 'react') attributes.push('ref={rootRef}');
        if (format === 'vue') attributes.push('ref="rootRef"');
        continue;
      }
      if (name === 'style') {
        attributes.push(format === 'react' ? `style={${js(styleObject(raw as Style))}}` : `style="${escapeHtml(styleText(raw as Style))}"`);
        continue;
      }
      const value = name === 'class' ? isBinding(raw) ? bind(classes(raw.expression), classes(String(raw.initial))) : classes(String(raw)) : raw;
      const expression = isBinding(value) ? value.expression : undefined;
      const initial = isBinding(value) ? value.initial : value;
      if (format === 'react') {
        // Uncontrolled form defaults must not become read-only React fields.
        const attr = name === 'checked' && !expression ? 'defaultChecked' : reactNames[name] ?? name;
        attributes.push(`${attr}={${expression ?? js(initial)}}`);
      } else if (format === 'vue' && expression) {
        attributes.push(`:${name}="${escapeHtml(expression)}"`);
      } else {
        if (initial !== null && initial !== undefined && (!booleans.has(name) || initial)) attributes.push(booleans.has(name) ? name : `${name}="${escapeHtml(initial)}"`);
        if (format === 'html' && expression) updates.push(`setAttribute(nodes[${id}], ${js(name)}, ${expression});`);
      }
    }
    for (const [event, code] of Object.entries(events)) {
      if (format === 'html') listeners.push(`nodes[${id}].addEventListener(${js(event)}, event => { ${code} });`);
      if (format === 'vue') attributes.push(`@${event}="${escapeHtml(`event => { ${code} }`)}"`);
      if (format === 'react') {
        const name = ({ keydown: 'onKeyDown', click: 'onClick', input: 'onChange', change: 'onChange', error: 'onError' } as Record<string, string>)[event];
        attributes.push(`${name}={event => { ${code} }}`);
      }
    }
    const open = `<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}`;
    if (voidTags.has(tag)) return `${open}${format === 'html' ? '>' : ' />'}`;
    const preserve = preserveWhitespace || tag === 'pre' || tag === 'code';
    const multiline = !preserve && children.some(child => typeof child === 'object' && !isBinding(child));
    const body = children.map(child => node(child, depth + 1, preserve));
    return multiline ? `${open}>\n${body.map(line => `${indent}  ${line}`).join('\n')}\n${indent}</${tag}>` : `${open}>${body.join('')}</${tag}>`;
  }
  return { markup: node(tree, 0), updates, listeners };
}
