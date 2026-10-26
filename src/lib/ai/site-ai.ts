import type { SiteDocument, SitePageEntry, SiteRegion } from '../../../shared/site-document.mjs';
import { inspectSiteLinks, normalizeSitePath, validateSiteDocument } from '../../../shared/site-document.mjs';
import { createDocument } from '../../model.ts';
import { validatePage, validateSite } from '../../../server/validation.mjs';
import { AiOperationDecoder, aiSystemPrompt, parseAiOperation } from './protocol.ts';
import { streamAi, safeAiError } from './client.ts';
import type { AiOperation, AiProfile, AiProvider } from './types.ts';

export type SitePlanEntry = NonNullable<AiOperation['pages']>[number];
export type SitePlan = { name: string; summary: string; pages: SitePlanEntry[]; sharedLayout: SiteRegion[]; deletes: string[] };
export type SiteAiSession = { version: 1; owner: string; siteId: string; task: string; status: 'confirm' | 'generating' | 'complete' | 'paused'; plan: SitePlan | null; before: SiteDocument; draft: SiteDocument; messages: string[]; updatedAt: number };
export const siteAiKey = (owner: string, siteId: string) => `animate-studio:ai-site:v1:${encodeURIComponent(owner)}:${siteId}`;

export function explainSite(site: SiteDocument): string {
  const lines = site.pages.map(entry => `• ${entry.name}：${entry.path}${entry.id === site.homePageId ? '（首页）' : ''}${entry.kind === 'detail' ? '，可在绑定中使用 route 参数' : ''}${entry.layout.length ? `，使用${entry.layout.map(region => region === 'header' ? '页头' : '页脚').join('和')}` : ''}`);
  const missing = inspectSiteLinks(site).filter(link => link.missing).length;
  return `站点「${site.name}」共有 ${site.pages.length} 个页面。\n${lines.join('\n')}\n共享布局：${Object.keys(site.sharedLayout).map(region => region === 'header' ? '页头' : '页脚').join('、') || '未启用'}。\n${missing ? `有 ${missing} 个链接需要修复，请在页面面板检查路径。` : '已配置的站内链接都有可识别的目标。'}\n在“页面”面板中修改结构，选中组件后可继续调整内容和交互。`;
}

export function validateSitePlan(site: SiteDocument, input: SitePlan): SitePlan {
  parseAiOperation(JSON.stringify({ v: 1, seq: 1, op: 'sitePlan', ...input }));
  const existing = new Set(site.pages.map(entry => entry.id));
  for (const id of input.deletes) if (!existing.has(id) || id === site.homePageId) throw new Error('AI 删除范围包含不存在页面或首页，未执行。');
  const ids = new Set(input.pages.map(entry => entry.id));
  if (input.deletes.some(id => ids.has(id))) throw new Error('同一页面不能同时出现在生成和删除计划中。');
  if (site.pages.length - input.deletes.length + input.pages.filter(entry => !existing.has(entry.id)).length > 24) throw new Error('站点页面数量超过上限。');
  const paths = new Set<string>(); let notFound = 0;
  for (const entry of input.pages) {
    const path = normalizeSitePath(entry.path);
    if (paths.has(path) || entry.id === site.homePageId && path !== '/' || path === '/' && entry.id !== site.homePageId) throw new Error('AI 首页或路径计划无效。');
    paths.add(path); if (entry.kind === 'notFound' && ++notFound > 1) throw new Error('站点最多一个 404 页面。');
    if (entry.layout.some(region => !input.sharedLayout.includes(region))) throw new Error('页面引用了计划外的共享布局。');
  }
  if (!ids.has(site.homePageId) && input.deletes.includes(site.homePageId)) throw new Error('不能删除首页。');
  return structuredClone(input);
}

export function siteFromPlan(site: SiteDocument, plan: SitePlan): SiteDocument {
  validateSitePlan(site, plan);
  const retained = site.pages.filter(entry => !plan.deletes.includes(entry.id));
  const planned = plan.pages.map(spec => {
    const old = site.pages.find(entry => entry.id === spec.id);
    const page = old ? { ...old.page, name: spec.name } : { ...createDocument(true), id: spec.id, name: spec.name, settings: structuredClone(site.pages[0].page.settings) };
    return { id: spec.id, name: spec.name, path: spec.path, kind: spec.kind, ...(old?.group ? { group: old.group } : {}), page, layout: spec.layout.filter(region => site.sharedLayout[region]) };
  });
  const used = new Set(plan.pages.map(entry => entry.id));
  const pages = [...planned, ...retained.filter(entry => !used.has(entry.id))];
  return validateSite(JSON.parse(JSON.stringify({ ...site, name: plan.name, pages, sharedLayout: Object.fromEntries(Object.entries(site.sharedLayout).filter(([region]) => plan.sharedLayout.includes(region as SiteRegion))) })));
}

