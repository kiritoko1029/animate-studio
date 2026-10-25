import type { PageDocument } from '../../model.ts';
import type { CustomComponentSnapshot } from '../../../shared/custom-components.mjs';
import { resetCustomInstance } from '../custom-components/instances.ts';
import { streamAi, safeAiError } from './client.ts';
import { applyAiOperation, AiOperationDecoder, buildAiContext, snapshotAiPage } from './protocol.ts';
import { withAiVersion } from './storage.ts';
import { AiContinuationError, AiOutputLimitError } from './errors.ts';
import type { AiChange, AiComponentRef, AiCreationMode, AiLibraryComponent, AiOperation, AiProfile, AiProgress, AiProvider, AiSession } from './types.ts';

export const aiMaxRequests = 12;

type Run = { id: string; owner: string; target: string; controller: AbortController; session: AiSession; startKey: string };
export type AiRunnerOptions = {
  getPage: () => PageDocument;
  getOwner: () => string;
  getTarget?: () => string;
  getSelection?: () => string[];
  getMode?: () => AiCreationMode;
  getComponents?: () => AiLibraryComponent[];
  resolveComponent?: (ref: AiComponentRef) => Promise<CustomComponentSnapshot>;
  /** Synchronous library persistence, after a recoverable definition checkpoint and before canvas commit. */
  prepareCustom?: (page: PageDocument, before: PageDocument, op: AiOperation) => PageDocument;
  commit: (page: PageDocument, change: AiChange, runId: string) => void;
  /** Persists the session and may return the stored copy (for example with old snapshots trimmed). */
  checkpoint: (session: AiSession, owner: string) => AiSession | undefined;
  onSession: (session: AiSession, owner: string) => void;
  onRunning: (running: boolean) => void;
  onProgress?: (progress: AiProgress) => void;
  stream?: typeof streamAi;
  yieldFrame?: () => Promise<void>;
};

/** Snapshot the page a run produced, so its result survives undo and later edits. */
function settle(run: Run, session: AiSession): AiSession {
  if (JSON.stringify(session.page) === run.startKey) return session;
  return withAiVersion(session, { runId: run.id, kind: 'after', time: Date.now(), label: session.status === 'complete' && session.summary ? session.summary : session.task, page: session.page });
}

