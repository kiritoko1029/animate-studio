import { useEffect, useRef, useState } from 'react';
import { Check, Download, KeyRound, LoaderCircle, Settings2, X } from 'lucide-react';
import { t, translateMessage } from '../../i18n';
import { StudioButton, StudioDialog } from '../StudioUI';
import { Tabs, TabsList, TabsTrigger } from '../animate-ui/components/radix/tabs';
import { apiBaseUrl, defaultAiSettings, validateAiProfile } from '../../lib/ai/config';
import { listAiModels, safeAiError } from '../../lib/ai/client';
import type { AiProvider, AiSettings } from '../../lib/ai/types';
import { AiSelect } from './AiSelect';

export function AiSettingsDialog({ settings, onSave, onClose }: { settings: AiSettings; onSave: (settings: AiSettings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [models, setModels] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const profile = draft.profiles[draft.provider];
  const change = (patch: Partial<typeof profile>) => setDraft(current => ({ ...current, profiles: { ...current.profiles, [current.provider]: { ...current.profiles[current.provider], ...patch } } }));
  useEffect(() => () => request.current?.abort(), []);
  const chooseProvider = (provider: AiProvider) => { request.current?.abort(); request.current = null; setBusy(false); setModels([]); setError(''); setDraft(value => ({ ...value, provider })); };
  async function readModels() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      const list = await listAiModels(draft.provider, profile, AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]));
      if (request.current !== controller || controller.signal.aborted) return;
      setModels(list);
      if (!list.length) setError(t('此接口没有返回可用模型，请手动填写模型名称。'));
    } catch (failure) { if (!controller.signal.aborted) setError(safeAiError(failure, profile.apiKey)); }
    finally { if (request.current === controller) setBusy(false); }
  }
  const save = () => {
    try {
      const normalized = structuredClone(draft);
      // All profiles are persisted together, including inactive drafts.
      for (const provider of ['openai', 'anthropic'] as const) {
        const value = normalized.profiles[provider];
        if (value.thinking !== 'budget' && (!Number.isInteger(value.thinkingBudget) || value.thinkingBudget < 1024 || value.thinkingBudget > 127999)) value.thinkingBudget = defaultAiSettings().profiles[provider].thinkingBudget;
        try { validateAiProfile(value, provider, false, false); }
        catch (failure) { chooseProvider(provider); throw failure; }
        normalized.profiles[provider] = { ...value, baseUrl: apiBaseUrl(value.baseUrl), apiKey: value.apiKey.trim(), model: value.model.trim(), effort: value.effort.trim() };
      }
      onSave(normalized);
      onClose();
    } catch (failure) { setError(safeAiError(failure, profile.apiKey)); }
  };
  return <StudioDialog title={t('AI 模型配置')} className="ai-settings-dialog" onClose={onClose}>
    <header className="ai-dialog-heading"><h2><Settings2 size={18}/>{t('AI 模型配置')}</h2><StudioButton className="icon-button" aria-label={t('关闭')} onClick={onClose}><X size={17}/></StudioButton></header>
    <div className="ai-settings-body">
      <Tabs value={draft.provider} onValueChange={value => chooseProvider(value as AiProvider)} className="studio-tab-root"><TabsList className="studio-tabs ai-provider-tabs" aria-label={t('API 协议')}><TabsTrigger value="openai">OpenAI Responses</TabsTrigger><TabsTrigger value="anthropic">Anthropic Messages</TabsTrigger></TabsList></Tabs>
      <p className="ai-settings-note"><KeyRound size={14}/>{t('配置和密钥仅保存在此浏览器，请勿在公用设备保存。请求由浏览器直连接口。')}</p>
      <label className="ai-field"><span>{t('API 基础地址')}</span><input aria-label={t('API 基础地址')} type="url" value={profile.baseUrl} onChange={event => { request.current?.abort(); request.current = null; setBusy(false); change({ baseUrl: event.target.value }); setModels([]); }} placeholder="https://api.openai.com/v1" autoComplete="off" spellCheck={false}/></label>
      <label className="ai-field"><span>{t('API 密钥')}</span><input aria-label={t('API 密钥')} type="password" value={profile.apiKey} onChange={event => { request.current?.abort(); request.current = null; setBusy(false); setModels([]); change({ apiKey: event.target.value }); }} autoComplete="off" spellCheck={false} maxLength={4096} placeholder={t('填写你的 API 密钥')}/></label>
      <div className="ai-model-heading"><label htmlFor="ai-model-name">{t('模型')}</label><StudioButton className="text-button" disabled={busy || !profile.apiKey.trim()} onClick={() => void readModels()}>{busy ? <LoaderCircle size={13} className="spin"/> : <Download size={13}/>} {t('读取模型列表')}</StudioButton></div>
      <input className="ai-model-input" id="ai-model-name" aria-label={t('模型名称')} value={profile.model} onChange={event => change({ model: event.target.value })} placeholder={t('从列表选择或输入模型 ID')} maxLength={200} spellCheck={false}/>
      {!!models.length && <AiSelect label={t('可用模型')} value={profile.model} options={models.map(value => ({ value, label: value }))} onChange={model => change({ model })} placeholder={t('选择模型')}/>}
      <div className="ai-settings-grid">
        <label className="ai-field"><span>{t('思考强度')}</span><input aria-label={t('思考强度')} value={profile.effort} onChange={event => change({ effort: event.target.value })} placeholder="low / medium / high" maxLength={32}/><small>{t('留空使用模型默认值，也可填写兼容接口支持的自定义强度。')} {t('生成页面一般用 low 或 medium 即可；high 会先思考很久才开始输出。')}</small></label>
        <label className="ai-field"><span>{t('最大输出 Token')}</span><input aria-label={t('最大输出 Token')} type="number" min={1024} max={128000} step={1024} value={Number.isFinite(profile.maxOutputTokens) ? profile.maxOutputTokens : ''} onChange={event => change({ maxOutputTokens: event.target.valueAsNumber })}/></label>
      </div>
      {draft.provider === 'openai' && <div className="ai-field"><span>{t('思考摘要')}</span><AiSelect label={t('请求思考摘要')} value={profile.reasoningSummary === false ? 'off' : 'auto'} options={[{ value: 'auto', label: t('自动显示') }, { value: 'off', label: t('不请求摘要') }]} onChange={value => change({ reasoningSummary: value === 'auto' })}/><small>{t('需要模型支持思考摘要；兼容接口不支持时可关闭，不影响生成进度显示。')}</small></div>}
      {draft.provider === 'anthropic' && <div className="ai-settings-grid"><div className="ai-field"><span>{t('思考模式')}</span><AiSelect label={t('思考模式')} value={profile.thinking} options={[{ value: 'default', label: t('模型默认') }, { value: 'adaptive', label: t('自适应思考') }, { value: 'budget', label: t('手动预算（旧模型）') }, { value: 'off', label: t('关闭思考') }]} onChange={thinking => change({ thinking: thinking as typeof profile.thinking })}/></div>{profile.thinking === 'budget' && <label className="ai-field"><span>{t('思考 Token 预算')}</span><input aria-label={t('思考 Token 预算')} type="number" min={1024} max={profile.maxOutputTokens - 1} step={1024} value={Number.isFinite(profile.thinkingBudget) ? profile.thinkingBudget : ''} onChange={event => change({ thinkingBudget: event.target.valueAsNumber })}/></label>}</div>}
      <p className="ai-settings-note">{t('不同模型支持的思考参数不同；接口需要允许浏览器跨域请求。不兼容时会显示供应商错误。')}</p>
      {error && <p className="ai-error" role="alert">{translateMessage(error)}</p>}
    </div>
    <footer className="ai-dialog-footer"><StudioButton className="secondary-button" onClick={onClose}>{t('取消')}</StudioButton><StudioButton className="primary-button" onClick={save}><Check size={14}/>{t('保存配置')}</StudioButton></footer>
  </StudioDialog>;
}
