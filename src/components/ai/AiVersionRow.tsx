import { Bookmark, History, RotateCcw } from 'lucide-react';
import { getLocale, t } from '../../i18n';
import type { AiVersion } from '../../lib/ai/types';
import { StudioButton } from '../StudioUI';

export function AiVersionRow({ version, current, disabled, onRestore }: { version: AiVersion; current: boolean; disabled: boolean; onRestore: () => void }) {
  const time = new Date(version.time).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
  const name = version.kind === 'before' ? t('修改前的页面') : t('AI 生成版本');
  return <div className={`ai-version ai-version--${version.kind}`} title={version.label}>
    {version.kind === 'before' ? <History size={13}/> : <Bookmark size={13}/>}
    <span className="ai-version-text"><strong>{name}</strong><small>{t('{0} 个组件', { 0: version.page.blocks.length })} · {time}</small></span>
    {current ? <span className="ai-version-current">{t('当前画布')}</span>
      : <StudioButton className="secondary-button ai-version-restore" disabled={disabled} aria-label={t('恢复{0}（{1}）', { 0: name, 1: time })} onClick={onRestore}><RotateCcw size={12}/>{t('恢复')}</StudioButton>}
  </div>;
}
