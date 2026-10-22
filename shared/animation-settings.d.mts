export type AnimationValue = string | number | boolean | null | AnimationValue[] | { [key: string]: AnimationValue };
export type AnimationSettings = Record<string, AnimationValue>;
export type AnimationSchema = {type?: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'; enum?: AnimationValue[]; anyOf?: AnimationSchema[]; properties?: Record<string, AnimationSchema>; required?: string[]; items?: AnimationSchema; tuple?: AnimationSchema[]; maxLength?: number; maxItems?: number; minItems?: number; min?: number; max?: number};
export type AnimationControl = { value?: AnimationValue; kind?: 'spring-options' | 'transition' | 'rgb' | 'json' | 'motion-target' | 'margin' | 'css-time' | 'css-length' | 'style' | 'element-props' | 'grid-size' | 'frames' | 'motion-element-props' | 'variants' | 'string' | 'number' | 'boolean'; booleans?: boolean[]; example?: AnimationValue; schema?: AnimationSchema; label?: string; advanced?: boolean; unit?: string; min?: number; max?: number; step?: number; maxLength?: number; options?: Record<string, string | number | boolean | null> };
export const officialAnimationControls: Record<string, { source: string; groups: Record<string, Record<string, AnimationControl>> }>;
export function validateAnimationSetting(field: AnimationControl, value: unknown, name?: string): void;
export function validateAnimationSettings(type: string, settings: unknown): void;
export function animationValuesEqual(a: unknown, b: unknown): boolean;
export function officialAnimationProps(type: string, group: string, settings?: AnimationSettings): AnimationSettings;
