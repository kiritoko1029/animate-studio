import type { AiChange } from './lib/ai/types';
import { blockName, blockLabel } from './i18n/catalog';
import { t, translateMessage, getLocale } from './i18n';
import { useLocale } from './i18n/react';
import { version as appVersion } from '../package.json';
import { Brand } from './components/Brand';
import { AnimationSettings } from './components/AnimationSettings';
import { InspectorDisclosure, InspectorDisclosureProvider, InspectorSettingsSearch, revealInspectorAdvanced, useInspectorDisclosure } from './components/InspectorSettings';
import { ComponentScaleControls } from './components/ComponentScaleControls';
import { BatchInspector } from './components/BatchInspector';
import { duplicateSelection, patchSelection, replaceSelectedBlocks, selectComponentIds, themeSelection } from './lib/component-selection';
import { Tabs, TabsList, TabsTrigger } from './components/animate-ui/components/radix/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from './components/animate-ui/components/radix/dropdown-menu';
import { Switch } from './components/animate-ui/components/radix/switch';
import { StudioButton, StudioDialog, StudioTooltip } from './components/StudioUI';
import { catalogEffects } from './lib/catalog-effects';
import { CatalogMiniature } from './components/CatalogBlock';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useSensor, useSensors, pointerWithin, closestCenter, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type CollisionDetection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Code2, Columns2, Copy, Braces, Download, ExternalLink, Eye, FilePlus2, GripVertical, Image, Layers, LayoutDashboard, LayoutTemplate, ListCollapse, LoaderCircle, Menu, Monitor, MousePointer2, PanelBottom, PanelLeft, PanelTop, Play, Plus, Redo2, RotateCcw, Search, Settings2, Smartphone, Sparkles, Square, SquareMousePointer, Tag, TextCursorInput, ToggleLeft, Trash2, Type, Undo2, Upload, X, AlertCircle, AlignLeft, AlignCenter, AlignRight, Minus, type LucideIcon } from 'lucide-react';
import { CheckSquare, CircleDot, SlidersHorizontal, UserRound, ChartNoAxesCombined, Table2, ListOrdered, Quote, CreditCard, Ellipsis, Star, Text, Puzzle } from 'lucide-react';
import { applyPageTheme, deleteCustomTheme, getTheme, prepareBlockForPage, saveCustomTheme, type CustomTheme, type ThemeId } from './lib/themes';
import { ThemePicker } from './components/ThemePicker';
import navbarIcons from '../shared/navbar-icons.json';
import { ThemeDesigner } from './components/ThemeDesigner';
import { LibraryMiniature } from './components/LibraryMiniature';
import { catalog, extendedCatalog, isExtendedComponent, createBlock, createDocument, defaultFrame, toFreeDocument, type Block, type BlockFrame, type BuiltinComponentType, type ComponentType, type PageDocument, type StudioDocument, type SiteDocument } from './model';
import { toSiteDocument, matchSiteRoute } from '../shared/site-document.mjs';
import { SiteNavigationContext, type SiteNavigation } from './lib/site-navigation';
import { useStudioSite } from './lib/use-studio-site';
import { SiteNavigator } from './components/SiteNavigator';
import { parseStudioDocument } from './lib/studio-document';
import './site-navigator.css';
import { SitePreview } from './components/SitePreview';
import { DataRuntimeProvider } from './components/data/DataRuntime';
import { BlockDataSettings } from './components/BlockDataSettings';
import { PageCreationDialog } from './components/PageCreationDialog';
import { createTaskSiteDocument } from './lib/page-templates';
import { configureChartFilter } from './lib/data/filter';
import { FreeCanvas } from './components/FreeCanvas';
import { CanvasSizeControls, DimensionField } from './components/CanvasSizeControls';
import { alignFrame, canvasBounds, clampFrame, frameSizeLimits, type HorizontalAlignment } from './lib/canvas-bounds';
import { ResizableStudioLayout } from './components/ResizableStudioLayout';
import { PaletteDragPreview } from './components/PaletteDragPreview';
import { canvasDropPosition, paletteDropPointer, pointInViewport } from './lib/palette-drag';
import { moveBlockLayer, type LayerAction } from './lib/layers';
import type { InspectorTab } from './components/CanvasComponentMenu';
import type { PageSettingsSection } from './components/CanvasPageMenu';
import { ComponentVariableDialog } from './components/ComponentVariableDialog';
import { createComponentVariable } from './lib/interactions/component-variable';
import { createAutosave } from './lib/autosave';
import { canvasModifierLabel } from './lib/canvas-shortcuts';
import { fetchPageApi } from './lib/page-api';
import { readGuestDraft, writeGuestDraft, type DraftRecord } from './lib/guest-draft';
import { accountApi, cloudPagePath, cloudSitePath, type CloudPageRecord, type Preferences } from './lib/account-api';
import { inspectorDisclosureStorageKey, validateInspectorDisclosures, type InspectorDisclosurePreferences, type WorkbenchPreferencesPatch } from './lib/workbench-preferences';
import { useAccount } from './components/AccountProvider';
import { AccountControls, LoginDialog } from './components/AccountControls';
import { placeBlock, insertBlockAfter, fillBlockWidth, type PlacementResult } from './lib/layout';
import { downloadCode } from './lib/code-export/download';
import type { Format } from './lib/code-export/generate';

import type { InteractionStudioTarget } from './components/InteractionStudio';
import { ComponentInteractions } from './components/InteractionControls';
import { createInteractionDemo } from './lib/interactions/demo';
import './interactions.css';
import { createCustomBlock, resetCustomInstance } from './lib/custom-components/instances';
import { customComponentLimits, type CustomComponentDefinition, type CustomComponentSource } from '../shared/custom-components.mjs';
import { CustomComponentLibrary } from './components/custom/CustomComponentLibrary';
import { CustomBlockInspector } from './components/custom/CustomBlockInspector';
import { CustomLibraryContext, useCustomLibrary } from './components/custom/useCustomLibrary';
import type { DesignerRequest } from './components/custom/ComponentDesigner';
const AiAssistant = lazy(() => import('./components/ai/AiStudio').then(module => ({ default: module.AiStudio })));
const AiSiteStudio = lazy(() => import('./components/ai/AiSiteStudio').then(module => ({ default: module.AiSiteStudio })));
const InteractionStudio = lazy(() => import('./components/InteractionStudio'));
const ComponentDesigner = lazy(() => import('./components/custom/ComponentDesigner'));
const customGroup = '我的组件';

type View = 'edit' | 'split' | 'preview';
type SaveState = 'loading' | 'pending' | 'saving' | 'saved' | 'error';
const icons: Record<ComponentType, LucideIcon> = { ...Object.fromEntries(Object.entries(extendedCatalog).map(([type, entry]) => [type, entry.group==='动态背景'?Image:entry.group==='文字动效'?Type:entry.group==='浮层'?PanelTop:entry.group==='按钮'?SquareMousePointer:entry.group==='导航'?ListCollapse:Sparkles])) as Record<keyof typeof extendedCatalog, LucideIcon>,navbar:PanelTop,hero:LayoutTemplate,heading:Type,text:AlignLeft,button:SquareMousePointer,card:LayoutDashboard,image:Image,input:TextCursorInput,accordion:ListCollapse,tabs:PanelTop,switch:ToggleLeft,alert:AlertCircle,badge:Tag,separator:Minus,footer:PanelBottom,textarea:Text,select:ChevronDown,checkbox:CheckSquare,radio:CircleDot,slider:SlidersHorizontal,avatar:UserRound,progress:LoaderCircle,statistic:ChartNoAxesCombined,table:Table2,timeline:ListOrdered,testimonial:Quote,pricing:CreditCard,breadcrumb:ChevronRight,pagination:Ellipsis,rating:Star,repeater:Table2,form:CheckSquare,chart:ChartNoAxesCombined,custom:Puzzle};
const collision: CollisionDetection = args => {
  const viewport = window.document.querySelector('[data-canvas-viewport]')?.getBoundingClientRect();
  const point = args.pointerCoordinates;
  if (point && viewport && pointInViewport(point, viewport) && args.droppableContainers.some(container => container.id === 'canvas')) return [{ id: 'canvas', data: { pointerCoordinates: point } }];
  const hits = pointerWithin(args).filter(hit => hit.id !== 'canvas');
  if (hits.length) return hits;
  return args.pointerCoordinates ? [] : closestCenter(args);
};

function IconButton({label,children,onClick,disabled=false,active=false,className=''}:{label:string;children:ReactNode;onClick?:()=>void;disabled?:boolean;active?:boolean;className?:string}) {
  return <StudioTooltip label={t(label)}><StudioButton type="button" className={`icon-button ${active?'active':''} ${className}`} aria-label={t(label)} onClick={onClick} disabled={disabled}>{children}</StudioButton></StudioTooltip>;
}

function Miniature({type}:{type:BuiltinComponentType}) {
  if(isExtendedComponent(type))return <CatalogMiniature type={type}/>;
  if(type==='button')return <span className="mini-button">Button <ArrowRight size={9}/></span>;
  if(type==='heading')return <span className="mini-heading">Make it <em>move.</em></span>;
  if(type==='text')return <span className="mini-lines"><i/><i/><i/></span>;
  if(type==='switch')return <span className="mini-switch"><i/></span>;
  if(type==='badge')return <span className="mini-badge"><span/> New release</span>;
  if(type==='input')return <span className="mini-input">{t("输入一些内容")}<span>|</span></span>;
  if(type==='accordion')return <span className="mini-accordion"><i>{t("如何开始？")}<Plus size={9}/></i><i>{t("探索更多")}<Plus size={9}/></i></span>;
  if(type==='tabs')return <span className="mini-tabs"><b>{t("概览")}</b><i>{t("详情")}</i><i>{t("设置")}</i></span>;
  if(type==='card')return <span className="mini-card"><span/><i/><i/></span>;
  if(type==='navbar')return <span className="mini-nav"><Square size={11} fill="currentColor"/><i/><i/><b/></span>;
  if(type==='hero')return <span className="mini-hero"><i/><strong>Build something.</strong><i/><b/></span>;
  if(type==='image')return <span className="mini-image"><Image size={24} strokeWidth={1.2}/></span>;
  if(type==='separator')return <span className="mini-divider"/>;
  if(type==='footer')return <span className="mini-footer"><span>© Forma</span><i/><i/></span>;
  if(type==='alert')return <span className="mini-alert"><AlertCircle size={12}/><i/></span>;
  return <LibraryMiniature type={type}/>;
}

function PaletteItem({type,onAdd}:{type:BuiltinComponentType;onAdd:()=>void}) {
  const {attributes,listeners,setNodeRef,isDragging} = useDraggable({id:`palette:${type}`,data:{type,from:'palette'}});
  const item=catalog.find(c=>c.type===type)!;
  return <StudioButton ref={setNodeRef} className={`palette-card ${isDragging?'dragging':''}`} {...listeners} {...attributes} onClick={onAdd} aria-label={t("添加{0}", { 0: t(item.name) })} title={t("{0} · 拖入画布或点击添加", { 0: t(item.description) })} data-component={type}>
    <span className="component-mini"><Miniature type={type}/><span className="mini-add"><Plus size={12}/></span></span>
    <span className="component-caption">{t(item.name)}{['button','heading','accordion'].includes(type)&&<span className="animated-dot" title="Animate UI"/>}</span>
  </StudioButton>;
}

