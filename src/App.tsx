import { Tabs, TabsList, TabsTrigger } from './components/animate-ui/components/radix/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './components/animate-ui/components/radix/dropdown-menu';
import { Switch } from './components/animate-ui/components/radix/switch';
import { Moon, Sun } from 'lucide-react';
import { StudioButton, StudioDialog, StudioTooltip } from './components/StudioUI';
import { catalogEffects } from './lib/catalog-effects';
import { CatalogMiniature } from './components/CatalogBlock';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useSensor, useSensors, pointerWithin, closestCenter, type DragEndEvent, type CollisionDetection } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Code2, Columns2, Copy, Database, Download, ExternalLink, Eye, FilePlus2, GripVertical, Image, Layers, LayoutDashboard, LayoutTemplate, ListCollapse, LoaderCircle, Menu, Monitor, MousePointer2, PanelBottom, PanelLeft, PanelTop, Play, Plus, Redo2, RotateCcw, Search, Settings2, Smartphone, Sparkles, Square, SquareMousePointer, Tag, TextCursorInput, ToggleLeft, Trash2, Type, Undo2, Upload, X, AlertCircle, AlignLeft, AlignCenter, AlignRight, Minus, type LucideIcon } from 'lucide-react';
import { CheckSquare, CircleDot, SlidersHorizontal, UserRound, ChartNoAxesCombined, Table2, ListOrdered, Quote, CreditCard, Ellipsis, Star, Text } from 'lucide-react';
import { applyPageTheme, deleteCustomTheme, getTheme, prepareBlockForPage, saveCustomTheme, type CustomTheme, type ThemeId } from './lib/themes';
import { ThemePicker } from './components/ThemePicker';
import { ThemeDesigner } from './components/ThemeDesigner';
import { LibraryMiniature } from './components/LibraryMiniature';
import { catalog, extendedCatalog, isExtendedComponent, createBlock, createDocument, blockName, defaultFrame, toFreeDocument, type Block, type BlockFrame, type ComponentType, type PageDocument } from './model';
import { PageRenderer } from './components/PageRenderer';
import { FreeCanvas } from './components/FreeCanvas';
import { createAutosave } from './lib/autosave';
import { canvasModifierLabel } from './lib/canvas-shortcuts';
import { placeBlock, insertBlockAfter } from './lib/layout';
import { downloadCode } from './lib/code-export/download';
import type { Format } from './lib/code-export/generate';

import type { InteractionStudioTarget } from './components/InteractionStudio';
import { ComponentInteractions } from './components/InteractionControls';
import { createInteractionDemo } from './lib/interactions/demo';
import './interactions.css';
const InteractionStudio = lazy(() => import('./components/InteractionStudio'));

type View = 'edit' | 'split' | 'preview';
type SaveState = 'loading' | 'pending' | 'saving' | 'saved' | 'error';
const icons: Record<ComponentType, LucideIcon> = { ...Object.fromEntries(Object.entries(extendedCatalog).map(([type, entry]) => [type, entry.group==='动态背景'?Image:entry.group==='文字动效'?Type:entry.group==='浮层'?PanelTop:entry.group==='按钮'?SquareMousePointer:entry.group==='导航'?ListCollapse:Sparkles])) as Record<keyof typeof extendedCatalog, LucideIcon>,navbar:PanelTop,hero:LayoutTemplate,heading:Type,text:AlignLeft,button:SquareMousePointer,card:LayoutDashboard,image:Image,input:TextCursorInput,accordion:ListCollapse,tabs:PanelTop,switch:ToggleLeft,alert:AlertCircle,badge:Tag,separator:Minus,footer:PanelBottom,textarea:Text,select:ChevronDown,checkbox:CheckSquare,radio:CircleDot,slider:SlidersHorizontal,avatar:UserRound,progress:LoaderCircle,statistic:ChartNoAxesCombined,table:Table2,timeline:ListOrdered,testimonial:Quote,pricing:CreditCard,breadcrumb:ChevronRight,pagination:Ellipsis,rating:Star};
const collision: CollisionDetection = args => {
  const viewport = window.document.querySelector('[data-canvas-viewport]')?.getBoundingClientRect();
  const point = args.pointerCoordinates;
  const hits = pointerWithin(args).filter(hit => hit.id !== 'canvas' || !point || !viewport || (point.x >= viewport.left && point.x <= viewport.right && point.y >= viewport.top && point.y <= viewport.bottom));
  if (hits.length) return hits.filter(hit=>hit.id!=='canvas').length ? hits.filter(hit=>hit.id!=='canvas') : hits;
  return args.pointerCoordinates ? [] : closestCenter(args);
};
function clampFrame(frame:BlockFrame,settings:PageDocument['settings']):BlockFrame {
  const width=Math.min(settings.maxWidth,Math.max(40,frame.width));
  const height=Math.min(settings.canvasHeight||1400,3000,Math.max(32,frame.height));
  return {width,height,x:Math.max(0,Math.min(frame.x,settings.maxWidth-width)),y:Math.max(0,Math.min(frame.y,(settings.canvasHeight||1400)-height))};
}

function IconButton({label,children,onClick,disabled=false,active=false,className=''}:{label:string;children:ReactNode;onClick?:()=>void;disabled?:boolean;active?:boolean;className?:string}) {
  return <StudioTooltip label={label}><StudioButton type="button" className={`icon-button ${active?'active':''} ${className}`} aria-label={label} onClick={onClick} disabled={disabled}>{children}</StudioButton></StudioTooltip>;
}
function Brand({small=false}:{small?:boolean}) {return <div className={`brand ${small?'small':''}`}><div className="brand-symbol"><span/><span/><span/></div>{!small&&<span>animate<span className="brand-light"> studio</span></span>}</div>;}

function Miniature({type}:{type:ComponentType}) {
  if(isExtendedComponent(type))return <CatalogMiniature type={type}/>;
  if(type==='button')return <span className="mini-button">Button <ArrowRight size={9}/></span>;
  if(type==='heading')return <span className="mini-heading">Make it <em>move.</em></span>;
  if(type==='text')return <span className="mini-lines"><i/><i/><i/></span>;
  if(type==='switch')return <span className="mini-switch"><i/></span>;
  if(type==='badge')return <span className="mini-badge"><span/> New release</span>;
  if(type==='input')return <span className="mini-input">输入一些内容<span>|</span></span>;
  if(type==='accordion')return <span className="mini-accordion"><i>如何开始？ <Plus size={9}/></i><i>探索更多 <Plus size={9}/></i></span>;
  if(type==='tabs')return <span className="mini-tabs"><b>概览</b><i>详情</i><i>设置</i></span>;
  if(type==='card')return <span className="mini-card"><span/><i/><i/></span>;
  if(type==='navbar')return <span className="mini-nav"><Square size={11} fill="currentColor"/><i/><i/><b/></span>;
  if(type==='hero')return <span className="mini-hero"><i/><strong>Build something.</strong><i/><b/></span>;
  if(type==='image')return <span className="mini-image"><Image size={24} strokeWidth={1.2}/></span>;
  if(type==='separator')return <span className="mini-divider"/>;
  if(type==='footer')return <span className="mini-footer"><span>© Forma</span><i/><i/></span>;
  if(type==='alert')return <span className="mini-alert"><AlertCircle size={12}/><i/></span>;
  return <LibraryMiniature type={type}/>;
}

