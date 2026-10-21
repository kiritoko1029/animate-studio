import { usePageImage } from './PageAssets';
import { OfficialEffect } from './OfficialEffect';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { motionProps } from '../lib/official-motion';
import { CatalogBlock } from './CatalogBlock';
import { InteractivePreview } from './InteractivePreview';
import { useContext, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, CircleHelp, ImageIcon, Layers3, Sparkles } from 'lucide-react';
import navbarIcons from '../../shared/navbar-icons.json';
import * as Tabs from '@animate-ui/react/primitives/radix-ui/tabs';
import * as Switch from '@animate-ui/react/primitives/radix-ui/switch';
import { AnimatedButton, AnimatedAccordion, FadeIn, HighlightText } from './animate-ui';
import { defaultFrame, safeUrl, isExtendedComponent, type Block, type BlockProps, type PageDocument } from '../model';
import { blockThemeStyle, pageThemeStyle, getTheme } from '../lib/themes';
import { navigate } from '../lib/navigation';
import { LibraryBlock } from './LibraryBlocks';
import '../page.css';
import { PagePreviewTheme } from './PagePreviewTheme';
import { BlockRuntimeProvider, NativeRuntimeContext, useBlockValue } from './NativeInteractions';

type BlockRendererProps = { block: Block; settings: PageDocument['settings']; interactive?: boolean; bounded?: boolean; preview?: boolean };
type PageRendererProps = { document: PageDocument; interactive?: boolean; replayKey?: number };

function parseItems(items = '') {
  return items.split('\n').map(line => line.trim()).filter(Boolean).map((line, index) => {
    const [title, ...content] = line.split('|');
    return { id: `item-${index}`, title: title.trim(), content: content.join('|').trim() || '在属性面板中编辑此处的内容。' };
  });
}

function ActionButton({ props, children, className = '', interactive = true }: { props: BlockProps; children?: ReactNode; className?: string; interactive?: boolean }) {
  const variant = props.variant === 'secondary' || props.variant === 'ghost' ? props.variant : 'primary';
  return <AnimatedButton {...motionProps<typeof AnimatedButton>({type:'button',id:'button',props}, 'Button')} className={`page-button page-button--${variant} ${className}`} variant={variant} disabled={!interactive} style={{ borderRadius: props.radius }} onClick={event => navigate(event, props.url)}>
    {children ?? props.label ?? '了解更多'}<ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
  </AnimatedButton>;
}

function ImageBlock({ block }: { block: Block }) {
  const [failed, setFailed] = useState(false);
  const props = block.props;
  const url = usePageImage(props.imageUrl);
  return <figure className="page-image-figure">
    {!failed && url !== '#' ? <img src={url} alt={props.title || '页面图片'} onError={() => setFailed(true)} style={{ borderRadius: props.radius }} loading="lazy" /> : <div className="page-image-placeholder" style={{ borderRadius: props.radius }}><ImageIcon size={32} strokeWidth={1.4} /><span>添加一张图片，让灵感更生动</span></div>}
    {(props.title || props.text) && <figcaption>{props.title && <strong>{props.title}</strong>}{props.text && <p>{props.text}</p>}</figcaption>}
  </figure>;
}

function NavbarMark({ props }: { props: BlockProps }) {
  const [failed, setFailed] = useState(false);
  const name = props.brandIcon ?? 'leaf';
  if (name === 'none') return null;
  const image = name === 'image';
  const url = usePageImage(props.imageUrl);
  const showImage = image && !failed && url !== '#';
  return <span className={`page-brand-mark${image ? ' page-brand-mark--image' : ''}`} aria-hidden="true">
    {showImage ? <img src={url} alt="" onError={() => setFailed(true)} /> : <span className="page-brand-placeholder"><svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d={(navbarIcons[name] ?? navbarIcons.leaf).path} /></svg></span>}
  </span>;
}

