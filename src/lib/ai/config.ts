import type { AiProfile, AiProvider, AiSettings } from './types.ts';

export const aiSettingsKey = 'animate-studio:ai-settings:v1';
export function defaultAiSettings(): AiSettings {
  const profile = (baseUrl: string): AiProfile => ({ baseUrl, apiKey: '', model: '', effort: '', maxOutputTokens: 8192, thinking: 'default', thinkingBudget: 2048, reasoningSummary: true });
  return { version: 1, provider: 'openai', profiles: { openai: profile('https://api.openai.com/v1'), anthropic: profile('https://api.anthropic.com/v1') } };
}
export function apiBaseUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('请填写完整的 AI 接口地址。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('AI 接口地址只支持 HTTP/HTTPS，不能包含账号、查询参数或片段。');
  return url.origin + url.pathname.replace(/\/(responses|messages|models)\/?$/, '').replace(/\/+$/, '');
}
export function validateAiProfile(profile: AiProfile, provider: AiProvider, requireModel = true, requireKey = true) {
  apiBaseUrl(profile.baseUrl);
  if ((requireKey && !profile.apiKey.trim()) || profile.apiKey.length > 4096) throw new Error('请先填写 API 密钥。');
  if (requireModel && (!profile.model.trim() || profile.model.length > 200)) throw new Error('请选择或填写模型名称。');
  if (!Number.isInteger(profile.maxOutputTokens) || profile.maxOutputTokens < 1024 || profile.maxOutputTokens > 128000) throw new Error('最大输出 Token 必须在 1024–128000 之间。');
  if (profile.effort && !/^[a-zA-Z0-9_-]{1,32}$/.test(profile.effort)) throw new Error('思考强度只能包含字母、数字、连字符和下划线。');
  if (!Number.isInteger(profile.thinkingBudget) || profile.thinkingBudget < 1024 || profile.thinkingBudget > 127999) throw new Error('思考预算必须是 1024–127999 之间的整数。');
  if (provider === 'anthropic' && profile.thinking === 'budget' && (!Number.isInteger(profile.thinkingBudget) || profile.thinkingBudget < 1024 || profile.thinkingBudget >= profile.maxOutputTokens)) throw new Error('思考预算至少为 1024，且必须小于最大输出 Token。');
}
export function readAiSettings(storage: Pick<Storage, 'getItem'> = localStorage): AiSettings {
  const defaults = defaultAiSettings();
  const raw = storage.getItem(aiSettingsKey);
  if (!raw) return defaults;
  const saved = JSON.parse(raw);
  if (saved?.version !== 1 || !['openai', 'anthropic'].includes(saved.provider)) throw new Error('AI 配置无法读取，请重新配置。');
  for (const provider of ['openai', 'anthropic'] as const) {
    const value = saved.profiles?.[provider];
    if (!value || ['baseUrl', 'apiKey', 'model', 'effort'].some(key => typeof value[key] !== 'string') || !['default', 'off', 'adaptive', 'budget'].includes(value.thinking) || !Number.isInteger(value.maxOutputTokens) || !Number.isInteger(value.thinkingBudget)) throw new Error('AI 配置无法读取，请重新配置。');
    defaults.profiles[provider] = Object.fromEntries(Object.keys(defaults.profiles[provider]).map(key => [key, key === 'reasoningSummary' ? value[key] !== false : value[key]])) as AiProfile;
  }
  defaults.provider = saved.provider;
  return defaults;
}
export function saveAiSettings(settings: AiSettings, storage: Pick<Storage, 'setItem'> = localStorage) {
  // An explicit UI save is the only write. Credentials never enter page or conversation records.
  storage.setItem(aiSettingsKey, JSON.stringify(settings));
}
