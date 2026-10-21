import { RotateCcw, Sparkles } from 'lucide-react';
import { officialAnimationControls, type AnimationSettings as Settings } from '../../shared/animation-settings.mjs';
import { StudioButton } from './StudioUI';
import { Switch } from './animate-ui/components/radix/switch';

const labels: Record<string, string> = {
  factor:'视差强度', starColor:'星星颜色',pointerEvents:'鼠标交互',strokeColor:'线条颜色',numberOfLines:'放射线数量',numberOfDiscs:'圆环数量',hexagonSize:'六边形大小（px）',hexagonMargin:'六边形间距（px）',starsCount:'星星数量',starsSize:'星星大小（px）',starsOpacity:'星星透明度',glowIntensity:'发光强度',glowAnimation:'发光过渡',movementSpeed:'移动速度',mouseInfluence:'鼠标作用范围（px）',mouseGravity:'鼠标引力',gravityStrength:'引力强度',starsInteraction:'星星相互作用',starsInteractionType:'相互作用方式',
  size:'尺寸（px）', from:'进入方向', side:'弹出方向', direction:'方向', showCloseButton:'显示关闭按钮', sideOffset:'距触发器间距（px）', align:'对齐', alignOffset:'对齐偏移（px）', followCursor:'跟随鼠标', checkAnimation:'勾选动画', spacing:'项目间距', orientation:'排列方向', progressBar:'显示倒计时进度', delay:'开始延迟', duration:'时长', writing:'逐字显示', cursor:'显示光标', tapScale:'按下缩放比例', hoverScale:'悬停缩放比例', fillHeight:'液体高度', neon:'霓虹效果', loop:'循环播放', holdDelay:'停留时间', y:'垂直位移（px）', wave:'波浪效果', trigger:'触发方式', type:'拆分单位', animation:'动画样式', stagger:'逐字间隔（秒）', fromNumber:'起始数值', padStart:'补齐位数', decimalSeparator:'小数分隔符', decimalPlaces:'小数位数', thousandSeparator:'千位分隔符', interactive:'鼠标交互', population:'烟花密度', glowColor:'发光颜色', shapeColor:'字符颜色', fontSize:'字符大小（px）', lineColor:'线条颜色', levels:'等高线层数', speed:'运动速度', scale:'缩放比例', peak:'山峰高度', zoomScale:'放大倍数', zoomOnHover:'悬停放大', zoomOnClick:'点击放大', animateOnHover:'悬停高亮', animate:'播放动画', global:'跟随整个页面', initialBlur:'初始模糊（px）', blur:'模糊', initialOpacity:'初始透明度', opacity:'最终透明度', slide:'滑入', fade:'淡入', zoom:'缩放', mode:'高亮范围', exitDelay:'离开延迟', hover:'悬停高亮', onlyOnHover:'仅悬停时生效', strength:'磁吸强度', range:'作用范围（px）', count:'粒子数量', radius:'扩散半径（px）', spread:'扩散角度', shrink:'边缘缩小比例', loopDelay:'循环间隔', deg:'光泽角度', enable:'启用', enableOnHover:'悬停触发', enableOnTap:'点击触发', offset:'滑入距离（px）', maxTilt:'最大倾斜角度', perspective:'透视距离（px）', initialScale:'初始缩放比例', effect:'切换效果', enableCursor:'显示自定义光标', enableCursorFollow:'显示跟随内容',
};
const options: Record<string, string> = {instant:'即时',ease:'缓动',spring:'弹簧',attract:'吸引',repel:'排斥',bounce:'反弹',merge:'合并',top:'上方',bottom:'下方',left:'左侧',right:'右侧',up:'向上',down:'向下',start:'起点',center:'居中',end:'末端',none:'自动',false:'关闭',true:'开启',x:'仅横向',y:'仅纵向','inline-start':'行首','inline-end':'行末',draw:'描画',pop:'弹出',horizontal:'水平',vertical:'垂直',hover:'悬停',click:'点击',chars:'字符',words:'单词',lines:'行',default:'默认',vibe:'跃动',writing:'书写',btt:'自下向上',ttb:'自上向下',ltr:'自左向右',rtl:'自右向左',text:'跟随文字颜色',white:'白色',blue:'蓝色',violet:'紫色',emerald:'绿色',amber:'琥珀色',rose:'玫瑰色',popper:'浮动定位','item-aligned':'对齐选项',children:'子元素',parent:'父容器',fade:'淡入淡出',slide:'滑动',push:'推入',zoom:'缩放',iris:'圆形展开',wipe:'擦除',bands:'条带',stack:'堆叠',flow:'流动',chop:'切片',random:'随机'};

function fieldLabel(group: string, key: string, type: string) {
  if (type === 'starsBackground' && key === 'speed') return '运动周期（秒）';
  if (type === 'copyButton' && key === 'delay') return '复制提示保持（毫秒）';
  if (type === 'slidingNumber' && key === 'fromNumber') return '从零开始';
  const label = labels[key] ?? key;
  if (['delay','duration','holdDelay','loopDelay','exitDelay'].includes(key)) return `${label}（${['LiquidButton','ShimmeringText','ParticlesEffect','IconButtonParticles'].includes(group) ? '秒' : '毫秒'}）`;
  return label;
}

export function AnimationSettings({ type, value = {}, onChange, extra = false }: { type: string; value?: Settings; onChange: (value: Settings) => void; extra?: boolean }) {
  const groups = officialAnimationControls[type]?.groups;
  if (!groups || !Object.values(groups).some(fields => Object.keys(fields).length)) return null;
  return <div className="property-section official-motion-settings">
    <h3><Sparkles size={13}/>{extra ? '附加动效设置' : '官方动效'}<StudioButton className="text-button" disabled={!Object.keys(value).length} onClick={() => onChange({})} aria-label={extra ? '恢复附加动效默认' : '恢复官方动效默认'}><RotateCcw size={12}/>恢复默认</StudioButton></h3>
    {!extra && <p className="field-hint">默认沿用官方示例。修改后即时生效，点击画布播放按钮可重播。</p>}
    {Object.entries(groups).flatMap(([group, fields]) => Object.entries(fields).map(([key, field]) => {
      const name = `${group}.${key}`;
      const current = value[name] ?? field.value;
      const label = fieldLabel(group, key, type);
      const update = (next: string | number | boolean) => {
        const settings = { ...value };
        if (next === field.value) delete settings[name]; else settings[name] = next;
        onChange(settings);
      };
      return <label className="field property-field" key={name}><span className="field-label">{label}</span>{field.options ? <select aria-label={label} value={JSON.stringify(current)} onChange={event => update(JSON.parse(event.target.value))}>{Object.entries(field.options).map(([label, option]) => <option key={label} value={JSON.stringify(option)}>{options[label] ?? label}</option>)}</select> : typeof field.value === 'boolean' ? <span className="studio-switch-field"><Switch aria-label={label} checked={Boolean(current)} onCheckedChange={update}/><span>{current ? '开启' : '关闭'}</span></span> : typeof field.value === 'number' ? <input type="number" aria-label={label} min={field.min ?? -10000} max={field.max ?? 100000} step={field.step ?? 'any'} value={Number(current)} onChange={event => { const n=event.target.valueAsNumber; if (Number.isFinite(n)) update(Math.max(field.min ?? -10000,Math.min(field.max ?? 100000, field.step === 1 ? Math.round(n) : n))); }}/> : <input aria-label={label} value={String(current)} maxLength={200} onChange={event => update(event.target.value)}/>}</label>;
    }))}
  </div>;
}