function BlockContent({ block, interactive, snapshot }: { block: Block; interactive: boolean; snapshot: boolean }) {
  const domId = useId();
  const p = block.props;
  const [inputValue, setInputValue] = useBlockValue<string>('');
  const [checked, setChecked] = useBlockValue(p.checked ?? false, 'checked');
  const [index, setIndex] = useBlockValue(p.value ?? 0);
  if (isExtendedComponent(block.type)) return <CatalogBlock block={{...block, type: block.type}} snapshot={snapshot}/>;
  switch (block.type) {
    case 'navbar': {
      const links = (p.items || '').split(/[,，\n]/).map(item => item.trim()).filter(item => item.split('|')[0].trim());
      return <nav className="page-navbar" aria-label="页面导航"><a className="page-brand" href="#" onClick={event => navigate(event, "#")} tabIndex={interactive ? 0 : -1}><NavbarMark key={`${p.brandIcon}:${p.imageUrl}`} props={p} /><span className="page-brand-title">{p.title}</span><span className="page-brand-dot">.</span></a><div className="page-nav-links">{links.map((item, i) => {
        const [label, url] = item.split('|');
        const href = safeUrl(url || ['#features', '#about', '#contact'][i % 3]);
        return <a key={`${item}-${i}`} href={href} onClick={event => navigate(event, href)} tabIndex={interactive ? 0 : -1}>{label}</a>;
      })}</div></nav>;
    }
    case 'hero': {
      const lines = (p.title || '').split('\n');
      return <section className="page-hero"><div className="page-hero-kicker"><span className="page-live-dot" />{p.label}</div><h1 style={{ fontSize: p.fontSize }}>{lines.map((line, i) => <span className="page-hero-line" key={i}>{i === lines.length - 1 ? <HighlightText {...motionProps<typeof HighlightText>(block, 'HighlightText')} color="color-mix(in srgb, var(--page-accent) 13%, transparent)">{line}</HighlightText> : line}</span>)}</h1><p className="page-hero-description">{p.text}</p><ActionButton props={{ ...p, variant: 'primary', label: p.variant || '开始探索' }} interactive={interactive} /></section>;
    }
    case 'heading': return <h2 className="page-heading" style={{ fontSize: p.fontSize }}><HighlightText {...motionProps<typeof HighlightText>(block, 'HighlightText')} color="color-mix(in srgb, var(--page-accent) 13%, transparent)">{p.title || ''}</HighlightText></h2>;
    case 'text': return <p className="page-paragraph" style={{ fontSize: p.fontSize }}>{p.text}</p>;
    case 'button': return <ActionButton props={p} interactive={interactive} />;
    case 'badge': return <span className={`page-badge page-badge--${p.variant || 'soft'}`}><Sparkles size={12} aria-hidden="true" />{p.label}</span>;
    case 'card': return <article className="page-feature-card" id={`${domId}-features`} data-anchor="features" style={{ background: p.background, borderRadius: p.radius }}><div className="page-card-copy"><h3 style={{ fontSize: p.fontSize }}>{p.title}</h3><p>{p.text}</p>{p.label && <button className="page-text-link" disabled={!interactive} onClick={event => navigate(event, p.url)}>{p.label}<ArrowRight size={14} /></button>}</div><div className="page-card-art" aria-hidden="true"><div className="page-art-dot page-art-dot-one" /><div className="page-art-dot page-art-dot-two" /><div className="page-art-stack page-art-stack-back" /><div className="page-art-stack page-art-stack-middle" /><div className="page-art-stack page-art-stack-front"><Layers3 size={32} strokeWidth={1.2} /><div className="page-art-line" /><div className="page-art-line page-art-line-short" /></div><span className="page-art-sparkle">✧</span></div></article>;
    case 'image': return <ImageBlock key={p.imageUrl} block={block} />;
    case 'input': return <label className="page-input-label">{p.label}<input className="page-input" type={p.variant === 'email' ? 'email' : 'text'} placeholder={p.text} value={inputValue} onChange={event => setInputValue(event.target.value)} disabled={!interactive} style={{ borderRadius: p.radius }} /></label>;
    case 'accordion': return <section className="page-faq" id={`${domId}-about`} data-anchor="about">{p.title && <div className="page-section-title"><h2 style={{ fontSize: p.fontSize }}>{p.title}</h2></div>}<AnimatedAccordion items={parseItems(p.items)} value={index < 0 ? '' : `item-${index}`} onValueChange={value => setIndex(value ? Number(value.replace('item-', '')) : -1)} /></section>;
    case 'tabs': {
      const items = parseItems(p.items);
      return <Tabs.Root className="page-tabs" value={items[index]?.id ?? items[0]?.id} onValueChange={value => setIndex(items.findIndex(item => item.id === value))} key={p.items}><Tabs.List className="page-tabs-list" aria-label="内容标签">{items.map(item => <Tabs.Trigger className="page-tab-trigger" key={item.id} value={item.id} disabled={!interactive}>{item.title}</Tabs.Trigger>)}</Tabs.List>{items.map(item => <Tabs.Content className="page-tab-content" value={item.id} key={item.id}><span className="page-tab-icon"><Sparkles size={21} strokeWidth={1.5} /></span><h3>{item.title}</h3><p>{item.content}</p></Tabs.Content>)}</Tabs.Root>;
    }
    case 'switch': return <div className="page-switch-row"><div><label htmlFor={`${domId}-switch`}>{p.label}</label>{p.text && <p>{p.text}</p>}</div><Switch.Root className="page-switch" id={`${domId}-switch`} aria-label={p.label} checked={checked} onCheckedChange={setChecked} disabled={!interactive}><Switch.Thumb className="page-switch-thumb"><Check size={10} strokeWidth={2.5} /></Switch.Thumb></Switch.Root></div>;
    case 'alert': return <div role="note" className="page-alert" style={{ borderRadius: p.radius }}><CircleHelp size={19} strokeWidth={1.7} /><div><strong>{p.title}</strong><p>{p.text}</p></div></div>;
    case 'separator': return <hr className="page-separator" />;
    case 'footer': return <footer className="page-footer" id={`${domId}-contact`} data-anchor="contact"><a className="page-footer-brand" href="#" onClick={event => navigate(event, "#")}>{p.title}<span>.</span></a><p>{p.text}</p></footer>;
    default: return <LibraryBlock key={JSON.stringify([block.id, p.items])} block={block} interactive={interactive} />;
  }
}

