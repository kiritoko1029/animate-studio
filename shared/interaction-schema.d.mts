import type { Block, PageDocument } from '../src/model';
import type { Bindings } from '../src/lib/interactions/types';
export const bindingLabels: Record<keyof Bindings, string>;
export const valueTypes: string[];
export function bindingKeys(block: Block): (keyof Bindings)[];
export function eventNames(type: string): ('click' | 'change')[];
export function validateInteractions(page: PageDocument): void;

export function bindingVariableTypes(block: Block, key: keyof Bindings): string[];
export function variableIsUsed(page: PageDocument, name: string): boolean;