function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="field"><span className="field-label">{t(label)}</span>{children}{hint&&<span className="field-hint">{t(hint)}</span>}</label>;}
function ColorField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) {return <Field label={t(label)}><span className="color-field"><input type="color" value={value} onChange={e=>onChange(e.target.value)} aria-label={t(label)}/><span>{value.toUpperCase()}</span></span></Field>;}
function RangeField({label,value,min=0,max=120,onChange}:{label:string;value:number;min?:number;max?:number;onChange:(v:number)=>void}) {return <Field label={t(label)}><span className="range-field"><input aria-label={t(label)} type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)}/><span>{value}<small>px</small></span></span></Field>;}

const itemHints: Partial<Record<ComponentType, string>> = {
  ...Object.fromEntries(Object.entries(extendedCatalog).map(([type, entry]) => [type, 'itemsHint' in entry ? entry.itemsHint : undefined])),
  navbar:'用英文逗号分隔，格式：导航文字 | 链接',
  select:'每行一个选项。', radio:'每行一项，格式：选项名称 | 说明（可选）',
  table:'第一行是表头，其余行是数据；列之间用 | 分隔，列数与表头保持一致。',
  timeline:'每行一项，格式：标题 | 说明 | 时间（可选）',
  pricing:'每行填写一项方案权益。',
  breadcrumb:'每行一级，格式：名称 | 链接；最后一级为当前页面。',
};

type InspectorRequest = { tab: InspectorTab | 'page'; section?: PageSettingsSection; advanced?: boolean; sequence: number };