function PaletteItem({type,onAdd}:{type:ComponentType;onAdd:()=>void}) {
  const {attributes,listeners,setNodeRef,isDragging} = useDraggable({id:`palette:${type}`,data:{type,from:'palette'}});
  const item=catalog.find(c=>c.type===type)!;
  return <StudioButton ref={setNodeRef} className={`palette-card ${isDragging?'dragging':''}`} {...listeners} {...attributes} onClick={onAdd} aria-label={`添加${item.name}`} title={`${item.description} · 拖入画布或点击添加`} data-component={type}>
    <span className="component-mini"><Miniature type={type}/><span className="mini-add"><Plus size={12}/></span></span>
    <span className="component-caption">{item.name}{['button','heading','accordion'].includes(type)&&<span className="animated-dot" title="Animate UI"/>}</span>
  </StudioButton>;
}

function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="field"><span className="field-label">{label}</span>{children}{hint&&<span className="field-hint">{hint}</span>}</label>;}
function ColorField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) {return <Field label={label}><span className="color-field"><input type="color" value={value} onChange={e=>onChange(e.target.value)} aria-label={label}/><span>{value.toUpperCase()}</span></span></Field>;}
function RangeField({label,value,min=0,max=120,onChange}:{label:string;value:number;min?:number;max?:number;onChange:(v:number)=>void}) {return <Field label={label}><span className="range-field"><input aria-label={label} type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)}/><span>{value}<small>px</small></span></span></Field>;}

const itemHints: Partial<Record<ComponentType, string>> = {
  ...Object.fromEntries(Object.entries(extendedCatalog).map(([type, entry]) => [type, 'itemsHint' in entry ? entry.itemsHint : undefined])),
  navbar:'用英文逗号分隔，格式：导航文字 | 链接',
  select:'每行一个选项。', radio:'每行一项，格式：选项名称 | 说明（可选）',
  table:'第一行是表头，其余行是数据；列之间用 | 分隔，列数与表头保持一致。',
  timeline:'每行一项，格式：标题 | 说明 | 时间（可选）',
  pricing:'每行填写一项方案权益。',
  breadcrumb:'每行一级，格式：名称 | 链接；最后一级为当前页面。',
};

