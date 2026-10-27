/**
 * Bootstrap that runs first inside every custom component document.
 *
 * It is serialized with Function.prototype.toString() into the sandboxed
 * iframe, so it must stay self-contained: no imports, no module-scope
 * references. It is the only code the platform runs next to author code and
 * it implements the documented component API:
 *
 *   component.props / component.theme / component.onProps(fn)
 *   component.log(...values) / component.openLink(url)
 *   [data-prop], [data-prop-href], [data-prop-src] and --as-* CSS variables
 *
 * Everything it sends to the host is untrusted input there: the host checks the
 * window, channel, message type and field types before acting on it.
 */
export function customComponentBootstrap(config, jsLine, probeLine) {
  'use strict';
  const host = window.parent;
  const channel = config.channel;
  const limit = (value, max) => { const text = String(value); return text.length > max ? `${text.slice(0, max)}…` : text; };
  const send = (type, detail) => {
    try { host.postMessage(Object.assign({ source: 'animate-studio-component', channel, type }, detail || {}), '*'); } catch { /* The host may already be gone. */ }
  };
  const describe = value => {
    if (value instanceof Error) return value.message || String(value);
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  // Browsers report inline-script lines relative to the document; some engines
  // count from the start of each script. A one-line probe script on a known
  // document line tells which, so lines always refer to the JavaScript panel
  // (whose script element starts with a newline).
  const probe = /:(\d+):\d+/.exec(String(window.__asProbe || ''));
  try { delete window.__asProbe; } catch { /* Not configurable in some engines. */ }
  const scriptRelative = Boolean(probe) && Number(probe[1]) === 1 && probeLine !== 1;
  const panelLine = line => {
    const value = scriptRelative ? Number(line) - 1 : Number(line) - jsLine + 1;
    return Number.isInteger(value) && value >= 1 ? value : undefined;
  };
  const frames = stack => [...String(stack || '').matchAll(/:(\d+):(\d+)\)?\s*$/gm)].map(match => ({ line: Number(match[1]), column: Number(match[2]) }));
  const stackLine = (stack, skip = 0) => {
    for (const frame of frames(stack).slice(skip)) {
      const line = panelLine(frame.line);
      if (line) return { line, column: frame.column };
    }
    return {};
  };
  const reported = new Set();
  const report = (type, message, position) => {
    const text = limit(message, 1000);
    const key = `${type}:${text}:${position?.line ?? ''}`;
    if (reported.has(key) || reported.size > 50) return;
    reported.add(key);
    send(type, Object.assign({ message: text }, position && position.line ? { line: position.line, column: Number.isInteger(position.column) ? position.column : undefined } : {}));
  };

  if (config.loopGuard) {
    // Continuous synchronous execution for more than a second is treated as a
    // runaway loop. Calls further apart than 100 ms start a new measurement.
    let started = 0, previous = 0;
    Object.defineProperty(window, '__asGuard', { value() {
      const now = performance.now();
      if (now - previous > 100) started = now;
      previous = now;
      if (now - started > 1000) {
        started = now;
        const error = new Error('检测到可能的死循环：循环连续运行超过 1 秒，已停止执行。');
        // The first stack frame is this guard; the second is the loop in the JavaScript panel.
        Object.defineProperty(error, 'asPosition', { value: stackLine(error.stack, 1) });
        throw error;
      }
    } });
  }

  const freezeRecord = value => {
    const result = {};
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) if (typeof item === 'string') result[key] = item;
    return Object.freeze(result);
  };
  let props = freezeRecord(config.props);
  let theme = freezeRecord(config.theme);
  let route = config.route ? Object.freeze({ path: String(config.route.path), pageId: String(config.route.pageId), pattern: String(config.route.pattern), params: freezeRecord(config.route.params) }) : undefined;
  const listeners = new Set();
  const themeVariables = { accent: 'accent', onAccent: 'on-accent', text: 'text', muted: 'muted', surface: 'surface', panel: 'panel', canvas: 'canvas', border: 'border', radius: 'radius', font: 'font' };
  function applyTheme() {
    const root = document.documentElement;
    root.dataset.scheme = theme.scheme === 'dark' ? 'dark' : 'light';
    for (const [key, name] of Object.entries(themeVariables)) if (typeof theme[key] === 'string') root.style.setProperty(`--as-${name}`, theme[key]);
  }
  function applyFields() {
    for (const element of document.querySelectorAll('[data-prop]')) {
      const key = element.getAttribute('data-prop');
      if (Object.hasOwn(props, key)) element.textContent = props[key];
    }
    for (const [attribute, target] of [['data-prop-href', 'href'], ['data-prop-src', 'src']]) {
      for (const element of document.querySelectorAll(`[${attribute}]`)) {
        const key = element.getAttribute(attribute);
        if (!Object.hasOwn(props, key)) continue;
        if (props[key]) element.setAttribute(target, props[key]); else element.removeAttribute(target);
      }
    }
  }
  function notify() {
    for (const listener of [...listeners]) {
      try { listener(props, theme); }
      catch (error) { report('error', `component.onProps 回调出错：${describe(error)}`, stackLine(error && error.stack)); }
    }
  }

  const api = Object.freeze({
    get props() { return props; },
    get theme() { return theme; },
    get route() { return route; },
    onProps(listener) {
      if (typeof listener !== 'function') throw new TypeError('component.onProps 需要一个函数');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    log(...values) { send('log', { level: 'log', message: limit(values.map(describe).join(' '), 1000) }); },
    openLink(url) { send('open-link', { href: limit(url, 2048) }); },
  });
  Object.defineProperty(window, 'component', { value: api, enumerable: true });

  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level];
    console[level] = (...values) => {
      send('log', { level, message: limit(values.map(describe).join(' '), 1000) });
      try { original.apply(console, values); } catch { /* Console output is optional. */ }
    };
  }

  window.addEventListener('error', event => {
    const target = event.target;
    if (target && target !== window && target.tagName) {
      report('warning', `资源加载失败：${limit(target.currentSrc || target.src || target.href || target.tagName.toLowerCase(), 300)}`);
      return;
    }
    const guarded = event.error && event.error.asPosition;
    const line = panelLine(event.lineno);
    report('error', event.error instanceof Error ? `${event.error.name}: ${event.error.message}` : event.message || describe(event.error), guarded && guarded.line ? guarded : line ? { line, column: event.colno } : stackLine(event.error && event.error.stack));
  }, true);
  window.addEventListener('unhandledrejection', event => {
    report('error', `未处理的 Promise 错误：${describe(event.reason)}`, stackLine(event.reason && event.reason.stack));
  });
  document.addEventListener('securitypolicyviolation', event => {
    const directive = String(event.effectiveDirective || event.violatedDirective || '');
    const blocked = String(event.blockedURI || '');
    let message = `已按安全策略阻止：${directive}`;
    if (blocked === 'eval') message = '组件不能使用 eval、new Function 或字符串形式的定时器。';
    else if (directive === 'script-src-attr') message = '已阻止 HTML 中的内联事件属性（如 onclick）。请在 JavaScript 面板中使用 addEventListener。';
    else if (directive.startsWith('script-src')) message = 'HTML 中的 <script> 标签和外部脚本不会执行。请把代码写在 JavaScript 面板；组件不支持 import 或外部库。';
    else if (directive === 'connect-src') message = '组件不能发起网络请求（fetch、XMLHttpRequest、WebSocket 已被阻止）。';
    else if (directive.startsWith('style-src')) message = '组件不能引用外部样式表，请把样式写在 CSS 面板。';
    else if (directive === 'form-action') message = '组件中的表单不能提交到其他地址。';
    report('warning', message);
  });

  // Links leave the component through the host, which applies the page link rules.
  // Fragment links keep scrolling inside the component itself.
  window.addEventListener('click', event => {
    if (event.isTrusted) send('click');
    if (event.defaultPrevented) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const href = anchor && anchor.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    event.preventDefault();
    send('open-link', { href: limit(href, 2048) });
  });
  document.addEventListener('submit', event => { event.preventDefault(); report('warning', '组件中的表单不会提交。请在 JavaScript 面板中处理 submit 事件。'); });

  window.addEventListener('message', event => {
    if (event.source !== host) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.channel !== channel) return;
    if (data.type === 'update') {
      props = freezeRecord(data.props);
      theme = freezeRecord(data.theme);
      route = data.route ? Object.freeze({ path: String(data.route.path), pageId: String(data.route.pageId), pattern: String(data.route.pattern), params: freezeRecord(data.route.params) }) : undefined;
      applyTheme(); applyFields(); notify();
    } else if (data.type === 'ping') send('pong');
  });

  // The markup is inserted as data, before this script, so an unclosed tag in
  // the HTML panel cannot swallow the scripts that follow.
  const script = document.currentScript;
  if (script) script.insertAdjacentHTML('beforebegin', String(config.html || ''));
  applyTheme();
  applyFields();
  if (script) script.remove();
  document.addEventListener('DOMContentLoaded', () => send('ready'), { once: true });
}
