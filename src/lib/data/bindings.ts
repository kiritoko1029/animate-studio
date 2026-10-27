import type { Block } from '../../model';
import type { Action, Bindings } from '../interactions/types';

export function bindingDataRoot(bindings?: Bindings): string | undefined {
  for (const binding of Object.values(bindings ?? {})) {
    if (binding?.kind !== 'expression') continue;
    const match = binding.value.match(/\bdata\.([A-Za-z][A-Za-z0-9_-]{0,39})/);
    if (match) return match[1];
  }
  return undefined;
}
export function bindingDataRoots(blocks: Block[]): string[] {
  const roots = new Set<string>();
  const visitAction = (action: Action): void => {
    if ('expression' in action) {
      const match = action.expression.match(/\bdata\.([A-Za-z][A-Za-z0-9_-]{0,39})/);
      if (match) roots.add(match[1]);
    }
    if (action.type === 'condition') { action.then.forEach(visitAction); action.else.forEach(visitAction); }
  };
  const visit = (block: Block) => {
    for (const binding of Object.values(block.bindings ?? {})) {
      if (binding?.kind !== 'expression') continue;
      for (const match of binding.value.matchAll(/\bdata\.([A-Za-z][A-Za-z0-9_-]{0,39})/g)) roots.add(match[1]);
    }
    for (const actions of Object.values(block.events ?? {})) actions?.forEach(visitAction);
    block.children?.forEach(visit);
  };
  blocks.forEach(visit);
  return [...roots];
}
