import { useRef, type ReactElement, type KeyboardEvent } from 'react';
import { ContextMenu } from '@animate-ui/react/primitives/radix-ui/context-menu';
import { AlignHorizontalDistributeCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, ArrowLeftRight, ArrowDown, ArrowUp, ArrowUpToLine, ArrowDownToLine, Copy, Database, Link2, Settings2, Trash2 } from 'lucide-react';
import { blockName, type Block } from '../model';
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

export function CanvasComponentMenu({ block, children, open, disabled, onOpenChange, onInspect, onCreateVariable, onAlign, onFillWidth, onDuplicate, onDelete, layerIndex, layerCount, onLayerChange }: {
  block: Block; children: ReactElement; open: boolean; disabled: boolean; onOpenChange: (open: boolean) => void;
  onInspect: (id: string, tab: InspectorTab) => void; onCreateVariable: (id: string) => void;
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
    {open && !disabled && <ContextMenu.Portal><ContextMenu.Content className="studio-menu canvas-component-menu" aria-label={`${blockName(block.type)}操作`} collisionPadding={8} loop
      onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current) trigger.current?.focus({ preventScroll: true }); }}
      onInteractOutside={() => { restoreFocus.current = false; }}>
      <ContextMenu.Label className="canvas-menu-label">{blockName(block.type)}</ContextMenu.Label>
      <ContextMenu.Item onSelect={() => run(() => onInspect(block.id, 'component'))}><Settings2 size={15} />编辑属性</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => run(() => onInspect(block.id, 'logic'))}><Link2 size={15} />绑定属性</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => run(() => onCreateVariable(block.id))}><Database size={15} />创建变量并绑定…</ContextMenu.Item>
      <ContextMenu.Separator className="canvas-menu-separator" />
      <ContextMenu.Label className="canvas-menu-label">对齐到页面边距</ContextMenu.Label>
      <ContextMenu.Group className="canvas-menu-align-row" aria-label="对齐到页面边距" onKeyDown={navigateRow}>
        {alignments.map(({ value, label, Icon }) => <ContextMenu.Item key={value} asChild textValue={label} onSelect={() => run(() => onAlign(block.id, value))}>
          <button type="button" aria-label={label} title={label}><Icon size={17} aria-hidden="true"/></button>
        </ContextMenu.Item>)}
      </ContextMenu.Group>
      <ContextMenu.Item onSelect={() => run(() => onFillWidth(block.id))} title="填满当前区域的可用宽度，保留页面边距与组件间距"><ArrowLeftRight size={15}/>一键宽度填充</ContextMenu.Item>
      <ContextMenu.Separator className="canvas-menu-separator" />
      <ContextMenu.Label className="canvas-menu-label">图层顺序</ContextMenu.Label>
      <ContextMenu.Group className="canvas-menu-align-row canvas-menu-layer-row" aria-label="图层顺序" onKeyDown={navigateRow}>
        {layers.map(({ value, label, Icon }) => {
          const unavailable = value === 'lower' || value === 'bottom' ? layerIndex === 0 : layerIndex === layerCount - 1;
          return <ContextMenu.Item key={value} asChild textValue={label} disabled={unavailable} onSelect={() => run(() => onLayerChange(block.id, value))}>
            <button type="button" disabled={unavailable} aria-label={label} title={label}><Icon size={17} aria-hidden="true"/></button>
          </ContextMenu.Item>;
        })}
      </ContextMenu.Group>
      <ContextMenu.Separator className="canvas-menu-separator" />
      <ContextMenu.Item onSelect={() => run(() => onDuplicate(block.id))}><Copy size={15} />复制组件</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => run(() => onDelete(block.id))}><Trash2 size={15} />删除组件</ContextMenu.Item>
    </ContextMenu.Content></ContextMenu.Portal>}
  </ContextMenu.Root>;
}
