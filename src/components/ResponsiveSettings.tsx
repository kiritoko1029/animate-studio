import { Monitor, RotateCcw, Smartphone, Tablet } from 'lucide-react';
import type { PageDocument } from '../model';
import { createResponsiveCandidate, resetDeviceLayout, type ResponsiveDevice } from '../lib/responsive';
import { t } from '../i18n';
import { StudioButton } from './StudioUI';
import '../responsive-settings.css';

export function ResponsiveSettings({ document, device, onDeviceChange, onSettings, notify }: { document: PageDocument; device: ResponsiveDevice; onDeviceChange: (device: ResponsiveDevice) => void; onSettings: (settings: Partial<PageDocument['settings']>) => void; notify: (message: string) => void }) {
  const adaptive = document.settings.responsive?.mode === 'adaptive';
  const apply = (next: PageDocument, message: string) => {
    try { onSettings({ responsive: next.settings.responsive }); notify(message); }
    catch (error) { notify(error instanceof Error ? error.message : t('暂时无法修改响应式布局')); }
  };
  const enable = () => {
    if (adaptive || !window.confirm(t('将按桌面内容生成平板和手机候选布局。请逐个断点检查，之后仍可撤销。继续吗？'))) return;
    try { apply(createResponsiveCandidate(document), t('已生成平板和手机候选布局，可逐页检查并撤销')); }
    catch (error) { notify(error instanceof Error ? error.message : t('暂时无法生成候选布局')); }
  };
  const reset = () => {
    if (!window.confirm(t('重新生成当前断点的候选布局？该断点的手动位置和隐藏设置将被替换，可撤销。'))) return;
    try { apply(resetDeviceLayout(document, device), t('已重新生成当前断点，可撤销')); }
    catch (error) { notify(error instanceof Error ? error.message : t('暂时无法重新生成布局')); }
  };
  const fixed = () => {
    if (!window.confirm(t('恢复固定画布？将移除平板和手机的独立布局，桌面内容保持不变，可撤销。'))) return;
    apply(resetDeviceLayout(document, 'desktop'), t('已恢复固定画布，桌面内容未改变'));
  };
  return <section className="property-section responsive-settings" data-page-setting="responsive"><h3>{t('响应式布局')}</h3><p className="field-hint">{t('默认保留固定画布。自适应模式按真实容器宽度选择布局，不只缩小桌面。')}</p><div className="responsive-device-options" aria-label={t('编辑断点')}>{([{ id: 'desktop', label: t('桌面'), icon: Monitor }, { id: 'tablet', label: t('平板'), icon: Tablet }, { id: 'mobile', label: t('手机'), icon: Smartphone }] as const).map(item => <StudioButton key={item.id} aria-pressed={device === item.id} disabled={!adaptive && item.id !== 'desktop'} onClick={() => onDeviceChange(item.id)}><item.icon size={14}/>{item.label}</StudioButton>)}</div>{adaptive ? <><p className="field-hint">{t('当前编辑：{0}。内容和交互跨断点共用；位置、尺寸、高度和隐藏状态分别保存。', { 0: t({ desktop: '桌面', tablet: '平板', mobile: '手机' }[device]) })}</p><div className="responsive-layout-actions"><StudioButton className="secondary-button" disabled={device === 'desktop'} onClick={reset}><RotateCcw size={13}/>{t('重新生成当前断点')}</StudioButton><StudioButton onClick={fixed}>{t('恢复固定画布')}</StudioButton></div></> : <StudioButton className="secondary-button" onClick={enable}>{t('启用自适应布局')}</StudioButton>}</section>;
}