export function applySiteOperation(site: SiteDocument, plan: SitePlan, operation: AiOperation): SiteDocument {
  if (operation.op === 'sitePage') {
    const spec = plan.pages.find(entry => entry.id === operation.id);
    if (!spec || !operation.page || operation.page.name !== spec.name) throw new Error('AI 试图修改计划外页面，已暂停。');
    const exists = site.pages.some(entry => entry.id === spec.id);
    const entry: SitePageEntry = { ...spec, page: operation.page, layout: spec.layout.filter(region => site.sharedLayout[region]) };
    return validateSite({ ...site, pages: exists ? site.pages.map(item => item.id === spec.id ? entry : item) : [...site.pages, entry] });
  }
  if (operation.op === 'siteLayout') {
    const region = operation.region!;
    if (!plan.sharedLayout.includes(region)) throw new Error('AI 试图修改计划外的共享布局。');
    const sharedLayout = { ...site.sharedLayout };
    if (operation.page) sharedLayout[region] = operation.page; else delete sharedLayout[region];
    return validateSite({ ...site, sharedLayout, pages: site.pages.map(entry => ({ ...entry, layout: operation.page ? entry.layout : entry.layout.filter(item => item !== region) })) });
  }
  throw new Error('整站生成只接受已确认的页面和布局操作。');
}

export function finishSite(site: SiteDocument, plan: SitePlan): SiteDocument {
  for (const spec of plan.pages) if (!site.pages.some(entry => entry.id === spec.id)) throw new Error(`页面「${spec.name}」尚未生成，可继续当前任务。`);
  return validateSite({ ...site, pages: site.pages.map(entry => {
    const spec = plan.pages.find(item => item.id === entry.id);
    return spec ? { ...entry, layout: [...spec.layout] } : entry;
  }) });
}

export function readSiteAiSession(owner: string, siteId: string, storage: Pick<Storage, 'getItem'> = localStorage): SiteAiSession | null {
  const raw = storage.getItem(siteAiKey(owner, siteId)); if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SiteAiSession;
    if (!value || value.version !== 1 || value.owner !== owner || value.siteId !== siteId || typeof value.task !== 'string' || !['confirm', 'generating', 'complete', 'paused'].includes(value.status) || !Array.isArray(value.messages) || value.messages.some(message => typeof message !== 'string')) throw new Error();
    const before = JSON.parse(JSON.stringify(value.before)), draft = JSON.parse(JSON.stringify(value.draft));
    validateSiteDocument(before, validatePage); validateSiteDocument(draft, validatePage);
    if (before.id !== siteId || draft.id !== siteId) throw new Error();
    if (value.plan) validateSitePlan(before, value.plan);
    return { ...value, status: value.status === 'generating' ? 'paused' : value.status, before, draft, messages: value.messages.slice(-60) };
  } catch { throw new Error('AI 站点检查点无法读取，原记录尚未覆盖。请先导出站点备份。'); }
}
export function writeSiteAiSession(session: SiteAiSession, storage: Pick<Storage, 'setItem'> = localStorage): SiteAiSession {
  const safe = JSON.parse(JSON.stringify({ ...session, messages: session.messages.slice(-60) })) as SiteAiSession;
  validateSiteDocument(safe.before, validatePage); validateSiteDocument(safe.draft, validatePage);
  if (safe.plan) validateSitePlan(safe.before, safe.plan);
  storage.setItem(siteAiKey(session.owner, session.siteId), JSON.stringify(safe));
  return safe;
}

export function siteSummary(site: SiteDocument) {
  return { id: site.id, name: site.name, homePageId: site.homePageId, pages: site.pages.map(entry => ({ id: entry.id, name: entry.name, path: entry.path, kind: entry.kind, layout: entry.layout, blocks: entry.page.blocks.length })), sharedLayout: Object.fromEntries(Object.entries(site.sharedLayout).map(([region, page]) => [region, { blocks: page.blocks.length }])) };
}