export function BlockRenderer({ block: savedBlock, settings, interactive = true, bounded = false, preview = false }: BlockRendererProps) {
  const reducedMotion = useReducedMotion();
  const context = useContext(NativeRuntimeContext);
  const runtime = context?.runtime;
  const block = { ...savedBlock, props: { ...savedBlock.props } };
  if (runtime) {
    for (const key of ['title', 'text', 'label'] as const) if (block.bindings?.[key]) block.props[key] = String(runtime.read(block.bindings[key], block.props[key] ?? ''));
    if (block.bindings?.value && !['input','textarea','select','combobox','inputOtp'].includes(block.type)) {
      const value = Number(runtime.read(block.bindings.value, block.props.value ?? 0));
      if (Number.isFinite(value)) block.props.value = value;
    }
    if (block.bindings?.checked) block.props.checked = Boolean(runtime.read(block.bindings.checked, block.props.checked ?? false));
    if (!runtime.read(block.bindings?.visible, true)) return null;
  }
  const enabled = interactive && !runtime?.read(block.bindings?.disabled, false);
  const p = block.props;
  const effect = p.animation || 'none';
  const initial = !reducedMotion && (effect === 'slide' || effect === 'scale') ? { opacity: 0, y: effect === 'slide' ? 18 : 0, scale: effect === 'scale' ? .96 : 1 } : false;
  const style = { textAlign: p.align, fontSize: p.fontSize, '--block-padding': `${p.padding ?? 20}px`, '--block-font-size': p.fontSize ? `${p.fontSize}px` : undefined, '--block-color': p.color, '--block-items': p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center', ...blockThemeStyle(block, settings) } as CSSProperties;
  const className = `page-block page-block--${block.type}${bounded ? ' page-block--bounded' : ''}`;
  const baseContent = <BlockRuntimeProvider block={block} runtime={runtime}><div className="page-block-content" inert={!enabled} data-interactive={enabled} aria-disabled={!enabled || undefined} onClick={event => {
    if (enabled && event.currentTarget.contains(event.target as Node)) void runtime?.dispatch(block.id, 'click', runtime.read(block.bindings?.value, p.value));
  }}><AnimateUIProvider {...motionProps<typeof AnimateUIProvider>(block, 'AnimateUIProvider')}><BlockContent block={block} interactive={enabled} snapshot={preview} /></AnimateUIProvider></div></BlockRuntimeProvider>;
  const content = preview || !p.effect || p.effect === 'none' ? baseContent : <div className="official-effect-boundary" inert={!enabled}><OfficialEffect key={`${p.effect}:${JSON.stringify(p.effectOptions ?? {})}`} block={block}>{baseContent}</OfficialEffect></div>;
  if (preview) return <div className={className} data-theme={p.theme??settings.theme} style={style}>{content}</div>;
  if (effect === 'fade') return <FadeIn className={className} data-theme={p.theme??settings.theme} style={style} initialOpacity={reducedMotion ? 1 : 0} transition={{ duration: reducedMotion ? 0 : .42 }}>{content}</FadeIn>;
  return <motion.div className={className} data-theme={p.theme??settings.theme} style={style} initial={initial} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reducedMotion ? 0 : .42, ease: [.22, 1, .36, 1] }}>{content}</motion.div>;
}

