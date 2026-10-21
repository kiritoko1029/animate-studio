/** Component-local CSS pixels, unaffected by the editor's transformed canvas. */
export function elementSize(element: HTMLElement) {
  return { width: element.clientWidth, height: element.clientHeight };
}

export function localPointer(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.width > 0 ? (clientX - rect.left) * element.clientWidth / rect.width : 0,
    y: rect.height > 0 ? (clientY - rect.top) * element.clientHeight / rect.height : 0,
  };
}
