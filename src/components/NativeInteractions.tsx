import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import type { createInteractionRuntime } from '../../shared/interactions.mjs';
import type { Block } from '../model';
import type { JsonValue } from '../lib/interactions/types';

export type NativeRuntime = ReturnType<typeof createInteractionRuntime>;
export const NativeRuntimeContext = createContext<{ runtime: NativeRuntime; state: Record<string, JsonValue> } | null>(null);
const BlockRuntimeContext = createContext<{ block: Block; runtime: NativeRuntime } | null>(null);

export function BlockRuntimeProvider({ block, runtime, children }: { block: Block; runtime?: NativeRuntime; children: ReactNode }) {
  return <BlockRuntimeContext.Provider value={runtime ? { block, runtime } : null}>{children}</BlockRuntimeContext.Provider>;
}

/** Native primitives keep their own local state until the author binds it to a page variable. */
export function useBlockValue<T extends string | number | boolean>(initial: T, property: 'value' | 'checked' = 'value'): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(BlockRuntimeContext);
  const [local, setLocal] = useState(initial);
  const previousInitial = useRef(initial);
  useEffect(() => {
    if (Object.is(previousInitial.current, initial)) return;
    previousInitial.current = initial; setLocal(initial);
  }, [initial]);
  const binding = context?.block.bindings?.[property];
  const raw = binding ? context!.runtime.read(binding, initial) : local;
  const value = (typeof initial === 'number' ? Number.isFinite(Number(raw)) ? Number(raw) : initial
    : typeof initial === 'boolean' ? Boolean(raw) : String(raw ?? '')) as T;
  return [value, action => { const next = typeof action === 'function' ? action(value) : action; setLocal(next); if (context) void context.runtime.dispatch(context.block.id, 'change', next); }];
}
