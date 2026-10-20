import { snippetCompletion, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { Variable } from './types';

export const scriptFunctions = [
  { name: 'setState', signature: 'ctx.setState(name, value)', description: '修改已定义的页面变量；脚本成功结束后统一提交。', snippet: 'setState("${name}", ${value})' },
  { name: 'log', signature: 'ctx.log(...values)', description: '在运行调试中显示文字、对象或数组。', snippet: 'log(${value})' },
  { name: 'notify', signature: 'ctx.notify(message)', description: '脚本成功结束后显示提示框。', snippet: 'notify("${操作成功}")' },
  { name: 'fetch', signature: 'await ctx.fetch(url, options?)', description: '发起 HTTP 请求，返回 Response。支持 method、headers、body、signal 和 timeout（毫秒，默认 10000）。', snippet: 'fetch("${https://example.com/api/data}")' },
  { name: 'fetchJSON', signature: 'await ctx.fetchJSON(url, options?)', description: '请求并解析 JSON；HTTP 非成功状态会抛出错误，204 返回 null。参数与 ctx.fetch 相同。', snippet: 'fetchJSON("${https://example.com/api/data}")' },
  { name: 'sleep', signature: 'await ctx.sleep(ms)', description: '等待指定毫秒数，不阻塞编辑器。计入脚本 15 秒总时限。', snippet: 'sleep(${1:500})' },
];

export const scriptTimerFunctions = [
  { name: 'setTimeout', signature: 'setTimeout(callback, delay, ...args)', description: '延迟执行一次，返回定时器 ID。需要用 await 等待包含回调的 Promise；脚本结束后计时器会被清理。仅等待时可用 await ctx.sleep(ms)。', snippet: 'setTimeout(() => {\n\t${1:// 延迟执行的代码}\n}, ${2:1000})' },
  { name: 'clearTimeout', signature: 'clearTimeout(timerId)', description: '取消 setTimeout 创建的定时器。', snippet: 'clearTimeout(${timerId})' },
  { name: 'setInterval', signature: 'setInterval(callback, delay, ...args)', description: '按间隔重复执行，返回定时器 ID。用 clearInterval 停止，并 await 等待完成；单次脚本最多运行 15 秒，状态和日志在结束后统一提交。', snippet: 'setInterval(() => {\n\t${1:// 定时执行的代码}\n}, ${2:1000})' },
  { name: 'clearInterval', signature: 'clearInterval(timerId)', description: '停止 setInterval 创建的重复定时器。', snippet: 'clearInterval(${timerId})' },
];

// Suggest globals available in the script Worker, excluding host-page DOM APIs.
export const scriptGlobals = Object.assign(Object.create(null), {
  Math, JSON, Number, String, Boolean, BigInt, Array, Object, Date, Promise,
  RegExp, Map, Set, WeakMap, WeakSet, Symbol, Intl,
  Error, TypeError, RangeError, SyntaxError, ReferenceError, URIError, AggregateError,
  URL, URLSearchParams, AbortController, AbortSignal, Headers, Request, Response,
  Blob, FormData, TextEncoder, TextDecoder, console,
  parseInt, parseFloat, isNaN, isFinite, encodeURI, decodeURI, encodeURIComponent, decodeURIComponent,
  structuredClone, queueMicrotask, atob, btoa, NaN, Infinity, undefined,
});

const functionOptions = scriptFunctions.map(item => snippetCompletion(item.snippet, { label: item.name, type: 'function', detail: item.signature.slice(item.signature.indexOf('(')), info: item.description, boost: 5 }));
const timerOptions = scriptTimerFunctions.map(item => snippetCompletion(item.snippet, { label: item.name, type: 'function', detail: item.signature.slice(item.signature.indexOf('(')), info: item.description, boost: 5 }));
const variableOption = (variable: Variable): Completion => ({ label: variable.name, type: 'variable', detail: variable.type, info: `初始值：${JSON.stringify(variable.initial).slice(0, 300)}` });

export function scriptCompletionSource(getVariables: () => Variable[]): CompletionSource {
  return context => {
    const variables = getVariables();
    const node = syntaxTree(context.state).resolveInner(context.pos, -1);
    if (/Comment/.test(node.name)) return null;
    const argument = context.matchBefore(/ctx\.(?:setState\(\s*|state\[\s*)['"][\w$]*/);
    if (argument) {
      const name = argument.text.match(/[\w$]*$/)![0];
      return { from: context.pos - name.length, options: variables.map(variableOption), validFor: /^[\w$]*$/ };
    }
    if (/String|TemplateString/.test(node.name)) return null;
    const member = context.matchBefore(/ctx(?:\.[\w$]*)+/);
    if (member) {
      const parts = member.text.split('.');
      let options: Completion[] = [];
      if (parts.length === 2) options = [
        { label: 'state', type: 'property', detail: '页面数据', info: '输入 ctx.state. 选择页面变量。' },
        { label: 'event', type: 'property', detail: '事件数据', info: '包含 value、type 和 blockId；手动测试时为空对象。' },
        ...functionOptions,
      ];
      else if (parts[1] === 'state') {
        if (parts.length === 3) options = variables.map(variableOption);
        else {
          let value: unknown = variables.find(v => v.name === parts[2])?.initial;
          for (const key of parts.slice(3, -1)) value = value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
          if (value && typeof value === 'object') options = (Array.isArray(value) ? ['length'] : Object.keys(value)).filter(key => /^[A-Za-z_$][\w$]*$/.test(key)).map(label => ({ label, type: 'property', detail: Array.isArray(value) && label === 'length' ? 'number' : typeof (value as Record<string, unknown>)[label] }));
        }
      } else if (parts[1] === 'event' && parts.length === 3) options = [
        { label: 'value', type: 'property', info: '用户输入或选择的新值；点击和手动测试时可能为空。' },
        { label: 'type', type: 'property', detail: 'string', info: '触发事件的类型，如 click、change。' },
        { label: 'blockId', type: 'property', detail: 'string', info: '触发事件的组件 ID。' },
      ];
      return { from: context.pos - parts.at(-1)!.length, options, validFor: /^[\w$]*$/ };
    }
    const word = context.matchBefore(/[\w$]+/);
    if (!word && !context.explicit) return null;
    const from = word?.from ?? context.pos;
    if (context.state.sliceDoc(Math.max(0, from - 1), from) === '.') return null;
    return { from, options: [
      { label: 'ctx', type: 'variable', detail: '页面脚本接口', info: '读取变量、更新数据、发起请求、记录日志和显示提示。' },
      snippetCompletion('fetch("${https://example.com/api/data}")', { label: 'fetch', type: 'function', detail: '(url, options?) → Promise<Response>', info: '与 ctx.fetch 相同。await 等待响应后，用 response.json() 或 response.text() 读取内容。' }),
      ...timerOptions,
    ], validFor: /^[\w$]*$/ };
  };
}

export function scriptExamples(variables: Variable[]) {
  const variable = variables[0];
  return [
    { label: 'GET JSON', code: 'try {\n  const data = await ctx.fetchJSON("https://example.com/api/data");\n  ctx.log("请求结果", data);\n  // 使用 ctx.setState("变量名", data) 更新已定义的变量\n} catch (error) {\n  ctx.log("请求失败", error.message);\n  ctx.notify(error.message);\n}' },
    { label: 'POST JSON', code: 'try {\n  const data = await ctx.fetchJSON("https://example.com/api/data", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ message: "你好" }),\n    timeout: 10000\n  });\n  ctx.log("提交结果", data);\n} catch (error) {\n  ctx.log("提交失败", error.message);\n}' },
    { label: '原生 fetch 写法', code: 'const response = await fetch("https://example.com/api/data");\nif (!response.ok) throw new Error(`HTTP ${response.status}`);\nconst data = await response.json();\nctx.log(data);' },
    { label: '修改变量', disabled: !variable, code: variable ? `ctx.setState(${JSON.stringify(variable.name)}, ${JSON.stringify(variable.initial, null, 2)});\nctx.log("变量已更新", ctx.state.${variable.name});` : '' },
    { label: '显示提示', code: 'ctx.notify("操作成功！");' },
    { label: '等待后执行', code: 'await ctx.sleep(500);\nctx.log("等待完成");' },
    { label: '定时重复（3 次）', code: 'let count = 0;\n// await 等待定时器完成，防止脚本提前结束\nawait new Promise(resolve => {\n  const timerId = setInterval(() => {\n    count += 1;\n    if (count >= 3) {\n      clearInterval(timerId);\n      resolve();\n    }\n  }, 500);\n});\n// 页面变量和日志在脚本结束后统一提交\nctx.log("定时执行完成，共", count, "次");' },
  ];
}
