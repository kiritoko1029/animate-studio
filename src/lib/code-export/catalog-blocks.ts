import { safeUrl, type BlockProps, type ExtendedComponentType } from '../../model.ts';
import { bind, h, js, type Binding, type Element } from './nodes.ts';

type Field = { expression: string; initial: string | number | boolean; set: (value: string) => string };
export type CatalogContext = { type: ExtendedComponentType; p: BlockProps; field: (initial: string | number | boolean, suffix?: string) => Field; id: (suffix?: string) => Binding; imageUrl: (value?: string) => string };
const rows = (text = '') => text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 100).map(line => line.split('|').map(cell => cell.trim()));
const link = (url?: string) => ({ href: safeUrl(url), ...(/^https?:\/\//i.test(safeUrl(url)) ? { target: '_blank', rel: 'noopener noreferrer' } : {}) });
const button = (label: string, action?: string, attrs = {}) => h('button', { type: 'button', class: 'page-catalog-button', ...(action ? { 'data-catalog-action': action } : {}), ...attrs }, [label]);
const codeTokens = (source: string) => source.includes('\u0000') ? [h('span', {}, [source])] : source.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/[^\n]*|\b(?:const|let|var|function|return|if|else|await|async|new|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g).filter(Boolean).map(token => h('span', { class: /^['"]/.test(token) ? 'page-code-string' : token.startsWith('//') ? 'page-code-comment' : /^(const|let|var|function|return|if|else|await|async|new|true|false|null)$/.test(token) ? 'page-code-keyword' : /^\d/.test(token) ? 'page-code-number' : '' }, [token]));
const description = (p: BlockProps) => [p.title ? h('h3', {}, [p.title]) : undefined, p.text ? h('p', {}, [p.text]) : undefined];

/** A portable node tree shared by the editor thumbnail and all three export targets. */
export function catalogContent({ type, p, field, id, imageUrl }: CatalogContext): Element {
  const shell = (children: Parameters<typeof h>[2], attrs = {}) => h('div', { class: `page-catalog page-catalog--${type}`, 'data-catalog': type, style: { '--catalog-duration': `${p.duration ?? 1800}ms` }, ...attrs }, children);
  const options = rows(p.items);
  const choice = (initial: number | string | boolean = 0) => field(initial);
  if (['dialog', 'alertDialog', 'sheet', 'drawer', 'imageZoom'].includes(type)) {
    const picture = imageUrl(p.imageUrl);
    return shell([
      type === 'imageZoom' ? h('button', { type: 'button', class: 'page-zoom-trigger', 'data-catalog-action': 'open-dialog', 'aria-label': p.title || '放大图片', 'aria-haspopup': 'dialog' }, [h('img', { src: picture, alt: p.title || '图片', style: { borderRadius: p.radius } })]) : button(p.label || '打开', 'open-dialog', { 'aria-haspopup': 'dialog' }),
      h('dialog', { class: `page-catalog-dialog page-catalog-dialog--${type === 'imageZoom' ? 'image' : p.variant || (type === 'drawer' ? 'bottom' : type === 'sheet' ? 'right' : 'center')}`, role: type === 'alertDialog' ? 'alertdialog' : 'dialog', 'aria-labelledby': id('-title'), 'aria-describedby': id('-description') }, [
        h('h2', { id: id('-title') }, [p.title || '详情']), h('p', { id: id('-description') }, [p.text || (type === 'imageZoom' ? '放大查看图片细节' : '')]),
        type === 'imageZoom' ? h('img', { src: picture, alt: p.title || '放大图片' }) : undefined,
        h('div', { class: 'page-catalog-actions' }, [button(type === 'alertDialog' ? '取消' : '关闭', 'close-dialog'), type === 'alertDialog' ? button('确认', 'confirm-dialog') : undefined]),
      ]), h('span', { class: 'page-catalog-status', role: 'status' }),
    ]);
  }
  if (['popover', 'hoverCard', 'tooltip', 'previewLinkCard', 'dropdownMenu', 'contextMenu'].includes(type)) {
    const menu = ['dropdownMenu', 'contextMenu'].includes(type);
    return shell([
      button(type === 'contextMenu' ? '右键或点击打开菜单' : p.label || '了解更多', 'open-popover', { 'aria-expanded': 'false', 'aria-controls': id('-popup') }),
      h('div', { popover: 'auto', class: 'page-catalog-popup', id: id('-popup'), role: type === 'tooltip' ? 'tooltip' : undefined }, menu ? options.map(([name, url]) => h('a', { ...link(url), class: 'page-catalog-menu-item' }, [name])) : [...description(p), type === 'previewLinkCard' ? h('a', { ...link(p.url), class: 'page-catalog-link' }, [p.url || '访问链接']) : undefined]),
    ]);
  }
  if (type === 'collapsible') {
    const value = choice(p.checked ?? false);
    return shell([h('button', { type: 'button', class: 'page-catalog-button', 'aria-expanded': bind(value.expression, value.initial), 'aria-controls': id('-body') }, [p.label || '展开详情', ' ⌄'], { click: value.set(`!${value.expression}`) }), h('div', { id: id('-body'), hidden: bind(`!${value.expression}`, !value.initial), class: 'page-catalog-reveal' }, description(p))]);
  }
  if (['menubar', 'navigationMenu'].includes(type)) {
    const groups = new Map<string, string[][]>();
    for (const [group, name, url] of options) groups.set(group, [...groups.get(group) || [], [name || group, url || '#']]);
    return shell([h('nav', { class: 'page-catalog-nav', 'aria-label': p.label || '导航' }, [...groups].map(([group, items], index) => h('div', { 'data-catalog': type === 'navigationMenu' ? 'hoverCard' : 'popover' }, [button(group + ' ⌄', 'open-popover', { 'aria-expanded': 'false', 'aria-controls': id(`-menu${index}`) }), h('div', { popover: 'auto', id: id(`-menu${index}`), class: 'page-catalog-popup' }, items.map(([name, url]) => h('a', { ...link(url), class: 'page-catalog-menu-item' }, [name])))])))]);
  }
  if (type === 'sidebar') {
    const expanded = choice(p.checked ?? true);
    return shell([h('button', { type: 'button', class: 'page-catalog-button', 'aria-expanded': bind(expanded.expression, expanded.initial), 'aria-controls': id('-nav') }, [p.label || '展开导航'], { click: expanded.set(`!${expanded.expression}`) }), h('nav', { id: id('-nav'), hidden: bind(`!${expanded.expression}`, !expanded.initial), class: 'page-catalog-side-nav', 'aria-label': p.title || '侧栏导航' }, [h('h3', {}, [p.title]), ...options.map(([name, url]) => h('a', link(url), [name]))])]);
  }
  if (type === 'combobox' || type === 'inputOtp') {
    const value = choice('');
    return shell([h('label', { class: 'page-input-label' }, [p.label, h('input', { class: `page-input ${type === 'inputOtp' ? 'page-catalog-otp' : ''}`, value: bind(value.expression, value.initial), placeholder: p.text, ...(type === 'inputOtp' ? { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: Math.min(12, Math.max(1, p.max ?? 6)), pattern: '[0-9]*', 'aria-describedby': id('-hint') } : { list: id('-options'), autocomplete: 'off' }) }, [], { input: value.set(type === 'inputOtp' ? `event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, ${Math.min(12, Math.max(1, p.max ?? 6))})` : 'event.currentTarget.value') })]), type === 'combobox' ? h('datalist', { id: id('-options') }, options.map(([name]) => h('option', { value: name }))) : h('small', { id: id('-hint') }, [`${Math.min(12, Math.max(1, p.max ?? 6))} 位数字，可粘贴验证码`])]);
  }
  if (type === 'toggle') {
    const value = choice(p.checked ?? false);
    return shell([h('button', { type: 'button', class: 'page-catalog-button', 'aria-pressed': bind(value.expression, value.initial) }, [p.label || '切换'], { click: value.set(`!${value.expression}`) })]);
  }
  if (type === 'toggleGroup') {
    const value = choice(p.value ?? 0);
    return shell([h('div', { role: 'group', 'aria-label': p.label || '切换选项', class: 'page-catalog-toggle-group' }, options.map(([name], i) => h('button', { type: 'button', 'aria-pressed': bind(`${value.expression} === ${i}`, value.initial === i) }, [name], { click: value.set(String(i)) })))]);
  }
  if (type === 'toast') return shell([button(p.label || '显示通知', 'toast'), h('div', { popover: 'manual', class: 'page-catalog-toast', role: 'status', 'data-duration': p.duration ?? 3000 }, [...description(p), button('关闭', 'close-toast', { 'aria-label': '关闭通知' })])]);
  if (type === 'questionnaire') {
    const step = choice(0);
    return shell([h('h3', {}, [p.title]), ...options.map(([question, choices], index) => {
      const answer = field('', `Answer${index}`);
      return h('fieldset', { hidden: bind(`${step.expression} !== ${index}`, step.initial !== index), class: 'page-catalog-question' }, [h('legend', {}, [question]), h('p', { class: 'page-detail' }, [`第 ${index + 1} / ${options.length} 题`]), ...(choices ? choices.split(',').map((name, i) => h('label', { class: 'page-catalog-answer' }, [h('input', { type: 'radio', name: id(`-q${index}`), value: name, checked: bind(`${answer.expression} === ${js(name)}`, false) }, [], { change: answer.set(js(name)) }), name])) : [h('input', { class: 'page-input', 'aria-label': question, value: bind(answer.expression, answer.initial) }, [], { input: answer.set('event.currentTarget.value') })]), h('div', { class: 'page-catalog-actions' }, [index > 0 ? h('button', { type: 'button', class: 'page-catalog-button' }, ['上一题'], { click: step.set(String(index - 1)) }) : undefined, h('button', { type: 'button', class: 'page-catalog-button', 'data-catalog-action': 'question-nav', disabled: bind(`!String(${answer.expression}).trim()`, true) }, [index === options.length - 1 ? p.label || '提交' : '下一题'], { click: step.set(String(index + 1)) })])]);
    }), h('p', { role: 'status', hidden: bind(`${step.expression} < ${options.length}`, options.length > 0) }, [p.text || '感谢你的回答！'])]);
  }
  if (type === 'avatarGroup') return shell([h('div', { class: 'page-catalog-avatars', 'aria-label': p.label || '成员' }, options.map(([name]) => h('span', { title: name, 'aria-label': name }, [Array.from(name).slice(0, 2).join('')]))), h('p', {}, [p.label])]);
  if (type === 'codeBlock') return shell([h('header', {}, [h('span', {}, [p.title || '代码']), button(p.label || '复制代码', 'copy')]), h('pre', {}, [h('code', { 'data-catalog-code': '' }, codeTokens(p.text || ''))]), h('span', { role: 'status', class: 'page-catalog-status' })]);
  if (type === 'pinnedList') {
    const pins = options.map((_, i) => field(false, `Pinned${i}`));
    return shell([h('h3', {}, [p.title]), ...[true, false].map(pinned => h('section', {}, [h('h4', {}, [pinned ? '置顶' : '全部']), ...options.map(([name], i) => h('div', { class: 'page-catalog-pinned-row', hidden: bind(`${pins[i].expression} !== ${pinned}`, pinned) }, [name, h('button', { type: 'button', 'aria-label': `${pinned ? '取消置顶' : '置顶'} ${name}`, 'aria-pressed': pinned }, [pinned ? '●' : '⌖'], { click: pins[i].set(`!${pins[i].expression}`) })]))]))]);
  }
  if (type === 'motionGrid') {
    const selected = choice(-1);
    return shell([h('h3', {}, [p.title]), h('div', { class: 'page-catalog-grid' }, options.map(([name], i) => h('button', { type: 'button', 'aria-pressed': bind(`${selected.expression} === ${i}`, false), style: { '--item-index': i } }, [name], { click: selected.set(String(i)) })))]);
  }
  if (type === 'scrollProgress') return shell([h('h3', {}, [p.title]), h('progress', { max: 100, value: 0, 'aria-label': p.title || '阅读进度', 'data-catalog-scroll': '' }), h('p', {}, [p.text])]);
  if (type === 'githubStars' || type === 'githubStarsButton') return shell([h('a', { ...link(p.url), class: 'page-catalog-button', 'data-github-url': p.url || '' }, ['★ ', p.title || p.label || 'GitHub', ' · ', h('span', { 'data-github-count': '' }, [p.value ? p.value.toLocaleString() : '—'])])]);
  if (['copyButton', 'flipButton', 'iconButton', 'liquidButton', 'rippleButton', 'themeTogglerButton'].includes(type)) {
    const action = type === 'copyButton' ? 'copy' : type === 'themeTogglerButton' ? 'theme' : undefined;
    const symbols: Record<string, string> = { star: '☆', heart: '♡', plus: '+', arrow: '→' };
    const content = type === 'flipButton' ? [h('span', { class: 'page-flip-front' }, [p.label]), h('span', { class: 'page-flip-back', 'aria-hidden': 'true' }, [p.text || p.label])] : [type === 'iconButton' ? symbols[p.variant || 'star'] || '☆' : p.label || '点击按钮'];
    return shell([h(action ? 'button' : 'a', { ...(action ? { type: 'button', 'data-catalog-action': action } : link(p.url)), class: 'page-catalog-button', 'aria-label': p.label || '按钮', ...(type === 'copyButton' ? { 'data-copy-text': p.text || '' } : {}) }, content), action ? h('span', { role: 'status', class: 'page-catalog-status' }) : undefined]);
  }
  if (['countingNumber', 'scrollingNumber', 'slidingNumber'].includes(type)) {
    const value = choice(p.value ?? 0);
    return shell([h('p', {}, [p.label]), h('strong', { class: 'page-catalog-number', 'data-catalog-number': type, 'data-duration': p.duration ?? 1600, style: { fontSize: p.fontSize } }, [h('span', { 'data-number-value': '' }, [bind(value.expression, value.initial)])])]);
  }
  if (type.endsWith('Text')) {
    const rotating = ['morphingText', 'rotatingText', 'swappingText'].includes(type);
    return shell([h('div', { class: 'page-catalog-text', style: { fontSize: p.fontSize }, 'data-text-effect': type, 'data-duration': p.duration ?? 1800, ...(rotating ? { 'data-text-items': JSON.stringify(options.map(([text]) => text)), 'aria-label': options.map(([text]) => text).join('，') } : {}) }, [rotating ? options[0]?.[0] || p.title || '' : h('span', { 'data-text-value': '' }, [p.title || ''])])]);
  }
  if (type.endsWith('Background')) return shell([h('div', { class: 'page-catalog-backdrop', 'aria-hidden': 'true' }, Array.from({ length: type === 'glyphBackground' ? 48 : type === 'bubbleBackground' ? 6 : 28 }, (_, i) => h('i', { style: { '--item-index': i, '--x': `${(i * 37 + 13) % 100}%`, '--y': `${(i * 53 + 7) % 100}%` } }, type === 'glyphBackground' ? ['01{}<>✦+'.charAt(i % 8)] : []))), h('div', { class: 'page-catalog-backdrop-copy' }, description(p))]);
  throw new Error(`未实现的官方组件适配：${type}`);
}