function Inspector({request,document,site,studioTheme,selected,onUpdate,onFrame,onSettings,onPageTheme,onDesignTheme,onDeleteTheme,onClose,onDelete,onDuplicate,onReset,onBlockChange,onOpenStudio,onConfigureFilter,onOpenDesigner,notify}:{request:InspectorRequest|null;document:PageDocument;site:SiteDocument;studioTheme:'light'|'dark';selected:Block|undefined;onUpdate:(props:Partial<Block['props']>)=>void;onFrame:(frame:BlockFrame)=>void;onSettings:(settings:Partial<PageDocument['settings']>)=>void;onPageTheme:(theme:ThemeId)=>void;onDesignTheme:(scope:'component'|'page',theme?:ThemeId)=>void;onDeleteTheme:(theme:ThemeId)=>void;onClose:()=>void;onDelete:()=>void;onDuplicate:()=>void;onReset:()=>void;onBlockChange:(block:Block)=>void;onOpenStudio:(target:InteractionStudioTarget)=>void;onConfigureFilter:(blockId:string)=>void;onOpenDesigner:(request:DesignerRequest)=>void;notify:(message:string)=>void}) {
  const [tab,setTab]=useState<'component'|'page'|'logic'>('component');
  useEffect(()=>{if(selected){setTab(tab=>tab==='page'?'component':tab);window.document.getElementById('inspector-panel')?.scrollTo({top:0});}},[selected?.id]);
  useEffect(()=>{
    if(!request)return;
    setTab(request.tab);
    const frame=requestAnimationFrame(()=>{
      window.document.getElementById(`inspector-tab-${request.tab}`)?.focus({preventScroll:true});
      window.document.getElementById('inspector-panel')?.scrollTo({top:0});
      if(request.advanced){const panel=window.document.getElementById('inspector-panel');if(panel)revealInspectorAdvanced(panel);}
      if(request.tab==='page'&&request.section){
        const section=window.document.querySelector<HTMLElement>(`[data-page-setting="${request.section}"]`);
        section?.scrollIntoView({block:'start'});
        (section?.querySelector<HTMLElement>('input,select')??section?.querySelector<HTMLElement>('button'))?.focus({preventScroll:true});
      }
    });
    return()=>cancelAnimationFrame(frame);
  },[request]);
  const themeDisclosure=useInspectorDisclosure(`component:${selected?.type??'none'}:theme`);
  const isComponent=(tab==='component'||tab==='logic') && !!selected;
  const p=selected?.props;
  const editableItems=p?.items ?? (selected ? (extendedCatalog as Partial<Record<ComponentType,{props:Block['props']}>>)[selected.type]?.props.items : undefined);
  const bounds=canvasBounds(document.settings);
  const selectedTheme=getTheme(p?.theme??document.settings.theme,document.settings.customThemes);
  const selectedAccent=p?.accent??(p?.theme?selectedTheme.accent:document.settings.accent);
  const numericMax=selected?.type==='rating'?5:p?.max??(selected?.type==='pagination'?5:100);
  const initialValues: Partial<Record<ComponentType,number>>={slider:60,progress:72,rating:4,pagination:1};
  const numericValue=Math.min(numericMax,p?.value??(selected?initialValues[selected.type]??0:0));
  return <aside id="inspector-sidebar-panel" className="inspector">
    <div className="inspector-heading"><span><Settings2 size={15}/> {t("属性面板")}</span><IconButton label={t("收起属性面板")} onClick={onClose}><X size={15}/></IconButton></div>
    <Tabs value={tab} onValueChange={value=>setTab(value as typeof tab)} className="studio-tab-root"><TabsList className="studio-tabs inspector-tabs" aria-label={t("属性面板分类")}><TabsTrigger value="component" id="inspector-tab-component" aria-controls="inspector-panel">{t("组件属性")}</TabsTrigger><TabsTrigger value="logic" id="inspector-tab-logic" aria-controls="inspector-panel" disabled={!selected}>{t("组件联动")}</TabsTrigger><TabsTrigger value="page" id="inspector-tab-page" aria-controls="inspector-panel">{t("页面设置")}</TabsTrigger></TabsList></Tabs>
    <div className="inspector-scroll" role="tabpanel" id="inspector-panel" aria-labelledby={`inspector-tab-${tab}`}>
      {tab==='logic' && selected ? <ComponentInteractions key={`${selected.id}-${request?.sequence??0}`} block={selected} page={document} site={site} onChange={onBlockChange} onOpenStudio={onOpenStudio}/> : isComponent && selected && p ? (selected.type==='custom' ? <CustomBlockInspector key={selected.id} block={selected} document={document} onChange={onBlockChange} onFrame={onFrame} onReset={onReset} onOpenDesigner={onOpenDesigner} onDesignTheme={onDesignTheme} onDeleteTheme={onDeleteTheme} notify={notify}/> : <>
        <div className="inspected-component"><span className="inspected-icon">{(()=>{const I=icons[selected.type];return <I size={18}/>;})()}</span><span><strong>{blockName(selected.type)}</strong><small>{catalog.find(c=>c.type===selected.type)?.english}</small></span><StudioTooltip label={t("恢复内容、样式与动效，保留位置、尺寸、图层和组件联动；支持撤销")}><StudioButton className="inspector-reset" aria-label={t("恢复组件默认属性")} onClick={onReset}><RotateCcw size={13}/><span>{t("恢复默认")}</span></StudioButton></StudioTooltip></div>
        <InspectorSettingsSearch key={`settings-${selected.id}`}/>
        <BlockDataSettings block={selected} page={document} site={site} onUpdate={onUpdate} onBlockChange={onBlockChange} onOpenStudio={onOpenStudio} onConfigureFilter={onConfigureFilter}/>
        <div className="property-section"><h3>{t("内容")}</h3>
          {p.title!==undefined&&<Field label={t("标题")}><textarea rows={selected.type==='hero'?2:1} aria-label={t("标题")} value={p.title} onChange={e=>onUpdate({title:e.target.value})} maxLength={300}/></Field>}
          {selected.type==='navbar'&&<>
            <Field label={t("品牌图标")}><select aria-label={t("品牌图标")} value={p.brandIcon??'leaf'} onChange={e=>onUpdate({brandIcon:e.target.value as Block['props']['brandIcon']})}>{Object.entries(navbarIcons).map(([value,icon])=><option key={value} value={value}>{t(icon.label)}</option>)}<option value="none">{t("不显示图标")}</option></select></Field>
            {p.brandIcon==='image'&&<Field label={t("Logo 图片地址")} hint={t("支持 https:// 图片链接或站内 / 路径，图片按比例显示。")}><input aria-label={t("Logo 图片地址")} type="url" value={p.imageUrl??''} placeholder="https://example.com/logo.svg" onChange={e=>onUpdate({imageUrl:e.target.value})} maxLength={2048}/></Field>}
          </>}
          {p.label!==undefined&&<Field label={selected.type==='hero'?t("顶部标签"):t("标签文字")}><input aria-label={selected.type==='hero'?t("顶部标签"):t("标签文字")} value={p.label} onChange={e=>onUpdate({label:e.target.value})} maxLength={300}/></Field>}
          {p.text!==undefined&&<Field label={['input','textarea','select'].includes(selected.type)?t("占位文字"):selected.type==='statistic'?t("显示数值"):selected.type==='testimonial'?t("评价内容"):t("描述文字")}><textarea rows={3} aria-label={['input','textarea','select'].includes(selected.type)?t("占位文字"):selected.type==='statistic'?t("显示数值"):selected.type==='testimonial'?t("评价内容"):t("描述文字")} value={p.text} onChange={e=>onUpdate({text:e.target.value})} maxLength={10000}/></Field>}
          {selected.type==='hero'&&<Field label={t("按钮文字")}><input aria-label={t("按钮文字")} value={p.variant||''} onChange={e=>onUpdate({variant:e.target.value})} maxLength={100}/></Field>}
          {p.url!==undefined&&<Field label={t("跳转链接")} hint={t("可选择站内页面，或填写 https://、mailto: 与 #锚点")}><><select aria-label={t("链接到站点页面")} value={site.pages.some(entry=>entry.path===p.url)?p.url:''} onChange={event=>{if(event.target.value)onUpdate({url:event.target.value});}}><option value="">{t("选择站点页面（可选）")}</option>{site.pages.map(entry=><option key={entry.id} value={entry.path}>{entry.name} · {entry.path}</option>)}</select><input aria-label={t("跳转链接")} value={p.url} onChange={e=>onUpdate({url:e.target.value})} placeholder="https://example.com" maxLength={2000}/></></Field>}
          {selected.type!=='navbar'&&p.imageUrl!==undefined&&<Field label={t("图片地址")}><input aria-label={t("图片地址")} value={p.imageUrl} onChange={e=>onUpdate({imageUrl:e.target.value})} maxLength={2000}/></Field>}
          {editableItems!==undefined&&<Field label={selected.type==='navbar'?t("导航项目"):t("内容项目")} hint={t(itemHints[selected.type] || t("每行一项，格式：标题 | 内容"))}><textarea rows={7} aria-label={t("内容项目")} value={editableItems} onChange={e=>onUpdate({items:e.target.value})} maxLength={10000}/></Field>}
          {['navbar','sidebar','menubar'].includes(selected.type)&&<Field label={t("菜单内容")} hint={t("使用站点页面时，菜单会随页面树自动更新。")}><select aria-label={t("菜单内容")} value={p.navigation??'custom'} onChange={event=>onUpdate({navigation:event.target.value as 'custom'|'site'})}><option value="custom">{t("自定义项目")}</option><option value="site">{t("站点页面（自动同步）")}</option></select></Field>}
          {selected.type==='pricing'&&<Field label={t("价格文字")}><input aria-label={t("价格文字")} value={p.variant||''} onChange={e=>onUpdate({variant:e.target.value})} maxLength={100}/></Field>}
          {['slider','progress','rating','pagination'].includes(selected.type)&&<>
            <Field label={selected.type==='progress'?t("当前进度"):selected.type==='pagination'?t("初始页码"):selected.type==='rating'?t("初始评分"):t("初始数值")} hint={selected.type==='rating'?t("0–5 星；预览中可点击或用方向键评分。"):undefined}><input type="number" min={selected.type==='pagination'?1:0} max={numericMax} step={1} value={numericValue} onChange={e=>{if(e.target.value==='')return;const value=Math.round(Number(e.target.value));if(Number.isFinite(value))onUpdate({value:Math.min(numericMax,Math.max(selected.type==='pagination'?1:0,value))});}}/></Field>
            {selected.type!=='rating'&&<Field label={selected.type==='pagination'?t("总页数"):t("最大值")} hint={t("支持 1–100")}><input type="number" min={1} max={100} step={1} value={p.max??(selected.type==='pagination'?5:100)} onChange={e=>{if(e.target.value==='')return;const max=Math.max(1,Math.min(100,Math.round(Number(e.target.value))));if(Number.isFinite(max))onUpdate({max,value:Math.min(numericValue,max)});}}/></Field>}
          </>}
          {['checkbox','switch','toggle','collapsible','sidebar'].includes(selected.type)&&<Field label={t("初始状态")}><span className="studio-switch-field"><Switch aria-label={t("初始状态")} checked={!!p.checked} onCheckedChange={checked=>onUpdate({checked})}/><span>{p.checked?t("已开启"):t("已关闭")}</span></span></Field>}
          {['checkbox','radio','select','slider','rating','pagination','textarea'].includes(selected.type)&&<p className="field-hint">{t("在预览中体验交互；预览操作不会改变这里保存的初始配置。")}</p>}
          {isExtendedComponent(selected.type)&&<><a className="catalog-doc-link" href={extendedCatalog[selected.type].docs} target="_blank" rel="noreferrer">{t("查看官方组件说明")}<ExternalLink size={12}/></a>{'variants' in extendedCatalog[selected.type]&&<Field label={t("展示方式")}><select aria-label={t("展示方式")} value={p.variant||''} onChange={e=>onUpdate({variant:e.target.value})}>{(extendedCatalog[selected.type] as {variants:string[][]}).variants.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></Field>}{['countingNumber','scrollingNumber','slidingNumber','githubStars','githubStarsButton'].includes(selected.type)&&<Field label={t("显示数值")}><input aria-label={t("显示数值")} type="number" min={0} max={1000000000} value={p.value??0} onChange={e=>{if(e.target.value)onUpdate({value:Math.max(0,Math.min(1000000000,Number(e.target.value)||0))});}}/></Field>}{selected.type==='inputOtp'&&<Field label={t("验证码位数")}><input aria-label={t("验证码位数")} type="number" min={1} max={12} value={p.max??6} onChange={e=>onUpdate({max:Math.max(1,Math.min(12,Math.round(Number(e.target.value)||6)))})}/></Field>}</>}
          {selected.type==='separator'&&<p className="muted-note">{t("使用分割线，为内容留出呼吸的空间。")}</p>}
        </div>
        <InspectorDisclosure id={`component:${selected.type}:advanced`} title="缩放与官方属性" badge="高级"><ComponentScaleControls key={`scale-${selected.id}`} block={selected} settings={document.settings} onChange={onBlockChange}/><AnimationSettings key={`motion-${selected.id}`} type={selected.type} value={p.motion} onChange={motion=>onUpdate({motion})}/></InspectorDisclosure>{selected.frame&&<div className="property-section"><h3>{t("位置与尺寸")}<span className="precision-label">PX</span></h3><div className="geometry-fields">{(['x','y','width','height'] as const).map((key,i)=><Field key={key} label={[t("横坐标 X"),t("纵坐标 Y"),t("宽度 W"),t("高度 H")][i]}><input type="number" aria-label={[t("横坐标 X"),t("纵坐标 Y"),t("宽度 W"),t("高度 H")][i]} min={key==='width'?40:key==='height'?32:bounds.margin} max={key==='width'?frameSizeLimits(document.settings,p.contentScale).width:key==='height'?frameSizeLimits(document.settings,p.contentScale).height:key==='x'?Math.max(bounds.left,bounds.right-selected.frame!.width):Math.max(bounds.top,bounds.bottom-selected.frame!.height)} value={Math.round(selected.frame![key])} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))onFrame({...selected.frame!,[key]:n});}}/></Field>)}</div><p className="field-hint">{t("拖动组件自由摆放；拖动边框或角点调整大小。按住 Shift 暂停网格吸附。")}</p></div>}
        <div className="property-section"><h3>{t("外观")}</h3>
          {['hero','heading','text','button','badge'].includes(selected.type)&&<Field label={t("对齐方式")}><span className="alignment-control">{(['left','center','right'] as const).map((align,i)=>{const I=[AlignLeft,AlignCenter,AlignRight][i];return <StudioButton type="button" key={align} className={(p.align||'left')===align?'active':''} aria-label={[t("左对齐"),t("居中"),t("右对齐")][i]} onClick={()=>onUpdate({align})}><I size={16}/></StudioButton>;})}</span></Field>}
          {(['heading','text','statistic','pricing'].includes(selected.type)||isExtendedComponent(selected.type)&&p.fontSize!==undefined)&&<RangeField label={t("文字大小")} value={p.fontSize??(selected.type==='statistic'?36:selected.type==='pricing'?30:16)} min={10} max={96} onChange={fontSize=>onUpdate({fontSize})}/>}
          <RangeField label={t("内边距")} value={p.padding??20} max={120} onChange={padding=>onUpdate({padding})}/>
          {['button','card','image','textarea','select','avatar','statistic','table','testimonial','pricing'].includes(selected.type)&&<RangeField label={t("圆角")} value={p.radius??((p.theme||document.settings.theme)?selectedTheme.radius:12)} max={80} onChange={radius=>onUpdate({radius})}/>}
          {selected.type==='button'&&<Field label={t("按钮样式")}><select aria-label={t("按钮样式")} value={p.variant||'primary'} onChange={e=>onUpdate({variant:e.target.value})}><option value="primary">{t("主要按钮")}</option><option value="secondary">{t("次要按钮")}</option><option value="ghost">{t("文字按钮")}</option></select></Field>}
          <ColorField label={t("强调颜色")} value={selectedAccent} onChange={accent=>onUpdate({accent})}/>
          <div className="color-fields"><ColorField label={t("背景颜色")} value={p.background??((p.theme||document.settings.theme)?(['card','statistic','testimonial','pricing'].includes(selected.type)?selectedTheme.panel:selectedTheme.canvas):'#ffffff')} onChange={background=>onUpdate({background})}/><ColorField label={t("文字颜色")} value={p.color??selectedTheme.text} onChange={color=>onUpdate({color})}/></div>
          {(p.background||p.color||p.accent||p.radius!==undefined)&&<StudioButton className="text-button" onClick={()=>onUpdate({background:undefined,color:undefined,accent:undefined,radius:undefined})}><RotateCcw size={12}/>{t("恢复主题样式")}</StudioButton>}
        </div>
        <div className="property-section"><h3><Sparkles size={13}/> {t("入场动效")}</h3><select aria-label={t("入场动效")} value={p.animation||'none'} onChange={e=>onUpdate({animation:e.target.value as Block['props']['animation']})}><option value="none">{t("无动效")}</option><option value="fade">{t("轻柔渐入")}</option><option value="slide">{t("向上浮现")}</option><option value="scale">{t("弹性缩放")}</option></select><p className="field-hint">{t("点击预览画布的播放按钮，重播动画。")}</p></div>
        <InspectorDisclosure id={`component:${selected.type}:effect`} title="附加动效" badge="高级"><div className="property-section"><Field label={t("附加动效")}><select aria-label={t("附加动效")} value={p.effect||'none'} onChange={e=>onUpdate({effect:e.target.value as Block['props']['effect'],effectOptions:{}})}>{catalogEffects.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></Field></div>
        {p.effect&&p.effect!=='none'&&<AnimationSettings extra type={`effect:${p.effect}`} value={p.effectOptions} onChange={effectOptions=>onUpdate({effectOptions})}/>}</InspectorDisclosure>
        <details {...themeDisclosure.detailsProps} key={selected.id} className="component-theme-disclosure" data-inspector-advanced>
          <summary onClick={themeDisclosure.onSummaryClick}><ChevronRight size={14}/><strong>{t("组件主题")}</strong><span>{p.theme?selectedTheme.name:t("跟随页面")}</span></summary>
          <ThemePicker customThemes={document.settings.customThemes??[]} onDesign={theme=>onDesignTheme('component',theme)} onDelete={onDeleteTheme} scope="component" value={p.theme} pageTheme={document.settings.theme} onChange={theme=>onUpdate({theme,accent:undefined,background:undefined,color:undefined,radius:undefined})}/>
        </details>
      </>) : tab==='component'?<div className="inspector-empty"><MousePointer2 size={28}/><h3>{t("选择一个组件")}</h3><p>{t("点击画布中的组件，")}<br/>{t("在这里调整它的内容与样式。")}</p><StudioButton className="secondary-button" onClick={()=>setTab('page')}>{t("调整页面设置")}</StudioButton></div>:<>
        <div className="page-setting-intro"><span className="inspected-icon"><LayoutTemplate size={20}/></span><h3>{t("让页面拥有自己的风格")}</h3><p>{t("统一页面风格，也可为组件设置独立主题。")}</p></div>
        <CanvasSizeControls width={document.settings.maxWidth} height={document.settings.canvasHeight??1400} onChange={({width,height})=>onSettings({maxWidth:width,canvasHeight:height})}/>
        <div className="property-section" data-page-setting="margin"><h3>{t("页面边距")}</h3><DimensionField label={t("全局页边距（px）")} value={document.settings.padding} min={0} max={120} onChange={padding=>onSettings({padding})}/><p className="field-hint">{t("四边统一留白，范围 0–120 px。组件限制在虚线框内；增加边距会移回越界组件，过大的组件会缩小，可撤销。")}</p></div>
        <ThemePicker customThemes={document.settings.customThemes??[]} onDesign={theme=>onDesignTheme('page',theme)} onDelete={onDeleteTheme} scope="page" studioScheme={studioTheme} value={document.settings.theme} onChange={theme=>{if(theme)onPageTheme(theme);}}/>
        <div className="property-section"><h3>{t("自定义配色")}</h3><ColorField label={t("主题颜色")} value={document.settings.accent} onChange={accent=>onSettings({accent})}/><div data-page-setting="background"><ColorField label={t("页面背景")} value={document.settings.background} onChange={background=>onSettings({background})}/></div></div>

      </>}
    </div>
    {isComponent&&<div className="inspector-footer"><StudioButton className="secondary-button" onClick={onDuplicate}><Copy size={14}/>{t("复制组件")}</StudioButton><IconButton label={t("删除选中组件")} className="danger" onClick={onDelete}><Trash2 size={15}/></IconButton></div>}
  </aside>;
}

