import type { Binding, InteractionConfig, JsonValue, RuntimeOptions } from '../src/lib/interactions/types';
export function createInteractionRuntime(config: InteractionConfig, options?: RuntimeOptions): {
  getState(): Record<string, JsonValue>;
  evaluate(source: string, event?: unknown, snapshot?: Record<string, JsonValue>): any;
  validateExpression(source: string): unknown;
  read(binding: Binding | undefined, fallback: any, snapshot?: Record<string, JsonValue>, event?: unknown): any;
  setState(name: string, value: JsonValue): void;
  setData(data: Record<string, JsonValue>): void;
  getData(): Record<string, JsonValue>;
  dispatch(id: string, name: string, value?: unknown): Promise<void>;
  reset(): void;
  runScript(id: string, event?: unknown): Promise<void>;
  activate(): void;
  dispose(): void;
};
