import { officialClass, officialStyle } from '../lib/official-motion';
import { useOfficialOpen } from './useOfficialOpen';
import { useContext, useEffect, useId, useState, type ComponentProps } from 'react';
import { X } from 'lucide-react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import * as Dialog from '@animate-ui/react/primitives/radix-ui/dialog';
import * as Radio from '@animate-ui/react/primitives/radix-ui/radio-group';
import { Drawer } from '@animate-ui/react/primitives/base-ui/drawer';
import type { Block } from '../model';
import { motionProps } from '../lib/official-motion';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import { PageBlockTheme } from './PagePreviewTheme';

/** The official Sheet form and Drawer selection layout, with the document's editable content. */
export function CatalogPanels({ block }: { block: Block }) {
  const p = block.props;
  const content=officialAnimationProps(block.type,'PanelContent',p.motion);
  const drawerSettings=motionProps<typeof Drawer.Root>(block,'Drawer');
  const [snap,setSnap]=useState<ComponentProps<typeof Drawer.Root>['snapPoint']>(drawerSettings.snapPoint);
  useEffect(()=>setSnap(drawerSettings.snapPoint),[drawerSettings.snapPoint]);
  const opening=useOfficialOpen(block,block.type==='sheet'?'Sheet':'Drawer');
  const theme = useContext(PageBlockTheme);
  const id = useId();
  const [choice, setChoice] = useState('0');
  const trigger = <Button type="button" className="as-page-catalog-button">{p.label || '打开'}</Button>;
  if (block.type === 'sheet') {
    const { side = 'right', showCloseButton, ...settings } = officialAnimationProps('sheet','SheetContent',p.motion);
    const fields = (p.items || '姓名|Pedro Duarte\n用户名|@peduarte').split('\n').filter(Boolean).map(row => row.split('|'));
    return <Dialog.Root {...motionProps<typeof Dialog.Root>(block,'Sheet')} {...opening}><Dialog.Trigger {...motionProps<typeof Dialog.Trigger>(block,'SheetTrigger')} asChild>{trigger}</Dialog.Trigger><Dialog.Portal {...motionProps<typeof Dialog.Portal>(block,'SheetPortal')}>
      <Dialog.Overlay {...motionProps<typeof Dialog.Overlay>(block,'SheetOverlay')} className={officialClass("native-catalog-overlay", (motionProps<typeof Dialog.Overlay>(block,'SheetOverlay')).className)} data-page-scheme={theme?.colorScheme} style={officialStyle(theme, (motionProps<typeof Dialog.Overlay>(block,'SheetOverlay')).style)}/>
      <Dialog.Content {...settings} data-side={String(side)} data-slot="sheet-content" className={officialClass("native-panel native-sheet native-catalog-portal", (settings).className)} data-page-scheme={theme?.colorScheme} style={officialStyle(theme, (settings).style)}>
        <header className="native-panel-header"><Dialog.Title {...motionProps<typeof Dialog.Title>(block,'SheetTitle')}>{p.title || '编辑资料'}</Dialog.Title><Dialog.Description {...motionProps<typeof Dialog.Description>(block,'SheetDescription')}>{p.text}</Dialog.Description></header>
        <div className="native-panel-body">{fields.map(([label,value],index) => <label className="native-panel-field" key={index} htmlFor={`${id}-${index}`}>{label}<input id={`${id}-${index}`} defaultValue={value || ''}/></label>)}</div>
        <footer className="native-panel-footer"><Dialog.Close {...motionProps<typeof Dialog.Close>(block,'SheetClose')} asChild><Button className="native-dialog-button native-dialog-button--primary">{String(content.primaryLabel || '保存更改')}</Button></Dialog.Close><Dialog.Close {...motionProps<typeof Dialog.Close>(block,'SheetClose')} asChild><Button className="native-dialog-button native-dialog-button--outline">{String(content.secondaryLabel || '关闭')}</Button></Dialog.Close></footer>
        {showCloseButton && <Dialog.Close {...motionProps<typeof Dialog.Close>(block,'SheetClose')} asChild><Button className="native-dialog-close" aria-label="关闭"><X size={16}/></Button></Dialog.Close>}
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>;
  }
  const legacySide=String(officialAnimationProps('drawer','Drawer',p.motion).direction || 'right');
  const swipeDirection=drawerSettings.swipeDirection ?? ({top:'up',bottom:'down',left:'left',right:'right'} as const)[legacySide as 'top'|'bottom'|'left'|'right'];
  const side=({up:'top',down:'bottom',left:'left',right:'right'} as const)[swipeDirection];
  const choices = (p.items || '标准配送|25–35 分钟 · 现在出发\n17:00 – 17:15|16:45 开始准备\n17:30 – 17:45|适合下班回家\n18:00 – 18:15|热门时段\n18:30 – 18:45|今晚最后时段').split('\n').filter(Boolean).map(row=>row.split('|'));
  return <Drawer.Root {...drawerSettings} {...opening} {...(drawerSettings.snapPoint!==undefined ? {snapPoint:snap,onSnapPointChange:setSnap} : {})} swipeDirection={swipeDirection}><Drawer.Trigger {...motionProps<typeof Drawer.Trigger>(block,'DrawerTrigger')} render={trigger}/><Drawer.Portal {...motionProps<typeof Drawer.Portal>(block,'DrawerPortal')}>
    {drawerSettings.modal===undefined || drawerSettings.modal===true ? <Drawer.Backdrop {...motionProps<typeof Drawer.Backdrop>(block,'DrawerBackdrop')} className={officialClass("native-catalog-overlay native-drawer-overlay", (motionProps<typeof Drawer.Backdrop>(block,'DrawerBackdrop')).className)} data-page-scheme={theme?.colorScheme} style={officialStyle(theme, (motionProps<typeof Drawer.Backdrop>(block,'DrawerBackdrop')).style)}/> : null}<Drawer.Viewport {...motionProps<typeof Drawer.Viewport>(block,'DrawerViewport')} className={officialClass("native-drawer-viewport",motionProps<typeof Drawer.Viewport>(block,'DrawerViewport').className)}>
      <Drawer.Popup {...motionProps<typeof Drawer.Popup>(block,'DrawerPopup')} className={officialClass("native-panel native-drawer native-catalog-portal", (motionProps<typeof Drawer.Popup>(block,'DrawerPopup')).className)} data-side={side} data-page-scheme={theme?.colorScheme} style={officialStyle(theme, (motionProps<typeof Drawer.Popup>(block,'DrawerPopup')).style)}>
        {officialAnimationProps('drawer','Drawer',p.motion).showSwipeHandle && <div data-slot="drawer-swipe-handle" className="native-drawer-handle" aria-hidden="true"/>}
        <Drawer.Content {...motionProps<typeof Drawer.Content>(block,'DrawerContent')} className={officialClass("native-drawer-content",motionProps<typeof Drawer.Content>(block,'DrawerContent').className)}>
          <header className="native-panel-header"><Drawer.Title {...motionProps<typeof Drawer.Title>(block,'DrawerTitle')}>{p.title || '选择配送时间'}</Drawer.Title><Drawer.Description {...motionProps<typeof Drawer.Description>(block,'DrawerDescription')}>{p.text}</Drawer.Description></header>
          <div className="native-panel-body"><Radio.Root value={choice} onValueChange={setChoice} aria-label={p.title || '选择配送时间'}>{choices.map(([title,description],i) => <label className="native-drawer-choice" key={i} htmlFor={`${id}-${i}`}><span><strong>{title}</strong><small>{description}</small></span><Radio.Item className="native-page-radio" id={`${id}-${i}`} value={String(i)}><Radio.Indicator className="native-page-radio-indicator"/></Radio.Item></label>)}</Radio.Root></div>
          <footer className="native-panel-footer"><Drawer.Close {...motionProps<typeof Drawer.Close>(block,'DrawerClose')} render={<Button className="native-dialog-button native-dialog-button--primary"/>}>{String(content.primaryLabel || '确认')}</Drawer.Close><Drawer.Close {...motionProps<typeof Drawer.Close>(block,'DrawerClose')} render={<Button className="native-dialog-button native-dialog-button--outline"/>}>{String(content.secondaryLabel || '取消')}</Drawer.Close></footer>
        </Drawer.Content>
      </Drawer.Popup>
    </Drawer.Viewport>
  </Drawer.Portal></Drawer.Root>;
}