function Inspector({document,studioTheme,selected,onUpdate,onFrame,onSettings,onPageTheme,onDesignTheme,onDeleteTheme,onClose,onDelete,onDuplicate,onBlockChange,onOpenStudio}:{document:PageDocument;studioTheme:'light'|'dark';selected:Block|undefined;onUpdate:(props:Partial<Block['props']>)=>void;onFrame:(frame:BlockFrame)=>void;onSettings:(settings:Partial<PageDocument['settings']>)=>void;onPageTheme:(theme:ThemeId)=>void;onDesignTheme:(scope:'component'|'page',theme?:ThemeId)=>void;onDeleteTheme:(theme:ThemeId)=>void;onClose:()=>void;onDelete:()=>void;onDuplicate:()=>void;onBlockChange:(block:Block)=>void;onOpenStudio:(target:InteractionStudioTarget)=>void}) {
  const [tab,setTab]=useState<'component'|'page'|'logic'>('component');
  useEffect(()=>{if(selected)setTab(tab=>tab==='page'?'component':tab);},[selected?.id]);
  const isComponent=(tab==='component'||tab==='logic') && !!selected;
  const p=selected?.props;
  const selectedTheme=getTheme(p?.theme??document.settings.theme,document.settings.customThemes);
  const selectedAccent=p?.accent??(p?.theme?selectedTheme.accent:document.settings.accent);
  const numericMax=selected?.type==='rating'?5:p?.max??(selected?.type==='pagination'?5:100);
  const initialValues: Partial<Record<ComponentType,number>>={slider:60,progress:72,rating:4,pagination:1};
  const numericValue=Math.min(numericMax,p?.value??(selected?initialValues[selected.type]??0:0));
  return <aside className="inspector">
    <div className="inspector-heading"><span><Settings2 size={15}/> 属性面板</span><IconButton label="收起属性面板" onClick={onClose}><X size={15}/></IconButton></div>
    <Tabs value={tab} onValueChange={value=>setTab(value as typeof tab)} className="studio-tab-root"><TabsList className="studio-tabs inspector-tabs" aria-label="属性面板分类"><TabsTrigger value="component" id="inspector-tab-component" aria-controls="inspector-panel">组件属性</TabsTrigger><TabsTrigger value="logic" id="inspector-tab-logic" aria-controls="inspector-panel" disabled={!selected}>组件联动</TabsTrigger><TabsTrigger value="page" id="inspector-tab-page" aria-controls="inspector-panel">页面设置</TabsTrigger></TabsList></Tabs>
    <div className="inspector-scroll" role="tabpanel" id="inspector-panel" aria-labelledby={`inspector-tab-${tab}`}>
      {tab==='logic' && selected ? <ComponentInteractions key={selected.id} block={selected} page={document} onChange={onBlockChange} onOpenStudio={onOpenStudio}/> : isComponent && selected && p ? <>
        <div className="inspected-component"><span className="inspected-icon">{(()=>{const I=icons[selected.type];return <I size={18}/>;})()}</span><span><strong>{blockName(selected.type)}</strong><small>{catalog.find(c=>c.type===selected.type)?.english}</small></span><span className="tiny-badge">已选中</span></div>
        <ThemePicker customThemes={document.settings.customThemes??[]} onDesign={theme=>onDesignTheme('component',theme)} onDelete={onDeleteTheme} scope="component" value={p.theme} pageTheme={document.settings.theme} onChange={theme=>onUpdate({theme,accent:undefined,background:undefined,color:undefined,radius:undefined})}/>
        {selected.frame&&<div className="property-section"><h3>位置与尺寸 <span className="precision-label">PX</span></h3><div className="geometry-fields">{(['x','y','width','height'] as const).map((key,i)=><Field key={key} label={['横坐标 X','纵坐标 Y','宽度 W','高度 H'][i]}><input type="number" aria-label={['横坐标 X','纵坐标 Y','宽度 W','高度 H'][i]} min={key==='width'?40:key==='height'?32:0} max={key==='width'?document.settings.maxWidth:key==='height'?3000:key==='x'?document.settings.maxWidth:document.settings.canvasHeight||1400} value={Math.round(selected.frame![key])} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))onFrame({...selected.frame!,[key]:n});}}/></Field>)}</div><p className="field-hint">拖动组件自由摆放；拖动边框或角点调整大小。按住 Shift 暂停网格吸附。</p></div>}
        <div className="property-section"><h3>内容</h3>
          {p.title!==undefined&&<Field label="标题"><textarea rows={selected.type==='hero'?2:1} aria-label="标题" value={p.title} onChange={e=>onUpdate({title:e.target.value})} maxLength={300}/></Field>}
          {p.label!==undefined&&<Field label={selected.type==='hero'?'顶部标签':'标签文字'}><input aria-label={selected.type==='hero'?'顶部标签':'标签文字'} value={p.label} onChange={e=>onUpdate({label:e.target.value})} maxLength={300}/></Field>}
          {p.text!==undefined&&<Field label={['input','textarea','select'].includes(selected.type)?'占位文字':selected.type==='statistic'?'显示数值':selected.type==='testimonial'?'评价内容':'描述文字'}><textarea rows={3} aria-label={['input','textarea','select'].includes(selected.type)?'占位文字':selected.type==='statistic'?'显示数值':selected.type==='testimonial'?'评价内容':'描述文字'} value={p.text} onChange={e=>onUpdate({text:e.target.value})} maxLength={10000}/></Field>}
          {selected.type==='hero'&&<Field label="按钮文字"><input aria-label="按钮文字" value={p.variant||''} onChange={e=>onUpdate({variant:e.target.value})} maxLength={100}/></Field>}
          {p.url!==undefined&&<Field label="跳转链接" hint="支持 https://、mailto: 或 #锚点"><input aria-label="跳转链接" value={p.url} onChange={e=>onUpdate({url:e.target.value})} placeholder="https://example.com" maxLength={2000}/></Field>}
          {p.imageUrl!==undefined&&<Field label="图片地址"><input aria-label="图片地址" value={p.imageUrl} onChange={e=>onUpdate({imageUrl:e.target.value})} maxLength={2000}/></Field>}
          {p.items!==undefined&&<Field label={selected.type==='navbar'?'导航项目':'内容项目'} hint={itemHints[selected.type] || '每行一项，格式：标题 | 内容'}><textarea rows={7} aria-label="内容项目" value={p.items} onChange={e=>onUpdate({items:e.target.value})} maxLength={10000}/></Field>}
          {selected.type==='pricing'&&<Field label="价格文字"><input aria-label="价格文字" value={p.variant||''} onChange={e=>onUpdate({variant:e.target.value})} maxLength={100}/></Field>}
          {['slider','progress','rating','pagination'].includes(selected.type)&&<>
            <Field label={selected.type==='progress'?'当前进度':selected.type==='pagination'?'初始页码':selected.type==='rating'?'初始评分':'初始数值'} hint={selected.type==='rating'?'0–5 星；预览中可点击或用方向键评分。':undefined}><input type="number" min={selected.type==='pagination'?1:0} max={numericMax} step={1} value={numericValue} onChange={e=>{if(e.target.value==='')return;const value=Math.round(Number(e.target.value));if(Number.isFinite(value))onUpdate({value:Math.min(numericMax,Math.max(selected.type==='pagination'?1:0,value))});}}/></Field>
            {selected.type!=='rating'&&<Field label={selected.type==='pagination'?'总页数':'最大值'} hint="支持 1–100"><input type="number" min={1} max={100} step={1} value={p.max??(selected.type==='pagination'?5:100)} onChange={e=>{if(e.target.value==='')return;const max=Math.max(1,Math.min(100,Math.round(Number(e.target.value))));if(Number.isFinite(max))onUpdate({max,value:Math.min(numericValue,max)});}}/></Field>}
          </>}
          {['checkbox','switch','toggle','collapsible','sidebar'].includes(selected.type)&&<Field label="初始状态"><span className="studio-switch-field"><Switch aria-label="初始状态" checked={!!p.checked} onCheckedChange={checked=>onUpdate({checked})}/><span>{p.checked?'已开启':'已关闭'}</span></span></Field>}
          {['checkbox','radio','select','slider','rating','pagination','textarea'].includes(selected.type)&&<p className="field-hint">在预览中体验交互；预览操作不会改变这里保存的初始配置。</p>}
          {isExtendedComponent(selected.type)&&<><a className="catalog-doc-link" href={extendedCatalog[selected.type].docs} target="_blank" rel="noreferrer">查看官方组件说明 <ExternalLink size={12}/></a>{'variants' in extendedCatalog[selected.type]&&<Field label="展示方式"><select aria-label="展示方式" value={p.variant||''} onChange={e=>onUpdate({variant:e.target.value})}>{(extendedCatalog[selected.type] as {variants:string[][]}).variants.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>}{p.duration!==undefined&&<Field label="动画 / 展示时长（毫秒）"><input aria-label="动画 / 展示时长" type="number" min={100} max={30000} value={p.duration} onChange={e=>{if(e.target.value)onUpdate({duration:Math.max(100,Math.min(30000,Number(e.target.value)||1800))});}}/></Field>}{['countingNumber','scrollingNumber','slidingNumber','githubStars','githubStarsButton'].includes(selected.type)&&<Field label="显示数值"><input aria-label="显示数值" type="number" min={0} max={1000000000} value={p.value??0} onChange={e=>{if(e.target.value)onUpdate({value:Math.max(0,Math.min(1000000000,Number(e.target.value)||0))});}}/></Field>}{selected.type==='inputOtp'&&<Field label="验证码位数"><input aria-label="验证码位数" type="number" min={1} max={12} value={p.max??6} onChange={e=>onUpdate({max:Math.max(1,Math.min(12,Math.round(Number(e.target.value)||6)))})}/></Field>}</>}
          {selected.type==='separator'&&<p className="muted-note">使用分割线，为内容留出呼吸的空间。</p>}
        </div>
        <div className="property-section"><h3>外观</h3>
          {['hero','heading','text','button','badge'].includes(selected.type)&&<Field label="对齐方式"><span className="alignment-control">{(['left','center','right'] as const).map((align,i)=>{const I=[AlignLeft,AlignCenter,AlignRight][i];return <StudioButton type="button" key={align} className={(p.align||'left')===align?'active':''} aria-label={['左对齐','居中','右对齐'][i]} onClick={()=>onUpdate({align})}><I size={16}/></StudioButton>;})}</span></Field>}
          {(['heading','text','statistic','pricing'].includes(selected.type)||isExtendedComponent(selected.type)&&p.fontSize!==undefined)&&<RangeField label="文字大小" value={p.fontSize??(selected.type==='statistic'?36:selected.type==='pricing'?30:16)} min={10} max={96} onChange={fontSize=>onUpdate({fontSize})}/>}
          <RangeField label="内边距" value={p.padding??20} max={120} onChange={padding=>onUpdate({padding})}/>
          {['button','card','image','textarea','select','avatar','statistic','table','testimonial','pricing'].includes(selected.type)&&<RangeField label="圆角" value={p.radius??((p.theme||document.settings.theme)?selectedTheme.radius:12)} max={80} onChange={radius=>onUpdate({radius})}/>}
          {selected.type==='button'&&<Field label="按钮样式"><select aria-label="按钮样式" value={p.variant||'primary'} onChange={e=>onUpdate({variant:e.target.value})}><option value="primary">主要按钮</option><option value="secondary">次要按钮</option><option value="ghost">文字按钮</option></select></Field>}
          <ColorField label="强调颜色" value={selectedAccent} onChange={accent=>onUpdate({accent})}/>
          <div className="color-fields"><ColorField label="背景颜色" value={p.background??((p.theme||document.settings.theme)?(['card','statistic','testimonial','pricing'].includes(selected.type)?selectedTheme.panel:selectedTheme.canvas):'#ffffff')} onChange={background=>onUpdate({background})}/><ColorField label="文字颜色" value={p.color??selectedTheme.text} onChange={color=>onUpdate({color})}/></div>
          {(p.background||p.color||p.accent||p.radius!==undefined)&&<StudioButton className="text-button" onClick={()=>onUpdate({background:undefined,color:undefined,accent:undefined,radius:undefined})}><RotateCcw size={12}/>恢复主题样式</StudioButton>}
        </div>
        <div className="property-section"><h3><Sparkles size={13}/> 入场动效</h3><select aria-label="入场动效" value={p.animation||'none'} onChange={e=>onUpdate({animation:e.target.value as Block['props']['animation']})}><option value="none">无动效</option><option value="fade">轻柔渐入</option><option value="slide">向上浮现</option><option value="scale">弹性缩放</option></select><p className="field-hint">点击预览画布的播放按钮，重播动画。</p><Field label="附加动效"><select aria-label="附加动效" value={p.effect||'none'} onChange={e=>onUpdate({effect:e.target.value as Block['props']['effect']})}>{catalogEffects.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field></div>
      </> : tab==='component'?<div className="inspector-empty"><MousePointer2 size={28}/><h3>选择一个组件</h3><p>点击画布中的组件，<br/>在这里调整它的内容与样式。</p><StudioButton className="secondary-button" onClick={()=>setTab('page')}>调整页面设置</StudioButton></div>:<>
        <div className="page-setting-intro"><span className="inspected-icon"><LayoutTemplate size={20}/></span><h3>让页面拥有自己的风格</h3><p>统一页面风格，也可为组件设置独立主题。</p></div>
        <ThemePicker customThemes={document.settings.customThemes??[]} onDesign={theme=>onDesignTheme('page',theme)} onDelete={onDeleteTheme} scope="page" studioScheme={studioTheme} value={document.settings.theme} onChange={theme=>{if(theme)onPageTheme(theme);}}/>
        <div className="property-section"><h3>自定义配色</h3><ColorField label="主题颜色" value={document.settings.accent} onChange={accent=>onSettings({accent})}/><ColorField label="页面背景" value={document.settings.background} onChange={background=>onSettings({background})}/></div>
        <div className="property-section"><h3>布局</h3><RangeField label="画布宽度" value={document.settings.maxWidth} min={320} max={1600} onChange={maxWidth=>onSettings({maxWidth})}/><Field label="画布高度"><input type="number" aria-label="画布高度" min={320} max={6000} value={document.settings.canvasHeight||1400} onChange={e=>onSettings({canvasHeight:Math.min(6000,Math.max(320,Number(e.target.value)||320))})}/></Field></div>
      </>}
    </div>
    {isComponent&&<div className="inspector-footer"><StudioButton className="secondary-button" onClick={onDuplicate}><Copy size={14}/>复制组件</StudioButton><IconButton label="删除选中组件" className="danger" onClick={onDelete}><Trash2 size={15}/></IconButton></div>}
  </aside>;
}

