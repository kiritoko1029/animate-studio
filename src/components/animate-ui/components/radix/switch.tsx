/** Styled Animate UI wrapper. Copyright (c) 2025 Elliot Sutton. MIT + Commons Clause.
 * Migrated to the v2 npm primitives; see THIRD_PARTY_NOTICES.md. */
import * as Primitive from '@animate-ui/react/primitives/radix-ui/switch';
import { cn } from '@/lib/cn';

export type SwitchProps = Primitive.SwitchProps;

export function Switch({ className, ...props }: SwitchProps) {
  return <Primitive.Root data-slot="switch" className={cn('relative flex h-5 w-8 shrink-0 items-center justify-start rounded-full border border-transparent px-px shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input data-[state=checked]:justify-end', className)} {...props}>
    <Primitive.Thumb data-slot="switch-thumb" className="pointer-events-none block size-4 rounded-full bg-background ring-0" />
  </Primitive.Root>;
}
