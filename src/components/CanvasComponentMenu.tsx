import { blockLabel } from '../i18n/catalog';
import { t } from '../i18n';
import { useRef, type ReactElement, type KeyboardEvent } from 'react';
import { ContextMenu } from '@animate-ui/react/primitives/radix-ui/context-menu';
import { AlignHorizontalDistributeCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, ArrowLeftRight, ArrowDown, ArrowUp, ArrowUpToLine, ArrowDownToLine, Copy, Database, Link2, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react';
import { type Block, type PageDocument } from '../model';
import { ComponentScaleControls } from './ComponentScaleControls';
import type { HorizontalAlignment } from '../lib/canvas-bounds';
import type { LayerAction } from '../lib/layers';

export type InspectorTab = 'component' | 'logic';
const alignments = [
  { value: 'left', label: '左对齐', Icon: AlignHorizontalJustifyStart },
  { value: 'center', label: '居中对齐', Icon: AlignHorizontalDistributeCenter },
  { value: 'right', label: '右对齐', Icon: AlignHorizontalJustifyEnd },
] as const;
const layers = [
  { value: 'lower', label: '置于下一层', Icon: ArrowDown },
  { value: 'raise', label: '置于上一层', Icon: ArrowUp },
  { value: 'top', label: '置于顶层', Icon: ArrowUpToLine },
  { value: 'bottom', label: '置于底层', Icon: ArrowDownToLine },
] as const;

function navigateRow(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled])')];
  const index = items.indexOf(event.target as HTMLElement);
  if (index < 0) return;
  event.preventDefault(); event.stopPropagation();
  items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]?.focus();
}

