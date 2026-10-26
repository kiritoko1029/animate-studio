import { createContext, useCallback, useContext, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { t } from '../i18n';
import type { InspectorDisclosurePreferences } from '../lib/workbench-preferences';
import { StudioButton } from './StudioUI';
import '../inspector-settings.css';

const InspectorDisclosureContext = createContext<{ preferences: InspectorDisclosurePreferences; revision: number; onChange: (id: string, open: boolean) => void }>({ preferences: {}, revision: 0, onChange: () => {} });
export const InspectorDisclosureProvider = InspectorDisclosureContext.Provider;

export function useInspectorDisclosure(id: string, defaultOpen = false) {
  const { preferences, revision, onChange } = useContext(InspectorDisclosureContext);
  const element = useRef<HTMLDetailsElement>(null);
  const preference = preferences[id];
  const ref = useCallback((node: HTMLDetailsElement | null) => {
    element.current = node;
    if (node) node.open = preference ?? defaultOpen;
  }, [id, preference, defaultOpen, revision]);
  const onSummaryClick = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !element.current) return;
    event.preventDefault();
    const open = !element.current.open;
    element.current.open = open;
    onChange(id, open);
  };
  return { detailsProps: { ref, open: defaultOpen, 'data-inspector-disclosure': id }, onSummaryClick };
}

export function InspectorDisclosure({ id, title, badge, children, className = '' }: { id: string; title: string; badge?: string; children: ReactNode; className?: string }) {
  const disclosure = useInspectorDisclosure(id);
  return <details {...disclosure.detailsProps} className={`inspector-disclosure ${className}`} data-inspector-advanced>
    <summary onClick={disclosure.onSummaryClick}><ChevronRight size={14}/><strong>{t(title)}</strong>{badge && <span>{t(badge)}</span>}<SlidersHorizontal size={13}/></summary>
    <div className="inspector-disclosure-content">{children}</div>
  </details>;
}

export function revealInspectorSetting(element: HTMLElement) {
  if (element instanceof HTMLDetailsElement) element.open = true;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  element.scrollIntoView({ block: 'center', behavior: 'instant' });
  element.focus({ preventScroll: true });
}

export function revealInspectorAdvanced(container: HTMLElement) {
  const groups = [...container.querySelectorAll<HTMLElement>('details[data-inspector-advanced], details.official-advanced')];
  for (const group of groups) revealInspectorSetting(group);
  const first = groups[0];
  if (first) {
    first.scrollIntoView({ block: 'start', behavior: 'instant' });
    first.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  }
}

type SearchItem = { id: string; label: string; detail: string; element: HTMLElement };

function searchGroup(element: HTMLElement) {
  const section = element.closest('.property-section')?.querySelector(':scope > h3')?.textContent?.trim();
  const official = element.closest('.official-property-group')?.querySelector(':scope > summary')?.textContent?.trim();
  return element.closest<HTMLElement>('[data-official-property]')?.dataset.officialProperty ?? official ?? section ?? t('组件属性');
}

export function InspectorSettingsSearch() {
  const root = useRef<HTMLDivElement>(null);
  const resultsId = useId();
  const [query, setQuery] = useState(''), [active, setActive] = useState(0), [open, setOpen] = useState(false);
  const normalized = query.trim().toLocaleLowerCase();
  const items: SearchItem[] = [];
  if (normalized && root.current) {
    const container = root.current.closest('.inspector-scroll') ?? root.current.parentElement;
    const controls = container?.querySelectorAll<HTMLElement>('input[aria-label], textarea[aria-label], select[aria-label], button[aria-label], button[aria-pressed], summary, .field input, .field textarea, .field select') ?? [];
    const seen = new Set<HTMLElement>();
    for (const element of controls) {
      if (seen.has(element) || element.closest('.inspector-settings-search') || element.matches('input[type="hidden"]')) continue;
      seen.add(element);
      const label = (element.getAttribute('aria-label') || element.closest('label')?.querySelector('.field-label')?.textContent || element.textContent || '').trim();
      const detail = searchGroup(element);
      if (`${label} ${detail}`.toLocaleLowerCase().includes(normalized)) items.push({ id: `${items.length}`, label, detail, element });
      if (items.length >= 8) break;
    }
  }
  const showResults = open && normalized.length > 0;
  const activeOptionId = showResults && items[active] ? `${resultsId}-option-${active}` : undefined;
  const reveal = (item: SearchItem) => {
    revealInspectorSetting(item.element);
    setQuery(''); setOpen(false); setActive(0);
  };
  return <div ref={root} className="inspector-settings-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Search size={13}/>
    <input aria-label={t('搜索设置')} placeholder={t('搜索设置…')} value={query} role="combobox" aria-autocomplete="list" aria-expanded={showResults} aria-controls={resultsId} aria-activedescendant={activeOptionId}
      onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') { event.preventDefault(); setQuery(''); setOpen(false); return; }
        if (!items.length) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true); setActive(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
        } else if (event.key === 'Enter') { event.preventDefault(); reveal(items[Math.min(active, items.length - 1)]); }
      }}/>
    {query && <StudioButton className="icon-button" aria-label={t('清除设置搜索')} onClick={() => { setQuery(''); setOpen(false); }}><X size={12}/></StudioButton>}
    {showResults && <div className="inspector-settings-results" id={resultsId} role="listbox" aria-label={t('设置搜索结果')}>
      {items.map((item, index) => <button type="button" id={`${resultsId}-option-${index}`} role="option" aria-selected={active === index} className={active === index ? 'active' : ''} key={`${item.id}-${item.label}`}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => reveal(item)}>
        <strong>{item.label}</strong><small>{item.detail}</small>
      </button>)}
      {!items.length && <p>{t('没有匹配的设置')}</p>}
    </div>}
  </div>;
}
