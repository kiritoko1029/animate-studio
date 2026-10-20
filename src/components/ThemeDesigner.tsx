import { StudioButton, StudioDialog } from './StudioUI';
import { useRef, useState, type CSSProperties } from 'react';
import { Check, Copy, Palette, X } from 'lucide-react';
import { createBlock, type PageDocument } from '../model';
import { BlockRenderer } from './PageRenderer';
import { contrastingText, isThemeColor, pageThemeStyle, resetThemeOverrides, themeColorKeys, themePresets, type CustomTheme, type ThemeDefinition, type PresetId } from '../lib/themes';
import '../theme-designer.css';

type Props = {
  initial: CustomTheme;
  editing: boolean;
  existingNames: string[];
  canCreate: boolean;
  scopeName: string;
  usageCount: number;
  onSave: (theme: CustomTheme) => void;
  onClose: () => void;
};
const colorLabels = { accent: '强调色', canvas: '页面底色', surface: '控件底色', panel: '卡片底色', text: '正文文字', muted: '次要文字', border: '边框颜色' };
const fontLabels: Record<PresetId, string> = { nature: '现代无衬线', 'tech-blue': '科技无衬线', violet: '圆润无衬线', 'warm-editorial': '杂志衬线', mono: '极简无衬线', midnight: '屏幕无衬线', 'animate-light': '现代无衬线', 'animate-dark': '现代无衬线' };
const shadowLabels: Record<PresetId, string> = { nature: '轻柔投影', 'tech-blue': '冷调投影', violet: '柔光悬浮', 'warm-editorial': '纸张压印', mono: '无阴影', midnight: '霓虹微光', 'animate-light': '中性轻投影', 'animate-dark': '无阴影' };
const fontPresets = themePresets.filter((preset, index, all) => all.findIndex(item => item.headingFont === preset.headingFont) === index);
const shadowPresets = themePresets.filter((preset, index, all) => all.findIndex(item => item.shadow === preset.shadow) === index);
const fullHex = (color: string) => color.length === 4 ? `#${color.slice(1).split('').map(c => c + c).join('')}` : color;

