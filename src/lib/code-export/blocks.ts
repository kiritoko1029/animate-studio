import { componentScaleStyle } from '../component-scale.ts';
import { catalogContent } from './catalog-blocks.ts';
import navbarIcons from '../../../shared/navbar-icons.json' with { type: 'json' };
import { createInteractionRuntime } from '../../../shared/interactions.mjs';
import { defaultFrame, safeUrl, isExtendedComponent, type BlockProps, type PageDocument } from '../../model.ts';
import { blockThemeStyle, pageThemeStyle } from '../themes.ts';
import { bind, h, js, type Element, type Style } from './nodes.ts';
import { customComponentSandbox } from '../../../shared/custom-components.mjs';
import { buildComponentDocument, randomToken } from '../custom-components/document.ts';
import { customComponentTheme, instanceProps } from '../custom-components/instances.ts';

type Assets = Record<string, string>;
const rows = (items = '') => items.split('\n').map(line => line.trim()).filter(Boolean).map(line => line.split('|').map(cell => cell.trim()));
const details = (text?: string) => text ? h('p', { class: 'page-detail' }, [text]) : undefined;
const sizeStyle = (p: BlockProps): Style => ({ fontSize: p.fontSize });
const clamp = (value: number, max: number, min = 0) => Math.max(min, Math.min(max, value));

// Small inline SVGs keep exports independent of framework-specific icon libraries.
function icon(name: string, size = 16) {
  const paths: Record<string, string> = {
    arrow: 'M4 12h15m-6-6 6 6-6 6', check: 'm5 12 4 4L19 6', down: 'm6 9 6 6 6-6', right: 'm9 6 6 6-6 6', left: 'm15 6-6 6 6 6',
    star: 'm12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z',
    spark: 'm12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z',
    layers: 'm2 8 10-5 10 5-10 5Zm0 5 10 5 10-5M2 18l10 5 10-5',
    image: 'M3 3h18v18H3Zm0 14 6-6 5 5 3-3 4 4M7 7h.01',
    info: 'M12 11v6m0-10h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
    trend: 'm3 17 6-6 4 4 8-10m-7 0h7v7', quote: 'M4 5h6v7H6c0 3-1 5-3 6m11-13h6v7h-4c0 3-1 5-3 6',
  };
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [h('path', { d: paths[name] ?? paths.spark })]);
}

