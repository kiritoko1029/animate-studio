import english from './en.json' with { type: 'json' };

export type Locale = 'zh-CN' | 'en';
export const localeStorageKey = 'animate-studio:locale';
const messages: Readonly<Record<string, string>> = english;
let locale: Locale = 'zh-CN';
const listeners = new Set<() => void>();

export function resolveLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved === 'zh-CN' || saved === 'en') return saved;
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function getLocale(): Locale { return locale; }
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setLocale(next: Locale, persist = true) {
  if (persist) {
    try { localStorage.setItem(localeStorageKey, next); } catch { /* Session choice still works. */ }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (next === locale) return;
  locale = next;
  listeners.forEach(listener => listener());
}

/** Called by the browser entry point; pure modules and export runtimes keep their defaults. */
export function initializeLocale() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(localeStorageKey); } catch { /* Private browsing can deny storage. */ }
  setLocale(resolveLocale(saved, navigator.languages?.length ? navigator.languages : [navigator.language]), false);
}

/** Translate only workbench copy. Interpolated values and authored page content remain untouched. */
export function t(source: string, values: Record<string, string | number | null | undefined> = {}): string {
  const message = locale === 'en' ? messages[source] ?? source : source;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(values, name) ? String(values[name] ?? '') : placeholder);
}

// Older API and validation modules return Chinese messages. Translate at the UI
// boundary so server contracts, saved documents and serialized runtimes stay stable.
const messagePatterns = Object.entries(messages).filter(([source]) => /\{\d+\}/.test(source)).map(([source, english]) => {
  const slots: string[] = [];
  const pattern = source.split(/(\{\d+\})/).map(part => {
    if (/^\{\d+\}$/.test(part)) { slots.push(part.slice(1, -1)); return '(.*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { pattern: new RegExp(`^${pattern}$`, 's'), slots, english };
});

export function translateMessage(message: string): string {
  if (locale !== 'en') return message;
  if (Object.hasOwn(messages, message)) return messages[message];
  for (const { pattern, slots, english } of messagePatterns) {
    const match = pattern.exec(message);
    if (match) {
      const values = Object.fromEntries(slots.map((slot, index) => [slot, match[index + 1]]));
      return english.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
    }
  }
  return message;
}
