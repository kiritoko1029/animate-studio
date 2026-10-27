/** Framework-neutral runtime. Keep dependencies inside the factory: exports embed this function. */
export function createInteractionRuntime(config, options = {}) {
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const variables = new Map((config.variables || []).map(v => [v.name, v]));
  const initial = Object.fromEntries([...variables].map(([name, v]) => [name, clone(v.initial)]));
  let state = clone(initial), data = clone(options.data ?? {}), disposed = false, epoch = 0;
  const cancellations = new Set(), reported = new Set();
  const log = (level, message) => { if (!disposed) options.onLog?.({ level, message: String(message).slice(0, 2000), time: Date.now() }); };
  let restored = false, storageWarning = false;
  // Storage is opt-in at the runtime boundary: validators and expression helpers stay pure.
  // Restore after mounting, so React rendering and server rendering never write browser data.
  function withStorage(callback) {
    if (!options.storageKey || typeof window === 'undefined') return;
    try { callback(window.localStorage); }
    catch {
      if (!storageWarning) { storageWarning = true; log('warning', '无法保存或读取浏览器变量，当前页面仍可使用，重新打开后可能恢复初始值。'); }
    }
  }
  function savedVariables(storage) {
    const raw = storage.getItem(options.storageKey);
    let record;
    try { record = JSON.parse(raw); } catch { /* Ignore damaged browser data. */ }
    const saved = {};
    if (record?.version === 1 && record.variables && typeof record.variables === 'object') {
      for (const [name, variable] of variables) {
        if (variable.persistent === false || !Object.hasOwn(record.variables, name)) continue;
        const entry = record.variables[name];
        if (entry?.type !== variable.type || JSON.stringify(entry.initial) !== JSON.stringify(variable.initial)) continue;
        try { saved[name] = { type: variable.type, initial: variable.initial, value: validateValue(name, entry.value) }; }
        catch { /* An invalid cached value must not discard other valid variables. */ }
      }
    }
    return { raw, saved };
  }
  function writeSaved(storage, saved, raw) {
    if (!Object.keys(saved).length) { if (raw !== null) storage.removeItem(options.storageKey); return; }
    const json = JSON.stringify({ version: 1, variables: saved });
    if (json !== raw) storage.setItem(options.storageKey, json);
  }
  function persist(name) {
    withStorage(storage => {
      const { raw, saved } = savedVariables(storage);
      const variable = variables.get(name);
      if (variable.persistent !== false) saved[name] = { type: variable.type, initial: variable.initial, value: state[name] };
      // Merge only this write, preserving changes made by another preview or browser tab.
      writeSaved(storage, saved, raw);
    });
  }
  function restore() {
    if (restored) return;
    restored = true;
    withStorage(storage => {
      const { raw, saved } = savedVariables(storage);
      state = { ...state, ...Object.fromEntries(Object.entries(saved).map(([name, entry]) => [name, entry.value])) };
      // Drop deleted/disabled variables and values from an older type or initial value.
      writeSaved(storage, saved, raw);
    });
  }
  function parse(source) {
    if (typeof source !== 'string' || source.length > 1000) throw new Error('表达式最长 1000 字符');
    const tokens = [];
    const pattern = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_$][\w$]*)|(===|!==|==|!=|>=|<=|&&|\|\||\?\?|[+\-*/%><!?:.()[\]]))/gy;
    let at = 0;
    while (at < source.length && source.slice(at).trim()) {
      pattern.lastIndex = at;
      const match = pattern.exec(source);
      if (!match || tokens.length > 256) throw new Error(`表达式在第 ${at + 1} 个字符处无效`);
      tokens.push(match[1] ? { kind: 'literal', value: Number(match[1]) } : match[2] ? { kind: 'literal', value: match[2][0] === '"' ? JSON.parse(match[2]) : match[2].slice(1, -1).replace(/\\(['\\nrt])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t' })[c] || c) } : { kind: 'symbol', value: match[3] || match[4] });
      at = pattern.lastIndex;
    }
    let i = 0;
    const peek = () => tokens[i]?.value;
    const take = value => { if (peek() !== value) throw new Error(`表达式需要 ${value}`); i++; };
    const precedence = { '??': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '===': 4, '!==': 4, '>': 5, '<': 5, '>=': 5, '<=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 };
    function primary() {
      const token = tokens[i++];
      if (!token) throw new Error('表达式不完整');
      if (token.kind === 'literal') return ['literal', token.value];
      if (['!', '-', '+'].includes(token.value)) return ['unary', token.value, primary()];
      let node;
      if (token.value === '(') { node = expression(0); take(')'); }
      else if (['true', 'false', 'null'].includes(token.value)) node = ['literal', { true: true, false: false, null: null }[token.value]];
      else if (['state', 'event', 'route', 'data'].includes(token.value)) node = ['root', token.value];
      else throw new Error('仅支持 state、event、route、data、常量和运算符');
      while (peek() === '.' || peek() === '[') {
        let key;
        if (peek() === '.') { i++; key = tokens[i++]; if (!key || key.kind !== 'symbol' || !/^[A-Za-z_$][\w$]*$/.test(key.value)) throw new Error('属性名无效'); key = ['literal', key.value]; }
        else { i++; key = expression(0); take(']'); }
        node = ['get', node, key];
      }
      return node;
    }
    function expression(min) {
      let left = primary();
      while (Object.hasOwn(precedence, peek()) && precedence[peek()] >= min) {
        const op = tokens[i++].value;
        left = ['binary', op, left, expression(precedence[op] + 1)];
      }
      if (min === 0 && peek() === '?') { i++; const yes = expression(0); take(':'); left = ['if', left, yes, expression(0)]; }
      return left;
    }
    const tree = expression(0);
    if (i !== tokens.length) throw new Error('不支持函数调用或赋值，请使用脚本动作');
    return tree;
  }
  const expressions = new Map();
  function evaluate(source, event = {}, snapshot = state) {
    if (!expressions.has(source)) expressions.set(source, parse(source));
    function visit(node) {
      const [type, a, b, c] = node;
      if (type === 'literal') return a;
      if (type === 'root') return a === 'state' ? snapshot : a === 'route' ? (options.route ?? {}) : a === 'data' ? data : event;
      if (type === 'get') { const target = visit(a), key = String(visit(b)); return target != null && !forbidden.has(key) && Object.hasOwn(Object(target), key) ? target[key] : undefined; }
      if (type === 'if') return visit(a) ? visit(b) : visit(c);
      if (type === 'unary') { const value = visit(b); return a === '!' ? !value : a === '-' ? -Number(value) : Number(value); }
      const left = visit(b);
      if (a === '&&') return left && visit(c);
      if (a === '||') return left || visit(c);
      if (a === '??') return left ?? visit(c);
      const right = visit(c);
      switch (a) {
        case '+': return typeof left === 'string' || typeof right === 'string' ? String(left ?? '') + String(right ?? '') : Number(left) + Number(right);
        case '-': return Number(left) - Number(right); case '*': return Number(left) * Number(right); case '/': return Number(left) / Number(right); case '%': return Number(left) % Number(right);
        case '==': case '===': return left === right; case '!=': case '!==': return left !== right;
        case '>': return left > right; case '<': return left < right; case '>=': return left >= right; case '<=': return left <= right;
      }
    }
    return visit(expressions.get(source));
  }
  function validateValue(name, value) {
    const variable = variables.get(name);
    if (!variable) throw new Error(`变量 ${name} 不存在`);
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (type !== variable.type || type === 'number' && !Number.isFinite(value)) throw new Error(`变量 ${name} 需要 ${variable.type} 类型`);
    const json = JSON.stringify(value);
    if (!json || json.length > 50000) throw new Error('变量值过大');
    JSON.parse(json, (key, item) => { if (forbidden.has(key) || typeof item === 'number' && !Number.isFinite(item)) throw new Error('变量包含无效值'); return item; });
    return JSON.parse(json);
  }
  function setState(name, value) {
    if (disposed) return;
    const next = validateValue(name, value);
    state = { ...state, [name]: next };
    persist(name);
    log('state', `${name} ← ${JSON.stringify(next).slice(0, 300)}`);
    options.onState?.(state);
  }
  function read(binding, fallback, snapshot = state, event = {}) {
    if (!binding) return fallback;
    try {
      const value = binding.kind === 'variable' ? snapshot[binding.value] : evaluate(binding.value, event, snapshot);
      if (value === undefined || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`绑定没有有效值：${binding.value}`);
      return value;
    } catch (error) { const message = error.message; if (!reported.has(message)) { reported.add(message); log('error', message); } return fallback; }
  }
  // This function is serialized into a Worker; keep every dependency inside it.
  function scriptWorker() {
    self.onmessage = async ({ data }) => {
      const writes = [], logs = [], notices = [], timers = new Set(), requests = new Set(), listeners = [];
      const nativeFetch = self.fetch.bind(self);
      const boundedDelay = (value, fallback) => {
        const ms = value === undefined ? fallback : Number(value);
        if (!Number.isFinite(ms) || ms < 0 || ms > 15000) throw new Error('等待或超时时间必须在 0–15000 毫秒之间');
        return ms;
      };
      async function request(input, init = {}) {
        const url = new URL(String(input), data.baseURL);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('请求地址仅支持 HTTP 或 HTTPS');
        const { timeout, signal, ...options } = init;
        const ms = boundedDelay(timeout, 10000);
        const controller = new AbortController();
        requests.add(controller);
        const abort = () => controller.abort(signal.reason);
        if (signal) {
          if (signal.aborted) abort();
          else { signal.addEventListener('abort', abort, { once: true }); listeners.push(() => signal.removeEventListener('abort', abort)); }
        }
        // Keep the deadline through response.json()/text(), not only receipt of headers.
        const timer = setTimeout(() => { timers.delete(timer); controller.abort(new Error(`请求超过 ${ms} 毫秒，已取消`)); }, ms);
        timers.add(timer);
        try { return await nativeFetch(url.href, { ...options, signal: controller.signal }); }
        catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason || error;
          throw new Error(`请求失败，请检查地址、网络和接口的 CORS 设置：${error.message || error}`);
        }
      }
      const ctx = {
        state: data.state, event: data.event, route: data.route ?? {},
        setState(name, value) { writes.push([name, value]); if (writes.length > 100) throw new Error('脚本最多修改 100 次'); this.state[name] = value; },
        log(...values) { if (logs.length < 50) logs.push(values.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ')); },
        notify(message) { if (notices.length < 10) notices.push(String(message).slice(0, 2000)); },
        fetch: request,
        async fetchJSON(url, options) {
          const response = await request(url, options);
          if (!response.ok) throw new Error(`HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`);
          if (response.status === 204) return null;
          try { return await response.json(); }
          catch (error) { if (error instanceof SyntaxError) throw new Error('接口响应不是有效的 JSON'); throw error; }
        },
        sleep(ms) { const delay = boundedDelay(ms, 0); return new Promise(resolve => { const timer = setTimeout(() => { timers.delete(timer); resolve(); }, delay); timers.add(timer); }); },
      };
      try {
        await new (Object.getPrototypeOf(async function () {}).constructor)('ctx', 'fetch', '"use strict";\n' + data.code)(ctx, request);
        self.postMessage({ writes, logs, notices });
      } catch (error) {
        self.postMessage({ error: (error?.message || String(error)) + (error?.stack ? '\n' + String(error.stack).split('\n').slice(1, 3).join('\n') : '') });
      } finally {
        for (const timer of timers) clearTimeout(timer);
        for (const controller of requests) controller.abort();
        for (const remove of listeners) remove();
      }
    };
  }
  function isolatedScript(script, event) {
    // Keep DOM/storage isolated. HTTP requests originate here and follow the browser's CORS rules.
    return new Promise((resolve, reject) => {
      if (cancellations.size >= 8) return reject(new Error('同时运行的脚本过多，请稍后重试'));
      if (typeof document === 'undefined') return reject(new Error('当前环境不支持脚本运行'));
      const token = crypto.randomUUID();
      const frame = document.createElement('iframe');
      frame.hidden = true; frame.setAttribute('sandbox', 'allow-scripts');
      const workerSource = `(${scriptWorker.toString()})()`;
      const bridge = `const token = ${JSON.stringify(token)}; let worker; addEventListener('message', e => { if (e.source !== parent || e.data.token !== token || worker) return; const url = URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], {type:'text/javascript'})); worker = new Worker(url); const finish = result => { worker.terminate(); URL.revokeObjectURL(url); parent.postMessage({token, result}, '*'); }; worker.onmessage = e => finish(e.data); worker.onerror = e => finish({error:e.message}); worker.postMessage(e.data.payload); }); parent.postMessage({token, ready:true}, '*');`;
      frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src http: https:"><script>${bridge.replace(/<\/script/gi, '<\\/script')}<\/script>`;
      let timer;
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); frame.remove(); cancellations.delete(cancel); };
      const cancel = () => { cleanup(); reject(new Error('脚本运行已取消')); };
      function receive(e) {
        if (e.source !== frame.contentWindow || e.data?.token !== token) return;
        if (e.data.ready) { frame.contentWindow.postMessage({ token, payload: { code: script.code, state: clone(state), event: clone(event), route: clone(options.route ?? {}), baseURL: document.baseURI } }, '*'); return; }
        cleanup(); const result = e.data.result;
        if (!result || result.error) reject(new Error(result?.error || '脚本运行失败'));
        else resolve(result);
      }
      cancellations.add(cancel); window.addEventListener('message', receive);
      timer = setTimeout(() => { cleanup(); reject(new Error('脚本超过 15 秒，已终止')); }, 15000);
      document.body.append(frame);
    });
  }
  async function runScript(id, event = {}) {
    const generation = epoch;
    const script = (config.scripts || []).find(item => item.id === id);
    if (!script) throw new Error('引用的脚本不存在');
    log('script', `运行脚本：${script.name}`);
    let result;
    try { result = await (options.runScript || isolatedScript)(script, event, clone(state)); }
    catch (error) { throw new Error(`${script.name}：${error?.message || String(error)}`); }
    if (disposed || generation !== epoch) return;
    if (!Array.isArray(result.writes) || result.writes.length > 100) throw new Error('脚本返回了无效数据');
    const changes = result.writes.map(([name, value]) => [name, validateValue(name, value)]);
    const notices = result.notices || [];
    if (!Array.isArray(notices) || notices.length > 10 || notices.some(message => typeof message !== 'string')) throw new Error('脚本返回了无效提示');
    for (const [name, value] of changes) setState(name, value);
    for (const message of (result.logs || []).slice(0, 50)) log('info', `${script.name}：${message}`);
    for (const message of notices) options.onNotify?.(message.slice(0, 2000));
  }
  function reset() { if (disposed) return; epoch++; for (const cancel of [...cancellations]) cancel(); state = clone(initial); withStorage(storage => storage.removeItem(options.storageKey)); reported.clear(); options.onState?.(state); log('info', '页面数据已重置'); }
  async function actions(list, event, generation = epoch) {
    for (const action of list || []) {
      if (disposed || generation !== epoch) return;
      log('action', `执行动作：${action.type}`);
      switch (action.type) {
        case 'set': setState(action.variable, evaluate(action.expression, event)); break;
        case 'toggle': setState(action.variable, !state[action.variable]); break;
        case 'reset': reset(); generation = epoch; break;
        case 'back': options.onBack?.(); break;
        case 'notify': options.onNotify?.(String(evaluate(action.expression, event) ?? '')); break;
        case 'navigate': {
          const url = String(evaluate(action.expression, event) ?? '');
          if (!/^(https?:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(url) || /[\s\\\u0000-\u001f]/.test(url)) throw new Error('跳转链接无效');
          options.onNavigate?.(url); break;
        }
        case 'script': await runScript(action.scriptId, event); break;
        case 'condition': await actions(evaluate(action.expression, event) ? action.then : action.else, event, generation); break;
      }
    }
  }
  async function dispatch(id, name, value) {
    if (disposed) return;
    const block = (config.blocks || []).find(item => item.id === id);
    if (!block || !read(block.bindings?.visible, true) || read(block.bindings?.disabled, false)) return;
    const event = { value, blockId: id, type: name };
    try {
      log('event', `${block.name || block.id} · ${name}`);
      if (name === 'change') {
        const binding = block.bindings?.[['checkbox', 'switch', 'toggle', 'collapsible', 'sidebar'].includes(block.type) ? 'checked' : 'value'];
        if (binding?.kind === 'variable') {
          const type = variables.get(binding.value)?.type;
          setState(binding.value, type === 'number' ? Number(value) : type === 'boolean' ? Boolean(value) : value);
        }
      }
      await actions(block.events?.[name], event);
    } catch (error) { log('error', error.message); }
  }
  return { getState: () => state, getData: () => data, evaluate, validateExpression: parse, read, setState, dispatch, reset, runScript,
    setData(next) { if (disposed) return; data = clone(next ?? {}); options.onData?.(data); },
    activate() { disposed = false; restore(); options.onState?.(state); },
    dispose() { disposed = true; epoch++; for (const cancel of [...cancellations]) cancel(); },
  };
}
