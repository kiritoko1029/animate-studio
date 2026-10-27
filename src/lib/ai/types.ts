import type { PageDocument } from '../../model.ts';
import type { CustomComponentDefinition, CustomComponentFields, CustomComponentSize } from '../../../shared/custom-components.mjs';
import type { DataSource } from '../../../shared/data-sources.mjs';
import type { SiteRegion, SitePageEntry } from '../../../shared/site-document.mjs';
export type AiPublicDataSource = Omit<DataSource, 'method' | 'transport' | 'credentialId' | 'headers' | 'query' | 'body'> & { method?: 'GET'; transport?: 'direct' };

export type AiProvider = 'openai' | 'anthropic';
export type AiCreationMode = 'page' | 'component';
export type AiComponentRef = { kind: 'local' | 'cloud'; id: string };
export type AiLibraryComponent = { ref: AiComponentRef; name: string; description?: string; fields?: CustomComponentFields; size?: CustomComponentSize };
export type AiProfile = {
  baseUrl: string;
  apiKey: string;
  model: string;
  effort: string;
  maxOutputTokens: number;
  thinking: 'default' | 'off' | 'adaptive' | 'budget';
  thinkingBudget: number;
  reasoningSummary?: boolean;
};
export type AiSettings = { version: 1; provider: AiProvider; profiles: Record<AiProvider, AiProfile> };
/** waiting: the model asked the user a question and the task resumes with the answer. */
export type AiStatus = 'idle' | 'running' | 'paused' | 'complete' | 'waiting' | 'error';
export type AiQuestion = { id: string; title: string; options: string[]; multiple?: boolean };
export type AiMessage = { id: string; role: 'user' | 'assistant'; text: string; time: number; questions?: AiQuestion[] };
export type AiReceipt = { runId: string; seq: number; op: string; blockId?: string; summary: string };
export type AiUsage = { input: number; output: number };
/** A restorable page snapshot taken around one AI run, independent of the editor undo history. */
export type AiVersion = { id: string; runId: string; kind: 'before' | 'after'; time: number; label: string; page: PageDocument };
export type AiSession = {
  version: 1; id: string; page: PageDocument; messages: AiMessage[]; receipts: AiReceipt[]; versions: AiVersion[];
  status: AiStatus; task: string; summary: string; error: string; updatedAt: number; usage: AiUsage;
  /** User selection at the start of this task, retained across pauses and refreshes. */
  selectedBlockIds?: string[];
  /** Older sessions without a mode are page tasks. */
  mode?: AiCreationMode;
};
export type AiChange = { key: string; blockId?: string; kind: 'add' | 'update' | 'remove' | 'page'; summary: string; time: number; frame?: { x: number; y: number; width: number; height: number } };
export type AiOperation = {
  v: 1; seq: number; op: 'message' | 'page' | 'add' | 'update' | 'remove' | 'data' | 'ask' | 'done' | 'component' | 'sitePlan' | 'sitePage' | 'siteLayout' | 'dataSource';
  summary?: string; text?: string; id?: string; type?: string;
  props?: Record<string, unknown>; frame?: Record<string, unknown>; settings?: Record<string, unknown>;
  name?: string; bindings?: unknown; events?: unknown; variables?: unknown; scripts?: unknown; questions?: AiQuestion[];
  component?: CustomComponentDefinition; componentRef?: AiComponentRef;
  page?: PageDocument; pages?: { id: string; name: string; path: string; kind: 'page' | 'detail' | 'notFound'; seo?: SitePageEntry['seo']; layout: SiteRegion[] }[];
  sharedLayout?: SiteRegion[]; deletes?: string[]; region?: SiteRegion; source?: AiPublicDataSource; dataSources?: AiPublicDataSource[];
};
/** Thinking text is provider-returned display content; summaries take precedence within each request. */
export type AiStreamEvent = { type: 'connected' } | { type: 'text'; text: string } | { type: 'thinking'; text?: string; newPart?: boolean; source?: 'summary' | 'reasoning' } | { type: 'usage'; usage: AiUsage } | { type: 'complete' };
export type AiProgress = {
  phase: 'connecting' | 'waiting' | 'thinking' | 'generating' | 'continuing';
  round: number; startedAt: number; endedAt?: number; changes: number; detail: string; reasoning: string;
  /** Per request: when it was sent, when headers arrived and when the first page record was produced. */
  requestedAt?: number; connectedAt?: number; firstOutputAt?: number;
};
