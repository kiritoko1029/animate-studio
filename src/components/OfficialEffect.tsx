import { officialClass } from '../lib/official-motion';
import { useContext, useDeferredValue, useMemo, useRef, useState, type ComponentProps, type ElementType, type ReactNode } from 'react';
import { AutoHeight } from '@animate-ui/react/primitives/effects/auto-height';
import { Blur } from '@animate-ui/react/primitives/effects/blur';
import { Click } from '@animate-ui/react/primitives/effects/click';
import { Effect } from '@animate-ui/react/primitives/effects/effect';
import { Fade } from '@animate-ui/react/primitives/effects/fade';
import { Highlight, HighlightItem } from '@animate-ui/react/primitives/effects/highlight';
import { Magnetic } from '@animate-ui/react/primitives/effects/magnetic';
import { Particles, ParticlesEffect } from '@animate-ui/react/primitives/effects/particles';
import { ScrollFade } from '@animate-ui/react/primitives/effects/scroll-fade';
import { Shine } from '@animate-ui/react/primitives/effects/shine';
import { Slide } from '@animate-ui/react/primitives/effects/slide';
import { ThemeToggler } from '@animate-ui/react/primitives/effects/theme-toggler';
import { Tilt, TiltContent } from '@animate-ui/react/primitives/effects/tilt';
import { Zoom } from '@animate-ui/react/primitives/effects/zoom';
import { Spring, SpringElement, SpringProvider } from '@animate-ui/react/primitives/spring';
import { Cursor, CursorContainer, CursorFollow, CursorProvider } from '@animate-ui/react/primitives/cursor';
import { PageTransition, PageTransitionShared } from './animate-ui/registry/page-transition';
import { PagePreviewTheme, useSystemScheme, type PageThemeSelection } from './PagePreviewTheme';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import type { Block } from '../model';

function ContentTransition({block,children}:{block:Block;children:ReactNode}) {
  const settings=officialAnimationProps('effect:page-transition','PageTransition',block.props.effectOptions);
  const key=String(settings.pageKey ?? JSON.stringify([block.props.title,block.props.text,block.props.value]));
  const current=useMemo(()=>({key,children}),[key,children]);
  // React View Transitions run in a deferred render, not a synchronous control update.
  const deferred=useDeferredValue(current);
  const {shared,...options}=settings;
  const shareProps=officialAnimationProps('effect:page-transition','PageTransitionShared',block.props.effectOptions);
  return <PageTransition {...options} effect={options.effect as ComponentProps<typeof PageTransition>['effect']} pageKey={deferred.key}>{shared ? <PageTransitionShared {...shareProps} name={String(shareProps.name || `block-${block.id}`)}>{deferred.children}</PageTransitionShared> : deferred.children}</PageTransition>;
}

