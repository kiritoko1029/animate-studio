export const canvasPresets = [
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '2k', label: '2K', width: 2560, height: 1440 },
  { id: '4k', label: '4K', width: 3840, height: 2160 },
];
export const defaultCanvasSize = canvasPresets[0];
export const canvasLimits = { minWidth: 320, maxWidth: 3840, minHeight: 320, maxHeight: 6000 };
