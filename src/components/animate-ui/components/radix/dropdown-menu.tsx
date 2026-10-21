/** Styled Animate UI wrapper. Copyright (c) 2025 Elliot Sutton. MIT + Commons Clause.
 * Migrated to the v2 npm primitives; see THIRD_PARTY_NOTICES.md. */
import * as Primitive from '@animate-ui/react/primitives/radix-ui/dropdown-menu';
import { cn } from '@/lib/cn';

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({ sideOffset = 4, className, ...props }: Primitive.DropdownMenuContentProps) {
  return <Primitive.Portal><Primitive.Content sideOffset={sideOffset} className={cn('bg-popover text-popover-foreground z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-none', className)} {...props} /></Primitive.Portal>;
}

export function DropdownMenuItem({ className, ...props }: Primitive.DropdownMenuItemProps) {
  return <Primitive.Item className={cn('relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: Primitive.DropdownMenuSeparatorProps) {
  return <Primitive.Separator className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />;
}
