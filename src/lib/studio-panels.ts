export type PanelWidths = { left: number; right: number };
export type PanelSide = keyof PanelWidths;
export const panelStorageKey = 'animate-studio-panel-widths';
export const panelMinimums: PanelWidths = { left: 180, right: 216 };
export const panelMaximums: PanelWidths = { left: 420, right: 480 };
const centerMinimum = 360;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function defaultPanelWidths(width: number): PanelWidths {
  return width >= 1600 ? { left: 246, right: 270 } : width > 1200 ? { left: 230, right: 244 }
    : width > 1050 ? { left: 210, right: 224 } : width > 800 ? { left: 200, right: 216 } : { left: 180, right: 235 };
}

export function fitPanelWidths(preferred: Partial<PanelWidths>, width: number, inspector: boolean): PanelWidths {
  const defaults = defaultPanelWidths(width);
  const left = clamp(preferred.left ?? defaults.left, panelMinimums.left, panelMaximums.left);
  const right = clamp(preferred.right ?? defaults.right, panelMinimums.right, panelMaximums.right);
  const dockedRight = inspector && width > 800;
  const excess = Math.max(0, left + (dockedRight ? right : 0) + centerMinimum - width);
  const leftRoom = left - panelMinimums.left, rightRoom = dockedRight ? right - panelMinimums.right : 0;
  const fraction = Math.min(1, excess / (leftRoom + rightRoom || 1));
  return { left: Math.round(left - leftRoom * fraction), right: Math.round(right - rightRoom * fraction) };
}

export function panelWidthLimit(side: PanelSide, widths: PanelWidths, width: number, inspector: boolean) {
  const other = side === 'right' ? widths.left : inspector && width > 800 ? widths.right : 0;
  return Math.max(panelMinimums[side], Math.min(panelMaximums[side], width - other - centerMinimum));
}

export function readPanelWidths(value: string | null): Partial<PanelWidths> {
  try {
    const parsed = JSON.parse(value ?? 'null');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries((['left', 'right'] as const).filter(side => typeof parsed[side] === 'number' && Number.isFinite(parsed[side])).map(side => [side, clamp(parsed[side], panelMinimums[side], panelMaximums[side])]));
  } catch { return {}; }
}