function linkAttrs(url?: string) {
  const href = safeUrl(url);
  return { href, ...(/^https?:\/\//i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}) };
}
function action(p: BlockProps, label = p.label || '了解更多') {
  const variant = ['secondary', 'ghost'].includes(p.variant ?? '') ? p.variant : 'primary';
  return h('a', { ...linkAttrs(p.url), class: `page-button page-button--${variant}`, style: { borderRadius: p.radius } }, [label, icon('arrow', 15)]);
}
const highlight = (text: string) => h('span', { class: 'as-highlight' }, [text]);

export function createPageTree(document: PageDocument, assets: Assets = {}) {
  const logic = createInteractionRuntime(document);
  const state: Record<string, string | number | boolean> = {};
  const width = Math.max(1, document.settings.maxWidth);
  let nextY = 32;
  const blocks = document.blocks.map((block, index) => {
    const frame = block.frame ?? defaultFrame(block.type, width, 32, nextY);
    nextY = Math.max(nextY, frame.y + frame.height + 24);
    const key = `b${index}`;
    const p = { ...block.props };
    const dynamic = (property: string, fallback: string | number | boolean) => bind(`readProp(${js(block.id)}, ${js(property)}, ${js(fallback)}, data)`, logic.read(block.bindings?.[property as keyof typeof block.bindings], fallback));
    const markers: Record<string, ReturnType<typeof bind>> = {};
    for (const property of ['title', 'text', 'label'] as const) {
      if (!block.bindings?.[property]) continue;
      const marker = `\u0000${block.id}:${property}\u0000`;
      markers[marker] = dynamic(property, p[property] || '');
      p[property] = marker;
    }
    const id = (suffix = '') => bind(`uid + ${js(`-${key}${suffix}`)}`, `as-export-${key}${suffix}`);
    const field = (initial: string | number | boolean, suffix = '') => {
      state[key + suffix] = initial;
      const property = ['checkbox', 'switch', 'toggle', 'collapsible', 'sidebar'].includes(block.type) ? 'checked' : 'value';
      const linked = !suffix && block.bindings?.[property];
      let expression = linked ? dynamic(property, initial).expression : `state.${key}${suffix}`;
      if (linked && typeof initial === 'number' && !['countingNumber','scrollingNumber','slidingNumber','motionGrid','questionnaire'].includes(block.type)) expression = `Math.max(${block.type === 'pagination' ? 1 : block.type === 'accordion' ? -1 : 0}, Math.min(${block.type === 'rating' ? 5 : ['tabs', 'radio', 'accordion'].includes(block.type) ? Math.max(0, rows(p.items).length - 1) : p.max ?? (block.type === 'pagination' ? 5 : 100)}, Number(${expression})))`;
      return { expression, initial: linked ? logic.read(block.bindings?.[property], initial) as string | number | boolean : initial, set: (value: string) => `const nextValue = ${value}; update(${js(key + suffix)}, nextValue); ${suffix ? '' : `void logic.dispatch(${js(block.id)}, 'change', nextValue);`}` };
    };
    const imageUrl = (value?: string) => assets[value ?? ''] ?? (/^(https?:\/\/|\/(?!\/))/i.test(safeUrl(value)) ? safeUrl(value) : '');
    function avatar(name = '', url = '', radius = 28) {
      const image = imageUrl(url);
      const failed = field(!image, 'Image');
      return h('span', { class: 'page-avatar', style: { borderRadius: radius } }, [
        image ? h('img', { src: image, alt: name ? `${name}的头像` : '头像', hidden: bind(failed.expression, failed.initial) }, [], { error: failed.set('true') }) : undefined,
        h('span', { hidden: bind(`!${failed.expression}`, !failed.initial), 'aria-hidden': 'true' }, [Array.from(name.trim() || '我').slice(0, 2).join('')]),
      ]);
    }
    function content(): Element {
      if (isExtendedComponent(block.type)) return catalogContent({ type: block.type, p, field, id, imageUrl });
      switch (block.type) {
        case 'navbar': {
          const name = p.brandIcon ?? 'leaf';
          const image = name === 'image' ? imageUrl(p.imageUrl) : '';
          const failed = field(!image, 'BrandImage');
          const mark = name === 'none' ? undefined : h('span', { class: `page-brand-mark${name === 'image' ? ' page-brand-mark--image' : ''}`, 'aria-hidden': 'true' }, [
            image ? h('img', { src: image, alt: '', hidden: bind(failed.expression, failed.initial) }, [], { error: failed.set('true') }) : undefined,
            h('span', { class: 'page-brand-placeholder', hidden: bind(`!${failed.expression}`, !failed.initial) }, [h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('path', { d: (navbarIcons[name] ?? navbarIcons.leaf).path })])]),
          ]);
          return h('nav', { class: 'page-navbar', 'aria-label': '页面导航' }, [
            h('a', { ...linkAttrs('#'), class: 'page-brand' }, [mark, h('span', { class: 'page-brand-title' }, [p.title]), h('span', { class: 'page-brand-dot' }, ['.'])]),
            h('div', { class: 'page-nav-links' }, (p.items || '').split(/[,，\n]/).map(item => item.trim()).filter(item => item.split('|')[0].trim()).map((item, i) => {
              const [label, url] = item.split('|');
              return h('a', linkAttrs(url || ['#features', '#about', '#contact'][i % 3]), [label]);
            })),
          ]);
        }
        case 'hero': {
          const lines = (p.title || '').split('\n');
          return h('section', { class: 'page-hero' }, [
            h('div', { class: 'page-hero-kicker' }, [h('span', { class: 'page-live-dot' }), p.label]),
            h('h1', { style: sizeStyle(p) }, lines.map((line, i) => h('span', { class: 'page-hero-line' }, [i === lines.length - 1 ? highlight(line) : line]))),
            h('p', { class: 'page-hero-description' }, [p.text]), action({ ...p, variant: 'primary' }, p.variant || '开始探索'),
          ]);
        }
        case 'heading': return h('h2', { class: 'page-heading', style: sizeStyle(p) }, [highlight(p.title || '')]);
        case 'text': return h('p', { class: 'page-paragraph', style: sizeStyle(p) }, [p.text]);
        case 'button': return action(p);
        case 'badge': return h('span', { class: 'page-badge' }, [icon('spark', 12), p.label]);
        case 'card': return h('article', { class: 'page-feature-card', 'data-anchor': 'features', style: { background: p.background, borderRadius: p.radius } }, [
          h('div', { class: 'page-card-copy' }, [h('h3', { style: sizeStyle(p) }, [p.title]), h('p', {}, [p.text]), p.label ? h('a', { ...linkAttrs(p.url), class: 'page-text-link' }, [p.label, icon('arrow', 14)]) : undefined]),
          h('div', { class: 'page-card-art', 'aria-hidden': 'true' }, [
            h('div', { class: 'page-art-dot page-art-dot-one' }), h('div', { class: 'page-art-dot page-art-dot-two' }),
            h('div', { class: 'page-art-stack page-art-stack-back' }), h('div', { class: 'page-art-stack page-art-stack-middle' }),
            h('div', { class: 'page-art-stack page-art-stack-front' }, [icon('layers', 32), h('div', { class: 'page-art-line' }), h('div', { class: 'page-art-line page-art-line-short' })]), h('span', { class: 'page-art-sparkle' }, ['✧']),
          ]),
        ]);
        case 'image': {
          const image = imageUrl(p.imageUrl);
          const failed = field(!image, 'Image');
          return h('figure', { class: 'page-image-figure' }, [
            image ? h('img', { src: image, alt: p.title || '页面图片', loading: 'lazy', style: { borderRadius: p.radius }, hidden: bind(failed.expression, failed.initial) }, [], { error: failed.set('true') }) : undefined,
            h('div', { class: 'page-image-placeholder', style: { borderRadius: p.radius }, hidden: bind(`!${failed.expression}`, !failed.initial) }, [icon('image', 32), h('span', {}, ['添加一张图片，让灵感更生动'])]),
            p.title || p.text ? h('figcaption', {}, [p.title ? h('strong', {}, [p.title]) : undefined, p.text ? h('p', {}, [p.text]) : undefined]) : undefined,
          ]);
        }
        case 'input': case 'textarea': {
          const value = field('');
          return h('label', { class: 'page-input-label' }, [p.label, h(block.type === 'input' ? 'input' : 'textarea', { class: block.type === 'input' ? 'page-input' : 'page-input page-textarea', ...(block.type === 'input' ? { type: p.variant === 'email' ? 'email' : 'text' } : { rows: 4 }), placeholder: p.text, value: bind(value.expression, value.initial), style: { borderRadius: p.radius } }, [], { input: value.set('event.currentTarget.value') })]);
        }
        case 'select': {
          const value = field('');
          return h('label', { class: 'page-input-label' }, [p.label, h('select', { class: 'page-input page-select', style: { borderRadius: p.radius }, value: bind(value.expression, '') }, [
            h('option', { value: '', disabled: true }, [p.text || '请选择']), ...rows(p.items).map(([title], i) => h('option', { value: `option-${i}` }, [title])),
          ], { change: value.set('event.currentTarget.value') })]);
        }
        case 'checkbox': {
          const value = field(p.checked ?? false);
          return h('div', { class: 'page-choice' }, [h('input', { id: id(), type: 'checkbox', checked: bind(value.expression, value.initial), 'aria-describedby': p.text ? id('-hint') : undefined }, [], { change: value.set('event.currentTarget.checked') }), h('div', {}, [h('label', { for: id() }, [p.label]), p.text ? h('p', { class: 'page-detail', id: id('-hint') }, [p.text]) : undefined])]);
        }
        case 'radio': {
          const value = field(0);
          return h('fieldset', { class: 'page-radio-group' }, [h('legend', {}, [p.label || '选择选项']), ...rows(p.items).map(([title, text], i) => h('div', { class: 'page-choice page-radio-option' }, [h('input', { id: id(`-${i}`), name: id(), type: 'radio', value: i, checked: bind(`${value.expression} === ${i}`, value.initial === i), 'aria-describedby': text ? id(`-${i}-hint`) : undefined }, [], { change: value.set(String(i)) }), h('div', {}, [h('label', { for: id(`-${i}`) }, [title]), text ? h('p', { class: 'page-detail', id: id(`-${i}-hint`) }, [text]) : undefined])]))]);
        }
        case 'slider': {
          const max = Math.max(1, p.max ?? 100);
          const value = field(clamp(p.value ?? 60, max));
          return h('div', { class: 'page-slider-field' }, [h('div', { class: 'page-field-heading' }, [h('label', { for: id() }, [p.label || '数值']), h('output', { for: id() }, [bind(value.expression, value.initial), h('small', {}, [` / ${max}`])])]), h('input', { id: id(), type: 'range', min: 0, max, step: 1, value: bind(value.expression, value.initial), 'aria-describedby': p.text ? id('-hint') : undefined }, [], { input: value.set('Number(event.currentTarget.value)') }), p.text ? h('p', { class: 'page-detail', id: id('-hint') }, [p.text]) : undefined]);
        }
        case 'accordion': {
          const items = rows(p.items).map(([title, ...text]) => [title, text.join('|').trim() || '在属性面板中编辑此处的内容。']);
          const value = field(items.length ? 0 : -1);
          return h('section', { class: 'page-faq', 'data-anchor': 'about', 'data-keyboard-group': 'accordion' }, [
            p.title ? h('div', { class: 'page-section-title' }, [h('h2', { style: sizeStyle(p) }, [p.title])]) : undefined,
            ...items.map(([title, text], i) => h('div', { class: 'as-accordion-item' }, [
              h('h3', {}, [h('button', { type: 'button', class: 'as-accordion-trigger', id: id(`-trigger-${i}`), 'aria-expanded': bind(`${value.expression} === ${i}`, i === 0), 'aria-controls': id(`-panel-${i}`) }, [title, icon('down', 12)], { click: value.set(`${value.expression} === ${i} ? -1 : ${i}`), keydown: "moveFocus(event, '.as-accordion-trigger');" })]),
              h('div', { role: 'region', id: id(`-panel-${i}`), 'aria-labelledby': id(`-trigger-${i}`), hidden: bind(`${value.expression} !== ${i}`, i !== 0) }, [h('div', {}, [text])]),
            ])),
          ]);
        }
        case 'tabs': {
          const items = rows(p.items).map(([title, ...text]) => [title, text.join('|').trim() || '在属性面板中编辑此处的内容。']);
          const value = field(0);
          return h('div', { class: 'page-tabs', 'data-keyboard-group': 'tabs' }, [
            h('div', { class: 'page-tabs-list', role: 'tablist', 'aria-label': '内容标签' }, items.map(([title], i) => h('button', { type: 'button', class: 'page-tab-trigger', role: 'tab', id: id(`-tab-${i}`), 'aria-controls': id(`-panel-${i}`), 'aria-selected': bind(`${value.expression} === ${i}`, i === 0), tabindex: bind(`${value.expression} === ${i} ? 0 : -1`, i === 0 ? 0 : -1), 'data-state': bind(`${value.expression} === ${i} ? 'active' : 'inactive'`, i === 0 ? 'active' : 'inactive') }, [title], { click: value.set(String(i)), keydown: "moveFocus(event, '[role=tab]', true);" }))),
            ...items.map(([title, text], i) => h('div', { class: 'page-tab-content', role: 'tabpanel', id: id(`-panel-${i}`), 'aria-labelledby': id(`-tab-${i}`), tabindex: 0, hidden: bind(`${value.expression} !== ${i}`, i !== 0) }, [h('span', { class: 'page-tab-icon' }, [icon('spark', 21)]), h('h3', {}, [title]), h('p', {}, [text])])),
          ]);
        }
        case 'switch': {
          const value = field(p.checked ?? false);
          const checked = bind(`${value.expression} ? 'checked' : 'unchecked'`, value.initial ? 'checked' : 'unchecked');
          return h('div', { class: 'page-switch-row' }, [h('div', {}, [h('label', { for: id() }, [p.label]), p.text ? h('p', {}, [p.text]) : undefined]), h('button', { id: id(), type: 'button', role: 'switch', class: 'page-switch', 'aria-label': p.label || '开关', 'aria-checked': bind(value.expression, value.initial), 'data-state': checked }, [h('span', { class: 'page-switch-thumb', 'data-state': checked }, [icon('check', 10)])], { click: value.set(`!${value.expression}`) })]);
        }
        case 'alert': return h('div', { role: 'note', class: 'page-alert', style: { borderRadius: p.radius } }, [icon('info', 19), h('div', {}, [h('strong', {}, [p.title]), h('p', {}, [p.text])])]);
        case 'separator': return h('hr', { class: 'page-separator' });
        case 'footer': return h('footer', { class: 'page-footer', 'data-anchor': 'contact' }, [h('a', { ...linkAttrs('#'), class: 'page-footer-brand' }, [p.title, h('span', {}, ['.'])]), h('p', {}, [p.text])]);
        case 'avatar': return h('div', { class: 'page-avatar-row' }, [avatar(p.title, p.imageUrl, p.radius), h('div', {}, [h('strong', {}, [p.title]), details(p.text)])]);
        case 'progress': {
          const max = Math.max(1, p.max ?? 100), value = field(clamp(p.value ?? 72, max));
          return h('div', { class: 'page-progress-field' }, [h('div', { class: 'page-field-heading' }, [h('label', { for: id() }, [p.label || '进度']), h('span', {}, [bind(`Math.round(${value.expression} / ${max} * 100) + '%'`, `${Math.round(Number(value.initial) / max * 100)}%`)])]), h('progress', { id: id(), max, value: bind(value.expression, value.initial) }), details(p.text)]);
        }
        case 'statistic': return h('article', { class: 'page-statistic' }, [h('div', { class: 'page-statistic-heading' }, [h('h3', {}, [p.title]), h('span', { class: 'page-statistic-icon' }, [icon('trend', 19)])]), h('p', { class: 'page-statistic-value' }, [p.text]), p.label ? h('span', { class: 'page-statistic-change' }, [p.label]) : undefined]);
        case 'table': {
          const [headers = [], ...body] = rows(p.items);
          return h('div', { class: 'page-table-scroll', tabindex: 0, role: 'region', 'aria-label': p.title || '数据表格' }, [h('table', { class: 'page-data-table', style: { borderRadius: p.radius } }, [p.title ? h('caption', {}, [p.title]) : undefined, h('thead', {}, [h('tr', {}, headers.map(title => h('th', { scope: 'col' }, [title])))]), h('tbody', {}, body.map(row => h('tr', {}, headers.map((_, i) => h('td', {}, [row[i] || '—'])))))]), headers.length ? undefined : details('暂无数据')]);
        }
        case 'timeline': return h('section', { class: 'page-timeline-section' }, [p.title ? h('h3', { class: 'page-library-title' }, [p.title]) : undefined, h('ol', { class: 'page-timeline' }, rows(p.items).map(([title, text, date]) => h('li', {}, [h('span', { class: 'page-timeline-dot', 'aria-hidden': 'true' }), h('div', { class: 'page-timeline-heading' }, [h('strong', {}, [title]), date ? h('span', {}, [date]) : undefined]), details(text)])))]);
        case 'testimonial': return h('figure', { class: 'page-testimonial' }, [icon('quote', 25), h('blockquote', {}, [p.text]), h('figcaption', {}, [avatar(p.title), h('div', {}, [h('strong', {}, [p.title]), details(p.label)])])]);
        case 'pricing': return h('article', { class: 'page-pricing' }, [h('span', { class: 'page-badge' }, [p.title]), h('p', { class: 'page-pricing-price' }, [p.variant]), details(p.text), h('ul', {}, rows(p.items).map(([item]) => h('li', {}, [icon('check', 16), item]))), action({ ...p, variant: 'primary' }, p.label || '选择方案')]);
        case 'breadcrumb': {
          const items = rows(p.items);
          return h('nav', { class: 'page-breadcrumb', 'aria-label': '面包屑' }, [h('ol', {}, items.map(([title, url], i) => h('li', {}, [i > 0 ? icon('right', 13) : undefined, i === items.length - 1 ? h('span', { 'aria-current': 'page' }, [title]) : h('a', linkAttrs(url), [title])])))]);
        }
        case 'pagination': {
          const total = clamp(Math.round(p.max ?? 5), 100, 1);
          const value = field(clamp(Math.round(p.value ?? 1), total, 1));
          const visible = (page: number) => `${total} <= 7 || ${page} === 1 || ${page} === ${total} || Math.abs(${value.expression} - ${page}) <= 1`;
          const initialVisible = (page: number) => total <= 7 || page === 1 || page === total || Math.abs(Number(value.initial) - page) <= 1;
          return h('nav', { class: 'page-pagination', 'aria-label': p.label || '分页' }, [h('div', { class: 'page-pagination-buttons' }, [
            h('button', { type: 'button', 'aria-label': '上一页', disabled: bind(`${value.expression} === 1`, value.initial === 1) }, [icon('left')], { click: value.set(`Math.max(1, ${value.expression} - 1)`) }),
            ...Array.from({ length: total }, (_, i) => i + 1).map(page => h('span', { class: 'page-pagination-item', hidden: bind(`!(${visible(page)})`, !initialVisible(page)) }, [
              page > 1 ? h('span', { class: 'page-pagination-gap', hidden: bind(visible(page - 1), initialVisible(page - 1)), 'aria-hidden': 'true' }, ['…']) : undefined,
              h('button', { type: 'button', 'aria-label': `第 ${page} 页`, 'aria-current': bind(`${value.expression} === ${page} ? 'page' : null`, value.initial === page ? 'page' : null) }, [page], { click: value.set(String(page)) }),
            ])),
            h('button', { type: 'button', 'aria-label': '下一页', disabled: bind(`${value.expression} === ${total}`, value.initial === total) }, [icon('right')], { click: value.set(`Math.min(${total}, ${value.expression} + 1)`) }),
          ]), h('p', { class: 'page-detail', 'aria-live': 'polite' }, [p.label || '', p.label ? ' · ' : '', '第 ', bind(value.expression, value.initial), ` / ${total} 页`])]);
        }
        case 'rating': {
          const value = field(clamp(Math.round(p.value ?? 4), 5));
          return h('fieldset', { class: 'page-rating', 'aria-describedby': p.text ? id('-hint') : undefined }, [h('legend', {}, [p.label || '评分']), h('div', { class: 'page-rating-stars' }, [
            ...[1, 2, 3, 4, 5].map(star => h('label', { class: bind(`'page-rating-star' + (${value.expression} >= ${star} ? ' is-filled' : '')`, `page-rating-star${Number(value.initial) >= star ? ' is-filled' : ''}`) }, [h('input', { type: 'radio', name: id(), value: star, checked: bind(`${value.expression} === ${star}`, value.initial === star), 'aria-label': `${star} 星` }, [], { change: value.set(String(star)) }), icon('star', 28)])),
            h('output', { 'aria-live': 'polite' }, [bind(value.expression, value.initial), ' / 5']),
          ]), p.text ? h('p', { id: id('-hint'), class: 'page-detail' }, [p.text]) : undefined]);
        }
        case 'custom': {
          // Same sandboxed document as the native renderer; fields are fixed at export time.
          const snapshot = p.custom;
          if (!snapshot) return h('div', { class: 'custom-component-fallback', role: 'alert' }, ['组件定义缺失']);
          const { html } = buildComponentDocument(snapshot, { channel: `export-${block.id}`, nonce: randomToken(), props: instanceProps(block), theme: customComponentTheme(block, document.settings) });
          return h('div', { class: 'custom-component-frame', style: { width: '100%', height: '100%' } }, [h('iframe', { title: snapshot.name, sandbox: customComponentSandbox, srcdoc: html, referrerpolicy: 'no-referrer', style: { display: 'block', width: '100%', height: '100%', border: 0 } })]);
        }
        default: { const exhaustive: never = block.type; throw new Error(`不支持导出组件：${exhaustive}`); }
      }
    }
    const style: Style = {
      textAlign: p.align, fontSize: p.fontSize, '--block-padding': `${p.padding ?? 20}px`, '--block-font-size': p.fontSize ? `${p.fontSize}px` : undefined,
      '--block-color': p.color, '--block-items': p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center',
      ...blockThemeStyle(block, document.settings), ...componentScaleStyle(block),
    };
    function mark(value: string) {
      let expression = js(value), changed = false;
      for (const [marker, binding] of Object.entries(markers)) {
        if (!value.includes(marker)) continue;
        // Markers are authored by this generator, never interpreted as user code.
        const parts = value.split(marker);
        expression = parts.map(part => js(part)).join(` + String(${binding.expression}) + `);
        changed = true;
        return bind(expression, parts.join(String(binding.initial ?? '')));
      }
      return changed ? bind(expression, value) : value;
    }
    function connect(node: Element): Element {
      for (const [name, value] of Object.entries(node.attrs)) if (typeof value === 'string') node.attrs[name] = mark(value);
      node.children = node.children.map(child => typeof child === 'string' ? mark(child) : typeof child === 'object' && 'tag' in child ? connect(child) : child);
      if (node.tag === 'a' && typeof node.attrs.class === 'string' && /page-button|page-text-link/.test(node.attrs.class) && (block.events?.click?.length || block.bindings?.disabled)) {
        const href = node.attrs.href; node.tag = 'button'; node.attrs.type = 'button'; delete node.attrs.href; delete node.attrs.target; delete node.attrs.rel;
        if (!block.events?.click?.length) node.events.click = `followLink(event.currentTarget.closest('.as-export'), ${js(href)});`;
      }
      if (block.bindings?.disabled && node.tag === 'a') {
        const disabled = dynamic('disabled', false); node.attrs['aria-disabled'] = disabled; node.attrs.tabindex = bind(`${disabled.expression} ? -1 : 0`, disabled.initial ? -1 : 0);
        node.events.click = `if (${disabled.expression}) { event.preventDefault(); event.stopPropagation(); return; } ${node.events.click || ''}`;
      }
      if (block.bindings?.disabled && ['button', 'input', 'textarea', 'select', 'fieldset'].includes(node.tag)) {
        const existing = node.attrs.disabled;
        const prior = existing && typeof existing === 'object' && 'expression' in existing ? existing.expression : js(existing || false);
        node.attrs.disabled = bind(`(${prior}) || ${dynamic('disabled', false).expression}`, Boolean(logic.read(block.bindings.disabled, false)));
      }
      return node;
    }
    const body = connect(content());
    const frameEvents: Record<string, string> = block.events?.click?.length ? { click: `event.preventDefault(); void logic.dispatch(${js(block.id)}, 'click');` } : {};
    return h('div', { class: 'page-free-frame', style: { left: frame.x, top: frame.y, width: Math.max(1, frame.width), height: Math.max(1, frame.height), zIndex: index + 1 }, 'data-block-type': block.type, 'data-block-id': block.id, ...(block.bindings?.visible ? { hidden: bind(`!${dynamic('visible', true).expression}`, !logic.read(block.bindings.visible, true)) } : {}), ...(block.bindings?.disabled ? { 'aria-disabled': dynamic('disabled', false) } : {}) }, [
      h('div', { class: `page-block page-block--${block.type} page-block--bounded`, style, 'data-theme': p.theme ?? document.settings.theme, 'data-animation': p.animation || 'none', 'data-catalog-effect': p.effect || 'none' }, [h('div', { class: 'page-block-content' }, [body])]),
    ], frameEvents);
  });
  const height = Math.max(1, document.settings.canvasHeight ?? Math.max(1200, nextY));
  const tree = h('div', { ref: 'rootRef', class: 'as-export page-surface page-surface--free', style: pageThemeStyle(document.settings) }, [
    h('div', { class: 'page-free-viewport' }, [h('div', { class: 'page-free-scaled-shell', style: { width, height } }, [
      h('div', { class: 'page-free-canvas', style: { width, height } }, blocks),
    ])]),
    // Static markup lets Vue's scoped styles and each framework's unique IDs cover the dialog.
    h('dialog', { class: 'as-runtime-notice', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': bind('uid + "-notice-title"', 'as-export-notice-title'), 'aria-describedby': bind('uid + "-notice-message"', 'as-export-notice-message') }, [
      h('h2', { id: bind('uid + "-notice-title"', 'as-export-notice-title') }, ['提示']),
      h('p', { class: 'as-runtime-notice-message', id: bind('uid + "-notice-message"', 'as-export-notice-message') }),
      h('form', { method: 'dialog' }, [h('button', { type: 'submit' }, ['确定'])]),
    ], { keydown: 'event.stopPropagation();' }),
  ]);
  return { tree, state, width, height };
}
