import type { ComponentProps, ElementType } from 'react';
import type { Block } from '../model';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';

/** The saved settings are validated against the pinned upstream control schema. */
export function motionProps<C extends ElementType>(block: Block, group: string): Omit<Partial<ComponentProps<C>>, 'asChild' | 'children' | 'defaultValue'> {
  return officialAnimationProps(block.type, group, block.props.motion) as Omit<Partial<ComponentProps<C>>, 'asChild' | 'children' | 'defaultValue'>;
}

export function anchoredProps<C extends ElementType>(block: Block, group: string): Omit<Partial<ComponentProps<C>>, 'asChild' | 'children' | 'defaultValue'> {
  const props = officialAnimationProps(block.type, group, block.props.motion);
  // Base UI's logical sides map to the matching physical side in this LTR canvas.
  if (props.side === 'inline-start') props.side = 'left';
  if (props.side === 'inline-end') props.side = 'right';
  return props as Omit<Partial<ComponentProps<C>>, 'asChild' | 'children' | 'defaultValue'>;
}
