import { useContext, useState, type CSSProperties } from 'react';
import { Layers, ChevronsUpDown, ChevronRight, Terminal, Bot, BookOpen, Settings, Frame, PieChart, Map, MoreHorizontal, PanelLeft, PanelLeftClose, Plus, User, CreditCard, Bell, LogOut, Sparkles } from 'lucide-react';
import * as Sidebar from '@animate-ui/react/primitives/sidebar';
import * as Collapsible from '@animate-ui/react/primitives/radix-ui/collapsible';
import * as Dialog from '@animate-ui/react/primitives/radix-ui/dialog';
import * as Menu from '@animate-ui/react/primitives/radix-ui/dropdown-menu';
import type { Block } from '../model';
import { safeUrl } from '../model';
import { navigate } from '../lib/navigation';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import { motionProps, officialClass, officialStyle } from '../lib/official-motion';
import { PageBlockTheme } from './PagePreviewTheme';
import { useBlockValue } from './NativeInteractions';

type Link={label:string;href?:string};
type Content={teams:{label:string;plan:string}[];platformLabel:string;groups:(Link&{children:Link[];open?:boolean})[];projectsLabel:string;projects:Link[];user:{name:string;email:string}};
export function CatalogSidebar({block}:{block:Block}) {
 const layout=officialAnimationProps('sidebar','SidebarLayout',block.props.motion);
 const p=block.props,provider=motionProps<typeof Sidebar.Provider>(block,'SidebarProvider');
 const [open,setOpen]=useBlockValue(Boolean(provider.open ?? provider.defaultOpen ?? p.checked ?? true),'checked');
 return <Sidebar.Provider {...provider} data-variant={String(layout.variant)} data-collapsible={String(layout.collapsible)} open={open} onOpenChange={setOpen} className={officialClass('native-sidebar-layout',provider.className)}><SidebarBody block={block}/></Sidebar.Provider>;
}
function SidebarBody({block}:{block:Block}) {
 const {open,setOpen,isMobile,openMobile,setOpenMobile}=Sidebar.useSidebar();
 const layout=officialAnimationProps('sidebar','SidebarLayout',block.props.motion);
 const mobile=isMobile && layout.collapsible!=='none';
 const expanded=layout.collapsible==='none' || (isMobile ? openMobile : open);
 const toggle=()=>isMobile?setOpenMobile(!openMobile):setOpen(!open);
 const theme=useContext(PageBlockTheme),[team,setTeam]=useState(0);
 const data=officialAnimationProps('sidebar','SidebarStructure',block.props.motion).content as unknown as Content;
 const legacy=(block.props.items || '').split('\n').filter(Boolean).map(line=>{const [label,href]=line.split('|');return {label,href,children:[]};});
 const groups:Content['groups']=block.props.motion?.['SidebarStructure.content'] || !legacy.length ? data.groups : legacy;
 const activeTeam=data.teams[team]??data.teams[0];
 const container=motionProps<typeof Sidebar.Container>(block,'SidebarContainer'),highlight=motionProps<typeof Sidebar.Highlight>(block,'SidebarHighlight'),gap=motionProps<typeof Sidebar.Gap>(block,'SidebarGap'),icon=motionProps<typeof Sidebar.TriggerIcon>(block,'SidebarTriggerIcon');
 const width=mobile?288:expanded?256:layout.collapsible==='offcanvas'?0:48;
 const icons=[Terminal,Bot,BookOpen,Settings];
 const menu=(children:React.ReactNode)=><Menu.Portal><Menu.Content className="native-menu-popup native-catalog-portal" side={isMobile?'bottom':'right'} align="end" sideOffset={4} style={theme} data-page-scheme={theme?.colorScheme}>{children}</Menu.Content></Menu.Portal>;
 const links=(items:Link[])=>items.map((item,i)=><Menu.Item asChild key={i}><a className="native-menu-item" href={safeUrl(item.href)} onClick={e=>navigate(e,item.href)}>{item.label}</a></Menu.Item>);
 const sidebar=<Sidebar.Container {...container} className={officialClass('native-sidebar-container native-sidebar-full',container.className)} data-state={mobile || expanded?'expanded':'collapsed'} style={officialStyle({width:width || 256,left:width===0?-256:0,'--sidebar-width':'16rem','--sidebar-width-icon':'3rem'} as CSSProperties,container.style)}>
  <header className="native-sidebar-header"><Menu.Root><Menu.Trigger className="native-sidebar-identity" title={activeTeam.label}><span className="native-sidebar-logo"><Layers size={16}/></span><span><strong>{activeTeam.label}</strong><small>{activeTeam.plan}</small></span><ChevronsUpDown size={16}/></Menu.Trigger>{menu(<><Menu.Label className="native-menu-label">团队</Menu.Label>{data.teams.map((entry,i)=><Menu.Item className="native-menu-item" key={i} onSelect={()=>setTeam(i)}><Layers size={14}/>{entry.label}<span className="native-menu-shortcut">⌘{i+1}</span></Menu.Item>)}<Menu.Separator className="native-menu-separator"/><Menu.Item className="native-menu-item"><Plus size={14}/>添加团队</Menu.Item></>)}</Menu.Root></header>
  <div className="native-sidebar-body"><Sidebar.Highlight {...highlight} className={officialClass('native-sidebar-highlight-root',highlight.className)}><section><div data-sidebar="group-label">{data.platformLabel}</div><ul>{groups.map((entry,i)=>{const Icon=icons[i%icons.length];return <li key={i}><Collapsible.Root defaultOpen={entry.open ?? i===0}><Collapsible.Trigger className="native-sidebar-link" data-sidebar="menu-button" title={entry.label}><Icon size={16}/><span>{entry.label}</span>{entry.children.length>0&&<ChevronRight size={14} className="native-sidebar-chevron"/>}</Collapsible.Trigger>{entry.children.length>0&&<Collapsible.Content className="native-sidebar-sub"><ul>{entry.children.map((child,j)=><li key={j}><a data-sidebar="menu-sub-button" href={safeUrl(child.href)} onClick={e=>navigate(e,child.href)}>{child.label}</a></li>)}</ul></Collapsible.Content>}</Collapsible.Root></li>;})}</ul></section>
  <section className="native-sidebar-projects"><div data-sidebar="group-label">{data.projectsLabel}</div><ul>{data.projects.map((project,i)=>{const Icon=[Frame,PieChart,Map][i%3];return <li className="native-sidebar-project" key={i}><a data-sidebar="menu-button" className="native-sidebar-link" href={safeUrl(project.href)} onClick={e=>navigate(e,project.href)}><Icon size={16}/><span>{project.label}</span></a><Menu.Root><Menu.Trigger className="native-sidebar-more" aria-label={`${project.label} · 更多`}><MoreHorizontal size={16}/></Menu.Trigger>{menu(links([{label:'查看项目',href:project.href},{label:'分享项目',href:project.href},{label:'删除项目'}]))}</Menu.Root></li>;})}<li><button className="native-sidebar-link" data-sidebar="menu-button"><MoreHorizontal size={16}/><span>更多</span></button></li></ul></section></Sidebar.Highlight></div>
  <footer className="native-sidebar-footer"><Menu.Root><Menu.Trigger className="native-sidebar-identity" title={data.user.name}><span className="native-sidebar-avatar">{data.user.name.slice(0,2).toUpperCase()}</span><span><strong>{data.user.name}</strong><small>{data.user.email}</small></span><ChevronsUpDown size={16}/></Menu.Trigger>{menu(<><Menu.Label className="native-menu-label">{data.user.name}<br/>{data.user.email}</Menu.Label><Menu.Separator className="native-menu-separator"/>{[Sparkles,User,CreditCard,Bell,LogOut].map((Icon,i)=><Menu.Item key={i} className="native-menu-item"><Icon size={16}/>{['升级 Pro','账户','账单','通知','退出登录'][i]}</Menu.Item>)}</>)}</Menu.Root></footer>
  <button className="native-sidebar-rail" data-sidebar="rail" aria-label="切换侧栏" onClick={toggle}/>
 </Sidebar.Container>;
 return <>{mobile ? <Dialog.Root open={openMobile} onOpenChange={setOpenMobile}><Dialog.Portal><Dialog.Overlay className="native-catalog-overlay"/><Dialog.Content data-side="left" className="native-sidebar-mobile native-catalog-portal" style={theme} data-page-scheme={theme?.colorScheme}><Dialog.Title className="native-sr-only">{block.props.title || '导航菜单'}</Dialog.Title><Dialog.Description className="native-sr-only">页面侧栏导航</Dialog.Description>{sidebar}</Dialog.Content></Dialog.Portal></Dialog.Root> : <><Sidebar.Gap {...gap} className={officialClass('native-sidebar-gap',gap.className)} style={officialStyle({width},gap.style)}/>{sidebar}</>}<div className="native-sidebar-inset"><button className="native-sidebar-toggle" onClick={toggle} aria-label={block.props.label || '切换侧栏'} aria-expanded={expanded}><Sidebar.TriggerIcon {...icon} open={icon.open ?? <PanelLeftClose size={16}/>} closed={icon.closed ?? <PanelLeft size={16}/>}/></button></div></>;
}
