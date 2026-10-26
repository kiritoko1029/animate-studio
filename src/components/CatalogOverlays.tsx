import { useContext, useId } from 'react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import * as Popover from '@animate-ui/react/primitives/radix-ui/popover';
import * as HoverCard from '@animate-ui/react/primitives/radix-ui/hover-card';
import * as Tooltip from '@animate-ui/react/primitives/radix-ui/tooltip';
import type { Block } from '../model';
import { safeUrl } from '../model';
import { usePageLinks } from '../lib/navigation';
import { motionProps, anchoredProps, officialClass, officialStyle } from '../lib/official-motion';
import { PageBlockTheme } from './PagePreviewTheme';
import { useOfficialOpen } from './useOfficialOpen';

export function CatalogOverlays({block}:{block:Block}) {
 const { navigate, safeUrl } = usePageLinks();
 const p=block.props,theme=useContext(PageBlockTheme),id=useId();
 const opening=useOfficialOpen(block,block.type==='hoverCard'?'HoverCard':block.type==='tooltip'?'Tooltip':'Popover');
 const trigger=<Button className="as-page-catalog-button">{p.label || '打开'}</Button>;
 if(block.type==='tooltip'){
  const content=anchoredProps<typeof Tooltip.Content>(block,'TooltipContent');
  return <Tooltip.Provider {...motionProps<typeof Tooltip.Provider>(block,'TooltipProvider')}><Tooltip.Root {...motionProps<typeof Tooltip.Root>(block,'Tooltip')} {...opening}><Tooltip.Trigger {...motionProps<typeof Tooltip.Trigger>(block,'TooltipTrigger')} asChild>{trigger}</Tooltip.Trigger><Tooltip.Portal {...motionProps<typeof Tooltip.Portal>(block,'TooltipPortal')}><Tooltip.Content {...content} className={officialClass('native-catalog-tooltip native-catalog-portal',content.className)} style={officialStyle(theme,content.style)} data-page-scheme={theme?.colorScheme}>{p.text || p.title || p.label}<Tooltip.Arrow {...motionProps<typeof Tooltip.Arrow>(block,'TooltipArrow')} className={officialClass('native-tooltip-arrow',motionProps<typeof Tooltip.Arrow>(block,'TooltipArrow').className)}/></Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>;
 }
 if(block.type==='hoverCard'){
  const content=anchoredProps<typeof HoverCard.Content>(block,'HoverCardContent'),root=motionProps<typeof HoverCard.Root>(block,'HoverCard');
  return <HoverCard.Root {...root} {...opening} openDelay={root.openDelay ?? 10} closeDelay={root.closeDelay ?? 100}><HoverCard.Trigger {...motionProps<typeof HoverCard.Trigger>(block,'HoverCardTrigger')} asChild><a className="native-hover-trigger" href={safeUrl(p.url)} onClick={event=>navigate(event,p.url)}>{p.label || '查看资料'}</a></HoverCard.Trigger><HoverCard.Portal {...motionProps<typeof HoverCard.Portal>(block,'HoverCardPortal')}><HoverCard.Content {...content} className={officialClass('native-hover-card native-catalog-portal',content.className)} style={officialStyle(theme,content.style)} data-page-scheme={theme?.colorScheme}><strong>{p.title}</strong><div>{p.text}</div>{(p.items ?? '2021 年 12 月加入').split('\n').map((text,i)=><small key={i}>{text}</small>)}</HoverCard.Content></HoverCard.Portal></HoverCard.Root>;
 }
 const content=anchoredProps<typeof Popover.Content>(block,'PopoverContent');
 const fields=(p.items ?? '宽度|100%\n最大宽度|300px\n高度|25px\n最大高度|none').split('\n').filter(Boolean).map(row=>row.split('|'));
 return <Popover.Root {...motionProps<typeof Popover.Root>(block,'Popover')} {...opening}><Popover.Trigger {...motionProps<typeof Popover.Trigger>(block,'PopoverTrigger')} asChild>{trigger}</Popover.Trigger><Popover.Portal {...motionProps<typeof Popover.Portal>(block,'PopoverPortal')}><Popover.Content {...content} className={officialClass('native-popover native-catalog-portal',content.className)} style={officialStyle(theme,content.style)} data-page-scheme={theme?.colorScheme}><header><h3>{p.title || '尺寸'}</h3><p>{p.text}</p></header><div className="native-popover-fields">{fields.map(([label,value],i)=><label key={i} htmlFor={`${id}-${i}`}><span>{label}</span><input id={`${id}-${i}`} defaultValue={value}/></label>)}</div></Popover.Content></Popover.Portal></Popover.Root>;
}