/** Use official effects around the content; never stack the portable CSS approximation. */
export function OfficialEffect({ block, children }: { block: Block; children: ReactNode }) {
  const type = block.props.effect;
  const scope = useRef<HTMLDivElement>(null);
  const [burst, setBurst] = useState(0);
  const theme = useContext(PagePreviewTheme);
  const [localScheme, setLocalScheme] = useState<PageThemeSelection>('light');
  const systemScheme=useSystemScheme();
  const selection=theme?.selection ?? localScheme;
  const scheme = theme?.scheme ?? (selection === 'system' ? systemScheme : selection);
  const raw = (group:string) => officialAnimationProps(`effect:${type}`,group,block.props.effectOptions);
  function props<C extends ElementType>(group:string) { return raw(group) as Omit<Partial<ComponentProps<C>>,'asChild'|'children'>; }
  const content = <div className="official-effect-content">{children}</div>;
  switch (type) {
    case 'auto-height': return <AutoHeight {...props<typeof AutoHeight>('AutoHeight')} deps={[block.props]}>{content}</AutoHeight>;
    case 'blur': return <Blur {...props<typeof Blur>('Blur')}>{content}</Blur>;
    case 'click': { const settings=props<typeof Click>('Click'); delete (settings as Record<string,unknown>).global; return <div ref={scope}>{content}<Click {...settings} scope={raw('Click').global ? undefined : scope}/></div>; }
    case 'effect': return <Effect {...props<typeof Effect>('Effect')}>{content}</Effect>;
    case 'fade': return <Fade {...props<typeof Fade>('Fade')}>{content}</Fade>;
    case 'highlight': {const {controlledItems,...settings}=props<typeof Highlight<'div'>>('Highlight');return controlledItems===false ? <Highlight {...settings} controlledItems={false} className={officialClass('official-highlight',settings.className)}>{content}</Highlight> : <Highlight {...props<typeof Highlight>('Highlight')} controlledItems defaultValue="component" className={officialClass("official-highlight", (props<typeof Highlight>('Highlight')).className)}><HighlightItem {...props<typeof HighlightItem>('HighlightItem')} value="component">{content}</HighlightItem></Highlight>;}
    case 'magnetic': return <Magnetic {...props<typeof Magnetic>('Magnetic')}>{content}</Magnetic>;
    case 'particles': return <div onClick={()=>setBurst(value=>value+1)}><Particles {...props<typeof Particles>('Particles')} animate={props<typeof Particles>('Particles').animate ?? burst>0}>{content}<ParticlesEffect key={burst} {...props<typeof ParticlesEffect>('ParticlesEffect')} className={officialClass("official-effect-particle", (props<typeof ParticlesEffect>('ParticlesEffect')).className)}/></Particles></div>;
    case 'scroll-fade': return <ScrollFade {...props<typeof ScrollFade>('ScrollFade')} className={officialClass("official-scroll-fade", (props<typeof ScrollFade>('ScrollFade')).className)}>{content}</ScrollFade>;
    case 'shine': return <Shine {...props<typeof Shine>('Shine')}>{content}</Shine>;
    case 'slide': return <Slide {...props<typeof Slide>('Slide')}>{content}</Slide>;
    case 'theme-toggler': return <ThemeToggler {...props<typeof ThemeToggler>('ThemeToggler')} theme={selection} resolvedTheme={scheme} setTheme={next=>{setLocalScheme(next);theme?.setScheme(next);}}>{({toggleTheme})=><div onClick={()=>toggleTheme(scheme==='light'?'dark':'light')}>{content}</div>}</ThemeToggler>;
    case 'tilt': return <Tilt {...props<typeof Tilt>('Tilt')}><TiltContent {...props<typeof TiltContent>('TiltContent')}>{content}</TiltContent></Tilt>;
    case 'zoom': return <Zoom {...props<typeof Zoom>('Zoom')}>{content}</Zoom>;
    case 'spring': return <SpringProvider {...props<typeof SpringProvider>('SpringProvider')}><Spring {...props<typeof Spring>('Spring')}/><SpringElement {...props<typeof SpringElement>('SpringElement')}>{content}</SpringElement></SpringProvider>;
    case 'page-transition': return <ContentTransition block={block}>{content}</ContentTransition>;
    case 'cursor': return <CursorProvider {...props<typeof CursorProvider>('CursorProvider')} global={Boolean(raw('CursorProvider').global)}><CursorContainer {...props<typeof CursorContainer>('CursorContainer')}>{content}{raw('CursorProvider').enableCursor && <Cursor {...props<typeof Cursor>('Cursor')}><svg width="24" height="24" viewBox="0 0 40 40" aria-hidden="true"><path fill="currentColor" d="M1.8 4.4 7 36.2c.3 1.8 2.6 2.3 3.6.8l3.9-5.7c1.7-2.5 4.5-4.1 7.5-4.3l6.9-.5c1.8-.1 2.5-2.4 1.1-3.5L5 2.5c-1.4-1.1-3.5 0-3.3 1.9Z"/></svg></Cursor>}{raw('CursorProvider').enableCursorFollow && <CursorFollow {...props<typeof CursorFollow>('CursorFollow')}><span className="official-cursor-label">{block.props.label || block.props.title || 'Designer'}</span></CursorFollow>}</CursorContainer></CursorProvider>;
    default: return children;
  }
}
