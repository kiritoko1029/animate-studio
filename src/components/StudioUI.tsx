import { useRef, type ReactNode } from 'react';
import { Button, type ButtonProps } from './animate-ui/components/buttons/button';
import { Dialog, DialogContent, DialogTitle } from './animate-ui/components/radix/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from './animate-ui/components/radix/tooltip';

/** Editor density and restrained motion on top of the official Animate UI button. */
export function StudioButton({ className = '', type = 'button', hoverScale = 1.015, tapScale = .97, ...props }: ButtonProps) {
  const variant = className.includes('primary-button') ? 'default' : className.includes('secondary-button') ? 'outline' : 'ghost';
  return <Button variant={variant} size="sm" type={type} hoverScale={hoverScale} tapScale={tapScale} className={`studio-control h-auto whitespace-normal p-0 shadow-none ${className}`} {...props} />;
}

export function StudioTooltip({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip delayDuration={400}><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent className="studio-tooltip" sideOffset={6}>{label}</TooltipContent></Tooltip>;
}

/** All editor dialogs share focus restoration, a fixed viewport, and one animation. */
export function StudioDialog({ title, className = '', children, onClose, dismissOutside = true, role = 'dialog' }: { title: string; className?: string; children: ReactNode; onClose: () => void; dismissOutside?: boolean; role?: 'dialog' | 'alertdialog' }) {
  const opener = useRef(document.activeElement);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={`studio-dialog ${className}`} showCloseButton={false} role={role} aria-describedby={undefined}
      transition={{ type: 'spring', stiffness: 350, damping: 32 }}
      onEscapeKeyDown={event => {
        const target = event.target;
        // Radix listens in capture phase; let editors consume Escape before closing a workbench.
        if (target instanceof Element && (target.closest('[data-escape-local]') || target.closest('.cm-editor')?.querySelector('.cm-tooltip-autocomplete'))) {
          event.preventDefault();
        } else event.stopPropagation();
      }}
      onPointerDownOutside={event => { if (!dismissOutside) event.preventDefault(); }}
      onCloseAutoFocus={event => { event.preventDefault(); const node = opener.current; if (node instanceof HTMLElement && node.isConnected) node.focus(); }}>
      <DialogTitle className="sr-only">{title}</DialogTitle>{children}
    </DialogContent>
  </Dialog>;
}
