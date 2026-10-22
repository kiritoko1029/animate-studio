import { CatalogQuestionnaire } from './CatalogQuestionnaire';
import { CatalogSidebar } from './CatalogSidebar';
import { officialClass, officialStyle } from '../lib/official-motion';
import { useOfficialOpen } from './useOfficialOpen';
import { useContext, useId, useState, type CSSProperties } from 'react';
import { Check, Copy, PanelLeft, PanelLeftClose, Circle, ChevronDown, X, Pin, PinOff, CircleCheck, CircleAlert, Info, LoaderCircle } from 'lucide-react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { CopyButton, CopyButtonIcon } from '@animate-ui/react/primitives/buttons/copy';
import { CodeBlock } from './animate-ui/registry/code-block';
import { PinnedList, PinnedListPinned, PinnedListUnpinned, PinnedListItems, PinnedListItem, PinnedListTrigger, PinnedListLabel } from '@animate-ui/react/primitives/pinned-list';
import * as Sidebar from '@animate-ui/react/primitives/sidebar';
import { Combobox } from '@animate-ui/react/primitives/base-ui/combobox';
import { Toast } from '@animate-ui/react/primitives/base-ui/toast';
import { Questionnaire } from '@animate-ui/react/primitives/questionnaire';
import { ScrollProgress, ScrollProgressContainer, ScrollProgressProvider } from '@animate-ui/react/primitives/scroll-progress';
import { PageScrollProgress } from './PageScrollProgress';
import { safeUrl, type Block, type ExtendedComponentType } from '../model';
import { PageBlockTheme } from './PagePreviewTheme';
import { useBlockValue } from './NativeInteractions';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import { motionProps } from '../lib/official-motion';
import { getTheme } from '../lib/themes';
import OfficialMotionGrid from './OfficialMotionGrid';

function ToastExample({ block }: { block: Block }) {
  const manager = Toast.useToastManager();
  const portalTheme = useContext(PageBlockTheme);
  const settings=officialAnimationProps('toast','ToastOptions',block.props.motion);
  const icons={success:CircleCheck,error:CircleAlert,warning:CircleAlert,info:Info,loading:LoaderCircle};
  return <><Button className="as-page-catalog-button" onClick={() => manager.add({title:block.props.title,description:block.props.text,type:String(settings.type || 'default'),priority:settings.priority as 'low'|'high'|undefined,timeout:typeof settings.timeout==='number'?settings.timeout:undefined})}>{block.props.label || '显示通知'}</Button><Toast.Portal {...motionProps<typeof Toast.Portal>(block,'ToastPortal')}><Toast.Viewport {...motionProps<typeof Toast.Viewport>(block,'ToastViewport')} className={officialClass('native-toast-viewport native-catalog-portal',motionProps<typeof Toast.Viewport>(block,'ToastViewport').className)} data-page-scheme={portalTheme?.colorScheme} style={officialStyle(portalTheme,motionProps<typeof Toast.Viewport>(block,'ToastViewport').style)}>{manager.toasts.map(item => {
    const Icon=icons[item.type as keyof typeof icons];
    return <Toast.Root {...motionProps<typeof Toast.Root>(block,'Toast')} key={item.id} toast={item} className={officialClass('native-toast',motionProps<typeof Toast.Root>(block,'Toast').className)}><Toast.Content {...motionProps<typeof Toast.Content>(block,'ToastContent')} className={officialClass('native-toast-content',motionProps<typeof Toast.Content>(block,'ToastContent').className)}>{Icon&&<Icon size={20} className={item.type==='loading'?'native-toast-loading':undefined}/>}<div><Toast.Title {...motionProps<typeof Toast.Title>(block,'ToastTitle')}/><Toast.Description {...motionProps<typeof Toast.Description>(block,'ToastDescription')}/>{Boolean(settings.actionLabel)&&<Toast.Action {...motionProps<typeof Toast.Action>(block,'ToastAction')} className={officialClass("native-dialog-button native-dialog-button--outline",motionProps<typeof Toast.Action>(block,'ToastAction').className)} onClick={()=>manager.close(item.id)}>{String(settings.actionLabel)}</Toast.Action>}</div><Toast.Close {...motionProps<typeof Toast.Close>(block,'ToastClose')} aria-label={motionProps<typeof Toast.Close>(block,'ToastClose')['aria-label'] ?? '关闭通知'} className={officialClass("native-toast-close",motionProps<typeof Toast.Close>(block,'ToastClose').className)}><X size={16}/></Toast.Close></Toast.Content></Toast.Root>;
  })}</Toast.Viewport></Toast.Portal></>;
}