/** Fit a fixed design width inside an observed container without scaling it up. */
export function useFitScale(ref: RefObject<HTMLElement | null>, designWidth: number) {
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setAvailableWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return availableWidth === null ? 1 : Math.min(1, Math.max(0, availableWidth) / Math.max(1, designWidth));
}

export function FreePage({ document, interactive = true, replayKey = 0 }: PageRendererProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scheme, setScheme] = useState<'light' | 'dark' | null>(null);
  const theme = scheme === 'dark' ? 'animate-dark' : 'animate-light';
  const settings = scheme ? { ...document.settings, theme, background: getTheme(theme).canvas } as PageDocument['settings'] : document.settings;
  const resolvedScheme = scheme ?? (getTheme(settings.theme, settings.customThemes).scheme === 'dark' ? 'dark' : 'light');
  const designWidth = Math.max(1, document.settings.maxWidth);
  let nextY = 32;
  const positionedBlocks = document.blocks.map(block => {
    const frame = block.frame ?? defaultFrame(block.type, designWidth, 32, nextY);
    nextY = Math.max(nextY, frame.y + frame.height + 24);
    return { block, frame };
  });
  const designHeight = Math.max(1, document.settings.canvasHeight ?? Math.max(1200, nextY));
  const scale = useFitScale(viewportRef, designWidth);
  const style = pageThemeStyle(settings) as CSSProperties;
  return <PagePreviewTheme.Provider value={{ scheme: resolvedScheme, setScheme }}><div className="page-surface page-surface--free" style={style}>
    <div className="page-free-viewport" ref={viewportRef}>
      <div className="page-free-scaled-shell" style={{ width: designWidth * scale, height: designHeight * scale }}>
        <div className="page-free-canvas" style={{ width: designWidth, height: designHeight, transform: `scale(${scale})` }} key={replayKey}>
          {positionedBlocks.map(({ block, frame }, index) => {
            return <div className="page-free-frame" key={block.id} data-block-id={block.id} style={{ left: frame.x, top: frame.y, width: Math.max(1, frame.width), height: Math.max(1, frame.height), zIndex: index + 1 }}>
              <BlockRenderer block={block} settings={settings} interactive={interactive} bounded />
            </div>;
          })}
        </div>
      </div>
    </div>
  </div></PagePreviewTheme.Provider>;
}

export function PageRenderer({ document, interactive = true, replayKey = 0 }: PageRendererProps) {
  if (interactive && (document.variables?.length || document.scripts?.length || document.blocks.some(block => block.props.effect && block.props.effect !== 'none' || Object.keys(block.bindings ?? {}).length || Object.values(block.events ?? {}).some(actions => actions.length)))) return <InteractivePreview key={replayKey} document={document} />;
  return <FreePage document={document} interactive={interactive} replayKey={replayKey} />;
}