export default function App() {
  const locale = useLocale();
  const [aiBusy, setAiBusy] = useState(false), [aiChanges, setAiChanges] = useState<AiChange[]>([]);
  const aiBusyRef = useRef(false), aiOwner = useRef<'page' | 'site' | null>(null);
  useEffect(() => {
    if (!aiChanges.length) return;
    const timer = setTimeout(() => setAiChanges(values => values.filter(value => Date.now() - value.time < 3000)), 3100);
    return () => clearTimeout(timer);
  }, [aiChanges]);
  useEffect(() => {
    window.document.title = t('Animate Studio · 页面编辑器');
    window.document.querySelector('meta[name="description"]')?.setAttribute('content', t('Animate Studio — 通过拖拽组件，构建有生命力的页面。'));
  }, [locale]);
  const { user } = useAccount();
  const userRef = useRef(user); userRef.current = user;
  const customLibrary = useCustomLibrary(user);
  const [aiComponentRequest, setAiComponentRequest] = useState<{ sequence: number; owner: string; kind: 'local' | 'cloud'; folderId: string | null } | null>(null);
  const [aiPageRequest, setAiPageRequest] = useState(0);
  const [aiSiteRequest, setAiSiteRequest] = useState(0);
  const [pageCreationOpen, setPageCreationOpen] = useState(false);
  const [designer,setDesigner]=useState<(DesignerRequest&{sequence:number})|null>(null);
  const [loginOpen,setLoginOpen]=useState(false);
  // The narrow-screen component drawer would otherwise stay above the designer.
  const openDesigner=useCallback((request:DesignerRequest)=>{setShowSidebar(false);setDesigner(previous=>({...request,sequence:(previous?.sequence??0)+1}));},[]);
  const [cloudTarget,setCloudTarget]=useState<{id:string;userId:string}|null>(null);
  const cloudTargetRef=useRef(cloudTarget);cloudTargetRef.current=cloudTarget;
  const requestedCloudPage=useRef(new URL(window.location.href).searchParams.get('page'));
  const restoredAccount=useRef<string|null>(null);
  const isAiBusy=useCallback(()=>aiBusyRef.current,[]);
  const {site,document,target:siteTarget,siteRef,targetRef:siteTargetRef,current,past,future,activate:activateWorkspace,update,updateSite,commit:commitWorkspace,selectTarget:selectWorkspaceTarget,undo:undoWorkspace,redo}=useStudioSite(isAiBusy);
  const [selection,setSelection]=useState<string[]>([]);
  const selectedIds=useMemo(()=>selection.filter(id=>document?.blocks.some(block=>block.id===id)),[selection,document?.blocks]);
  const selected=selectedIds.at(-1)??null;
  const setSelected=useCallback((id:string|null)=>setSelection(id?[id]:[]),[]);
  const selectComponent=useCallback((id:string|null,additive=false)=>setSelection(ids=>selectComponentIds(ids,id,additive)),[]);
  useEffect(()=>{setSelection(ids=>{const next=ids.filter(id=>document?.blocks.some(block=>block.id===id));return next.length===ids.length?ids:next;});},[document?.blocks]);
  const [loadError,setLoadError]=useState('');
  const [saveState,setSaveState]=useState<SaveState>('loading');
  const [saveError,setSaveError]=useState('');
  const [savedAt,setSavedAt]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [insertAfterId,setInsertAfterId]=useState<string|null>(null);
  const [group,setGroup]=useState('全部');
  const [sidebarTab,setSidebarTab]=useState<'components'|'pages'|'layers'>('components');
  const [view,setView]=useState<View>('edit');
  const [canvasReveal,setCanvasReveal]=useState(0);
  const [device,setDevice]=useState<'desktop'|'mobile'>('desktop');
  const [inspector,setInspector]=useState(()=>window.innerWidth>1000);
  const [inspectorRequest,setInspectorRequest]=useState<InspectorRequest|null>(null);
  const [variableBlockId,setVariableBlockId]=useState<string|null>(null);
  const [dragging,setDragging]=useState<Block|null>(null);
  const dragCandidate=useRef<Block|null>(null);
  const [dragCanvasScale,setDragCanvasScale]=useState<number|null>(null);
  const [toast,setToast]=useState('');
  const [replay,setReplay]=useState(0);
  const [fullPreview,setFullPreview]=useState(false);
  function readGuestDisclosures() {
    try { const stored=localStorage.getItem(inspectorDisclosureStorageKey);return stored?validateInspectorDisclosures(JSON.parse(stored))??{}:{}; }
    catch{return {};}
  }
  const [studioTheme,setStudioTheme]=useState<'light'|'dark'>(()=>{try{return localStorage.getItem('animate-studio:appearance')==='dark'?'dark':'light';}catch{return 'light';}});
  useEffect(()=>{window.document.documentElement.dataset.studioTheme=studioTheme;},[studioTheme]);
  const [inspectorDisclosures,setInspectorDisclosures]=useState<InspectorDisclosurePreferences>(readGuestDisclosures);
  const disclosureState=useRef(inspectorDisclosures);disclosureState.current=inspectorDisclosures;
  const [disclosureRevision,setDisclosureRevision]=useState(0);
  const [pageMenuOpen,setPageMenuOpen]=useState(false);
  const [logicTarget,setLogicTarget]=useState<InteractionStudioTarget|null>(null);
  const [showHelp,setShowHelp]=useState(false);
  const [showSidebar,setShowSidebar]=useState(false);
  const [themeDesign,setThemeDesign]=useState<{initial:CustomTheme;editing:boolean;blockId?:string;blockIds?:string[];scopeName:string}|null>(null);
  const autosave=useRef<ReturnType<typeof createAutosave<SiteDocument>>|null>(null);
  const savedRevision=useRef<string|null>(null);
  const aiCloudPending=useRef(false);
  const loadVersion=useRef(0);
  const persistenceVersion=useRef(0);
  const preferencesVersion=useRef(0);
  const preferencesQueue=useRef(Promise.resolve());
  const fileRef=useRef<HTMLInputElement>(null);
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor));
  const notify=useCallback((message:string)=>setToast(message),[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3200);return()=>clearTimeout(t);},[toast]);
  function changeAiRunning(owner:'page'|'site',running:boolean){
    if(running&&aiOwner.current&&aiOwner.current!==owner)throw new Error(t('请先暂停另一项 AI 任务，再继续。'));
    if(!running&&aiOwner.current!==owner)return;
    aiOwner.current=running?owner:null;aiBusyRef.current=running;setAiBusy(running);
    if(running){setView('edit');setPageMenuOpen(false);setShowSidebar(false);}
  }

  useEffect(()=>{
    const controller=new AbortController();const version=++preferencesVersion.current;
    const restore=(preferences:InspectorDisclosurePreferences)=>{disclosureState.current=preferences;setInspectorDisclosures(preferences);setDisclosureRevision(value=>value+1);};
    if(user){
      restore({});
      void accountApi<Preferences>('/api/account/preferences',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted&&version===preferencesVersion.current){setStudioTheme(value.studioTheme);restore(validateInspectorDisclosures(value.inspectorDisclosures??{})??{});}}).catch(()=>{});
    }else{
      try{setStudioTheme(localStorage.getItem('animate-studio:appearance')==='dark'?'dark':'light');}catch{/* Retain the usable theme. */}
      restore(readGuestDisclosures());
    }
    return()=>controller.abort();
  },[user?.id]);
  function queuePreferences(owner:string,patch:WorkbenchPreferencesPatch,errorMessage:string){
    preferencesQueue.current=preferencesQueue.current.then(async()=>{
      if(userRef.current?.id!==owner)return;
      await accountApi('/api/account/preferences',{method:'PATCH',body:{version:1,...patch}});
    }).catch(()=>{if(userRef.current?.id===owner)notify(errorMessage);});
  }
  function changeStudioTheme(){
    const next=studioTheme==='light'?'dark':'light';preferencesVersion.current++;setStudioTheme(next);
    const owner=userRef.current?.id;if(!owner){try{localStorage.setItem('animate-studio:appearance',next);}catch{/* The theme still applies. */}return;}
    queuePreferences(owner,{studioTheme:next},t("外观已应用，云端同步失败，请稍后重试切换。"));
  }
  function changeInspectorDisclosure(id:string,open:boolean){
    const next=validateInspectorDisclosures({...disclosureState.current,[id]:open});
    if(!next){notify(t("展开偏好已达到保存上限，本次仅在当前页面生效。"));return;}
    preferencesVersion.current++;disclosureState.current=next;setInspectorDisclosures(next);
    const owner=userRef.current?.id;if(!owner){try{localStorage.setItem(inspectorDisclosureStorageKey,JSON.stringify(next));}catch{/* The disclosure state still applies. */}return;}
    queuePreferences(owner,{inspectorDisclosures:next},t("展开状态已应用，云端同步失败，请稍后重试。"));
  }

  const activateDocument=useCallback((next:StudioDocument,record:DraftRecord,target:{id:string;userId:string}|null,resetHistory=true,syncLocation=true)=>{
    autosave.current?.dispose();const version=++persistenceVersion.current;
    const nextSite=toSiteDocument(next), savedSite=record.page?toSiteDocument(record.page):null;
    cloudTargetRef.current=target;setCloudTarget(target);savedRevision.current=record.savedAt;aiCloudPending.current=false;
    if(syncLocation){
      requestedCloudPage.current=null;const url=new URL(window.location.href);
      if(target)url.searchParams.set('page',target.id);else url.searchParams.delete('page');
      window.history.replaceState(window.history.state,'',url);
    }
    autosave.current=createAutosave<SiteDocument>({
      ...(savedSite?{initialSaved:savedSite}:{}),
      write:async site=>{
        if(target&&userRef.current?.id!==target.userId)throw new Error(t("登录状态已改变，请重新登录或导出当前页面。"));
        if(target&&aiCloudPending.current){aiCloudPending.current=false;const error=new Error(t('AI 整站结果尚未保存到云端，请主动保存或发布。'));error.name='AiCloudPending';throw error;}
        if(target&&!savedRevision.current)throw new Error(t("缺少云端修订信息，请重新打开站点后重试。"));
        const saved=target?await accountApi<CloudPageRecord>(cloudSitePath(target.id),{method:'PUT',body:{site,expectedRevision:savedRevision.current}}):writeGuestDraft(site);
        if(version===persistenceVersion.current){savedRevision.current=saved.savedAt;setSavedAt(saved.savedAt);}
      },
      onState:(state,error)=>{if(version===persistenceVersion.current){const pending=error instanceof Error&&error.name==='AiCloudPending';setSaveState(pending?'pending':state);setSaveError(pending?'':error instanceof Error?error.message:'');}},
    });
    activateWorkspace(nextSite,nextSite.homePageId,resetHistory);setSavedAt(record.savedAt);setSaveState(record.page?'saved':'pending');
    if(resetHistory){setSelected(null);setInsertAfterId(null);}
    autosave.current.schedule(nextSite);
  },[setSelected,activateWorkspace]);

  const load=useCallback(async()=>{
    const request=++loadVersion.current;
    setLoadError('');setSaveState('loading');
    try {
      const data=await readGuestDraft();
      if(request!==loadVersion.current)return;
      const next=toSiteDocument(data.page||createDocument()), page=next.pages.find(entry=>entry.id===next.homePageId)!.page;
      activateDocument(next,data,null,true,false);setSelected(page.blocks.find(b=>b.type==='hero')?.id||null);
    } catch(error){if(request===loadVersion.current)setLoadError(error instanceof Error?error.message:t("读取失败"));}
  },[activateDocument,setSelected]);
  useEffect(()=>{void load();return()=>{loadVersion.current++;persistenceVersion.current++;autosave.current?.dispose();};},[load]);

  useEffect(()=>{
    const id=requestedCloudPage.current;
    if(!user||!document||!id||restoredAccount.current===user.id)return;
    restoredAccount.current=user.id;
    void openCloud(id).catch(error=>{
      requestedCloudPage.current=null;const url=new URL(window.location.href);url.searchParams.delete('page');window.history.replaceState(window.history.state,'',url);
      notify(error instanceof Error?error.message:t("无法恢复云端页面，请从云端页面列表重新打开。"));
    });
  },[user?.id,!!document]);

  useEffect(()=>{
    const target=cloudTargetRef.current;
    if(target&&target.userId!==user?.id&&siteRef.current){
      activateDocument(siteRef.current,{page:null,savedAt:null},null,false);
      notify(t("登录状态已改变，当前内容已转为浏览器草稿，云端保存已停止"));
    }
  },[user?.id,activateDocument,notify]);

  async function flushCurrent(){
    if(siteRef.current)autosave.current?.schedule(siteRef.current);
    await autosave.current?.flush();
    if(autosave.current?.isDirty())throw new Error(t("当前站点尚未保存，请先重试保存或导出备份。"));
  }
  async function saveCloud():Promise<CloudPageRecord>{
    const owner=userRef.current?.id;const site=siteRef.current;
    if(!owner||!site)throw new Error(t("请先登录，再保存站点到云端。"));
    const target=cloudTargetRef.current;
    if(target&&target.userId!==owner)throw new Error(t("当前站点属于另一账号，请先导出备份并返回浏览器草稿。"));
    aiCloudPending.current=false;
    if(target){await flushCurrent();const result=await accountApi<CloudPageRecord>(cloudSitePath(target.id));if(userRef.current?.id!==owner)throw new Error(t("登录状态已改变，请重试。"));return result;}
    const result=await accountApi<CloudPageRecord>('/api/account/sites',{method:'POST',body:{site}});
    if(userRef.current?.id!==owner)throw new Error(t("登录状态已改变。站点已保存至原账号，请重新登录查看。"));
    if(siteRef.current!==site)throw new Error(t("站点在保存期间有新修改，请重新保存。"));
    activateDocument(site,result,{id:result.id,userId:owner},false);
    await flushCurrent();return result;
  }
  async function openCloud(id:string){
    const owner=userRef.current?.id;if(!owner)throw new Error(t("请先登录。"));
    await flushCurrent();const expected=siteRef.current;
    const record=await accountApi<CloudPageRecord>(cloudPagePath(id));
    if(userRef.current?.id!==owner)throw new Error(t("登录状态已改变，请重试。"));
    if(siteRef.current!==expected)throw new Error(t("当前站点又有新修改，请保存后重新打开。"));
    activateDocument(record.page,record,{id,userId:owner});
  }
  async function returnToGuest(){
    await flushCurrent();if(!cloudTargetRef.current)return;
    const expected=siteRef.current;const record=await readGuestDraft();
    if(siteRef.current!==expected)throw new Error(t("当前站点又有新修改，请保存后重试。"));
    activateDocument(record.page??createDocument(),record,null);
  }
  async function publishCloud(){
    const owner=userRef.current?.id;const record=await saveCloud();await flushCurrent();
    if(!owner||userRef.current?.id!==owner)throw new Error(t("登录状态已改变，请重试。"));
    return accountApi<{token:string;publishedAt:string}>(cloudPagePath(record.id)+'/share',{method:'POST',body:{}});
  }
  async function deleteCloud(id:string){
    const target=cloudTargetRef.current;const active=target?.id===id;
    if(active)await flushCurrent();
    const expected=siteRef.current;const guest=active?await readGuestDraft():null;
    if(active&&expected!==siteRef.current)throw new Error(t("当前站点又有新修改，请保存后重试删除。"));
    await accountApi(cloudPagePath(id),{method:'DELETE'});
    if(active&&cloudTargetRef.current?.id===id){
      if(siteRef.current!==expected){activateDocument(siteRef.current!,{page:null,savedAt:null},null);notify(t("云端站点已删除，操作期间的新修改已保留为浏览器草稿"));}
      else activateDocument(guest!.page??createDocument(),guest!,null);
    }
  }
  async function startNewDocument(next:StudioDocument){
    if(aiBusyRef.current)return false;
    try{
      await flushCurrent();
      const nextSite=toSiteDocument(next);
      if(cloudTargetRef.current){activateDocument(nextSite,{page:null,savedAt:null},null);notify(t("已开始新站点，原有云端站点已保留"));}
      else{
        requestedCloudPage.current=null;const url=new URL(window.location.href);url.searchParams.delete('page');window.history.replaceState(window.history.state,'',url);
        updateSite(nextSite,nextSite.homePageId);setSelected(null);setInsertAfterId(null);notify(t("已开始新站点，可撤销恢复浏览器草稿"));
      }
      setPageMenuOpen(false);return true;
    }
    catch(error){notify(error instanceof Error?error.message:t("暂时无法新建站点"));return false;}
  }

  const save=useCallback((_page:PageDocument)=>{
    if(siteRef.current)autosave.current?.schedule(siteRef.current);
    return autosave.current?.flush();
  },[]);
  useEffect(()=>{if(site)autosave.current?.schedule(site);},[site]);
  useEffect(()=>{
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(autosave.current?.isDirty()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);
  },[]);

  const undo=useCallback(()=>{if(undoWorkspace()==='ai')notify(t("已撤销整次 AI 生成。可按 ⌘⇧Z 重做，或在 AI 对话中恢复保存的版本。"));},[undoWorkspace,notify]);
  const remove=useCallback((id:string)=>{const doc=current.current;if(!doc)return;const ids=selectedIds.includes(id)?selectedIds:[id];update({...doc,blocks:doc.blocks.filter(block=>!ids.includes(block.id))});setSelected(null);notify(t("已删除 {0} 个组件，可通过撤销恢复", { 0: ids.length }));},[update,notify,selectedIds,setSelected]);
  const duplicate=useCallback((id:string)=>{const doc=current.current;if(!doc)return;try{const result=duplicateSelection(doc,selectedIds.includes(id)?selectedIds:[id]);update(result.page);setSelection(result.ids);notify(t("已复制 {0} 个组件", { 0: result.ids.length }));}catch(error){notify(error instanceof Error?error.message:t("暂时无法复制组件"));}},[update,notify,selectedIds]);
  const finishAdding=useCallback((result:PlacementResult)=>{
    update(result.page);setSelected(result.block.id);setInspector(true);setView(v=>v==='preview'?'split':v);setShowSidebar(false);setInsertAfterId(null);
    notify(result.block.type==='custom'?t("已添加「{0}」的页面副本，之后编辑源组件不会改变它", { 0: blockLabel(result.block) }):insertAfterId?t("已插入组件，后续内容已整体下移"):result.expanded?t("已添加组件并扩展画布，已有组件位置保持不变"):t("已将{0}放入空白区域", { 0: blockName(result.block.type) }));
    requestAnimationFrame(()=>window.document.querySelector(`[data-block-id="${result.block.id}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'}));
  },[update,notify,insertAfterId]);
  const add=useCallback((type:BuiltinComponentType)=>{
    const doc=current.current;if(!doc)return;
    try {
      const candidate=prepareBlockForPage(createBlock(type),doc.settings);
      finishAdding(insertAfterId?insertBlockAfter(doc,candidate,insertAfterId):placeBlock(doc,candidate));
    } catch(error){notify(error instanceof Error?error.message:t("暂时无法放置组件"));}
  },[finishAdding,notify,insertAfterId]);
  const addCustom=useCallback((definition:CustomComponentDefinition,source:CustomComponentSource)=>{
    const doc=current.current;if(!doc)return false;
    if(doc.blocks.filter(block=>block.type==='custom').length>=customComponentLimits.perPage){notify(t("每个页面最多包含 {0} 个自定义组件", { 0: customComponentLimits.perPage }));return false;}
    try {
      // The page receives a copy of the definition; later library edits never change it.
      const candidate=createCustomBlock(definition,source);
      finishAdding(insertAfterId?insertBlockAfter(doc,candidate,insertAfterId):placeBlock(doc,candidate));
      return true;
    } catch(error){notify(error instanceof Error?error.message:t("暂时无法放置组件"));return false;}
  },[finishAdding,notify,insertAfterId]);
  useEffect(()=>{
    // Share pages link back with ?library=mine after copying a component.
    const url=new URL(window.location.href);
    if(url.searchParams.get('library')!=='mine')return;
    setSidebarTab('components');setGroup(customGroup);setShowSidebar(true);
    url.searchParams.delete('library');window.history.replaceState(window.history.state,'',url);
  },[]);
  function resetComponent(id:string) {
    const doc=current.current,block=doc?.blocks.find(item=>item.id===id);if(!doc||!block)return;
    if(block.type==='custom'){
      // A custom instance resets its fields to the copied definition; code, geometry and appearance stay.
      update({...doc,blocks:doc.blocks.map(item=>item.id===id?resetCustomInstance(item):item)});
      notify(t("实例字段已恢复为组件默认值，可撤销"));return;
    }
    const defaults=prepareBlockForPage(createBlock(block.type),doc.settings).props;
    update({...doc,blocks:doc.blocks.map(item=>item.id===id?{...item,props:{...defaults,...(item.props.contentScale === undefined ? {} : {contentScale:item.props.contentScale})}}:item)});
    notify(t("组件属性已恢复默认，可撤销"));
  }
  function startInsert(id:string){setInsertAfterId(id);setSidebarTab('components');setShowSidebar(true);setQuery('');setGroup('全部');notify(t("选择左侧组件，将自动插入选中组件下方"));}
  const changeLayer=useCallback((id:string,action:LayerAction)=>{
    const doc=current.current;if(!doc)return;
    const next=moveBlockLayer(doc,id,action);if(next===doc)return;
    update(next);setSelected(id);
    notify({lower:t("已置于下一层"),raise:t("已置于上一层"),top:t("已置于顶层"),bottom:t("已置于底层")}[action]);
  },[update,notify]);

  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||dragging||aiBusyRef.current)return;
      if(window.document.querySelector('dialog[open], [data-slot=dialog-content], [role=menu]'))return;
      if(e.key==='Escape'){setFullPreview(false);setShowHelp(false);setPageMenuOpen(false);setShowSidebar(false);return;}
      const target=e.target as HTMLElement;const typing=['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(current.current)void save(current.current);return;}
      if(typing||target.closest('[role="separator"]')||fullPreview||showHelp)return;
      if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='a'&&target.closest('.layer-list')){e.preventDefault();setSelection(current.current?.blocks.map(block=>block.id)??[]);setInspector(true);return;}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'&&selected){e.preventDefault();duplicate(selected);}
      if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();remove(selected);}
    };
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[undo,redo,selected,remove,duplicate,save,fullPreview,showHelp,dragging]);

  function inspectComponent(id:string,tab:InspectorTab,advanced?:boolean) {
    if(!selectedIds.includes(id)||tab==='logic')setSelected(id);setInspector(true);
    setInspectorRequest(previous=>({tab,advanced,sequence:(previous?.sequence??0)+1}));
  }
  function inspectPage(section:PageSettingsSection) {
    setSelected(null);setInspector(true);
    setInspectorRequest(previous=>({tab:'page',section,sequence:(previous?.sequence??0)+1}));
  }

  function updateSettings(settings:Partial<PageDocument['settings']>) {
    const doc=current.current;if(!doc)return;
    const next={...doc.settings,...settings};
    update({...doc,settings:next,blocks:doc.blocks.map(block=>block.frame?{...block,frame:clampFrame(block.frame,next,block.props.contentScale)}:block)});
  }

  function updateFrame(id:string,frame:BlockFrame) {
    const doc=current.current;if(!doc)return;
    update({...doc,blocks:doc.blocks.map(block=>block.id===id?{...block,frame:clampFrame(frame,doc.settings,block.props.contentScale)}:block)});
  }
  function linkChartFilter(blockId:string){
    try{
      const site=siteRef.current,page=current.current;
      if(!site||!page?.id)throw new Error(t('请先选择页面和图表。'));
      const result=configureChartFilter(site,page.id,blockId);
      updateSite(result.site,siteTarget);
      notify(t('已为 {0} 个组件关联分类筛选', { 0: result.linked }) + (result.skipped ? t('；{0} 个已有筛选未更改', { 0: result.skipped }) : ''));
    }catch(error){notify(error instanceof Error?error.message:t('暂时无法配置分类筛选'));}
  }
  function alignComponent(id:string,alignment:HorizontalAlignment) {
    const doc=current.current,block=doc?.blocks.find(block=>block.id===id);if(!doc||!block)return;
    setSelected(id);
    updateFrame(id,alignFrame(block.frame??defaultFrame(block.type,doc.settings.maxWidth),doc.settings,alignment,block.props.contentScale));
  }
  function fillComponentWidth(id:string) {
    const doc=current.current;if(!doc)return;
    try {
      const frame=fillBlockWidth(doc,id);
      setSelected(id);updateFrame(id,frame);
      notify(t("已填满当前区域的可用宽度"));
    } catch(error){notify(error instanceof Error?error.message:t("暂时无法填充组件宽度"));}
  }
  function onDragStart(event:DragStartEvent) {
    const doc=current.current;if(!doc)return;
    const type=event.active.data.current?.type as BuiltinComponentType|undefined;
    const candidate=type?prepareBlockForPage(createBlock(type),doc.settings):null;
    dragCandidate.current=candidate;setDragCanvasScale(null);setDragging(candidate);
    if(candidate)setView(view=>view==='preview'?'split':view);
  }
  function paletteDropTarget(event:DragMoveEvent) {
    const doc=current.current,candidate=dragCandidate.current;
    const stage=window.document.querySelector<HTMLElement>('[data-free-stage]');
    const viewport=window.document.querySelector<HTMLElement>('[data-canvas-viewport]');
    const point=paletteDropPointer(event.collisions,event.active.rect.current.translated);
    if(!doc||!candidate||!stage||!viewport||!point||!pointInViewport(point,viewport.getBoundingClientRect()))return null;
    const scale=Number(stage.dataset.scale)||1;
    const position=canvasDropPosition(point,stage.getBoundingClientRect(),scale,defaultFrame(candidate.type,canvasBounds(doc.settings).width).width);
    return {doc,candidate,position,scale};
  }
  function onDragMove(event:DragMoveEvent){setDragCanvasScale(paletteDropTarget(event)?.scale??null);}
  function clearDrag(){setDragging(null);setDragCanvasScale(null);dragCandidate.current=null;}
  function onDragEnd(event:DragEndEvent) {
    const target=paletteDropTarget(event);
    clearDrag();
    const doc=current.current;if(!doc)return;
    const {active,over}=event;
    if(active.data.current?.from==='palette'){
      if(!target)return;
      try {
        finishAdding(insertAfterId?insertBlockAfter(target.doc,target.candidate,insertAfterId):placeBlock(target.doc,target.candidate,target.position));
      } catch(error){notify(error instanceof Error?error.message:t("暂时无法放置组件"));}
    } else {
      if(!over)return;
      const from=doc.blocks.findIndex(b=>b.id===active.id);const to=over.id==='canvas'?doc.blocks.length-1:doc.blocks.findIndex(b=>b.id===over.id);
      if(from>=0&&to>=0&&from!==to){update({...doc,blocks:arrayMove(doc.blocks,from,to)});notify(t("组件顺序已更新"));}
    }
  }
  function download() {
    if(!site)return;const url=URL.createObjectURL(new Blob([JSON.stringify(site,null,2)],{type:'application/json'}));
    const link=window.document.createElement('a');link.href=url;link.download=`${site.name.replace(/[\\/:*?"<>|]/g,'-')||'site'}.json`;link.click();URL.revokeObjectURL(url);setPageMenuOpen(false);notify(t("站点配置已导出"));
  }
  async function exportCode(format: Format) {
    if (!site) return;
    try {
      notify(t("正在准备官方动效运行时…"));
      await downloadCode(site, format);
      setPageMenuOpen(false);
      notify(t("{0}已导出", { 0: { html: t('HTML 站点'), vue: t('Vue 组件'), react: t('React 组件') }[format] }));
    } catch {
      notify(t("代码导出失败，请重试"));
    }
  }
  async function importFile(file?:File) {
    if(!file)return;
    try {
      if(file.size>2*1024*1024)throw new Error(t("站点文件不能超过 2 MiB"));
      const next=parseStudioDocument(JSON.parse(await file.text())), nextSite=toSiteDocument(next);
      updateSite(nextSite,nextSite.homePageId);setSelected(null);setInsertAfterId(null);notify(t("已导入「{0}」", { 0: next.name }));
    } catch(error){notify(t("导入失败：{0}", { 0: error instanceof Error?translateMessage(error.message):t('文件格式不正确') }));}
    if(fileRef.current)fileRef.current.value='';
  }

  function loadInteractionDemo() { const next=createInteractionDemo(); next.settings.customThemes=document?.settings.customThemes??[]; void startNewDocument(next); }

  function openThemeDesigner(scope:'component'|'page', id?:ThemeId) {
    const doc=current.current;if(!doc)return;
    const block=scope==='component'?doc.blocks.find(item=>item.id===selected):undefined;
    const source=getTheme(id??block?.props.theme??doc.settings.theme,doc.settings.customThemes);
    const initial:CustomTheme={...source,id:id?.startsWith('custom-')?id as CustomTheme['id']:`custom-${crypto.randomUUID()}`};
    if(!id){
      let name=t("我的主题"),index=2;while(doc.settings.customThemes?.some(theme=>theme.name===name))name=t("我的主题 {0}", { 0: index++ });
      initial.name=name;
      initial.accent=block?.props.accent??(block?.props.theme?source.accent:doc.settings.accent);
      initial.canvas=block?.props.theme?source.canvas:doc.settings.background;
      if(block?.props.background)initial.panel=block.props.background;
      if(block?.props.color)initial.text=block.props.color;
      if(block?.props.radius!==undefined)initial.radius=block.props.radius;
    }
    setThemeDesign({initial,editing:!!id,blockId:block?.id,blockIds:block&&selectedIds.length>1?[...selectedIds]:undefined,scopeName:block?selectedIds.length>1?t("{0} 个组件", { 0: selectedIds.length }):t("「{0}」组件", { 0: blockName(block.type) }):t("页面")});
  }

  const activeEntry=site?.pages.find(entry=>entry.id===siteTarget);
  const editorNavigation=useMemo<SiteNavigation|null>(()=>site?{navigate:()=>false,href:raw=>raw,isCurrent:raw=>matchSiteRoute(site,raw)?.entry.id===siteTarget,back:()=>{},params:{},siteName:site.name,pages:site.pages,currentPageId:siteTarget,currentPath:activeEntry?.path??'/',route:activeEntry?{path:activeEntry.path,pageId:siteTarget,pattern:activeEntry.path,params:{}}:undefined}:null,[site,siteTarget,activeEntry?.path]);
  if(!site||!document)return <div className="loading-screen"><Brand phase={loadError?'idle':'loading'}/>{loadError?<><AlertCircle size={28}/><p role="alert">{translateMessage(loadError)}</p><StudioButton className="primary-button" onClick={()=>void load()}>{t("重新读取")}</StudioButton></>:<p role="status">{t("正在打开你的创作空间…")}</p>}</div>;
  const selectedBlock=document.blocks.find(b=>b.id===selected);
  const selectedBlocks=document.blocks.filter(block=>selectedIds.includes(block.id));
  const variableBlock=document.blocks.find(b=>b.id===variableBlockId);
  const filtered=catalog.filter(c=>(group==='全部'||c.group===group)&&`${c.name} ${c.english} ${c.description} ${t(c.group)} ${t(c.description)}`.toLowerCase().includes(query.toLowerCase()));
  const saveText=saveState==='saved'?(cloudTarget?t("已保存到云端"):t("已保存到浏览器")):saveState==='saving'?t("保存中"):saveState==='error'?t("保存失败"):t("待保存");
  return <DataRuntimeProvider sources={site.dataSources ?? []} access={{ scope: 'editor', pageId: cloudTarget?.id }}><InspectorDisclosureProvider value={{preferences:inspectorDisclosures,revision:disclosureRevision,onChange:changeInspectorDisclosure}}><CustomLibraryContext.Provider value={customLibrary}><SiteNavigationContext.Provider value={editorNavigation}><div className="studio-app">
    <header className="app-header" inert={aiBusy}>
      <div className="header-brand"><IconButton label={t("打开组件与页面工具")} className="mobile-menu" onClick={()=>setShowSidebar(!showSidebar)}><Menu size={18}/></IconButton><Brand phase="ready"/><a className="version-label" href={`https://github.com/kiritoko1029/animate-studio/releases/tag/v${appVersion}`} target="_blank" rel="noreferrer" aria-label={t("当前版本 v{0}，查看更新日志", { 0: appVersion })} title={t("v{0} · 查看更新日志", { 0: appVersion })}>v{appVersion}</a></div>
      <div className="document-heading"><span className="header-slash">/</span><input aria-label={t("页面名称")} value={document.name} onChange={e=>update({...document,name:e.target.value})} maxLength={100}/><span className={`save-status ${saveState}`} title={saveState==='error'?translateMessage(saveError):savedAt?t("保存于 {0}", { 0: new Date(savedAt).toLocaleTimeString(getLocale()) }):cloudTarget?t("自动保存到云端"):t("自动保存到当前浏览器")}>{saveState==='saved'?<CheckCircle2 size={13}/>:saveState==='saving'?<LoaderCircle size={13} className="spin"/>:saveState==='error'?<AlertCircle size={13}/>:<span className="pending-dot"/>}{saveText}</span>{saveState==='error'&&<StudioButton className="retry-save" onClick={()=>void save(document)}>{t("重试")}</StudioButton>}</div>
      <div className="header-actions">
        <div className="history-controls" role="group" aria-label={t("编辑历史")}><IconButton label={t("撤销 (⌘Z)")} onClick={undo} disabled={!past.length}><Undo2 size={16}/></IconButton><IconButton label={t("重做 (⌘⇧Z)")} onClick={redo} disabled={!future.length}><Redo2 size={16}/></IconButton></div>
        <DropdownMenu open={pageMenuOpen} onOpenChange={setPageMenuOpen}>
          <DropdownMenuTrigger asChild><StudioButton className="secondary-button page-actions-button" aria-label={t("页面操作")}><FilePlus2 size={15}/><span>{t("页面")}</span><ChevronDown size={12}/></StudioButton></DropdownMenuTrigger>
          <DropdownMenuContent className="studio-menu page-actions-menu" align="end" sideOffset={8}>
            <DropdownMenuLabel>{t("新建页面")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={()=>{const next=createDocument(true);next.settings.customThemes=document.settings.customThemes??[];void startNewDocument(next);}}><FilePlus2 size={15}/>{t("空白页面")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>{setPageMenuOpen(false);setPageCreationOpen(true);}}><LayoutTemplate size={15}/>{t("从任务或模板开始…")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={loadInteractionDemo}><Code2 size={15}/>{t("组件联动示例")}</DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuLabel>{t("导出")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={()=>exportCode('html')}><Code2 size={15}/>{t("导出 HTML")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>exportCode('vue')}><Code2 size={15}/>{t("导出 Vue")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>exportCode('react')}><Code2 size={15}/>{t("导出 React")}</DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuItem onSelect={download}><Download size={15}/>{t("导出页面 JSON")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>{fileRef.current?.click();setPageMenuOpen(false);}}><Upload size={15}/>{t("导入页面 JSON")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <StudioButton className="primary-button preview-button" aria-label={t("预览页面")} title={t("预览页面")} onClick={()=>setFullPreview(true)}><Play size={13} fill="currentColor"/>{t("预览页面")}</StudioButton><AccountControls studioTheme={studioTheme} onToggleTheme={changeStudioTheme} targetId={cloudTarget?.id??null} onSaveCloud={saveCloud} onOpenPage={openCloud} onDeletePage={deleteCloud} onPublish={publishCloud} onBeforeSignOut={returnToGuest} onGuest={returnToGuest} notify={notify}/>
      </div>
    </header>
    <DndContext sensors={sensors} collisionDetection={collision} autoScroll={false} onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={onDragMove} onDragEnd={onDragEnd} onDragCancel={clearDrag}>
      <ResizableStudioLayout inspectorOpen={inspector} disabled={!!dragging || aiBusy} inert={aiBusy}>
        {showSidebar&&<div className="sidebar-backdrop" onClick={()=>setShowSidebar(false)}/>}
        <aside id="component-sidebar-panel" className={`component-sidebar ${showSidebar?'shown':''}`}>
          <Tabs value={sidebarTab} onValueChange={value=>setSidebarTab(value as typeof sidebarTab)} className="studio-tab-root"><TabsList className="studio-tabs sidebar-tabs" aria-label={t("组件、页面与图层")}><TabsTrigger value="components" id="sidebar-tab-components" aria-controls="sidebar-panel"><LayoutDashboard size={15}/>{t("组件")}</TabsTrigger><TabsTrigger value="pages" id="sidebar-tab-pages" aria-controls="sidebar-panel"><FilePlus2 size={15}/>{t("页面")}<span>{site?.pages.length??0}</span></TabsTrigger><TabsTrigger value="layers" id="sidebar-tab-layers" aria-controls="sidebar-panel"><Layers size={15}/>{t("图层")}<span>{document.blocks.length}</span></TabsTrigger></TabsList></Tabs>
          <div className="sidebar-content" role="tabpanel" id="sidebar-panel" aria-labelledby={`sidebar-tab-${sidebarTab}`}>{sidebarTab==='components'?<>
            <div className="library-intro"><div><h2>{t("组件库")}</h2><span>{catalog.length}</span></div></div>
            <div className="search-box"><Search size={14}/><input aria-label={t("搜索组件")} placeholder={t("搜索组件…")} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<StudioButton onClick={()=>setQuery('')} aria-label={t("清除搜索")}><X size={12}/></StudioButton>}</div>
            <div className="category-filter">{['全部',...new Set(catalog.map(item=>item.group)),customGroup].map(g=><StudioButton key={g} className={group===g?'active':''} onClick={()=>setGroup(g)}>{t(g)}</StudioButton>)}</div>
            <div className="library-scroll">{insertAfterId&&<div className="insert-notice"><span>{t("选择组件，插入选中项之后")}</span><StudioButton aria-label={t("取消插入")} onClick={()=>setInsertAfterId(null)}><X size={13}/></StudioButton></div>}{group===customGroup?<CustomComponentLibrary onCreateWithAi={target => { setShowSidebar(false); setAiComponentRequest(previous => ({ ...target, owner: userRef.current ? `account:${userRef.current.id}` : 'guest', sequence: (previous?.sequence ?? 0) + 1 })); }} page={document} query={query} onAdd={addCustom} onOpenDesigner={openDesigner} onRequestLogin={()=>setLoginOpen(true)} notify={notify}/>:<>{group==='全部'&&!query&&<StudioButton className="custom-entry" onClick={()=>setGroup(customGroup)}><span className="custom-entry-icon"><Puzzle size={16}/></span><span><strong>{t("我的组件")}</strong><small>{t("用 HTML、CSS、JavaScript 编写自己的组件 ·")}{customLibrary.local.components.length} {t("个本机组件")}</small></span><ChevronRight size={14}/></StudioButton>}<div className="library-section-heading"><span>{group==='全部'?t("所有组件"):t("{0}组件", { 0: t(group) })}</span><span>{filtered.length}</span></div><div className="component-grid">{filtered.map(c=><PaletteItem key={c.type} type={c.type} onAdd={()=>add(c.type)}/>)}</div>{!filtered.length&&<div className="search-empty"><Search size={23}/><p>{t("没有找到相关组件")}</p><StudioButton className="text-button" onClick={()=>{setQuery('');setGroup('全部');}}>{t("查看所有组件")}</StudioButton></div>}</>}</div>
          </>:sidebarTab==='pages'&&site?<SiteNavigator site={site} target={siteTarget} disabled={aiBusy} notify={notify} onSelect={id=>{if(selectWorkspaceTarget(id)){setSelected(null);setShowSidebar(false);}}} onChange={(next,id)=>{try{updateSite(next,id);if(id)setSelected(null);}catch(error){notify(error instanceof Error?error.message:t('站点修改失败'));}}}/>:<div className="layer-list"><div className="layer-heading"><span><LayoutTemplate size={14}/> {t("首页")}</span><small>{t("顶部 → 底部")}</small></div>{[...document.blocks].reverse().map((block,index)=>{const I=icons[block.type];return <div key={block.id} className={`layer-item ${selectedIds.includes(block.id)?'selected':''}`}><StudioButton aria-pressed={selectedIds.includes(block.id)} onClick={event=>{selectComponent(block.id,event.shiftKey||event.metaKey||event.ctrlKey);setCanvasReveal(n=>n+1);setInspector(true);setView(v=>v==='preview'?'split':v);}}><I size={15}/><span>{block.props.title||block.props.label||blockLabel(block)}</span></StudioButton><span className="layer-order">{document.blocks.length-index}</span><div className="layer-actions"><IconButton label={t("将{0}置于上一层", { 0: blockName(block.type) })} disabled={index===0} onClick={()=>changeLayer(block.id,'raise')}><ArrowUp size={12}/></IconButton><IconButton label={t("将{0}置于下一层", { 0: blockName(block.type) })} disabled={index===document.blocks.length-1} onClick={()=>changeLayer(block.id,'lower')}><ArrowDown size={12}/></IconButton></div></div>;})}{!document.blocks.length&&<p className="muted-note">{t("添加组件后，图层会出现在这里。")}</p>}</div>}
          </div><div className="sidebar-bottom"><a className="animate-credit" title="Animate UI v2.1.2 · @animate-ui/react 2.0.0" href="https://animate-ui.com/docs" target="_blank" rel="noreferrer"><span className="animate-mark">a.</span><span>{t("由 Animate UI v2 驱动")}</span><ExternalLink size={11}/></a></div>
        </aside>
        <main className="workspace">
          <div className="workspace-toolbar"><div className="workspace-breadcrumb"><LayoutTemplate size={14}/><span>{t("首页")}</span><ChevronRight size={12}/><strong>{t("页面编辑器")}</strong></div><div className="toolbar-end"><StudioTooltip label={t("管理页面数据与脚本")}><StudioButton className="secondary-button page-logic-button" aria-label={t("数据与脚本")} aria-haspopup="dialog" onClick={()=>setLogicTarget({tab:'data'})}><Braces size={15}/><span>{t("数据与脚本")}</span></StudioButton></StudioTooltip><Tabs value={view} onValueChange={value=>setView(value as View)} className="studio-tab-root"><TabsList className="studio-tabs view-switch" aria-label={t("画布视图")}>{([{id:'edit',name:t("编辑"),icon:MousePointer2},{id:'split',name:t("并排"),icon:Columns2},{id:'preview',name:t("预览"),icon:Eye}] as const).map(v=><TabsTrigger key={v.id} value={v.id} id={`view-tab-${v.id}`} aria-controls="workspace-canvas-panel" aria-label={t("{0}模式", { 0: v.name })}><v.icon size={13}/>{v.name}</TabsTrigger>)}</TabsList></Tabs><span className="toolbar-separator"/><div className="device-toggle"><IconButton label={t("桌面视图")} active={device==='desktop'} onClick={()=>setDevice('desktop')}><Monitor size={16}/></IconButton><IconButton label={t("手机视图")} active={device==='mobile'} onClick={()=>setDevice('mobile')}><Smartphone size={16}/></IconButton></div><span className="toolbar-separator"/><IconButton label={t("切换属性面板")} active={inspector} onClick={()=>setInspector(!inspector)}><Settings2 size={16}/></IconButton></div></div>
          {saveState==='error'&&<div className="save-error-banner" role="alert"><AlertCircle size={14}/><span>{translateMessage(saveError)}{t("，修改仍保留在画布中。")}</span><StudioButton onClick={()=>void save(document)}>{t("重新保存")}</StudioButton></div>}
          <div className={`canvas-workspace view-${view}`} role="tabpanel" id="workspace-canvas-panel" aria-labelledby={`view-tab-${view}`}>
            {view!=='preview'&&<section className={`canvas-pane edit-pane ${aiBusy ? 'ai-operating' : ''}`} aria-busy={aiBusy}><div className="pane-heading"><span><MousePointer2 size={13}/><strong>{t("编辑画布")}</strong><span className="pane-tag">{aiBusy ? t("AI 编辑中") : t("可编辑")}</span></span><span className="pane-hint">{aiBusy ? t("暂停后可手动编辑") : t("自由摆放 · 网格吸附")}</span></div><FreeCanvas aiBusy={aiBusy} aiChanges={aiChanges} revealKey={canvasReveal} document={document} selected={selected} selectedIds={selectedIds} onSelect={selectComponent} onSelectAll={()=>{setSelection(document.blocks.map(block=>block.id));setInspector(true);}} onFramesChange={frames=>update({...document,blocks:document.blocks.map(block=>frames[block.id]?{...block,frame:frames[block.id]}:block)})} onInspect={inspectComponent} onCreateVariable={id=>{setSelected(id);setVariableBlockId(id);}} onPageMarginChange={padding=>updateSettings({padding})} onPageSettings={inspectPage} onFrameChange={updateFrame} onBlockChange={block=>update({...document,blocks:document.blocks.map(b=>b.id===block.id?block:b)})} onAlign={alignComponent} onFillWidth={fillComponentWidth} onLayerChange={changeLayer} onCanvasSizeChange={({width,height})=>updateSettings({maxWidth:width,canvasHeight:height})} onDelete={remove} onDuplicate={duplicate} onInsertAfter={startInsert} isDragging={!!dragging} device={device}/></section>}
            {view!=='edit'&&<section className="canvas-pane preview-pane"><div className="pane-heading"><span><Eye size={14}/><strong>{t("实时预览")}</strong><span className="live-indicator"/> </span><IconButton label={t("重播动画")} onClick={()=>setReplay(n=>n+1)}><Play size={12}/></IconButton></div><div className={`preview-scroll ${device==='mobile'?'mobile':''}`}><div className="preview-browser" style={{maxWidth:device==='mobile'?375:document.settings.maxWidth}}><div className="browser-bar"><div className="browser-dots"><i/><i/><i/></div><span><span className="lock-icon">⌑</span> {document.name||t("未命名页面")}</span><RotateCcw size={10}/></div><SitePreview document={site} toolbar initialPath={activeEntry?.path??'/'} replayKey={replay} dataPageId={cloudTarget?.id}/></div><div className="preview-footnote"><span className="live-indicator"/>{t("与编辑画布实时同步")}</div></div></section>}
          </div>
          <footer className="workspace-status"><span><span className="connection-dot"/>{t("创作空间")}<span className="status-separator">/</span>{document.blocks.length} {t("个组件")}</span><span><kbd>⌘ Z</kbd> {t("撤销")}<StudioButton onClick={()=>setShowHelp(true)}><CircleHelp size={13}/>{t("快捷键与帮助")}</StudioButton></span></footer>
        </main>
        {variableBlock&&<ComponentVariableDialog key={variableBlock.id} page={document} block={variableBlock} onClose={()=>setVariableBlockId(null)} onCreate={(key,variable)=>{
          const page=current.current;if(!page)return;
          update(createComponentVariable(page,variableBlock.id,key,variable));
          setVariableBlockId(null);inspectComponent(variableBlock.id,'logic');notify(t("已创建变量 {0} 并绑定，可撤销", { 0: variable.name }));
        }}/>}
        {inspector&&(selectedBlocks.length>1?<BatchInspector key={selectedIds.join(',')} request={inspectorRequest} document={document} blocks={selectedBlocks} onPatch={patch=>update(patchSelection(document,selectedIds,patch))} onBlocksChange={blocks=>update(replaceSelectedBlocks(document,blocks))} onTheme={theme=>update(themeSelection(document,selectedIds,theme))} onDesignTheme={()=>openThemeDesigner('component')} onClose={()=>setInspector(false)} onDelete={()=>selected&&remove(selected)} onDuplicate={()=>selected&&duplicate(selected)}/>:<Inspector site={site} request={inspectorRequest} studioTheme={studioTheme} onOpenStudio={setLogicTarget} onConfigureFilter={linkChartFilter} onOpenDesigner={openDesigner} notify={notify} onBlockChange={block=>update({...document,blocks:document.blocks.map(b=>b.id===block.id?block:b)})} document={document} selected={selectedBlock} onDesignTheme={openThemeDesigner} onDeleteTheme={theme=>{update(deleteCustomTheme(document,theme));notify(t("主题已删除，相关组件已恢复继承，可撤销"));}} onPageTheme={theme=>{update(applyPageTheme(document,theme));notify(t("已应用{0}", { 0: theme.startsWith('custom-') ? getTheme(theme,document.settings.customThemes).name : t(getTheme(theme,document.settings.customThemes).name) }));}} onUpdate={props=>{if(!selectedBlock)return;update({...document,blocks:document.blocks.map(b=>b.id===selectedBlock.id?{...b,props:{...b.props,...props}}:b)});}} onFrame={frame=>selected&&updateFrame(selected,frame)} onSettings={updateSettings} onClose={()=>setInspector(false)} onDelete={()=>selected&&remove(selected)} onDuplicate={()=>selected&&duplicate(selected)} onReset={()=>selected&&resetComponent(selected)}/>)}
      </ResizableStudioLayout>
      <PaletteDragPreview block={dragging} settings={document.settings} canvasScale={dragCanvasScale}/>
    </DndContext>
    {pageCreationOpen&&<PageCreationDialog onClose={()=>setPageCreationOpen(false)} onSelect={async task=>{const next=createTaskSiteDocument(task);next.pages[0].page.settings.customThemes=document.settings.customThemes??[];if(await startNewDocument(next))setPageCreationOpen(false);}} onBlank={async()=>{const next=createDocument(true);next.settings.customThemes=document.settings.customThemes??[];if(await startNewDocument(next))setPageCreationOpen(false);}} onAi={()=>{setPageCreationOpen(false);setAiPageRequest(value=>value+1);}} onAiSite={()=>{setPageCreationOpen(false);setAiSiteRequest(value=>value+1);}}/>}
    <Suspense fallback={null}><AiAssistant key={user?.id ?? 'guest'} page={document} owner={user ? `account:${user.id}` : 'guest'} signedIn={!!user} cloudPageId={cloudTarget?.id ?? null}
      pageRequest={aiPageRequest} componentRequest={aiComponentRequest} onAddComponent={addCustom} onOpenDesigner={openDesigner} onRequestLogin={() => setLoginOpen(true)}
      selectedBlockIds={selectedIds}
      getSurface={() => window.document.querySelector<HTMLElement>('.free-canvas-stage') ?? window.document.querySelector<HTMLElement>('.preview-pane .page-surface')}
      onRevealBlock={id => { if (!aiBusyRef.current) { setView('edit'); setSelected(id); setCanvasReveal(value => value + 1); } }}
      getPage={() => current.current!}
      onRunningChange={running => changeAiRunning('page', running)}
      onCommit={(next, change, runId) => {
        if (!aiBusyRef.current || !current.current || next.id !== current.current.id) throw new Error(t('页面已切换，AI 已暂停。'));
        commitWorkspace(next, runId);setAiChanges(values => [...values.filter(value => value.blockId !== change.blockId && Date.now() - value.time < 3000), change].slice(-5));
        if (change.blockId && change.kind !== 'remove') { setSelected(change.blockId); setCanvasReveal(value => value + 1); }
      }}
      onRestorePage={page => { if (page.id === current.current?.id && !aiBusyRef.current) { update(page); notify(t('已恢复所选页面版本，可撤销')); } }}
      onOpenLocal={async page => { const expected = current.current; const owner = userRef.current?.id; await flushCurrent(); if (owner !== userRef.current?.id || expected !== current.current) throw new Error(t('当前页面又有新修改，请保存后重试。')); activateDocument(toFreeDocument(page), { page: null, savedAt: null }, null); }}
      onOpenCloud={openCloud}
      onCreatePage={() => { const next = createDocument(true); next.settings.customThemes = current.current?.settings.customThemes ?? []; return startNewDocument(next); }}
      onCreateSite={() => { if (aiOwner.current === 'page') { notify(t('请先暂停当前页面 AI 任务，再创建整站。')); return; } setAiSiteRequest(value => value + 1); }}
    /><AiSiteStudio site={site} owner={user ? `account:${user.id}` : 'guest'} openRequest={aiSiteRequest} getSite={() => siteRef.current!}
      onRunningChange={running => changeAiRunning('site', running)}
      onCommit={next => { if (siteRef.current?.id !== next.id) throw new Error(t('站点已切换，AI 结果未应用。')); aiBusyRef.current = false; aiCloudPending.current = !!cloudTargetRef.current; updateSite(next, next.homePageId); setSelected(null); notify(t(cloudTargetRef.current ? '整站已应用到当前草稿，云端待保存' : '整站已应用，可撤销恢复')); }}
    /></Suspense>
    {designer&&<Suspense fallback={null}><ComponentDesigner key={designer.sequence} request={designer} page={document} onClose={()=>setDesigner(null)} onAddToPage={addCustom} onRequestLogin={()=>setLoginOpen(true)} notify={notify}/></Suspense>}
    {loginOpen&&<LoginDialog onClose={()=>setLoginOpen(false)}/>}
    {logicTarget&&<Suspense fallback={null}><InteractionStudio initialTarget={logicTarget} page={document} site={site} onSiteChange={updateSite} dataPageId={cloudTarget?.id} onChange={update} onClose={()=>setLogicTarget(null)} onDemo={loadInteractionDemo}/></Suspense>}
    {themeDesign&&<ThemeDesigner initial={themeDesign.initial} editing={themeDesign.editing} scopeName={themeDesign.scopeName} existingNames={(document.settings.customThemes??[]).map(theme=>theme.name)} canCreate={(document.settings.customThemes?.length??0)<30} usageCount={(document.settings.theme===themeDesign.initial.id?1:0)+document.blocks.filter(block=>block.props.theme===themeDesign.initial.id).length} onClose={()=>setThemeDesign(null)} onSave={theme=>{const next=saveCustomTheme(document,theme,themeDesign.blockId);update(themeDesign.blockIds?themeSelection(next,themeDesign.blockIds,theme.id):next);setThemeDesign(null);notify(t("已应用「{0}」，正在自动保存", { 0: theme.name }));}}/>}
    <input type="file" accept=".json,application/json" ref={fileRef} hidden onChange={e=>void importFile(e.target.files?.[0])}/>
    <AnimatePresence>{toast&&<motion.div className="toast" role="status" initial={{opacity:0,y:12,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:8}}><CheckCircle2 size={16}/>{translateMessage(toast)}<StudioButton aria-label={t("关闭提示")} onClick={()=>setToast('')}><X size={13}/></StudioButton></motion.div>}</AnimatePresence>
    {fullPreview&&<StudioDialog title={t("页面预览")} className="full-preview" onClose={()=>setFullPreview(false)}><header><StudioButton className="secondary-button" autoFocus onClick={()=>setFullPreview(false)}><ArrowLeft size={14}/>{t("返回编辑")}</StudioButton><span>{document.name}</span><div><IconButton label={t("桌面预览")} active={device==='desktop'} onClick={()=>setDevice('desktop')}><Monitor size={17}/></IconButton><IconButton label={t("手机预览")} active={device==='mobile'} onClick={()=>setDevice('mobile')}><Smartphone size={17}/></IconButton><IconButton label={t("重播页面动画")} onClick={()=>setReplay(n=>n+1)}><RotateCcw size={16}/></IconButton></div></header><div className={`full-preview-scroll ${device}`}><div className="full-preview-page" style={{maxWidth:device==='mobile'?375:document.settings.maxWidth}}><SitePreview document={site} toolbar initialPath={activeEntry?.path??'/'} replayKey={replay} dataPageId={cloudTarget?.id}/></div></div></StudioDialog>}
    {showHelp&&<StudioDialog title={t("快捷键与帮助")} className="help-dialog" onClose={()=>setShowHelp(false)}><div className="modal-heading"><h2>{t("让创作更顺手")}</h2><IconButton label={t("关闭帮助")} onClick={()=>setShowHelp(false)}><X size={18}/></IconButton></div><p>{t("拖入组件 → 拖动位置与大小 → 查看预览。修改会自动保存。")}</p><div className="shortcut-list">{[[t("全选画布组件"),'⌘ / Ctrl + A'],[t("增减选择"),t("Shift / ⌘ / Ctrl + 点击")],[t("撤销"),'⌘ / Ctrl + Z'],[t("重做"),'⌘ / Ctrl + Shift + Z'],[t("复制选中组件"),'⌘ / Ctrl + D'],[t("删除选中组件"),'Delete / Backspace'],[t("立即保存"),'⌘ / Ctrl + S'],[t("缩放画布"),t("{0} + 滚轮 / + / −", { 0: canvasModifierLabel })],[t("平移画布"),t("空格 + 拖动 / 中键")],[t("适应画布"),`${canvasModifierLabel} + 0`],[t("恢复 100%"),`${canvasModifierLabel} + 1`],[t("关闭预览与弹窗"),'Esc']].map(([name,key])=><div key={name}><span>{name}</span><kbd>{key}</kbd></div>)}</div><p className="help-note">{t("拖动八个控制点调整大小，按住 Shift 暂停网格吸附。点击添加会自动寻找空白区域；选中组件工具栏的加号可在其后插入，并整体下移后续内容。方向键微调位置，Shift + 方向键移动 8px。")}</p><a href="https://animate-ui.com/docs" target="_blank" rel="noreferrer">{t("查看 Animate UI 文档")}<ExternalLink size={13}/></a></StudioDialog>}
  </div></SiteNavigationContext.Provider></CustomLibraryContext.Provider></InspectorDisclosureProvider></DataRuntimeProvider>;
}
