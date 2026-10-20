const isMacOS = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

export const canvasModifierLabel = isMacOS ? '⌘' : 'Alt';

export function hasCanvasModifier(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>) {
  return !event.ctrlKey && (isMacOS ? event.metaKey && !event.altKey : event.altKey && !event.metaKey);
}
