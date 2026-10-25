import { apiBaseUrl, validateAiProfile } from './config.ts';
import type { AiProfile, AiProvider, AiStreamEvent } from './types.ts';
import { AiOutputLimitError } from './errors.ts';

export type AiInput = { system: string; context: string };
export function providerHeaders(provider: AiProvider, key: string): Record<string, string> {
  return provider === 'openai' ? { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` }
    : { 'Content-Type': 'application/json', 'x-api-key': key.trim(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
}
export function providerBody(provider: AiProvider, profile: AiProfile, input: AiInput): Record<string, unknown> {
  if (provider === 'openai') return {
    model: profile.model.trim(), stream: true, store: false, instructions: input.system,
    input: [{ role: 'user', content: input.context }], max_output_tokens: profile.maxOutputTokens,
    ...(profile.effort || profile.reasoningSummary !== false ? { reasoning: { ...(profile.effort ? { effort: profile.effort } : {}), ...(profile.reasoningSummary !== false ? { summary: 'auto' } : {}) } } : {}),
  };
  return { model: profile.model.trim(), stream: true, max_tokens: profile.maxOutputTokens, system: input.system,
    messages: [{ role: 'user', content: input.context }],
    ...(profile.effort ? { output_config: { effort: profile.effort } } : {}),
    ...(profile.thinking === 'adaptive' ? { thinking: { type: 'adaptive' } } : profile.thinking === 'budget' ? { thinking: { type: 'enabled', budget_tokens: profile.thinkingBudget } } : profile.thinking === 'off' ? { thinking: { type: 'disabled' } } : {}),
  };
}
export function safeAiError(error: unknown, key: string): string {
  const message = error instanceof Error ? error.message : 'AI 请求失败，请稍后重试。';
  return (key.trim() ? message.replaceAll(key, '[API key]').replaceAll(key.trim(), '[API key]') : message).slice(0, 1000);
}
async function checkResponse(response: Response, key: string) {
  if (response.ok) return;
  const text = (await response.text()).slice(0, 16000);
  let detail = '';
  try { const value = JSON.parse(text); detail = value.error?.message || value.error || value.message || ''; } catch { /* Non-JSON gateway errors are reported by status only. */ }
  throw new Error(safeAiError(new Error(`AI HTTP ${response.status}${typeof detail === 'string' && detail ? `: ${detail}` : ''}`), key));
}

/** Silence and total duration limits for one request. Reasoning models can be quiet for minutes, so idling is generous. */
export const aiStreamLimits = { idleMs: 5 * 60 * 1000, totalMs: 30 * 60 * 1000 };

/** SSE framing is independent of provider tokens, UTF-8 boundaries and network chunk sizes. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal: AbortSignal, onData?: () => void): AsyncGenerator<Record<string, any>> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '', bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await reader.read();
      signal.throwIfAborted();
      onData?.();
      buffer += decoder.decode(result.value, { stream: !result.done });
      bytes += result.value?.byteLength ?? 0;
      // Each token is its own SSE event, and terminal events repeat the whole output, so only absurd sizes are refused.
      if (bytes > 256 * 1024 * 1024 || buffer.length > 16 * 1024 * 1024) throw new Error('AI 响应过大，已暂停生成。');
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index); buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (!data || data === '[DONE]') continue;
        let event: unknown;
        try { event = JSON.parse(data); } catch { throw new Error('AI 返回了无效的流式数据。'); }
        if (event && typeof event === 'object') yield event as Record<string, any>;
      }
      if (result.done) {
        if (buffer.trim() && !buffer.trim().startsWith(':')) throw new Error('AI 连接在数据传输中断开，请继续生成。');
        break;
      }
    }
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function* streamAi(provider: AiProvider, profile: AiProfile, input: AiInput, signal: AbortSignal, fetcher: typeof fetch = fetch, limits = aiStreamLimits): AsyncGenerator<AiStreamEvent> {
  validateAiProfile(profile, provider);
  const idle = new AbortController(), total = new AbortController();
  const idleError = () => new Error(`AI 接口超过 ${Math.round(limits.idleMs / 1000)} 秒没有返回数据，已暂停并保留完成的组件。可以检查网络后继续生成。`);
  let idleTimer = setTimeout(() => idle.abort(idleError()), limits.idleMs);
  const totalTimer = setTimeout(() => total.abort(new Error(`AI 单次请求超过 ${Math.round(limits.totalMs / 60000)} 分钟，已暂停并保留完成的组件。可以继续生成。`)), limits.totalMs);
  const touch = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => idle.abort(idleError()), limits.idleMs); };
  const combined = AbortSignal.any([signal, idle.signal, total.signal]);
  try {
    let response: Response;
    try { response = await fetcher(`${apiBaseUrl(profile.baseUrl)}/${provider === 'openai' ? 'responses' : 'messages'}`, { method: 'POST', headers: providerHeaders(provider, profile.apiKey), body: JSON.stringify(providerBody(provider, profile, input)), signal: combined, credentials: 'omit', redirect: 'error' }); }
    catch (error) { if (combined.aborted) throw combined.reason; throw new Error('无法连接 AI 接口，请检查地址、网络及接口的浏览器跨域支持。'); }
    touch();
    await checkResponse(response, profile.apiKey);
    if (!response.body) throw new Error('AI 接口没有返回流式响应。');
    yield { type: 'connected' };
    yield* readEvents(provider, response.body, combined, touch, profile.apiKey);
  } finally { clearTimeout(idleTimer); clearTimeout(totalTimer); }
}

async function* readEvents(provider: AiProvider, body: ReadableStream<Uint8Array>, signal: AbortSignal, touch: () => void, apiKey: string): AsyncGenerator<AiStreamEvent> {
  let complete = false, inputTokens = 0, outputTokens = 0, continuation = false, thinking = false, reportedAt: number | null = null;
  let reasoning = '', hasSummary = false, summaryPrefix = '';
  function* flushReasoning(): Generator<AiStreamEvent> {
    if (!reasoning || hasSummary) return;
    yield { type: 'thinking', text: reasoning, source: 'reasoning' };
    reasoning = ''; reportedAt = Date.now(); thinking = true;
  }
  let refused = false, refusal = '';
  const refusalLimit = 1000 + apiKey.length; // Keep enough trailing text to redact a key across the displayed cutoff.
  for await (const event of readSse(body, signal, touch)) {
    // Flush a short final fragment before output, completion or failure can end this request.
    if (event.type !== 'response.reasoning_text.delta' && event.type !== 'response.reasoning_summary_part.added' && event.type !== 'response.reasoning_summary_text.delta') yield* flushReasoning();
    // Gateways sometimes send a bare {"error": ...} object without an event type.
    if (!event.type && event.error) throw new Error(safeAiError(new Error(event.error.message || (typeof event.error === 'string' ? event.error : 'AI 生成失败。')), apiKey));
    if (provider === 'openai') {
      if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') {
        refused = true;
        if (event.type === 'response.refusal.delta' && typeof event.delta === 'string') refusal = (refusal + event.delta).slice(0, refusalLimit);
        if (event.type === 'response.refusal.done' && typeof event.refusal === 'string') refusal = event.refusal.slice(0, refusalLimit);
      }
      if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        // Some compatible gateways omit refusal deltas and provide only the final response content.
        const parts = (Array.isArray(event.response?.output) ? event.response.output : [])
          .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
          .filter((part: any) => part?.type === 'refusal');
        if (parts.length) {
          refused = true;
          const detail = parts.map((part: any) => typeof part.refusal === 'string' ? part.refusal : '').filter(Boolean).join('\n');
          if (detail) refusal = detail.slice(0, refusalLimit);
        }
      }
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') { thinking = false; yield { type: 'text', text: event.delta }; }
      // Some compatible endpoints publish display text instead of a separate summary.
      // Coalesce rapid deltas, never inspect encrypted content or signature fields.
      if (event.type === 'response.output_item.added' && event.item?.type === 'reasoning' && !thinking) { thinking = true; yield { type: 'thinking' }; }
      if (event.type === 'response.reasoning_text.delta' && typeof event.delta === 'string' && !hasSummary) {
        reasoning = (reasoning + event.delta).slice(-12000);
        if (reportedAt === null || Date.now() - reportedAt >= 250) yield* flushReasoning();
      }
      if (event.type === 'response.reasoning_summary_part.added') yield { type: 'thinking', newPart: true, source: 'summary' };
      if (event.type === 'response.reasoning_summary_text.delta' && typeof event.delta === 'string') {
        if (!hasSummary) {
          summaryPrefix = (summaryPrefix + event.delta).slice(-12000);
          if (summaryPrefix.trim()) {
            hasSummary = true; reasoning = '';
            yield { type: 'thinking', text: summaryPrefix, source: 'summary' }; summaryPrefix = '';
          }
        } else yield { type: 'thinking', text: event.delta, source: 'summary' };
      }
      if (event.type === 'error' || event.type === 'response.failed') throw new Error(safeAiError(new Error(event.error?.message || event.response?.error?.message || 'AI 生成失败。'), apiKey));
      if (event.type === 'response.incomplete') {
        inputTokens = event.response?.usage?.input_tokens ?? 0; outputTokens = event.response?.usage?.output_tokens ?? 0;
        if (refused) { complete = true; break; }
        if (event.response?.incomplete_details?.reason !== 'max_output_tokens') throw new Error('AI 输出被接口终止，请检查模型返回的限制。');
        continuation = true; complete = true; break;
      }
      if (event.type === 'response.completed') {
        complete = true; inputTokens = event.response?.usage?.input_tokens ?? 0; outputTokens = event.response?.usage?.output_tokens ?? 0; break;
      }
    } else {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') yield { type: 'text', text: event.delta.text };
      if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') yield { type: 'thinking', newPart: true, text: event.content_block.thinking || '', source: 'reasoning' };
      if (event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') yield { type: 'thinking', text: event.delta.thinking, source: 'reasoning' };
      if (event.type === 'message_start') inputTokens = event.message?.usage?.input_tokens ?? 0;
      if (event.type === 'error') throw new Error(safeAiError(new Error(event.error?.message || 'AI 生成失败。'), apiKey));
      if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
        if (event.delta?.stop_reason === 'max_tokens') continuation = true;
        else if (event.delta?.stop_reason && event.delta.stop_reason !== 'end_turn' && event.delta.stop_reason !== 'stop_sequence') throw new Error('AI 输出被接口终止，请检查模型返回的限制。');
      }
      if (event.type === 'message_stop') { complete = true; break; }
    }
  }
  yield* flushReasoning();
  if (refused) {
    yield { type: 'usage', usage: { input: inputTokens, output: outputTokens } };
    throw new Error(safeAiError(new Error(refusal ? `AI 拒绝了本次请求：${refusal}` : 'AI 拒绝了本次请求，请调整需求后重试。'), apiKey));
  }
  if (!complete) throw new Error('AI 连接意外中断，已保留完成的组件，可以继续生成。');
  yield { type: 'usage', usage: { input: inputTokens, output: outputTokens } };
  if (continuation) throw new AiOutputLimitError('AI 达到输出限制，将从已保存的组件继续。');
  yield { type: 'complete' };
}

export async function listAiModels(provider: AiProvider, profile: AiProfile, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string[]> {
  validateAiProfile(profile, provider, false);
  const ids = new Set<string>(); let cursor = '';
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${apiBaseUrl(profile.baseUrl)}/models`);
    if (provider === 'anthropic') { url.searchParams.set('limit', '1000'); if (cursor) url.searchParams.set('after_id', cursor); }
    const response = await fetcher(url, { headers: providerHeaders(provider, profile.apiKey), signal, credentials: 'omit', redirect: 'error' });
    await checkResponse(response, profile.apiKey);
    const data = await response.json();
    if (!Array.isArray(data?.data)) throw new Error('模型列表格式不正确，可手动填写模型名称。');
    for (const model of data.data) if (typeof model.id === 'string' && model.id.length <= 200) ids.add(model.id);
    if (provider !== 'anthropic' || !data.has_more) return [...ids].sort();
    if (!data.last_id || data.last_id === cursor) throw new Error('模型列表分页无效，可手动填写模型名称。');
    cursor = data.last_id;
  }
  throw new Error('模型列表过长，可手动填写模型名称。');
}