function ScrollExample({ block }: { block: Block }) {
  const props = motionProps<typeof ScrollProgressProvider>(block,'ScrollProgressProvider');
  const horizontal = props.direction === 'horizontal';
  if (props.global) return <PageScrollProgress block={block} label={block.props.title || '阅读进度'} direction={props.direction}/>;
  return <div className="native-scroll-example"><ScrollProgressProvider {...props}><div className="native-scroll-example-bar"><ScrollProgress {...motionProps<typeof ScrollProgress>(block,'ScrollProgress')} className={officialClass("native-scroll-example-fill", (motionProps<typeof ScrollProgress>(block,'ScrollProgress')).className)}/></div><ScrollProgressContainer {...motionProps<typeof ScrollProgressContainer>(block,'ScrollProgressContainer')} className={officialClass("native-scroll-example-container", (motionProps<typeof ScrollProgressContainer>(block,'ScrollProgressContainer')).className)} style={officialStyle({overflowX:horizontal?'auto':'hidden',overflowY:horizontal?'hidden':'auto'}, (motionProps<typeof ScrollProgressContainer>(block,'ScrollProgressContainer')).style)}><div style={{display:'flex',flexDirection:horizontal?'row':'column'}}>{Array.from({length:5},(_,i)=><div key={i} className="native-scroll-example-panel">{i===0 ? <p>{block.props.text || '滚动此区域，查看进度'} <span aria-hidden="true">{horizontal?'→':'↓'}</span></p> : i%2 ? <div/> : null}</div>)}</div></ScrollProgressContainer></ScrollProgressProvider></div>;
}