export class AiRunner {
  private active: Run | null = null;
  constructor(privateOptions: AiRunnerOptions) { this.options = privateOptions; }
  private options: AiRunnerOptions;
  get running() { return this.active !== null; }
  pause(reason = '', persist = true) {
    const run = this.active;
    if (!run) return;
    this.active = null;
    run.controller.abort();
    let session = settle(run, { ...run.session, status: 'paused', error: reason, updatedAt: Date.now() });
    try { if (persist) session = this.options.checkpoint(session, run.owner) ?? session; } catch (error) { session = { ...session, error: error instanceof Error ? error.message : reason }; }
    this.options.onSession(session, run.owner); this.options.onRunning(false);
  }
  /** display is the user's chat message when it differs from the task sent to the model (an answer to a question). */
  async start(session: AiSession, provider: AiProvider, profile: AiProfile, task: string, locale: string, resume = false, display = task) {
    if (this.active) throw new Error('请先暂停当前 AI 任务。');
    // Reject local document problems before making a paid request, using its persisted JSON shape.
    const page = snapshotAiPage(this.options.getPage());
    if (page.id !== session.id) throw new Error('页面已切换，请重新发送任务。');
    const mode = this.options.getMode?.() ?? 'page';
    if (mode === 'component' && page.blocks.some(block => block.type !== 'custom')) throw new Error('组件创作必须使用独立的自定义组件草稿。');
    if (resume && session.mode && session.mode !== mode) throw new Error('创作模式已改变，请重新发送任务。');
    const contextOptions = { mode, components: JSON.parse(JSON.stringify(this.options.getComponents?.() ?? [])) as AiLibraryComponent[] };
    const id = crypto.randomUUID(), now = Date.now();
    // Preserve referents through manual resume and answers as well as automatic continuation.
    const selection = (resume || display !== task) && session.selectedBlockIds ? session.selectedBlockIds : this.options.getSelection?.() ?? [];
    const selectedBlockIds = [...new Set(selection)].filter(id => page.blocks.some(block => block.id === id));
    let next: AiSession = { ...session, page, mode, selectedBlockIds, task: resume ? session.task : task, status: 'running', error: '', updatedAt: now,
      messages: resume ? session.messages : [...session.messages, { id: crypto.randomUUID(), role: 'user', text: display, time: now }] };
    // The page before this run stays restorable once undo history is gone; an empty page needs no copy.
    if (page.blocks.length) next = withAiVersion(next, { runId: id, kind: 'before', time: now, label: next.task, page });
    const run: Run = { id, owner: this.options.getOwner(), target: this.options.getTarget?.() ?? page.id!, controller: new AbortController(), session: next, startKey: JSON.stringify(page) };
    // Capture the user's selection once: highlighting generated blocks must not redirect a later round.
    const context = buildAiContext(page, { ...next, error: resume ? session.error : '' }, locale, resume, selectedBlockIds, contextOptions);
    next = run.session = this.options.checkpoint(next, run.owner) ?? next;
    this.active = run; this.options.onSession(next, run.owner); this.options.onRunning(true);
    let progress: AiProgress = { phase: 'connecting', round: 1, startedAt: now, requestedAt: now, changes: 0, detail: '', reasoning: '' };
    let operationIndex = 0;
    const guard = () => {
      if (this.active !== run || run.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (this.options.getOwner() !== run.owner || (this.options.getTarget?.() ?? this.options.getPage().id) !== run.target || this.options.getPage().id !== run.session.id) throw new Error('页面或账号已切换，AI 已暂停。');
      if ((this.options.getMode?.() ?? 'page') !== mode) throw new Error('创作模式已改变，AI 已暂停。');
    };
    const publish = (value: AiSession) => {
      guard(); run.session = this.options.checkpoint(value, run.owner) ?? value; this.options.onSession(run.session, run.owner);
    };
    const report = (patch: Partial<AiProgress>) => {
      guard(); progress = { ...progress, ...patch }; this.options.onProgress?.(progress);
    };
    function* decode(decoder: AiOperationDecoder, text?: string) {
      try { yield* text === undefined ? decoder.finish() : decoder.push(text); }
      catch (error) { throw new AiContinuationError(safeAiError(error, profile.apiKey)); }
    }
    const apply = async (op: Parameters<typeof applyAiOperation>[1]) => {
      guard();
      let before = this.options.getPage();
      if (mode === 'component' && (op.op === 'add' || op.op === 'data' || ['update', 'remove'].includes(op.op) && before.blocks.find(block => block.id === op.id)?.type !== 'custom')) throw new AiContinuationError('组件创作只能创建和修改自定义组件，请使用 component 操作。');
      if (mode === 'component' && op.op === 'update' && ['props', 'bindings', 'events'].some(key => Object.hasOwn(op, key))) throw new AiContinuationError('组件创作中的字段、样式和交互请通过 component 操作写入完整组件定义。');
      let resolved: CustomComponentSnapshot | undefined;
      if (op.op === 'component' && op.componentRef) {
        if (!this.options.resolveComponent) throw new Error('当前无法读取组件库，请创建新的自定义组件或稍后重试。');
        resolved = await this.options.resolveComponent(op.componentRef);
        guard(); before = this.options.getPage();
      }
      let result: ReturnType<typeof applyAiOperation>;
      try { result = applyAiOperation(before, op, resolved); }
      catch (error) { throw new AiContinuationError(safeAiError(error, profile.apiKey)); }
      if (mode === 'component' && op.op === 'component') {
        // An isolated component preview represents reusable defaults, not a page instance's overrides.
        const page = { ...result.page, blocks: result.page.blocks.map(block => block.id === op.id ? resetCustomInstance(block) : block) };
        const block = page.blocks.find(item => item.id === op.id);
        result = { ...result, page, change: result.change ?? (JSON.stringify(page) !== JSON.stringify(before) ? { kind: 'update', blockId: op.id, summary: op.summary || '保存自定义组件', frame: block?.frame } : null) };
      }
      let { page: updatedPage, change } = result;
      const { warnings } = result;
      const seq = ++operationIndex;
      let updated: AiSession = { ...run.session, page: updatedPage, updatedAt: Date.now() };
      if (change) updated = { ...updated, receipts: [...updated.receipts, { runId: run.id, seq, op: op.op, blockId: op.id, summary: change.summary }].slice(-100) };
      if (op.op === 'message') updated = { ...updated, messages: [...updated.messages, { id: `${run.id}:${seq}`, role: 'assistant' as const, text: op.text!, time: Date.now() }].slice(-60) };
      if (op.op === 'ask') updated = { ...updated, messages: [...updated.messages, { id: `${run.id}:${seq}`, role: 'assistant' as const, text: op.text || '', questions: op.questions, time: Date.now() }].slice(-60) };
      if (op.op === 'done') updated = { ...updated, summary: op.summary || '', messages: [...updated.messages, { id: `${run.id}:${seq}`, role: 'assistant' as const, text: op.summary || '页面已更新。', time: Date.now() }].slice(-60) };
      if (warnings?.length) updated = { ...updated, messages: [...updated.messages, { id: `${run.id}:${seq}:warnings`, role: 'assistant' as const, text: warnings.join('\n'), time: Date.now() }].slice(-60) };
      // Persist a validated checkpoint before changing the visible document. No await splits this transaction.
      guard(); updated = this.options.checkpoint(updated, run.owner) ?? updated;
      run.session = updated;
      guard();
      if (op.op === 'component' && !op.componentRef && this.options.prepareCustom) {
        const prepared = snapshotAiPage(this.options.prepareCustom(updatedPage, before, op));
        guard();
        if (prepared.id !== updatedPage.id) throw new Error('保存自定义组件时页面已改变，AI 已暂停。');
        if (JSON.stringify(prepared) !== JSON.stringify(updatedPage)) {
          updatedPage = prepared;
          if (!change) {
            const block = prepared.blocks.find(block => block.id === op.id);
            change = { kind: 'update', blockId: op.id, summary: op.summary || '保存自定义组件', frame: block?.frame };
            updated = { ...updated, receipts: [...updated.receipts, { runId: run.id, seq, op: op.op, blockId: op.id, summary: change.summary }].slice(-100) };
          }
          updated = this.options.checkpoint({ ...updated, page: prepared }, run.owner) ?? { ...updated, page: prepared };
          run.session = updated;
        }
      }
      guard();
      if (change) this.options.commit(updatedPage, { ...change, key: `${run.id}:${seq}`, time: Date.now() }, run.id);
      run.session = updated; this.options.onSession(updated, run.owner);
      if (change || op.op === 'message' || op.op === 'ask') report({ phase: 'generating', detail: change?.summary ?? (op.text || op.questions?.[0]?.title || ''), changes: progress.changes + (change && JSON.stringify(before) !== JSON.stringify(updatedPage) ? 1 : 0) });
      if (change) await (this.options.yieldFrame?.() ?? Promise.resolve());
    };
    try {
      report({});
      let nextContext = context, stalled = 0;
      for (let round = 1; round <= aiMaxRequests; round++) {
        guard();
        const decoder = new AiOperationDecoder(), request = new AbortController();
        const changesBefore = progress.changes;
        const earlierReasoning = progress.reasoning;
        let roundReasoning = '', reasoningSource: 'summary' | 'reasoning' | null = null, pendingPart = false;
        let providerComplete = false, continuation: AiContinuationError | null = null;
        let terminalOperation: Parameters<typeof applyAiOperation>[1] | null = null;
        const consume = async (op: Parameters<typeof applyAiOperation>[1]) => {
          // A completion summary or question is only trustworthy after the rest of the stream validates.
          if (op.op === 'done' || op.op === 'ask') terminalOperation = op;
          else await apply(op);
        };
        try {
          for await (const event of (this.options.stream ?? streamAi)(provider, profile, nextContext, AbortSignal.any([run.controller.signal, request.signal]))) {
            guard();
            if (event.type === 'connected') report({ phase: 'waiting', connectedAt: Date.now() });
            if (event.type === 'text') {
              if (progress.phase !== 'generating') report({ phase: 'generating', firstOutputAt: progress.firstOutputAt ?? Date.now() });
              for (const op of decode(decoder, event.text)) await consume(op);
            }
            if (event.type === 'complete') providerComplete = true;
            if (event.type === 'thinking') {
              const source = event.source ?? 'summary';
              if (source === 'reasoning' && reasoningSource === 'summary') continue;
              if (event.newPart) pendingPart = true;
              if (event.text) {
                if (source === 'summary' && event.text.trim() && reasoningSource === 'reasoning') { roundReasoning = ''; pendingPart = false; }
                if (event.text.trim()) reasoningSource = source;
                roundReasoning = (roundReasoning + (pendingPart && roundReasoning ? '\n\n' : '') + event.text).slice(-12000);
                pendingPart = false;
              }
              report({ phase: 'thinking', reasoning: (earlierReasoning + (earlierReasoning && roundReasoning ? '\n\n' : '') + roundReasoning).slice(-12000) });
            }
            if (event.type === 'usage') publish({ ...run.session, usage: { input: run.session.usage.input + event.usage.input, output: run.session.usage.output + event.usage.output } });
          }
          guard();
          if (!providerComplete) throw new Error('AI 连接意外中断，已保留完成的组件，可以继续生成。');
          for (const op of decode(decoder)) await consume(op);
        } catch (error) {
          guard();
          if (!(error instanceof AiContinuationError)) throw error;
          continuation = error;
        } finally { request.abort(); }
        // Only a provider output limit can complete an already finished task. Validate its buffered tail, too.
        if (continuation instanceof AiOutputLimitError) {
          try { for (const op of decode(decoder)) await consume(op); continuation = null; }
          catch (error) { if (!(error instanceof AiContinuationError)) throw error; continuation = error; }
        }
        if (!continuation) {
          if (terminalOperation) await apply(terminalOperation);
          publish(settle(run, { ...run.session, status: decoder.terminal === 'ask' ? 'waiting' : 'complete', updatedAt: Date.now(), error: '' }));
          break;
        }
        stalled = changesBefore === progress.changes ? stalled + 1 : 0;
        if (stalled >= 2) throw new Error(`AI 连续两轮没有有效修改，已暂停。请调整需求或模型配置后继续。\n${continuation.message}`);
        if (round === aiMaxRequests) throw new Error('AI 已达到本次自动续写上限，进度已保存。可以继续生成。');
        nextContext = buildAiContext(this.options.getPage(), { ...run.session, error: continuation.message }, locale, true, selectedBlockIds, contextOptions);
        report({ phase: 'continuing', round: round + 1, detail: continuation.message, requestedAt: Date.now(), connectedAt: undefined, firstOutputAt: undefined });
        await (this.options.yieldFrame?.() ?? Promise.resolve());
        guard();
      }
    } catch (error) {
      if (this.active === run) {
        let failed = settle(run, { ...run.session, status: 'paused', error: safeAiError(error, profile.apiKey), updatedAt: Date.now() });
        try { failed = this.options.checkpoint(failed, run.owner) ?? failed; } catch { /* Keep the in-memory document and last successful checkpoint. */ }
        run.session = failed; this.options.onSession(failed, run.owner);
      }
    } finally {
      if (this.active === run) { this.active = null; run.controller.abort(); this.options.onRunning(false); }
    }
  }
}