export default function App() {
  const [document,setDocument]=useState<PageDocument|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [past,setPast]=useState<PageDocument[]>([]);
  const [future,setFuture]=useState<PageDocument[]>([]);
  const [loadError,setLoadError]=useState('');
  const [saveState,setSaveState]=useState<SaveState>('loading');
  const [saveError,setSaveError]=useState('');
  const [savedAt,setSavedAt]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [insertAfterId,setInsertAfterId]=useState<string|null>(null);
  const [group,setGroup]=useState('全部');
  const [sidebarTab,setSidebarTab]=useState<'components'|'layers'>('components');
  const [view,setView]=useState<View>('split');
  const [canvasReveal,setCanvasReveal]=useState(0);
  const [device,setDevice]=useState<'desktop'|'mobile'>('desktop');
  const [inspector,setInspector]=useState(()=>window.innerWidth>1000);
  const [dragging,setDragging]=useState<ComponentType|null>(null);
  const [toast,setToast]=useState('');
  const [replay,setReplay]=useState(0);
  const [fullPreview,setFullPreview]=useState(false);
  const [studioTheme,setStudioTheme]=useState<'light'|'dark'>(()=>{try{return localStorage.getItem('animate-studio:appearance')==='dark'?'dark':'light';}catch{return 'light';}});
  useEffect(()=>{window.document.documentElement.dataset.studioTheme=studioTheme;try{localStorage.setItem('animate-studio:appearance',studioTheme);}catch{/* Appearance is still usable when storage is unavailable. */}},[studioTheme]);
  const [showExport,setShowExport]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [logicTarget,setLogicTarget]=useState<InteractionStudioTarget|null>(null);
  const [showHelp,setShowHelp]=useState(false);
  const [showSidebar,setShowSidebar]=useState(false);
  const [themeDesign,setThemeDesign]=useState<{initial:CustomTheme;editing:boolean;blockId?:string;scopeName:string}|null>(null);
  const current=useRef(document); current.current=document;
  const autosave=useRef<ReturnType<typeof createAutosave<PageDocument>>|null>(null);
  const loadVersion=useRef(0);
  const fileRef=useRef<HTMLInputElement>(null);
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const notify=useCallback((message:string)=>setToast(message),[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t);},[toast]);

  const load=useCallback(async()=>{
    const request=++loadVersion.current;
    setLoadError('');setSaveState('loading');
    try {
      const response=await fetch('/api/page');
      if(!response.ok)throw new Error('暂时无法读取页面，请确认服务正在运行。');
      const data=await response.json();
      if(request!==loadVersion.current)return;
      const next:PageDocument=toFreeDocument(data.page||createDocument());
      autosave.current?.dispose();
      autosave.current=createAutosave<PageDocument>({
        ...(data.page?{initialSaved:data.page}:{}),
        write:async page=>{
          const response=await fetch('/api/page',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({page})});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||'保存失败，请重试。');
          setSavedAt(data.savedAt);
        },
        onState:(state,error)=>{setSaveState(state);setSaveError(error instanceof Error?error.message:'');},
      });
      setDocument(next);setSavedAt(data.savedAt);setSelected(next.blocks.find(b=>b.type==='hero')?.id||null);
      setSaveState(data.page?'saved':'pending');
    } catch(error){if(request===loadVersion.current)setLoadError(error instanceof Error?error.message:'读取失败');}
  },[]);
  useEffect(()=>{void load();return()=>{loadVersion.current++;autosave.current?.dispose();};},[load]);

  const save=useCallback((page:PageDocument)=>{
    autosave.current?.schedule(page);
    return autosave.current?.flush();
  },[]);
  useEffect(()=>{
    if(!document)return;
    autosave.current?.schedule(document);
  },[document]);
  useEffect(()=>{
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(autosave.current?.isDirty()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);
  },[]);

  const update=useCallback((next:PageDocument)=>{
    const previous=current.current;if(!previous||JSON.stringify(previous)===JSON.stringify(next))return;
    setPast(history=>[...history.slice(-79),previous]);setFuture([]);setDocument(next);current.current=next;
  },[]);
  const undo=useCallback(()=>{if(!past.length||!current.current)return;const previous=past[past.length-1];const outgoing=current.current;setFuture(items=>[outgoing,...items]);setPast(items=>items.slice(0,-1));setDocument(previous);current.current=previous;},[past]);
  const redo=useCallback(()=>{if(!future.length||!current.current)return;const next=future[0];const outgoing=current.current;setPast(items=>[...items,outgoing]);setFuture(items=>items.slice(1));setDocument(next);current.current=next;},[future]);
  const remove=useCallback((id:string)=>{if(!current.current)return;update({...current.current,blocks:current.current.blocks.filter(b=>b.id!==id)});setSelected(null);notify('组件已删除，可通过撤销恢复');},[update,notify]);
  const duplicate=useCallback((id:string)=>{const doc=current.current;if(!doc)return;if(doc.blocks.length>=200){notify('每个页面最多支持 200 个组件');return;}const index=doc.blocks.findIndex(b=>b.id===id);if(index<0)return;const original=doc.blocks[index];const block={...structuredClone(original),id:crypto.randomUUID(),props:{...original.props},...(original.frame?{frame:clampFrame({...original.frame,x:original.frame.x+24,y:original.frame.y+24},doc.settings)}:{})};const blocks=[...doc.blocks];blocks.splice(index+1,0,block);update({...doc,blocks});setSelected(block.id);notify('已复制组件');},[update,notify]);
  const add=useCallback((type:ComponentType,_index?:number,position?:{x:number;y:number})=>{
    const doc=current.current;if(!doc)return;
    if(doc.blocks.length>=200){notify('每个页面最多支持 200 个组件');return;}
    try {
      const candidate=prepareBlockForPage(createBlock(type),doc.settings);
      const result=insertAfterId?insertBlockAfter(doc,candidate,insertAfterId):placeBlock(doc,candidate,position);
      update(result.page);setSelected(result.block.id);setInspector(true);setView(v=>v==='preview'?'split':v);setShowSidebar(false);setInsertAfterId(null);
      notify(insertAfterId?'已插入组件，后续内容已整体下移':result.expanded?'已添加组件并扩展画布，已有组件位置保持不变':`已将${blockName(type)}放入空白区域`);
      requestAnimationFrame(()=>window.document.querySelector(`[data-block-id="${result.block.id}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'}));
    } catch(error){notify(error instanceof Error?error.message:'暂时无法放置组件');}
  },[update,notify,insertAfterId]);
  function startInsert(id:string){setInsertAfterId(id);setSidebarTab('components');setShowSidebar(true);setQuery('');setGroup('全部');notify('选择左侧组件，将自动插入选中组件下方');}
  const move=useCallback((id:string,direction:number)=>{const doc=current.current;if(!doc)return;const from=doc.blocks.findIndex(b=>b.id===id);const to=from+direction;if(from<0||to<0||to>=doc.blocks.length)return;update({...doc,blocks:arrayMove(doc.blocks,from,to)});},[update]);

  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{
      if(e.defaultPrevented)return;
      if(window.document.querySelector('dialog[open], [data-slot=dialog-content], [role=menu]'))return;
      if(e.key==='Escape'){setFullPreview(false);setShowHelp(false);setShowExport(false);setShowNew(false);setShowSidebar(false);return;}
      const target=e.target as HTMLElement;const typing=['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(current.current)void save(current.current);return;}
      if(typing||fullPreview||showHelp)return;
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'&&selected){e.preventDefault();duplicate(selected);}
      if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();remove(selected);}
    };
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[undo,redo,selected,remove,duplicate,save,fullPreview,showHelp]);

  function updateFrame(id:string,frame:BlockFrame) {
    const doc=current.current;if(!doc)return;
    update({...doc,blocks:doc.blocks.map(block=>block.id===id?{...block,frame:clampFrame(frame,doc.settings)}:block)});
  }
  function onDragEnd(event:DragEndEvent) {
    setDragging(null);const doc=current.current;if(!doc||!event.over)return;
    const {active,over}=event;
    if(active.data.current?.from==='palette'){
      const type=active.data.current.type as ComponentType;
      const stage=window.document.querySelector<HTMLElement>('[data-free-stage]');
      const translated=active.rect.current.translated;
      if(stage&&translated){const rect=stage.getBoundingClientRect();const scale=Number(stage.dataset.scale)||1;const frame=defaultFrame(type,doc.settings.maxWidth);add(type,undefined,{x:(translated.left+translated.width/2-rect.left)/scale-frame.width/2,y:(translated.top+translated.height/2-rect.top)/scale-24});}
      else add(type);
    } else {
      const from=doc.blocks.findIndex(b=>b.id===active.id);const to=over.id==='canvas'?doc.blocks.length-1:doc.blocks.findIndex(b=>b.id===over.id);
      if(from>=0&&to>=0&&from!==to){update({...doc,blocks:arrayMove(doc.blocks,from,to)});notify('组件顺序已更新');}
    }
  }
  function download() {
    if(!document)return;const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));
    const link=window.document.createElement('a');link.href=url;link.download=`${document.name.replace(/[\\/:*?"<>|]/g,'-')||'page'}.json`;link.click();URL.revokeObjectURL(url);setShowExport(false);notify('页面配置已导出');
  }
  function exportCode(format: Format) {
    if (!document) return;
    try {
      downloadCode(document, format);
      setShowExport(false);
      notify(`${{ html: 'HTML 页面', vue: 'Vue 组件', react: 'React 组件' }[format]}已导出`);
    } catch {
      notify('代码导出失败，请重试');
    }
  }
  async function importFile(file?:File) {
    if(!file)return;
    try {
      if(file.size>500*1024)throw new Error('文件不能超过 500 KB');
      const page=JSON.parse(await file.text());
      const response=await fetch('/api/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'页面格式不正确');
      update(toFreeDocument(data.page));setSelected(null);setInsertAfterId(null);notify(`已导入「${data.page.name}」`);
    } catch(error){notify(`导入失败：${error instanceof Error?error.message:'文件格式不正确'}`);}
    if(fileRef.current)fileRef.current.value='';
  }

  function loadInteractionDemo() { const next=createInteractionDemo(); next.settings.customThemes=document?.settings.customThemes; update(next); setSelected(next.blocks.find(b=>b.type==='input')?.id||null); setInsertAfterId(null); setShowNew(false); notify('已载入联动示例，可通过撤销恢复原页面'); }

  function openThemeDesigner(scope:'component'|'page', id?:ThemeId) {
    const doc=current.current;if(!doc)return;
    const block=scope==='component'?doc.blocks.find(item=>item.id===selected):undefined;
    const source=getTheme(id??block?.props.theme??doc.settings.theme,doc.settings.customThemes);
    const initial:CustomTheme={...source,id:id?.startsWith('custom-')?id as CustomTheme['id']:`custom-${crypto.randomUUID()}`};
    if(!id){
      let name='我的主题',index=2;while(doc.settings.customThemes?.some(theme=>theme.name===name))name=`我的主题 ${index++}`;
      initial.name=name;
      initial.accent=block?.props.accent??(block?.props.theme?source.accent:doc.settings.accent);
      initial.canvas=block?.props.theme?source.canvas:doc.settings.background;
      if(block?.props.background)initial.panel=block.props.background;
      if(block?.props.color)initial.text=block.props.color;
      if(block?.props.radius!==undefined)initial.radius=block.props.radius;
    }
    setThemeDesign({initial,editing:!!id,blockId:block?.id,scopeName:block?`「${blockName(block.type)}」组件`:'页面'});
  }

  if(!document)return <div className="loading-screen"><Brand/>{loadError?<><AlertCircle size={28}/><p>{loadError}</p><StudioButton className="primary-button" onClick={()=>void load()}>重新读取</StudioButton></>:<><LoaderCircle className="spin" size={24}/><p>正在打开你的创作空间…</p></>}</div>;
  const selectedBlock=document.blocks.find(b=>b.id===selected);
  const filtered=catalog.filter(c=>(group==='全部'||c.group===group)&&`${c.name} ${c.english} ${c.description}`.toLowerCase().includes(query.toLowerCase()));
  const saveText=saveState==='saved'?'已保存':saveState==='saving'?'保存中':saveState==='error'?'保存失败':'待保存';
  return <div className="studio-app">
    <header className="app-header">
      <div className="header-brand"><IconButton label="打开组件与页面工具" className="mobile-menu" onClick={()=>setShowSidebar(!showSidebar)}><Menu size={18}/></IconButton><Brand/><span className="beta-label">BETA</span></div>
      <div className="document-heading"><span className="header-slash">/</span><input aria-label="页面名称" value={document.name} onChange={e=>update({...document,name:e.target.value})} maxLength={100}/><span className={`save-status ${saveState}`} title={saveState==='error'?saveError:savedAt?`保存于 ${new Date(savedAt).toLocaleTimeString('zh-CN')}`:'自动保存到服务'}>{saveState==='saved'?<CheckCircle2 size={13}/>:saveState==='saving'?<LoaderCircle size={13} className="spin"/>:saveState==='error'?<AlertCircle size={13}/>:<span className="pending-dot"/>}{saveText}</span>{saveState==='error'&&<StudioButton className="retry-save" onClick={()=>void save(document)}>重试</StudioButton>}</div>
      <div className="header-actions"><IconButton label={studioTheme==='light'?'切换工作台深色主题':'切换工作台浅色主题'} onClick={()=>setStudioTheme(value=>value==='light'?'dark':'light')}>{studioTheme==='light'?<Moon size={16}/>:<Sun size={16}/>}</IconButton><div className="history-controls"><IconButton label="撤销 (⌘Z)" onClick={undo} disabled={!past.length}><Undo2 size={16}/></IconButton><IconButton label="重做 (⌘⇧Z)" onClick={redo} disabled={!future.length}><Redo2 size={16}/></IconButton></div><span className="header-divider"/>
        <DropdownMenu open={showExport} onOpenChange={setShowExport}><DropdownMenuTrigger asChild><StudioButton className="secondary-button export-button"><Download size={14}/>导出<ChevronDown size={12}/></StudioButton></DropdownMenuTrigger><DropdownMenuContent className="studio-menu export-menu" align="end" sideOffset={8}>
          <DropdownMenuItem onSelect={()=>exportCode('html')}><Code2 size={15}/><span>导出 HTML<small>单文件页面 · 浏览器直接打开</small></span></DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>exportCode('vue')}><Code2 size={15}/><span>导出 Vue<small>Vue 3.5+ · 无额外 UI 依赖</small></span></DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>exportCode('react')}><Code2 size={15}/><span>导出 React<small>React 18+ · 无额外 UI 依赖</small></span></DropdownMenuItem>
          <DropdownMenuSeparator/>
          <DropdownMenuItem onSelect={download}><Download size={15}/><span>导出页面 JSON<small>保存可再次编辑的页面配置</small></span></DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>{fileRef.current?.click();setShowExport(false);}}><Upload size={15}/><span>导入页面 JSON<small>载入已有页面配置</small></span></DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <StudioButton className="primary-button preview-button" onClick={()=>setFullPreview(true)}><Play size={13} fill="currentColor"/>预览页面</StudioButton><div className="user-avatar" title="创作空间">C</div>
      </div>
    </header>
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={event=>setDragging((event.active.data.current?.type||document.blocks.find(b=>b.id===event.active.id)?.type) as ComponentType)} onDragEnd={onDragEnd} onDragCancel={()=>setDragging(null)}>
      <div className={`studio-body ${inspector?'with-inspector':''}`}>
        {showSidebar&&<div className="sidebar-backdrop" onClick={()=>setShowSidebar(false)}/>}
        <aside className={`component-sidebar ${showSidebar?'shown':''}`}>
          <nav className="sidebar-page-tools" aria-label="数据与脚本">
            <StudioButton aria-haspopup="dialog" onClick={()=>setLogicTarget({tab:'data'})}><Database size={15}/><span>页面数据</span><small>{document.variables?.length??0}</small></StudioButton>
            <StudioButton aria-haspopup="dialog" onClick={()=>setLogicTarget({tab:'scripts'})}><Code2 size={15}/><span>脚本</span><small>{document.scripts?.length??0}</small></StudioButton>
          </nav>
          <Tabs value={sidebarTab} onValueChange={value=>setSidebarTab(value as typeof sidebarTab)} className="studio-tab-root"><TabsList className="studio-tabs sidebar-tabs" aria-label="组件与图层"><TabsTrigger value="components" id="sidebar-tab-components" aria-controls="sidebar-panel"><LayoutDashboard size={15}/>组件</TabsTrigger><TabsTrigger value="layers" id="sidebar-tab-layers" aria-controls="sidebar-panel"><Layers size={15}/>图层<span>{document.blocks.length}</span></TabsTrigger></TabsList></Tabs>
          <div className="sidebar-content" role="tabpanel" id="sidebar-panel" aria-labelledby={`sidebar-tab-${sidebarTab}`}>{sidebarTab==='components'?<>
            <div className="library-intro"><div><h2>组件库</h2><span>{catalog.length}</span></div></div>
            <div className="search-box"><Search size={14}/><input aria-label="搜索组件" placeholder="搜索组件…" value={query} onChange={e=>setQuery(e.target.value)}/>{query?<StudioButton onClick={()=>setQuery('')} aria-label="清除搜索"><X size={12}/></StudioButton>:<span>⌕</span>}</div>
            <div className="category-filter">{['全部',...new Set(catalog.map(item=>item.group))].map(g=><StudioButton key={g} className={group===g?'active':''} onClick={()=>setGroup(g)}>{g}</StudioButton>)}</div>
            <div className="library-scroll">{insertAfterId&&<div className="insert-notice"><span>选择组件，插入选中项之后</span><StudioButton aria-label="取消插入" onClick={()=>setInsertAfterId(null)}><X size={13}/></StudioButton></div>}<div className="library-section-heading"><span>{group==='全部'?'所有组件':`${group}组件`}</span><span>{filtered.length}</span></div><div className="component-grid">{filtered.map(c=><PaletteItem key={c.type} type={c.type} onAdd={()=>add(c.type)}/>)}</div>{!filtered.length&&<div className="search-empty"><Search size={23}/><p>没有找到相关组件</p><StudioButton className="text-button" onClick={()=>{setQuery('');setGroup('全部');}}>查看所有组件</StudioButton></div>}</div>
          </>:<div className="layer-list"><div className="layer-heading"><span><LayoutTemplate size={14}/> 首页</span><small>{document.blocks.length} 个组件</small></div>{document.blocks.map((block,index)=>{const I=icons[block.type];return <div key={block.id} className={`layer-item ${selected===block.id?'selected':''}`}><StudioButton onClick={()=>{setSelected(block.id);setCanvasReveal(n=>n+1);setInspector(true);setView(v=>v==='preview'?'split':v);}}><I size={15}/><span>{block.props.title||block.props.label||blockName(block.type)}</span></StudioButton><span className="layer-order">{index+1}</span><div className="layer-actions"><IconButton label={`上移${blockName(block.type)}`} disabled={index===0} onClick={()=>move(block.id,-1)}><ArrowUp size={12}/></IconButton><IconButton label={`下移${blockName(block.type)}`} disabled={index===document.blocks.length-1} onClick={()=>move(block.id,1)}><ArrowDown size={12}/></IconButton></div></div>;})}{!document.blocks.length&&<p className="muted-note">添加组件后，图层会出现在这里。</p>}</div>}
          </div><div className="sidebar-bottom"><DropdownMenu open={showNew} onOpenChange={setShowNew}><DropdownMenuTrigger asChild><StudioButton className="new-page-button"><Plus size={15}/><span>新建页面</span><ChevronDown size={12}/></StudioButton></DropdownMenuTrigger><DropdownMenuContent className="studio-menu new-page-menu" side="top" align="start" sideOffset={8}><DropdownMenuItem onSelect={()=>{const next=createDocument(true);next.settings.customThemes=document.settings.customThemes;update(next);setSelected(null);setInsertAfterId(null);setShowNew(false);notify('已新建空白页面，可撤销恢复');}}><FilePlus2 size={15}/>空白页面</DropdownMenuItem><DropdownMenuItem onSelect={()=>{const next=createDocument();next.settings.customThemes=document.settings.customThemes;update(next);setSelected(next.blocks[1].id);setInsertAfterId(null);setShowNew(false);notify('已载入灵感模板，可撤销恢复');}}><LayoutTemplate size={15}/>从灵感模板开始</DropdownMenuItem><DropdownMenuItem onSelect={loadInteractionDemo}><Code2 size={15}/>组件联动示例</DropdownMenuItem></DropdownMenuContent></DropdownMenu><a className="animate-credit" href="https://animate-ui.com/docs" target="_blank" rel="noreferrer"><span className="animate-mark">a.</span><span>由 Animate UI 驱动</span><ExternalLink size={11}/></a></div>
        </aside>
        <main className="workspace">
          <div className="workspace-toolbar"><div className="workspace-breadcrumb"><LayoutTemplate size={14}/><span>首页</span><ChevronRight size={12}/><strong>页面编辑器</strong></div><div className="toolbar-end"><Tabs value={view} onValueChange={value=>setView(value as View)} className="studio-tab-root"><TabsList className="studio-tabs view-switch" aria-label="画布视图">{([{id:'edit',name:'编辑',icon:MousePointer2},{id:'split',name:'并排',icon:Columns2},{id:'preview',name:'预览',icon:Eye}] as const).map(v=><TabsTrigger key={v.id} value={v.id} id={`view-tab-${v.id}`} aria-controls="workspace-canvas-panel" aria-label={`${v.name}模式`}><v.icon size={13}/>{v.name}</TabsTrigger>)}</TabsList></Tabs><span className="toolbar-separator"/><div className="device-toggle"><IconButton label="桌面视图" active={device==='desktop'} onClick={()=>setDevice('desktop')}><Monitor size={16}/></IconButton><IconButton label="手机视图" active={device==='mobile'} onClick={()=>setDevice('mobile')}><Smartphone size={16}/></IconButton></div><span className="toolbar-separator"/><IconButton label="切换属性面板" active={inspector} onClick={()=>setInspector(!inspector)}><Settings2 size={16}/></IconButton></div></div>
          {saveState==='error'&&<div className="save-error-banner" role="alert"><AlertCircle size={14}/><span>{saveError}，修改仍保留在画布中。</span><StudioButton onClick={()=>void save(document)}>重新保存</StudioButton></div>}
          <div className={`canvas-workspace view-${view}`} role="tabpanel" id="workspace-canvas-panel" aria-labelledby={`view-tab-${view}`}>
            {view!=='preview'&&<section className="canvas-pane edit-pane"><div className="pane-heading"><span><MousePointer2 size={13}/><strong>编辑画布</strong><span className="pane-tag">可编辑</span></span><span className="pane-hint">自由摆放 · 网格吸附</span></div><FreeCanvas revealKey={canvasReveal} document={document} selected={selected} onSelect={setSelected} onFrameChange={updateFrame} onDelete={remove} onDuplicate={duplicate} onInsertAfter={startInsert} isDragging={!!dragging} device={device}/></section>}
            {view!=='edit'&&<section className="canvas-pane preview-pane"><div className="pane-heading"><span><Eye size={14}/><strong>实时预览</strong><span className="live-indicator"/> </span><IconButton label="重播动画" onClick={()=>setReplay(n=>n+1)}><Play size={12}/></IconButton></div><div className={`preview-scroll ${device==='mobile'?'mobile':''}`}><div className="preview-browser" style={{maxWidth:device==='mobile'?375:document.settings.maxWidth}}><div className="browser-bar"><div className="browser-dots"><i/><i/><i/></div><span><span className="lock-icon">⌑</span> {document.name||'未命名页面'}</span><RotateCcw size={10}/></div><PageRenderer document={document} replayKey={replay}/></div><div className="preview-footnote"><span className="live-indicator"/>与编辑画布实时同步</div></div></section>}
          </div>
          <footer className="workspace-status"><span><span className="connection-dot"/>创作空间<span className="status-separator">/</span>{document.blocks.length} 个组件</span><span><kbd>⌘ Z</kbd> 撤销<StudioButton onClick={()=>setShowHelp(true)}><CircleHelp size={13}/>快捷键与帮助</StudioButton></span></footer>
        </main>
        {inspector&&<Inspector studioTheme={studioTheme} onOpenStudio={setLogicTarget} onBlockChange={block=>update({...document,blocks:document.blocks.map(b=>b.id===block.id?block:b)})} document={document} selected={selectedBlock} onDesignTheme={openThemeDesigner} onDeleteTheme={theme=>{update(deleteCustomTheme(document,theme));notify('主题已删除，相关组件已恢复继承，可撤销');}} onPageTheme={theme=>{update(applyPageTheme(document,theme));notify(`已应用${getTheme(theme,document.settings.customThemes).name}`);}} onUpdate={props=>{if(!selectedBlock)return;update({...document,blocks:document.blocks.map(b=>b.id===selectedBlock.id?{...b,props:{...b.props,...props}}:b)});}} onFrame={frame=>selected&&updateFrame(selected,frame)} onSettings={settings=>{const next={...document.settings,...settings};update({...document,settings:next,blocks:document.blocks.map(block=>block.frame?{...block,frame:clampFrame(block.frame,next)}:block)});}} onClose={()=>setInspector(false)} onDelete={()=>selected&&remove(selected)} onDuplicate={()=>selected&&duplicate(selected)}/>}
      </div>
      <DragOverlay dropAnimation={{duration:180,easing:'ease-out'}}>{dragging&&<div className="drag-overlay"><Miniature type={dragging}/><span>{blockName(dragging)}</span></div>}</DragOverlay>
    </DndContext>
    {logicTarget&&<Suspense fallback={null}><InteractionStudio initialTarget={logicTarget} page={document} onChange={update} onClose={()=>setLogicTarget(null)} onDemo={loadInteractionDemo}/></Suspense>}
    {themeDesign&&<ThemeDesigner initial={themeDesign.initial} editing={themeDesign.editing} scopeName={themeDesign.scopeName} existingNames={(document.settings.customThemes??[]).map(theme=>theme.name)} canCreate={(document.settings.customThemes?.length??0)<30} usageCount={(document.settings.theme===themeDesign.initial.id?1:0)+document.blocks.filter(block=>block.props.theme===themeDesign.initial.id).length} onClose={()=>setThemeDesign(null)} onSave={theme=>{update(saveCustomTheme(document,theme,themeDesign.blockId));setThemeDesign(null);notify(`已应用「${theme.name}」，正在自动保存`);}}/>}
    <input type="file" accept=".json,application/json" ref={fileRef} hidden onChange={e=>void importFile(e.target.files?.[0])}/>
    <AnimatePresence>{toast&&<motion.div className="toast" role="status" initial={{opacity:0,y:12,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:8}}><CheckCircle2 size={16}/>{toast}<StudioButton aria-label="关闭提示" onClick={()=>setToast('')}><X size={13}/></StudioButton></motion.div>}</AnimatePresence>
    {fullPreview&&<StudioDialog title="页面预览" className="full-preview" onClose={()=>setFullPreview(false)}><header><StudioButton className="secondary-button" autoFocus onClick={()=>setFullPreview(false)}><ArrowLeft size={14}/>返回编辑</StudioButton><span>{document.name}</span><div><IconButton label="桌面预览" active={device==='desktop'} onClick={()=>setDevice('desktop')}><Monitor size={17}/></IconButton><IconButton label="手机预览" active={device==='mobile'} onClick={()=>setDevice('mobile')}><Smartphone size={17}/></IconButton><IconButton label="重播页面动画" onClick={()=>setReplay(n=>n+1)}><RotateCcw size={16}/></IconButton></div></header><div className={`full-preview-scroll ${device}`}><div className="full-preview-page" style={{maxWidth:device==='mobile'?375:document.settings.maxWidth}}><PageRenderer document={document} replayKey={replay}/></div></div></StudioDialog>}
    {showHelp&&<StudioDialog title="快捷键与帮助" className="help-dialog" onClose={()=>setShowHelp(false)}><div className="modal-heading"><h2>让创作更顺手</h2><IconButton label="关闭帮助" onClick={()=>setShowHelp(false)}><X size={18}/></IconButton></div><p>拖入组件 → 拖动位置与大小 → 查看预览。修改会自动保存。</p><div className="shortcut-list">{[['撤销','⌘ / Ctrl + Z'],['重做','⌘ / Ctrl + Shift + Z'],['复制选中组件','⌘ / Ctrl + D'],['删除选中组件','Delete / Backspace'],['立即保存','⌘ / Ctrl + S'],['缩放画布',`${canvasModifierLabel} + 滚轮 / + / −`],['平移画布','空格 + 拖动 / 中键'],['适应画布',`${canvasModifierLabel} + 0`],['恢复 100%',`${canvasModifierLabel} + 1`],['关闭预览与弹窗','Esc']].map(([name,key])=><div key={name}><span>{name}</span><kbd>{key}</kbd></div>)}</div><p className="help-note">拖动八个控制点调整大小，按住 Shift 暂停网格吸附。点击添加会自动寻找空白区域；选中组件工具栏的加号可在其后插入，并整体下移后续内容。方向键微调位置，Shift + 方向键移动 8px。</p><a href="https://animate-ui.com/docs" target="_blank" rel="noreferrer">查看 Animate UI 文档 <ExternalLink size={13}/></a></StudioDialog>}
  </div>;
}
