import { officialClass, officialStyle } from '../lib/official-motion';
import { useOfficialOpen } from './useOfficialOpen';
import { useContext } from 'react';
import { X } from 'lucide-react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import * as Dialog from '@animate-ui/react/primitives/radix-ui/dialog';
import * as AlertDialog from '@animate-ui/react/primitives/radix-ui/alert-dialog';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import type { Block } from '../model';
import { motionProps } from '../lib/official-motion';
import { PageBlockTheme } from './PagePreviewTheme';

/** Layout follows the pinned v2 confirmation demo; primitives retain focus and motion. */
export function CatalogDialog({ block }: { block: Block }) {
  const theme = useContext(PageBlockTheme);
  const opening=useOfficialOpen(block,block.type==='alertDialog'?'AlertDialog':'Dialog');
  const alert = block.type === 'alertDialog';
  const { Root, Trigger, Portal, Overlay, Content, Title, Description } = alert ? AlertDialog : Dialog;
  const Cancel = alert ? AlertDialog.Cancel : Dialog.Close;
  const Action = alert ? AlertDialog.Action : Dialog.Close;
  const settings = officialAnimationProps(block.type, alert ? 'AlertDialogContent' : 'DialogContent', block.props.motion);
  const prefix = alert ? 'AlertDialog' : 'Dialog';
  const showClose = !alert && settings.showCloseButton;
  const contentProps = motionProps<typeof Dialog.Content>(block, alert ? 'AlertDialogContent' : 'DialogContent');
  delete (contentProps as Record<string, unknown>).showCloseButton;

  delete (contentProps as Record<string,unknown>).size;
  return <Root {...motionProps<typeof Dialog.Root>(block, alert ? 'AlertDialog' : 'Dialog')} {...opening}>
    <Trigger {...motionProps<typeof Trigger>(block,`${prefix}Trigger`)} asChild><Button type="button" className="as-page-catalog-button">{block.props.label || '打开对话框'}</Button></Trigger>
    <Portal {...motionProps<typeof Portal>(block,`${prefix}Portal`)}>
      <Overlay {...motionProps<typeof Dialog.Overlay>(block, alert ? 'AlertDialogOverlay' : 'DialogOverlay')} className={officialClass("native-catalog-overlay", (motionProps<typeof Dialog.Overlay>(block, alert ? 'AlertDialogOverlay' : 'DialogOverlay')).className)} data-page-scheme={theme?.colorScheme} style={officialStyle(theme, (motionProps<typeof Dialog.Overlay>(block, alert ? 'AlertDialogOverlay' : 'DialogOverlay')).style)} />
      <Content {...contentProps} data-size={alert ? String(settings.size) : undefined}
        className={officialClass("native-catalog-dialog native-confirmation-dialog",contentProps.className)} data-page-scheme={theme?.colorScheme} style={officialStyle(theme,contentProps.style)}>
        <div className="native-dialog-header" data-close-button={showClose || undefined}>
          <Title {...motionProps<typeof Title>(block,`${prefix}Title`)} className={officialClass("native-dialog-title",motionProps<typeof Title>(block,`${prefix}Title`).className)}>{block.props.title || '确认操作'}</Title>
          <Description {...motionProps<typeof Description>(block,`${prefix}Description`)} className={officialClass("native-dialog-description",motionProps<typeof Description>(block,`${prefix}Description`).className)}>{block.props.text}</Description>
        </div>
        <div className="native-dialog-footer">
          <Cancel {...motionProps<typeof Cancel>(block,alert ? 'AlertDialogCancel' : 'DialogClose')} asChild><Button type="button" className="native-dialog-button native-dialog-button--outline">取消</Button></Cancel>
          <Action {...motionProps<typeof Action>(block,alert ? 'AlertDialogAction' : 'DialogClose')} asChild><Button type="button" className="native-dialog-button native-dialog-button--primary">继续</Button></Action>
        </div>
        {showClose && <Dialog.Close {...motionProps<typeof Dialog.Close>(block,'DialogClose')} asChild>
          <Button type="button" className="native-dialog-close" aria-label="关闭"><X size={16} aria-hidden="true" /></Button>
        </Dialog.Close>}
      </Content>
    </Portal>
  </Root>;
}
