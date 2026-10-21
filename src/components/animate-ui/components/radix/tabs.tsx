/** Styled Animate UI wrapper. Copyright (c) 2025 Elliot Sutton. MIT + Commons Clause.
 * Migrated to the v2 npm primitives; see THIRD_PARTY_NOTICES.md. */
import * as Primitive from '@animate-ui/react/primitives/radix-ui/tabs';
import { cn } from '@/lib/cn';

export function Tabs({ className, ...props }: Primitive.TabsProps) {
  return <Primitive.Root className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function TabsList({ className, ...props }: Primitive.TabsListProps) {
  return <Primitive.List data-slot="tabs-list" className={cn('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: Primitive.TabsTriggerProps) {
  return <Primitive.Trigger data-slot="tabs-trigger" className={cn('relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground', className)} {...props} />;
}

export function TabsContent({ className, ...props }: Primitive.TabsContentProps) {
  return <Primitive.Content className={cn('flex-1 outline-none', className)} {...props} />;
}
