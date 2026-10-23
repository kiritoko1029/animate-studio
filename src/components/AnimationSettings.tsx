import { t, translateMessage } from '../i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { officialAnimationControls, animationValuesEqual, validateAnimationSetting, type AnimationControl, type AnimationValue, type AnimationSettings as Settings } from '../../shared/animation-settings.mjs';
import { StudioButton } from './StudioUI';
import { Switch } from './animate-ui/components/radix/switch';

const labels: Record<string, string> = {
  factor:'视差强度', starColor:'星星颜色',pointerEvents:'鼠标交互',strokeColor:'线条颜色',numberOfLines:'放射线数量',numberOfDiscs:'圆环数量',hexagonSize:'六边形大小（px）',hexagonMargin:'六边形间距（px）',starsCount:'星星数量',starsSize:'星星大小（px）',starsOpacity:'星星透明度',glowIntensity:'发光强度',glowAnimation:'发光过渡',movementSpeed:'移动速度',mouseInfluence:'鼠标作用范围（px）',mouseGravity:'鼠标引力',gravityStrength:'引力强度',starsInteraction:'星星相互作用',starsInteractionType:'相互作用方式',
  size:'尺寸（px）', from:'进入方向', side:'弹出方向', direction:'方向', showCloseButton:'显示关闭按钮', sideOffset:'距触发器间距（px）', align:'对齐', alignOffset:'对齐偏移（px）', followCursor:'跟随鼠标', checkAnimation:'勾选动画', spacing:'项目间距', orientation:'排列方向', progressBar:'显示倒计时进度', delay:'开始延迟', duration:'时长', writing:'逐字显示', cursor:'显示光标', tapScale:'按下缩放比例', hoverScale:'悬停缩放比例', fillHeight:'液体高度', neon:'霓虹效果', loop:'循环播放', holdDelay:'停留时间', y:'垂直位移（px）', wave:'波浪效果', trigger:'触发方式', type:'拆分单位', animation:'动画样式', stagger:'逐字间隔（秒）', fromNumber:'起始数值', padStart:'补齐位数', decimalSeparator:'小数分隔符', decimalPlaces:'小数位数', thousandSeparator:'千位分隔符', interactive:'鼠标交互', population:'烟花密度', glowColor:'发光颜色', shapeColor:'字符颜色', fontSize:'字符大小（px）', lineColor:'线条颜色', levels:'等高线层数', speed:'运动速度', scale:'缩放比例', peak:'山峰高度', zoomScale:'放大倍数', zoomOnHover:'悬停放大', zoomOnClick:'点击放大', animateOnHover:'悬停高亮', animate:'播放动画', global:'跟随整个页面', initialBlur:'初始模糊（px）', blur:'模糊', initialOpacity:'初始透明度', opacity:'最终透明度', slide:'滑入', fade:'淡入', zoom:'缩放', mode:'高亮范围', exitDelay:'离开延迟', hover:'悬停高亮', onlyOnHover:'仅悬停时生效', strength:'磁吸强度', range:'作用范围（px）', count:'粒子数量', radius:'扩散半径（px）', spread:'扩散角度', shrink:'边缘缩小比例', loopDelay:'循环间隔', deg:'光泽角度', enable:'启用', enableOnHover:'悬停触发', enableOnTap:'点击触发', offset:'滑入距离（px）', maxTilt:'最大倾斜角度', perspective:'透视距离（px）', initialScale:'初始缩放比例', effect:'切换效果', enableCursor:'显示自定义光标', enableCursorFollow:'显示跟随内容',
};
const options: Record<string, string> = {single:'单选',multiple:'多选',null:'不设置',instant:'即时',ease:'缓动',spring:'弹簧',attract:'吸引',repel:'排斥',bounce:'反弹',merge:'合并',top:'上方',bottom:'下方',left:'左侧',right:'右侧',up:'向上',down:'向下',start:'起点',center:'居中',end:'末端',none:'自动',false:'关闭',true:'开启',x:'仅横向',y:'仅纵向','inline-start':'行首','inline-end':'行末',draw:'描画',pop:'弹出',horizontal:'水平',vertical:'垂直',hover:'悬停',click:'点击',chars:'字符',words:'单词',lines:'行',default:'默认',vibe:'跃动',writing:'书写',btt:'自下向上',ttb:'自上向下',ltr:'自左向右',rtl:'自右向左',text:'跟随文字颜色',white:'白色',blue:'蓝色',violet:'紫色',emerald:'绿色',amber:'琥珀色',rose:'玫瑰色',popper:'浮动定位','item-aligned':'对齐选项',children:'子元素',parent:'父容器',fade:'淡入淡出',slide:'滑动',push:'推入',zoom:'缩放',iris:'圆形展开',wipe:'擦除',bands:'条带',stack:'堆叠',flow:'流动',chop:'切片',random:'随机'};

