import { StudioButton } from './StudioUI';
import type { CSSProperties } from 'react';
import { Check, Link2, Palette, Pencil, Plus, Trash2 } from 'lucide-react';
import { contrastingText, getTheme, themePresets, type CustomTheme, type ThemeId } from '../lib/themes';
import '../theme-picker.css';

type Props = {
  scope: 'component' | 'page';
  studioScheme?: 'light' | 'dark';
  value?: ThemeId;
  pageTheme?: ThemeId;
  onChange: (theme?: ThemeId) => void;
  customThemes: CustomTheme[];
  onDesign: (theme?: ThemeId) => void;
  onDelete: (theme: ThemeId) => void;
};

export function ThemePicker({ scope, value, pageTheme, customThemes, onChange, onDesign, onDelete, studioScheme }: Props) {
  const label = scope === 'component' ? '组件主题' : '页面主题';
  const active = value ? getTheme(value, customThemes) : undefined;
  const isCustom = customThemes.some(theme => theme.id === value);
  return <section className="property-section theme-section" aria-label={label}>
    <h3><Palette size={13} />{label}<span className="theme-count">{themePresets.length} 套风格</span></h3>
    {scope === 'component' && <StudioButton type="button" className={`theme-inherit ${!value ? 'selected' : ''}`} aria-pressed={!value} onClick={() => onChange(undefined)}>
      <Link2 size={14} /><span><strong>跟随页面</strong><small>{pageTheme ? getTheme(pageTheme, customThemes).name : '当前页面配色'}</small></span>{!value && <Check size={14} />}
    </StudioButton>}
    {scope === 'page' && studioScheme && <StudioButton type="button" className="theme-inherit" onClick={() => onChange(studioScheme === 'dark' ? 'animate-dark' : 'animate-light')}>
      <Link2 size={14} /><span><strong>应用工作台配色</strong><small>当前{studioScheme === 'dark' ? '深色' : '浅色'} · 同时更新画布与组件</small></span>
    </StudioButton>}
    <div className="theme-preset-grid">
      {[...themePresets.filter(theme => theme.id.startsWith('animate-')), ...themePresets.filter(theme => !theme.id.startsWith('animate-'))].map(theme => <StudioButton type="button" key={theme.id} className={`theme-preset ${value === theme.id ? 'selected' : ''}`} aria-label={`${label}：${theme.name}`} aria-pressed={value === theme.id} onClick={() => onChange(theme.id)} title={theme.description}>
        <span className="theme-preset-art" aria-hidden="true" style={{ '--sample-accent': theme.accent, '--sample-ink': theme.text, '--sample-muted': theme.muted, '--sample-border': theme.border, '--sample-panel': theme.panel, '--sample-radius': `${Math.min(8, theme.radius / 2)}px`, background: theme.canvas } as CSSProperties}>
          <span className="theme-sample-type" style={{ fontFamily: theme.headingFont }}>Aa</span><span className="theme-sample-lines"><i /><i /></span><span className="theme-sample-button" style={{ color: contrastingText(theme.accent) }}>Go <span>↗</span></span>
          {value === theme.id && <span className="theme-selected-mark"><Check size={10} /></span>}
        </span>
        <span className="theme-preset-name">{theme.name}</span>
      </StudioButton>)}
    </div>
    <div className="custom-theme-heading"><strong>我的主题</strong><span>{customThemes.length} / 30</span></div>
    {!!customThemes.length && <div className="custom-theme-list">{customThemes.map(theme => <StudioButton key={theme.id} type="button" className={`custom-theme-item ${value === theme.id ? 'selected' : ''}`} aria-label={`${label}：${theme.name}`} aria-pressed={value === theme.id} onClick={() => onChange(theme.id)}><span className="custom-theme-swatches" aria-hidden="true">{[theme.accent, theme.canvas, theme.text].map((color, index) => <i key={index} style={{ background: color }} />)}</span><span>{theme.name}</span>{value === theme.id && <Check size={13} />}</StudioButton>)}</div>}
    <StudioButton type="button" className="design-theme-button" onClick={() => onDesign()} disabled={customThemes.length >= 30}><Plus size={14} />设计主题</StudioButton>
    {isCustom && <div className="custom-theme-actions"><StudioButton type="button" onClick={() => onDesign(value)}><Pencil size={12} />编辑主题</StudioButton><StudioButton type="button" aria-label={`删除主题：${active?.name}`} onClick={() => value && onDelete(value)} title="使用此主题的组件将跟随页面；若页面正在使用它则恢复自然清新风，可撤销。"><Trash2 size={12} />删除</StudioButton></div>}
    {!customThemes.length && <p className="theme-description">从当前风格开始，设计并保存自己的主题。</p>}
    {customThemes.length >= 30 && <p className="theme-description">已达 30 套上限，可编辑或删除已有主题。</p>}
    <p className="theme-description">{active?.description ?? (scope === 'component' ? '随页面统一变化，也可选择独立风格。' : '页面配色独立保存，也可一键应用工作台配色。')}</p>
    <p className="field-hint">{scope === 'component' ? '切换会重置此组件的颜色与圆角，可撤销。' : '应用到跟随页面的组件，重置其颜色与圆角；独立主题保留。'}</p>
  </section>;
}
