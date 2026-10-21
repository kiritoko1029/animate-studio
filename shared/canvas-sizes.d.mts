export type CanvasSize = { width: number; height: number };
export const canvasPresets: readonly (CanvasSize & { id: string; label: string })[];
export const defaultCanvasSize: CanvasSize & { id: string; label: string };
export const canvasLimits: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number };