/** Each catalog entry uses its own upstream primitive and motion lifecycle. */
export function CatalogComposites({ block }: { block: Block & { type: ExtendedComponentType } }) {
  const { type, props: p } = block;
  const portalTheme = useContext(PageBlockTheme);
  const id = useId();
  const opening=useOfficialOpen(block,'Combobox');
  const [value, setValue] = useBlockValue<string>('');
  const [multipleValues,setMultipleValues]=useBlockValue<string[]>([]);
  const [checked, setChecked] = useBlockValue(Boolean(p.motion?.['SidebarProvider.open'] ?? p.motion?.['SidebarProvider.defaultOpen'] ?? p.checked ?? true), 'checked');
  const [step, setStep] = useBlockValue(p.value ?? 0);
  const [submitted, setSubmitted] = useState(false);
  const [pins, setPins] = useState<string[]>(()=>((officialAnimationProps(type,'PinnedListState',p.motion).pinned as number[] | undefined) ?? []).filter(i=>Number.isInteger(i)&&i>=0&&i<(p.items || '').split('\n').filter(Boolean).length).map(i=>`${motionProps<typeof PinnedListItem>(block,'PinnedListItem').id ?? id}-${i}`));
  const options = (p.items || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => line.split('|').map(cell => cell.trim()));
  const buttonClass = 'as-page-catalog-button';
  const shell = (children: React.ReactNode) => <div className={`as-page-catalog native-catalog native-catalog--${type}`} data-animate-ui="v2-composition">{children}</div>;
  switch (type) {
    case 'sidebar': return shell(<CatalogSidebar block={block}/>);
    case 'combobox': {
      const settings=motionProps<typeof Combobox.Root>(block,'Combobox');
      const input=<label className="as-page-input-label">{p.label}<div className="native-combobox-input"><Combobox.Input {...motionProps<typeof Combobox.Input>(block,'ComboboxInput')} className={officialClass("as-page-input", (motionProps<typeof Combobox.Input>(block,'ComboboxInput')).className)} placeholder={motionProps<typeof Combobox.Input>(block,'ComboboxInput').placeholder ?? p.text} aria-label={motionProps<typeof Combobox.Input>(block,'ComboboxInput')['aria-label'] ?? p.label}/><Combobox.Clear {...motionProps<typeof Combobox.Clear>(block,'ComboboxClear')} aria-label={motionProps<typeof Combobox.Clear>(block,'ComboboxClear')['aria-label'] ?? '清除选择'}><X size={14}/></Combobox.Clear><Combobox.Trigger {...motionProps<typeof Combobox.Trigger>(block,'ComboboxTrigger')} aria-label={motionProps<typeof Combobox.Trigger>(block,'ComboboxTrigger')['aria-label'] ?? '展开选项'}><ChevronDown size={16}/></Combobox.Trigger></div></label>;
      const popup=<Combobox.Portal {...motionProps<typeof Combobox.Portal>(block,'ComboboxPortal')}><Combobox.Positioner {...motionProps<typeof Combobox.Positioner>(block,'ComboboxContent')} className={officialClass("native-menubar-positioner", (motionProps<typeof Combobox.Positioner>(block,'ComboboxContent')).className)}><Combobox.Popup {...motionProps<typeof Combobox.Popup>(block,'ComboboxPopup')} className={officialClass("as-page-catalog-popup native-catalog-popup", (motionProps<typeof Combobox.Popup>(block,'ComboboxPopup')).className)} data-page-scheme={portalTheme?.colorScheme} style={officialStyle(portalTheme, (motionProps<typeof Combobox.Popup>(block,'ComboboxPopup')).style)}><Combobox.Empty {...motionProps<typeof Combobox.Empty>(block,'ComboboxEmpty')}>没有匹配选项</Combobox.Empty><Combobox.List {...motionProps<typeof Combobox.List>(block,'ComboboxList')}>{(name:string)=><Combobox.Item {...motionProps<typeof Combobox.Item>(block,'ComboboxItem')} key={name} value={name} className={officialClass("native-combobox-option", (motionProps<typeof Combobox.Item>(block,'ComboboxItem')).className)}><Combobox.ItemIndicator {...motionProps<typeof Combobox.ItemIndicator>(block,'ComboboxItemIndicator')}><Check size={16} aria-hidden="true"/></Combobox.ItemIndicator><span>{name}</span></Combobox.Item>}</Combobox.List></Combobox.Popup></Combobox.Positioner></Combobox.Portal>;
      return shell(settings.multiple ? <Combobox.Root<string,true> {...motionProps<typeof Combobox.Root<string,true>>(block,'Combobox')} {...opening} multiple items={options.map(([name])=>name)} value={multipleValues} onValueChange={setMultipleValues}><Combobox.Chips {...motionProps<typeof Combobox.Chips>(block,'ComboboxChips')} className={officialClass("native-combobox-chips",motionProps<typeof Combobox.Chips>(block,'ComboboxChips').className)}>{multipleValues.map(name=><Combobox.Chip {...motionProps<typeof Combobox.Chip>(block,'ComboboxChip')} key={name}>{name}<Combobox.ChipRemove {...motionProps<typeof Combobox.ChipRemove>(block,'ComboboxChipRemove')} aria-label={motionProps<typeof Combobox.ChipRemove>(block,'ComboboxChipRemove')['aria-label'] ?? `移除 ${name}`}><X size={12}/></Combobox.ChipRemove></Combobox.Chip>)}</Combobox.Chips>{input}{popup}</Combobox.Root> : <Combobox.Root<string,false> {...motionProps<typeof Combobox.Root<string,false>>(block,'Combobox')} {...opening} multiple={false} items={options.map(([name])=>name)} value={value || null} onValueChange={next=>setValue(next ?? '')}>{input}{popup}</Combobox.Root>);
    }
    case 'toast': return shell(<Toast.Provider {...motionProps<typeof Toast.Provider>(block,'Toaster')} timeout={motionProps<typeof Toast.Provider>(block,'Toaster').timeout ?? p.duration ?? 5000}><ToastExample block={block}/></Toast.Provider>);
    case 'questionnaire': return shell(<CatalogQuestionnaire block={block}/>);
    case 'codeBlock': {
      const settings=motionProps<typeof CodeBlock>(block,'CodeBlock');
      const scheme=settings.theme || (portalTheme?.colorScheme === 'dark' ? 'dark' : 'light');
      const palette=getTheme(scheme==='dark' ? 'animate-dark' : 'animate-light');
      const surface=settings.theme ? {'--page-panel':palette.panel,'--page-ink':palette.text,'--page-muted':palette.muted,'--studio-100':palette.panel,'--studio-950':palette.text,'--studio-500':palette.muted,color:palette.text} as CSSProperties : undefined;
      return shell(<>{p.title && <header className="native-code-heading"><span>{p.title}</span></header>}<div data-page-scheme={scheme} style={surface}><CodeBlock {...settings} code={p.text || ''} lang={settings.lang || 'tsx'} theme={scheme} className={officialClass("native-code-block", settings.className)}/></div></>);
    }
    case 'motionGrid': return shell(<OfficialMotionGrid block={block}/>);
    case 'pinnedList': {const itemId=motionProps<typeof PinnedListItem>(block,'PinnedListItem').id ?? id;return shell(<><h3>{p.title}</h3><PinnedList {...motionProps<typeof PinnedList>(block,'PinnedList')} onPinnedChange={item => setPins(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])}>{[true, false].map(pinned => {
      const Group = pinned ? PinnedListPinned : PinnedListUnpinned;
      return <Group {...motionProps<typeof Group>(block,pinned ? 'PinnedListPinned' : 'PinnedListUnpinned')} key={String(pinned)}><PinnedListLabel {...motionProps<typeof PinnedListLabel>(block,'PinnedListLabel')} hide={motionProps<typeof PinnedListLabel>(block,'PinnedListLabel').hide ?? (pinned ? pins.length === 0 : pins.length === options.length)}>{pinned ? '置顶' : '全部'}</PinnedListLabel><PinnedListItems {...motionProps<typeof PinnedListItems>(block,'PinnedListItems')}>{options.map(([name], index) => pins.includes(`${itemId}-${index}`) === pinned && <PinnedListItem {...motionProps<typeof PinnedListItem>(block,'PinnedListItem')} id={`${itemId}-${index}`} key={index} customTrigger={motionProps<typeof PinnedListItem>(block,'PinnedListItem').customTrigger ?? true} className={officialClass("as-page-catalog-pinned-row", (motionProps<typeof PinnedListItem>(block,'PinnedListItem')).className)}>{name}<PinnedListTrigger {...motionProps<typeof PinnedListTrigger>(block,'PinnedListTrigger')} aria-label={motionProps<typeof PinnedListTrigger>(block,'PinnedListTrigger')['aria-label'] ?? `${pinned ? '取消置顶' : '置顶'} ${name}`}>{pinned ? <PinOff size={16}/> : <Pin size={16}/>}</PinnedListTrigger></PinnedListItem>)}</PinnedListItems></Group>;
    })}</PinnedList></>);}
    case 'scrollProgress': return shell(<ScrollExample block={block}/>);
    default: throw new Error(`缺少组件适配：${type}`);
  }
}