function ThemeColorField({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  const valid = isThemeColor(value);
  return <label className="designer-color-field"><span>{name}</span><span className={`designer-color-input ${valid ? '' : 'invalid'}`}>
    <input type="color" aria-label={`${name}取色器`} value={valid ? fullHex(value) : '#ffffff'} onChange={e => onChange(e.target.value)} />
    <input type="text" aria-label={`${name}色值`} value={value} maxLength={7} spellCheck={false} aria-invalid={!valid} onChange={e => onChange(e.target.value)} />
  </span>{!valid && <small>请输入 #RGB 或 #RRGGBB</small>}</label>;
}

export function ThemeDesigner({ initial, editing, existingNames, canCreate, scopeName, usageCount, onSave, onClose }: Props) {
  const nameInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial);
  const [copyMode, setCopyMode] = useState(false);
  const [base, setBase] = useState('');
  const change = <K extends keyof ThemeDefinition>(key: K, value: ThemeDefinition[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const duplicateName = existingNames.some(name => name.toLocaleLowerCase() === draft.name.trim().toLocaleLowerCase())
    && (!editing || copyMode || draft.name.trim().toLocaleLowerCase() !== initial.name.toLocaleLowerCase());
  const valid = !!draft.name.trim() && !duplicateName && themeColorKeys.every(key => isThemeColor(draft[key]));
  const previewTheme = { ...draft };
  for (const key of themeColorKeys) if (!isThemeColor(previewTheme[key])) previewTheme[key] = initial[key];
  const settings: PageDocument['settings'] = { theme: draft.id, customThemes: [previewTheme], accent: previewTheme.accent, background: previewTheme.canvas, maxWidth: 500, padding: 20 };
  const previewStyle = pageThemeStyle(settings) as CSSProperties;
  const [previewBlocks] = useState(() => ['card', 'input', 'button', 'switch'].map(type => {
    const block = createBlock(type as 'card' | 'input' | 'button' | 'switch');
    return { ...block, props: { ...resetThemeOverrides(block.props), padding: 16, animation: 'none' as const } };
  }));
  function submit() {
    if (!valid || (copyMode && !canCreate)) return;
    onSave({ ...draft, id: copyMode ? `custom-${crypto.randomUUID()}` : draft.id, name: draft.name.trim(), description: draft.description.trim() });
  }
  return <StudioDialog title="主题工作台" className="theme-designer" onClose={onClose} dismissOutside={false}>
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <header className="designer-heading"><div><span className="designer-eyebrow"><Palette size={14} />主题工作台</span><h2 id="theme-designer-title">{editing && !copyMode ? '编辑主题' : '设计自己的主题'}</h2></div><StudioButton type="button" className="icon-button" aria-label="关闭主题设计器" onClick={onClose}><X size={18} /></StudioButton></header>
      <div className="designer-body">
        <div className="designer-controls">
          <label className="designer-field">主题名称<input ref={nameInput} value={draft.name} maxLength={40} placeholder="例如：海盐蓝品牌风" aria-label="主题名称" aria-invalid={duplicateName} onChange={e => change('name', e.target.value)} /></label>
          {duplicateName && <p className="designer-error" role="alert">已有同名主题，请换一个名称。</p>}
          <label className="designer-field">风格描述<input value={draft.description} maxLength={120} placeholder="用一句话描述你的风格" aria-label="风格描述" onChange={e => change('description', e.target.value)} /></label>
          <label className="designer-field">从预设取样<select aria-label="从预设取样" value={base} onChange={e => {
            const preset = themePresets.find(theme => theme.id === e.target.value);
            if (preset) { setDraft({ ...preset, id: draft.id, name: draft.name }); setBase(preset.id); }
          }}><option value="" disabled>以当前风格为起点</option>{themePresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><small>替换配色、字体与形状，保留主题名称。</small></label>
          <fieldset><legend>配色</legend><div className="designer-colors">{themeColorKeys.map(key => <ThemeColorField key={key} name={colorLabels[key]} value={draft[key]} onChange={value => change(key, value)} />)}</div></fieldset>
          <fieldset><legend>形状与质感</legend>
            {(['radius', 'controlRadius'] as const).map((key, i) => <label className="designer-field" key={key}>{i ? '按钮与控件圆角' : '卡片圆角'}<span className="designer-range"><input type="range" min={0} max={80} aria-label={i ? '按钮与控件圆角' : '卡片圆角'} value={draft[key]} onChange={e => change(key, +e.target.value)} /><output>{draft[key]} px</output></span></label>)}
            <label className="designer-field">阴影<select aria-label="主题阴影" value={draft.shadow} onChange={e => change('shadow', e.target.value)}>{shadowPresets.map(preset => <option key={preset.id} value={preset.shadow}>{shadowLabels[preset.id]}</option>)}</select></label>
            <label className="designer-field">标题字体<select aria-label="标题字体" value={draft.headingFont} onChange={e => change('headingFont', e.target.value)}>{fontPresets.map(preset => <option key={preset.id} value={preset.headingFont}>{fontLabels[preset.id]}</option>)}</select></label>
            <label className="designer-field">控件明暗<select aria-label="控件明暗" value={draft.scheme} onChange={e => change('scheme', e.target.value)}><option value="light">浅色</option><option value="dark">深色</option></select></label>
          </fieldset>
        </div>
        <section className="designer-preview" aria-label="主题实时预览"><div className="designer-preview-heading"><span><i />实时预览</span><small>卡片 · 表单 · 按钮</small></div>
          <div className="designer-preview-page" style={previewStyle}><div className="designer-preview-intro"><span style={{ background: previewTheme.accent, color: contrastingText(previewTheme.accent) }}>你的风格，你来定义</span><h3 style={{ color: previewTheme.text, fontFamily: previewTheme.headingFont }}>{draft.name.trim() || '我的主题'}</h3><p style={{ color: previewTheme.muted }}>{draft.description || '从一抹颜色开始，构建自己的视觉语言。'}</p></div>{previewBlocks.map(block => <BlockRenderer key={block.id} block={block} settings={settings} interactive={false} />)}</div>
          <p className="designer-preview-note">保存后应用到{scopeName}。{editing && !copyMode ? `当前有 ${usageCount} 处使用此主题，修改会同步生效。` : '主题会出现在「我的主题」中，可用于其他组件。'}</p>
        </section>
      </div>
      <footer className="designer-footer"><div>{editing && !copyMode && <StudioButton type="button" className="text-button" disabled={!canCreate} onClick={() => { setCopyMode(true); change('name', `${draft.name.slice(0, 35)} 副本`); }}><Copy size={14} />另存为新主题</StudioButton>}{copyMode && <span className="designer-copy-state">将保存为独立副本</span>}</div><StudioButton type="button" className="secondary-button" onClick={onClose}>取消</StudioButton><StudioButton className="primary-button" type="submit" disabled={!valid || (copyMode && !canCreate)}><Check size={14} />保存并应用</StudioButton></footer>
    </form>
  </StudioDialog>;
}
