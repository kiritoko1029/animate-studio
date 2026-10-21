export type AnimationSettings = Record<string, string | number | boolean>;
export type AnimationControl = { value: string | number | boolean; min?: number; max?: number; step?: number; options?: Record<string, string | number | boolean> };
export const officialAnimationControls: Record<string, { source: string; groups: Record<string, Record<string, AnimationControl>> }>;
export function validateAnimationSettings(type: string, settings: unknown): void;
export function officialAnimationProps(type: string, group: string, settings?: AnimationSettings): AnimationSettings;
