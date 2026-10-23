import { t } from '../i18n';
import { useRef, useState, type ReactElement } from 'react';
import { ContextMenu } from '@animate-ui/react/primitives/radix-ui/context-menu';
import { Check, ChevronRight, Grid3X3, Magnet, Maximize, Palette, PaintBucket, Ruler, Scan, Settings2, SquareDashed } from 'lucide-react';
import { canvasPresets } from '../../shared/canvas-sizes.mjs';
import type { PageDocument } from '../model';

export type PageSettingsSection = 'size' | 'margin' | 'background' | 'theme';
export type CanvasGridPreferences = { showGrid: boolean; snapToGrid: boolean; gridSize: 8 | 16 | 24 | 32 };
const marginPresets = [0, 16, 24, 32, 48, 64, 80, 120];
const menuClass = 'studio-menu canvas-component-menu canvas-page-menu';

export function CanvasPageMenu({ children, disabled, settings, grid, onSelectCanvas, onSizeChange, onMarginChange, onPageSettings, onGridChange, onFit, onActualSize }: {
  children: ReactElement; disabled: boolean; settings: PageDocument['settings']; grid: CanvasGridPreferences;
  onSelectCanvas: () => void;
  onSizeChange: (size: { width: number; height: number }) => void;
  onMarginChange: (margin: number) => void;
  onPageSettings: (section: PageSettingsSection) => void;
  onGridChange: (settings: Partial<CanvasGridPreferences>) => void;
  onFit: () => void; onActualSize: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(true);
  const preset = canvasPresets.find(size => size.width === settings.maxWidth && size.height === settings.canvasHeight);
  const inspect = (section: PageSettingsSection) => {
    restoreFocus.current = false;
    trigger.current?.focus({ preventScroll: true });
    onPageSettings(section);
  };
  return <ContextMenu.Root open={open && !disabled} modal={false} onOpenChange={next => {
    setOpen(next);
    if (next) { restoreFocus.current = true; onSelectCanvas(); }
  }}>
    <ContextMenu.Trigger asChild ref={trigger} disabled={disabled} aria-haspopup="menu"
      onContextMenu={event => {
        // Component menus own their subtree, including when their actions are disabled.
        if ((event.target as HTMLElement).closest('[data-block-id]')) { event.preventDefault(); return; }
        event.stopPropagation();
        if (!disabled) event.currentTarget.focus({ preventScroll: true });
      }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) return;
        event.preventDefault(); event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.max(8, Math.min(rect.left + 24, window.innerWidth - 8)), clientY: Math.max(8, Math.min(rect.top + 24, window.innerHeight - 8)) }));
      }}>{children}</ContextMenu.Trigger>
    {/* Retire the dismissal layer immediately so an exiting menu cannot intercept the next menu. */}
    {open && !disabled && <ContextMenu.Portal><ContextMenu.Content className={menuClass} aria-label={t("画布与页面操作")} collisionPadding={8} loop
      onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current) trigger.current?.focus({ preventScroll: true }); }}
      onInteractOutside={() => { restoreFocus.current = false; }}>
      <ContextMenu.Label className="canvas-menu-label">{t("画布与页面")}</ContextMenu.Label>
      <ContextMenu.Item onSelect={() => inspect('size')}><Settings2 size={15}/>{t("页面设置…")}</ContextMenu.Item>
      <ContextMenu.Sub><ContextMenu.SubTrigger><Maximize size={15}/>{t("画布尺寸")}<span className="canvas-menu-value">{preset?.label ?? t("自定义")}</span><ChevronRight size={13}/></ContextMenu.SubTrigger>
        <ContextMenu.Portal><ContextMenu.SubContent className={menuClass} aria-label={t("画布尺寸")} collisionPadding={8}>
          <ContextMenu.RadioGroup value={preset?.id ?? 'custom'} onValueChange={id => { const size = canvasPresets.find(size => size.id === id); if (size) onSizeChange({ width: size.width, height: size.height }); }}>
            {canvasPresets.map(size => <ContextMenu.RadioItem key={size.id} value={size.id}><span className="canvas-menu-check"><ContextMenu.ItemIndicator><Check size={14}/></ContextMenu.ItemIndicator></span>{size.label}<span className="canvas-menu-value">{size.width} × {size.height}</span></ContextMenu.RadioItem>)}
          </ContextMenu.RadioGroup>
          <ContextMenu.Separator className="canvas-menu-separator"/>
          <ContextMenu.Item onSelect={() => inspect('size')}>{t("自定义尺寸…")}</ContextMenu.Item>
        </ContextMenu.SubContent></ContextMenu.Portal>
      </ContextMenu.Sub>
      <ContextMenu.Sub><ContextMenu.SubTrigger><SquareDashed size={15}/>{t("页面边距")}<span className="canvas-menu-value">{settings.padding} px</span><ChevronRight size={13}/></ContextMenu.SubTrigger>
        <ContextMenu.Portal><ContextMenu.SubContent className={menuClass} aria-label={t("页面边距")} collisionPadding={8}>
          <ContextMenu.RadioGroup value={String(settings.padding)} onValueChange={value => onMarginChange(Number(value))}>
            {marginPresets.map(margin => <ContextMenu.RadioItem key={margin} value={String(margin)}><span className="canvas-menu-check"><ContextMenu.ItemIndicator><Check size={14}/></ContextMenu.ItemIndicator></span>{margin === 0 ? t("无边距") : `${margin} px`}</ContextMenu.RadioItem>)}
          </ContextMenu.RadioGroup>
          <ContextMenu.Separator className="canvas-menu-separator"/>
          <ContextMenu.Item onSelect={() => inspect('margin')}>{t("自定义页边距…")}</ContextMenu.Item>
        </ContextMenu.SubContent></ContextMenu.Portal>
      </ContextMenu.Sub>
      <ContextMenu.Item onSelect={() => inspect('background')}><PaintBucket size={15}/>{t("页面背景…")}<span className="canvas-menu-color" aria-hidden="true" style={{ background: settings.background }}/></ContextMenu.Item>
      <ContextMenu.Item onSelect={() => inspect('theme')}><Palette size={15}/>{t("页面主题…")}</ContextMenu.Item>
      <ContextMenu.Separator className="canvas-menu-separator"/>
      <ContextMenu.CheckboxItem checked={grid.showGrid} onCheckedChange={checked => onGridChange({ showGrid: checked === true })}><Grid3X3 size={15}/>{t("显示网格")}<span className="canvas-menu-value"><ContextMenu.ItemIndicator><Check size={14}/></ContextMenu.ItemIndicator></span></ContextMenu.CheckboxItem>
      <ContextMenu.CheckboxItem checked={grid.snapToGrid} onCheckedChange={checked => onGridChange({ snapToGrid: checked === true })}><Magnet size={15}/>{t("网格吸附")}<span className="canvas-menu-value"><ContextMenu.ItemIndicator><Check size={14}/></ContextMenu.ItemIndicator></span></ContextMenu.CheckboxItem>
      <ContextMenu.Sub><ContextMenu.SubTrigger><Ruler size={15}/>{t("网格间距")}<span className="canvas-menu-value">{grid.gridSize} px</span><ChevronRight size={13}/></ContextMenu.SubTrigger>
        <ContextMenu.Portal><ContextMenu.SubContent className={menuClass} aria-label={t("网格间距")} collisionPadding={8}>
          <ContextMenu.RadioGroup value={String(grid.gridSize)} onValueChange={value => onGridChange({ gridSize: Number(value) as CanvasGridPreferences['gridSize'] })}>
            {[8,16,24,32].map(size => <ContextMenu.RadioItem key={size} value={String(size)}><span className="canvas-menu-check"><ContextMenu.ItemIndicator><Check size={14}/></ContextMenu.ItemIndicator></span>{size} px</ContextMenu.RadioItem>)}
          </ContextMenu.RadioGroup>
        </ContextMenu.SubContent></ContextMenu.Portal>
      </ContextMenu.Sub>
      <ContextMenu.Separator className="canvas-menu-separator"/>
      <ContextMenu.Item onSelect={onFit}><Scan size={15}/>{t("适应画布")}</ContextMenu.Item>
      <ContextMenu.Item onSelect={onActualSize}><Maximize size={15}/>{t("恢复 100%")}</ContextMenu.Item>
    </ContextMenu.Content></ContextMenu.Portal>}
  </ContextMenu.Root>;
}
