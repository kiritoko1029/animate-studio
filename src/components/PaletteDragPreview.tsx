import { DragOverlay, type Modifier } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import { blockName, defaultFrame, type Block, type PageDocument } from '../model';
import { pageThemeStyle } from '../lib/themes';
import { palettePointer } from '../lib/palette-drag';
import { canvasBounds } from '../lib/canvas-bounds';
import { BlockRenderer } from './PageRenderer';

/** Carry real content with the pointer until release; the canvas stays unchanged. */
export function PaletteDragPreview({ block, settings, canvasScale }: { block: Block | null; settings: PageDocument['settings']; canvasScale: number | null }) {
  const frame = block ? defaultFrame(block.type, canvasBounds(settings).width) : null;
  const scale = canvasScale ?? (frame ? Math.min(1, 320 / frame.width, 240 / frame.height) : 1);
  const anchor: Modifier = ({ transform, activatorEvent, activeNodeRect, windowRect }) => {
    if (!frame || !activeNodeRect || !activatorEvent) return transform;
    const point = palettePointer(activatorEvent as MouseEvent, { x: 0, y: 0 }, activeNodeRect);
    if (!point) return transform;
    const left = transform.x + point.x - frame.width * scale / 2, top = transform.y + point.y - 24 * scale;
    return { ...transform,
      x: (canvasScale !== null ? left : Math.max(8, Math.min(left, (windowRect?.width ?? Infinity) - frame.width * scale - 8))) - activeNodeRect.left,
      y: (canvasScale !== null ? top : Math.max(32, Math.min(top, (windowRect?.height ?? Infinity) - frame.height * scale - 8))) - activeNodeRect.top,
    };
  };
  return <DragOverlay dropAnimation={null} adjustScale={false} modifiers={[anchor]} style={{ pointerEvents: 'none' }} zIndex={80}>
    {block && frame && <div className="palette-drag-preview" aria-hidden="true" style={{ width: frame.width * scale, height: frame.height * scale }}>
      <div className="palette-drag-surface page-surface" style={{ ...pageThemeStyle(settings), width: frame.width, height: frame.height, transform: `scale(${scale})` } as CSSProperties}>
        <BlockRenderer block={block} settings={settings} interactive={false} bounded preview />
      </div>
      <span className="palette-drag-label">{blockName(block.type)}</span>
    </div>}
  </DragOverlay>;
}