function fieldLabel(group: string, key: string, type: string) {
  if (key === 'type' && ['toggleGroup','accordion'].includes(type)) return t("选择方式");
  if (key === 'type' && group === 'QuestionnaireInput') return t("输入类型");
  if (type === 'starsBackground' && key === 'speed') return t("运动周期（秒）");
  if (type === 'copyButton' && key === 'delay') return t("复制提示保持（毫秒）");
  if (type === 'slidingNumber' && key === 'fromNumber') return t("从零开始");
  const label = t(labels[key] ?? key);
  if (['delay','duration','holdDelay','loopDelay','exitDelay'].includes(key)) return `${t(label)}（${['LiquidButton','ShimmeringText','ParticlesEffect','IconButtonParticles'].includes(group) ? t("秒") : t("毫秒")}）`;
  return label;
}

function StructuredField({ field, name, value, onChange }: { field: AnimationControl; name: string; value: AnimationValue | undefined; onChange: (value: AnimationValue | undefined) => void }) {
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2);
  const previous = useRef(serialized);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState('');
  const id = useId();
  useEffect(() => { if (serialized !== previous.current) { previous.current = serialized; setDraft(serialized); setError(''); } }, [serialized]);
  return <><textarea aria-label={name} aria-invalid={!!error} aria-describedby={error ? id : undefined} rows={5} value={draft} placeholder={JSON.stringify(field.example ?? {}, null, 2)} spellCheck={false} onChange={event => {
    const text = event.target.value;
    setDraft(text);
    try {
      const next = text.trim() ? JSON.parse(text) as AnimationValue : undefined;
      if (next !== undefined) validateAnimationSetting(field, next, name);
      setError(''); previous.current = next === undefined ? '' : JSON.stringify(next, null, 2); onChange(next);
    } catch (error) { setError(error instanceof Error ? error.message : t("请输入有效 JSON")); }
  }}/>{error && <span id={id} role="alert" className="field-error">{translateMessage(error)}{t("；尚未应用")}</span>}</>;
}

function TextSettingField({field,name,value,onChange}:{field:AnimationControl;name:string;value:AnimationValue|undefined;onChange:(value:AnimationValue|undefined)=>void}) {
  const shown=value===undefined?'':String(value)+(typeof value==='number'&&field.kind==='css-time'?'s':typeof value==='number'&&field.kind==='css-length'?'px':'');
  const [draft,setDraft]=useState(shown),[error,setError]=useState('');
  const previous=useRef(shown),id=useId();
  useEffect(()=>{if(shown!==previous.current){previous.current=shown;setDraft(shown);setError('');}},[shown]);
  return <><input aria-label={name} aria-invalid={!!error} aria-describedby={error?id:undefined} placeholder={t("沿用默认")} value={draft} maxLength={field.maxLength??200} onChange={event=>{const text=event.target.value;setDraft(text);try{const next=text===''&&field.value===undefined?undefined:text;if(next!==undefined)validateAnimationSetting(field,next,name);setError('');previous.current=text;onChange(next);}catch(error){setError(error instanceof Error?error.message:t("输入无效"));}}}/>{error&&<span id={id} role="alert" className="field-error">{translateMessage(error)}{t("；尚未应用")}</span>}</>;
}