type RunOptions = {
  site: SiteDocument; task: string; provider: AiProvider; profile: AiProfile; signal: AbortSignal;
  phase: 'plan' | 'generate'; plan?: SitePlan; draft?: SiteDocument; stream?: typeof streamAi; getSite?: () => SiteDocument;
  onDraft?: (site: SiteDocument) => void; onMessage?: (message: string) => void;
};
export async function runSiteAi(options: RunOptions): Promise<{ plan: SitePlan; site: SiteDocument | null; messages: string[] }> {
  const original = JSON.parse(JSON.stringify(options.site)) as SiteDocument;
  validateSiteDocument(original, validatePage);
  let draft = options.phase === 'generate' ? JSON.parse(JSON.stringify(options.draft ?? siteFromPlan(original, options.plan!))) as SiteDocument : null;
  if (draft) validateSiteDocument(draft, validatePage);
  const plan = options.plan ? validateSitePlan(original, options.plan) : null;
  const messages: string[] = [];
  const context = JSON.stringify({ mode: options.phase === 'plan' ? 'site-plan' : 'site-generate', task: options.task.slice(0, 12000), site: options.phase === 'plan' ? siteSummary(original) : draft, approvedPlan: plan });
  if (context.length > 240000) throw new Error('站点上下文过大，请缩小本次任务范围后再生成。');
  const system = `${aiSystemPrompt}\nThis is an atomic multi-page SITE task. The original page protocol is background only. Use ONLY the site operations below plus message/done. Never use add/update/remove/data/page/component in this task.\nPlanning phase (mode="site-plan"): emit one optional message then exactly one sitePlan terminal record: {"v":1,"seq":1,"op":"sitePlan","name":"Site name","summary":"Pages and scope","pages":[{"id":"existing-or-new-stable-id","name":"Home","path":"/","kind":"page","layout":["header","footer"]},{"id":"products","name":"Products","path":"/products","kind":"page","layout":["header","footer"]},{"id":"product-detail","name":"Product detail","path":"/products/:id","kind":"detail","layout":["header","footer"]}],"sharedLayout":["header","footer"],"deletes":[]}. Existing ids must be retained for pages being modified. Omit unchanged existing pages rather than replacing them. Any deletion must be explicit in deletes and summary; never delete the home page. Only list sharedLayout that the user should have.\nGeneration phase (mode="site-generate"): approvedPlan is confirmed by the user. Emit one complete sitePage for EACH new/changed planned page: {"v":1,"seq":1,"op":"sitePage","id":"products","page":{"version":1,"id":"products","name":"Products","settings":{"background":"#ffffff","accent":"#171717","maxWidth":1920,"padding":48,"layout":"free","canvasHeight":1080},"blocks":[]},"summary":"Build product list"}. page.id and page.name must match the plan; blocks use the existing catalog and exact free-canvas frames. Use real internal paths from the plan in buttons and navbar items, never pretend API or CMS data is connected. Build useful content in every new page and detail sample content clearly marked as examples. Do not change paths or ids. Use siteLayout with region:"header"|"footer" and a complete PageDocument whose id is "shared-header" or "shared-footer" to create/update confirmed shared regions. Existing unchanged pages/layouts are already in the draft and must not be regenerated. Finish only after every new planned page exists, then emit done. Return only NDJSON, no markdown.`;
  let completed = false, resultPlan = plan;
  const accept = (operation: AiOperation) => {
    if (operation.op === 'message') { if (operation.text) { messages.push(operation.text); options.onMessage?.(operation.text); } return; }
    if (operation.op === 'sitePlan') {
      if (options.phase !== 'plan') throw new Error('本次生成已经确认计划，不能中途改变范围。');
      resultPlan = validateSitePlan(original, { name: operation.name!, summary: operation.summary ?? '', pages: operation.pages!, sharedLayout: operation.sharedLayout ?? [], deletes: operation.deletes ?? [] });
      return;
    }
    if (operation.op === 'done') { completed = true; return; }
    if (options.phase !== 'generate' || !resultPlan || !draft) throw new Error('AI 在计划确认前尝试修改站点。');
    draft = applySiteOperation(draft, resultPlan, operation);
    options.onDraft?.(structuredClone(draft));
  };
  const decoder = new AiOperationDecoder();
  for await (const event of (options.stream ?? streamAi)(options.provider, options.profile, { system, context }, options.signal)) {
    options.signal.throwIfAborted();
    if (event.type === 'text') for (const operation of decoder.push(event.text)) accept(operation);
    if (event.type === 'complete') {
      for (const operation of decoder.finish()) accept(operation);
      if (options.phase === 'plan' && resultPlan) return { plan: resultPlan, site: null, messages };
      if (options.phase === 'generate' && resultPlan && draft && completed) {
        const result = finishSite(draft, resultPlan);
        if (options.getSite && JSON.stringify(options.getSite()) !== JSON.stringify(original)) throw new Error('站点已发生变化，AI 结果保留在检查点中，不会覆盖新修改。');
        return { plan: resultPlan, site: result, messages };
      }
      throw new Error('AI 尚未完成整站任务，已保留检查点，可以继续生成。');
    }
  }
  throw new Error('AI 连接中断，已保留站点检查点。');
}

export function siteAiError(error: unknown, profile: AiProfile): string {
  return safeAiError(error, profile.apiKey);
}
