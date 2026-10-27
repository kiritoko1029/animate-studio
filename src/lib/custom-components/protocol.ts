/**
 * Host side of the component frame protocol. Every message from a component
 * frame is untrusted: it is accepted only from the exact frame window, with the
 * channel of the current run, a known type and well-typed, bounded fields.
 */
export type FrameMessage =
  | { type: 'ready' }
  | { type: 'pong' }
  | { type: 'click' }
  | { type: 'error'; message: string; line?: number; column?: number }
  | { type: 'warning'; message: string; line?: number; column?: number }
  | { type: 'log'; level: 'log' | 'info' | 'warn' | 'error'; message: string }
  | { type: 'open-link'; href: string };

const messageSource = 'animate-studio-component';
const shapes: Record<FrameMessage['type'], { required: string[]; optional: string[] }> = {
  ready: { required: [], optional: [] },
  pong: { required: [], optional: [] },
  click: { required: [], optional: [] },
  error: { required: ['message'], optional: ['line', 'column'] },
  warning: { required: ['message'], optional: ['line', 'column'] },
  log: { required: ['level', 'message'], optional: [] },
  'open-link': { required: ['href'], optional: [] },
};
const envelope = ['source', 'channel', 'type'];

function plain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
const boundedText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max + 1;
const position = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000000);

/** Returns the typed message, or null when it must be ignored. */
export function readFrameMessage(event: { source: unknown; data: unknown }, expected: { source: unknown; channel: string }): FrameMessage | null {
  if (!expected.source || event.source !== expected.source) return null;
  const data = event.data;
  if (!plain(data) || data.source !== messageSource || data.channel !== expected.channel || typeof data.type !== 'string') return null;
  if (!Object.hasOwn(shapes, data.type)) return null;
  const type = data.type as FrameMessage['type'];
  const shape = shapes[type];
  for (const key of Object.keys(data)) if (!envelope.includes(key) && !shape.required.includes(key) && !shape.optional.includes(key)) return null;
  for (const key of shape.required) if (!Object.hasOwn(data, key)) return null;
  switch (type) {
    case 'ready': case 'pong': case 'click': return { type };
    case 'error': case 'warning': {
      if (!boundedText(data.message, 1000) || !position(data.line) || !position(data.column)) return null;
      return { type, message: String(data.message), ...(data.line === undefined ? {} : { line: data.line as number }), ...(data.column === undefined ? {} : { column: data.column as number }) };
    }
    case 'log': {
      if (!['log', 'info', 'warn', 'error'].includes(String(data.level)) || !boundedText(data.message, 1000)) return null;
      return { type, level: data.level as 'log' | 'info' | 'warn' | 'error', message: String(data.message) };
    }
    case 'open-link': return boundedText(data.href, 2048) ? { type, href: String(data.href) } : null;
  }
}

/** Host-to-frame messages carry only display data: instance fields and theme values. */
export function updateMessage(channel: string, props: Record<string, string>, theme: Record<string, string>, route?: import('./document').ComponentRoute) {
  return { channel, type: 'update' as const, props: { ...props }, theme: { ...theme }, ...(route ? { route } : {}) };
}

/** Allows short bursts but stops a frame from flooding the page runtime. */
export function createRateLimiter(limit = 10, windowMs = 1000, now: () => number = () => Date.now()) {
  const hits: number[] = [];
  return () => {
    const time = now();
    while (hits.length && time - hits[0] >= windowMs) hits.shift();
    if (hits.length >= limit) return false;
    hits.push(time);
    return true;
  };
}