export function AnimationSettings({ type, value = {}, onChange, extra = false, mixedKeys = [], onFieldChange }: { type: string; value?: Settings; onChange: (value: Settings) => void; extra?: boolean; mixedKeys?: string[]; onFieldChange?: (key: string, value: AnimationValue | undefined) => void }) {
  const [resetVersion, setResetVersion] = useState(0);
  const groups = officialAnimationControls[type]?.groups;
  if (!groups || !Object.values(groups).some(fields => Object.keys(fields).length)) return null;
  function renderField(group:string,key:string,field:AnimationControl) {
      const name = `${group}.${key}`;
      const mixed = mixedKeys.includes(name);
      const current = Object.hasOwn(value, name) ? value[name] : field.value;
      const label = t(field.label ?? (key==='size'&&field.options ? t("尺寸") : field.unit ? `${t(labels[key] ?? key)}（${field.unit}）` : fieldLabel(group, key, type)));
      const update = (next: AnimationValue | undefined) => {
        if (next !== undefined) validateAnimationSetting(field, next, name);
        const settings = { ...value };
        if (next === undefined || animationValuesEqual(next, field.value)) delete settings[name]; else settings[name] = next;
        if (onFieldChange) onFieldChange(name, settings[name]); else onChange(settings);
      };
      const structured = ['spring-options','transition','rgb','json','motion-target','style','element-props','grid-size','frames','motion-element-props','variants'].includes(field.kind ?? '');
      const kind = field.kind ?? typeof field.value;
      return <div className="field property-field" key={`${type}:${name}:${resetVersion}`} data-official-property={name}>
        <label><span className="field-label">{t(label)}{mixed && <small className="batch-mixed">{t("多种值")}</small>}</span>
          {structured ? <StructuredField field={field} name={`${group} · ${t(label)}`} value={mixed ? undefined : current} onChange={update}/> : field.options ? <select aria-label={t(label)} value={mixed ? '__mixed' : JSON.stringify(current) ?? ''} onChange={event => update(event.target.value ? JSON.parse(event.target.value) : undefined)}>{mixed && <option value="__mixed" disabled>{t("多种值")}</option>}{field.value === undefined && <option value="">{t("沿用默认")}</option>}{Object.entries(field.options).map(([label, option]) => <option key={t(label)} value={JSON.stringify(option)}>{t(options[label] ?? label)}</option>)}</select> : kind === 'boolean' ? <span className="studio-switch-field"><Switch aria-label={t(label)} checked={!mixed && Boolean(current)} onCheckedChange={update}/><span>{mixed ? t("多种值") : current ? t("开启") : t("关闭")}</span></span> : kind === 'number' ? <input type="number" aria-label={t(label)} placeholder={mixed ? t("多种值") : t("沿用默认")} min={field.min ?? -10000} max={field.max ?? 100000} step={field.step ?? 'any'} value={mixed || current === undefined ? '' : Number(current)} onChange={event => { const n=event.target.valueAsNumber; if (event.target.value === '' && field.value === undefined) update(undefined); else if (Number.isFinite(n)) update(Math.max(field.min ?? -10000,Math.min(field.max ?? 100000, field.step === 1 ? Math.round(n) : n))); }}/> : <TextSettingField field={field} name={t(label)} value={mixed ? undefined : current} onChange={update}/>}
        </label>
        <span className="field-hint">{name}{field.value === undefined ? t(" · 可选") : ''}</span>
      </div>;
  }
  return <div className="property-section official-motion-settings">
    <h3><Sparkles size={13}/>{extra ? t("附加动效设置") : t("官方属性")}<StudioButton className="text-button" onClick={() => { setResetVersion(n => n + 1); onChange({}); }} aria-label={extra ? t("恢复附加动效默认") : t("恢复官方动效默认")}><RotateCcw size={12}/>{t("恢复默认")}</StudioButton></h3>
    {!extra && <p className="field-hint">{t("默认沿用官方示例。留空的可选属性使用组件默认值；修改后即时生效。")}</p>}
    {Object.entries(groups).map(([group, fields], groupIndex) => {
      const basic=Object.entries(fields).filter(([,field])=>!field.advanced), advanced=Object.entries(fields).filter(([,field])=>field.advanced);
      return <details className="official-property-group" key={group} open={groupIndex === 0}><summary>{group} <small>{Object.keys(fields).length} {t("个属性")}</small></summary>
        {basic.map(([key,field])=>renderField(group,key,field))}
        {advanced.length>0 && (basic.length ? <details className="official-advanced"><summary>{t("更多官方属性（{0}）", { 0: advanced.length })}</summary>{advanced.map(([key,field])=>renderField(group,key,field))}</details> : advanced.map(([key,field])=>renderField(group,key,field)))}
      </details>;
    })}

  </div>;
}