export function CanvasComponentMenu({ block, selectionCount = 1, settings, onBlockChange, children, open, disabled, onOpenChange, onInspect, onCreateVariable, onAlign, onFillWidth, onDuplicate, onDelete, layerIndex, layerCount, onLayerChange }: {
  block: Block; children: ReactElement; open: boolean; disabled: boolean; onOpenChange: (open: boolean) => void;
  selectionCount?: number; settings: PageDocument['settings']; onBlockChange: (block: Block) => void;
  onInspect: (id: string, tab: InspectorTab, advanced?: boolean) => void; onCreateVariable: (id: string) => void;
  onDuplicate: (id: string) => void; onDelete: (id: string) => void;
  onAlign: (id: string, alignment: HorizontalAlignment) => void;
  onFillWidth: (id: string) => void;
  layerIndex: number; layerCount: number;
  onLayerChange: (id: string, action: LayerAction) => void;
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  const restoreFocus = useRef(true);
  const run = (action: () => void) => {
    restoreFocus.current = false;
    // Dialogs capture their opener on mount. Use the component, not a disappearing menu item.
    trigger.current?.focus({ preventScroll: true });
    action();
  };
  return <ContextMenu.Root open={open && !disabled} modal={false} onOpenChange={open => { if (open) restoreFocus.current = true; onOpenChange(open); }}>
    <ContextMenu.Trigger asChild ref={trigger} disabled={disabled} aria-haspopup="menu" onContextMenu={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) return;
        event.preventDefault(); event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.max(8, Math.min(rect.left + 24, window.innerWidth - 8)), clientY: Math.max(8, Math.min(rect.top + 24, window.innerHeight - 8)) }));
      }}>{children}</ContextMenu.Trigger>
    {/* Retire the dismissal layer immediately so an exiting menu cannot intercept the next menu. */}
    {open && !disabled && <ContextMenu.Portal><ContextMenu.Content className="studio-menu canvas-component-menu" aria-label={selectionCount > 1 ? t("所选组件操作") : t("{0}操作", { 0: blockLabel(block) })} collisionPadding={8} loop
      onEscapeKeyDown={event => {
        // Let the percentage field discard its draft before the menu dismisses.
        if (event.target instanceof HTMLElement && event.target.closest('.canvas-menu-scale input[type="number"]')) event.preventDefault();
      }}
      onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current) trigger.current?.focus({ preventScroll: true }); }}
      onInteractOutside={() => { restoreFocus.current = false; }}>
      <ContextMenu.Label className="canvas-menu-label">{selectionCount > 1 ? t("已选 {0} 个组件", { 0: selectionCount }) : blockLabel(block)}</ContextMenu.Label>
      <ContextMenu.Item onSelect={() => run(() => onInspect(block.id, 'component'))}><Settings2 size={15} />{selectionCount > 1 ? t("批量编辑属性") : t("编辑属性")}</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => run(() => onInspect(block.id, 'component', true))}><SlidersHorizontal size={15} />{t("高级设置…")}</ContextMenu.Item>
      {selectionCount <= 1 && <>
      <ContextMenu.Item onSelect={() => run(() => onInspect(block.id, 'logic'))}><Link2 size={15} />{t("绑定属性")}</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => run(() => onCreateVariable(block.id))}><Database size={15} />{t("创建变量并绑定…")}</ContextMenu.Item>
      <ContextMenu.Separator className="canvas-menu-separator" />
      <ContextMenu.Item asChild textValue={t("整体缩放")} onSelect={event => event.preventDefault()}>
        <div className="canvas-menu-scale" aria-label={t("整体缩放")} onKeyDown={event => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
          }
        }} onPointerMove={event => {
          // Menu hover must not steal focus while a nested input is being edited.
          if (event.currentTarget.contains(document.activeElement)) event.preventDefault();
        }}>
          <ComponentScaleControls block={block} settings={settings} onChange={onBlockChange} variant="menu"/>
        </div>
      </ContextMenu.Item>
      <ContextMenu.Separator className="canvas-menu-separator" />
      <ContextMenu.Label className="canvas-menu-label">{t("对齐到页面边距")}</ContextMenu.Label>
      <ContextMenu.Group className="canvas-menu-align-row" aria-label={t("对齐到页面边距")} onKeyDown={navigateRow}>
        {alignments.map(({ value, label, Icon }) => <ContextMenu.Item key={value} asChild textValue={t(label)} onSelect={() => run(() => onAlign(block.id, value))}>
          <button type="button" aria-label={t(label)} title={t(label)}><Icon size={17} aria-hidden="true"/></button>
        </ContextMenu.Item>)}
      </ContextMenu.Group>
      <ContextMenu.Item onSelect={() => run(() => onFillWidth(block.id))} title={t("填满当前区域的可用宽度，保留页面边距与组件间距")}><ArrowLeftRight size={15}/>{t("一键宽度填充")}</ContextMenu.Item>
      <ContextMenu.Separator className="canvas-menu-separator" />
      <ContextMenu.Label className="canvas-menu-label">{t("图层顺序")}</ContextMenu.Label>
      <ContextMenu.Group className="canvas-menu-align-row canvas-menu-layer-row" aria-label={t("图层顺序")} onKeyDown={navigateRow}>
        {layers.map(({ value, label, Icon }) => {
          const unavailable = value === 'lower' || value === 'bottom' ? layerIndex === 0 : layerIndex === layerCount - 1;
          return <ContextMenu.Item key={value} asChild textValue={t(label)} disabled={unavailable} onSelect={() => run(() => onLayerChange(block.id, value))}>
            <button type="button" disabled={unavailable} aria-label={t(label)} title={t(label)}><Icon size={17} aria-hidden="true"/></button>
          </ContextMenu.Item>;
        })}
      </ContextMenu.Group>
      <ContextMenu.Separator className="canvas-menu-separator" />
      </>}
      <ContextMenu.Item onSelect={() => run(() => onDuplicate(block.id))}><Copy size={15} />{selectionCount > 1 ? t("复制所选组件") : t("复制组件")}</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => run(() => onDelete(block.id))}><Trash2 size={15} />{selectionCount > 1 ? t("删除所选组件") : t("删除组件")}</ContextMenu.Item>
    </ContextMenu.Content></ContextMenu.Portal>}
  </ContextMenu.Root>;
}
