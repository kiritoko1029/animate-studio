/** Bound the upstream rolling list: it otherwise allocates one element per integer. */
export function scrollingNumberOptions(value: number, fontSize = 44) {
  return { step: Math.max(1, Math.ceil(Math.abs(value) / 100)), itemsSize: Math.ceil(fontSize * 1.3) };
}
