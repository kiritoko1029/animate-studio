import { useContext } from 'react';
import { ChevronDown, Circle, CircleAlert, CircleCheck } from 'lucide-react';
import { NavigationMenu as N } from '@animate-ui/react/primitives/base-ui/navigation-menu';
import type { Block } from '../model';
import { safeUrl } from '../model';
import { navigate } from '../lib/navigation';
import { motionProps, officialClass, officialStyle } from '../lib/official-motion';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import { PageBlockTheme } from './PagePreviewTheme';

type Entry={label:string;href?:string;description?:string;icon?:'circle'|'alert'|'check';children?:Entry[];columns?:number;width?:number};
export function CatalogNavigation({block}:{block:Block}) {
 const theme=useContext(PageBlockTheme);
 const configured=officialAnimationProps(block.type,'NavigationStructure',block.props.motion).items as unknown as Entry[];
 const groups=new Map<string,Entry[]>();
 for(const row of (block.props.items || '').split('\n').filter(Boolean)){const [group,label,href,description]=row.split('|');groups.set(group,[...(groups.get(group)??[]),{label:label||group,href,description}]);}
 const nodes:Entry[]=block.props.motion?.['NavigationStructure.items'] || !groups.size ? configured : [...groups].map(([label,children])=>({label,children}));
 const root=motionProps<typeof N.Root>(block,'NavigationMenu'), list=motionProps<typeof N.List>(block,'NavigationMenuList'), item=motionProps<typeof N.Item>(block,'NavigationMenuItem'), trigger=motionProps<typeof N.Trigger>(block,'NavigationMenuTrigger'), content=motionProps<typeof N.Content>(block,'NavigationMenuContent'), link=motionProps<typeof N.Link>(block,'NavigationMenuLink'), popup=motionProps<typeof N.Popup>(block,'NavigationMenuPopup'), positioner=motionProps<typeof N.Positioner>(block,'NavigationMenuPositioner'), viewport=motionProps<typeof N.Viewport>(block,'NavigationMenuViewport');
 return <N.Root {...root} className={officialClass('native-navigation',root.className)}><N.List {...list} className={officialClass('native-navigation-list',list.className)}>{nodes.map((node,i)=><N.Item {...item} key={i}>{node.children?.length ? <><N.Trigger {...trigger} className={officialClass('native-navigation-trigger',trigger.className)}>{node.label}<ChevronDown size={12}/></N.Trigger><N.Content {...content} className={officialClass('native-navigation-content',content.className)}><ul className="native-navigation-grid" style={{width:node.width ?? (node.columns===2 ? 600 : 384),gridTemplateColumns:`repeat(${node.columns ?? 1},minmax(0,1fr))`}}>{node.children.map((entry,j)=>{const Icon=entry.icon==='check'?CircleCheck:entry.icon==='alert'?CircleAlert:Circle;return <li key={j}><N.Link {...link} href={safeUrl(entry.href)} onClick={e=>navigate(e,entry.href)} className={officialClass('native-navigation-link',link.className)}>{entry.icon&&<Icon size={16}/>}<span><strong>{entry.label}</strong>{entry.description&&<small>{entry.description}</small>}</span></N.Link></li>;})}</ul></N.Content></> : <N.Link {...link} href={safeUrl(node.href)} onClick={e=>navigate(e,node.href)} className={officialClass('native-navigation-trigger',link.className)}>{node.label}</N.Link>}</N.Item>)}</N.List><N.Portal {...motionProps<typeof N.Portal>(block,'NavigationMenuPortal')}><N.Positioner {...positioner} sideOffset={positioner.sideOffset ?? 8} className={officialClass('native-menubar-positioner',positioner.className)}><N.Popup {...popup} className={officialClass('native-navigation-popup',popup.className)} style={officialStyle(theme,popup.style)} data-page-scheme={theme?.colorScheme}><N.Viewport {...viewport} className={officialClass('native-navigation-viewport',viewport.className)}/></N.Popup></N.Positioner></N.Portal></N.Root>;
}
