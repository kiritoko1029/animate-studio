import { officialClass, officialStyle } from '../lib/official-motion';
import { motion, useReducedMotion } from 'motion/react';
import { useOfficialOpen } from './useOfficialOpen';
import { usePageImage } from './PageAssets';
import { useContext, useState, type ReactNode, type ElementType, type ComponentProps } from 'react';
import { Check, Copy, Heart, Plus, Star, ArrowRight, Moon, Sun, Bold, Italic, Underline, Bookmark, ChevronsUpDown } from 'lucide-react';
import { Button } from '@animate-ui/react/primitives/buttons/button';
import { CopyButton, CopyButtonIcon } from '@animate-ui/react/primitives/buttons/copy';
import { IconButton, IconButtonParticles } from '@animate-ui/react/primitives/buttons/icon';
import { RippleButton, RippleButtonRipples } from '@animate-ui/react/primitives/buttons/ripple';
import { GradientText } from '@animate-ui/react/primitives/texts/gradient';
import { MorphingText } from '@animate-ui/react/primitives/texts/morphing';
import { RollingText } from '@animate-ui/react/primitives/texts/rolling';
import { RotatingText, RotatingTextContainer } from '@animate-ui/react/primitives/texts/rotating';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { SlidingText } from '@animate-ui/react/primitives/texts/sliding';
import { SplittingText } from '@animate-ui/react/primitives/texts/splitting';
import { SwappingText } from '@animate-ui/react/primitives/texts/swapping';
import { TypingText, TypingTextCursor } from '@animate-ui/react/primitives/texts/typing';
import { CountingNumber } from '@animate-ui/react/primitives/texts/counting-number';
import { SlidingNumber } from '@animate-ui/react/primitives/texts/sliding-number';
import { ScrollingNumber, ScrollingNumberContainer, ScrollingNumberItems, ScrollingNumberHighlight } from '@animate-ui/react/primitives/texts/scrolling-number';
import { Image, ImageZoom } from '@animate-ui/react/primitives/effects/image-zoom';
import { OTPInput, REGEXP_ONLY_DIGITS } from '@animate-ui/react/primitives/input-otp';
import * as Popover from '@animate-ui/react/primitives/radix-ui/popover';
import * as HoverCard from '@animate-ui/react/primitives/radix-ui/hover-card';
import * as DropdownMenu from '@animate-ui/react/primitives/radix-ui/dropdown-menu';
import * as ContextMenu from '@animate-ui/react/primitives/radix-ui/context-menu';
import * as Collapsible from '@animate-ui/react/primitives/radix-ui/collapsible';
import * as Toggle from '@animate-ui/react/primitives/radix-ui/toggle';
import * as ToggleGroup from '@animate-ui/react/primitives/radix-ui/toggle-group';
import { Menubar } from '@animate-ui/react/primitives/base-ui/menubar';
import { Menu } from '@animate-ui/react/primitives/base-ui/menu';
import { NavigationMenu } from '@animate-ui/react/primitives/base-ui/navigation-menu';
import * as Tooltip from '@animate-ui/react/primitives/radix-ui/tooltip';
import { motionProps, anchoredProps } from '../lib/official-motion';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import { FlipButton, FlipButtonBack, FlipButtonFront } from './animate-ui/registry/buttons/flip';
import { LiquidButton } from './animate-ui/registry/buttons/liquid';
import { ThemeTogglerButton, ThemeTogglerButtonIcon } from './animate-ui/registry/buttons/theme-toggler';
import { BubbleBackground } from './animate-ui/registry/backgrounds/bubble';
import { FireworksBackground } from './animate-ui/registry/backgrounds/fireworks';
import { GlyphBackground } from './animate-ui/registry/backgrounds/glyph';
import { GradientBackground } from './animate-ui/registry/backgrounds/gradient';
import { GravityStarsBackground } from './animate-ui/registry/backgrounds/gravity-stars';
import { HexagonBackground } from './animate-ui/registry/backgrounds/hexagon';
import { HoleBackground } from './animate-ui/registry/backgrounds/hole';
import { StarsBackground } from './animate-ui/registry/backgrounds/stars';
import { TopographyBackground } from './animate-ui/registry/backgrounds/topography';
import { safeUrl, type Block, type ExtendedComponentType } from '../model';
import { usePageLinks } from '../lib/navigation';
import '../native-catalog.css';
import { CatalogComposites } from './CatalogComposites';
import { PageBlockTheme, PagePreviewTheme, useSystemScheme, type PageThemeSelection } from './PagePreviewTheme';
import { scrollingNumberOptions } from '../lib/number-display';
import { localPointer } from '../lib/element-geometry';
import { useBlockValue } from './NativeInteractions';
import { CatalogDialog } from './CatalogDialog';
import { CatalogNavigation } from './CatalogNavigation';
import { CatalogMenus } from './CatalogMenus';
import { CatalogOverlays } from './CatalogOverlays';
import { CatalogPanels } from './CatalogPanels';
import { CatalogAvatars, CatalogStars, CatalogLinkPreview } from './CatalogDisplay';

const backgrounds = { bubbleBackground: BubbleBackground, fireworksBackground: FireworksBackground, glyphBackground: GlyphBackground, gradientBackground: GradientBackground, gravityStarsBackground: GravityStarsBackground, hexagonBackground: HexagonBackground, holeBackground: HoleBackground, starsBackground: StarsBackground, topographyBackground: TopographyBackground };
const buttonClass = 'as-page-catalog-button';
const popupClass = 'as-page-catalog-popup native-catalog-popup';

/** v2 primitives retain the document's property schema; portable exports have their own runtime. */
export default function NativeCatalogBlock({ block, snapshot = false }: { block: Block & { type: ExtendedComponentType }; snapshot?: boolean }) {
  const { type, props: p } = block;
  const { navigate, safeUrl } = usePageLinks();
  const opening=useOfficialOpen(block,type[0].toUpperCase()+type.slice(1));
  const reduce=useReducedMotion();
  const imageSource = usePageImage(p.imageUrl);
  const [inputValue, setInputValue] = useBlockValue<string>('');
  const [checked, setChecked] = useBlockValue(Boolean(type==='toggle' ? p.motion?.['Toggle.pressed'] ?? p.motion?.['Toggle.defaultPressed'] ?? p.checked ?? false : type==='collapsible' ? p.motion?.['Collapsible.open'] ?? p.motion?.['Collapsible.defaultOpen'] ?? p.checked ?? false : p.checked ?? false), 'checked');
  const [index, setIndex] = useBlockValue(p.value ?? 0);
  const [multiSelection, setMultiSelection] = useBlockValue<string[]>([]);
  const [localTheme,setLocalTheme]=useState<PageThemeSelection>('light');
  const previewTheme=useContext(PagePreviewTheme);
  const portalTheme=useContext(PageBlockTheme);
  const systemScheme=useSystemScheme();
  const selection=previewTheme?.selection ?? localTheme;
  const resolvedTheme=previewTheme?.scheme ?? (selection === 'system' ? systemScheme : selection);
  const changeTheme=(next:PageThemeSelection)=>{setLocalTheme(next);previewTheme?.setScheme(next);};
  const options = (p.items || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => line.split('|').map(cell => cell.trim()));
  const groups = new Map<string, string[][]>();
  for (const row of options) groups.set(row[0], [...groups.get(row[0]) || [], row]);
  const texts = options.length ? options.map(([text]) => text) : [p.title || ''];
  function m<C extends ElementType>(group: string) { return motionProps<C>(block, group); }
  function anchored<C extends ElementType>(group: string) { return anchoredProps<C>(block, group); }
  const raw = (group: string) => officialAnimationProps(type, group, p.motion);
  const textStyle = { fontSize: p.fontSize ?? 36, fontWeight:600 };
  const number = p.value ?? 0;
  const numberStyle = { fontSize: p.fontSize ?? 44, lineHeight: 1.3, fontWeight:600, fontVariantNumeric: 'tabular-nums' } as const;

  const imageOrigin = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = event.type === 'click' && event.detail === 0
      ? { x: event.currentTarget.clientWidth / 2, y: event.currentTarget.clientHeight / 2 }
      : localPointer(event.currentTarget, event.clientX, event.clientY);
    const child = event.currentTarget.firstElementChild as HTMLElement | null;
    if (child) child.style.transformOrigin = `${point.x}px ${point.y}px`;
  };
  const action = (event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => navigate(event, p.url);
  const label = p.label || '了解更多';
  const description = <>{p.title && <h3>{p.title}</h3>}{p.text && <p>{p.text}</p>}</>;
  const trigger = <Button type="button" className={buttonClass}>{label}</Button>;
  const shell = (children: ReactNode) => <div className={`as-page-catalog native-catalog native-catalog--${type}`} data-animate-ui="v2">{children}</div>;
  const Background = backgrounds[type as keyof typeof backgrounds];
  if (Background) {
    const settings:Record<string,unknown> = raw(type[0].toUpperCase() + type.slice(1));
    const dark=portalTheme?.colorScheme==='dark';
    if(type==='starsBackground'){
      settings.layerOptions=[raw('StarLayer1'),raw('StarLayer2'),raw('StarLayer3')];
      settings.starColor=settings.starColor || (dark?'#fff':'#000');
      settings.style=officialStyle({background:p.background || (dark?'radial-gradient(ellipse at bottom,#262626 0%,#000 100%)':'radial-gradient(ellipse at bottom,#f5f5f5 0%,#fff 100%)')},settings.style);
    }
    if(type==='fireworksBackground')settings.color=settings.color ?? (dark?'white':'black');
    if(type==='glyphBackground')settings.style=officialStyle({background:p.background || (dark?'#121212':'#fff'),color:p.color || (dark?'#fff':'#171717')},settings.style);
    if(type==='topographyBackground')settings.style=officialStyle({background:p.background || (dark?'radial-gradient(ellipse at center,#171717 0%,#000 100%)':'radial-gradient(ellipse at center,#fafafa 0%,#f0f0f0 100%)'),color:p.color || (dark?'#a3a3a3':'#737373')},settings.style);
    for (const key of ['glowColor','shapeColor','lineColor'] as const) if (key in settings && (settings as Record<string, unknown>)[key] === '') delete (settings as Record<string, unknown>)[key];
    return shell(<div className={`native-catalog-background-frame native-catalog-background-frame--${type}`}><Background key={JSON.stringify(portalTheme)} {...settings} className={officialClass("native-catalog-background", (settings).className)} /><div className="native-catalog-background-copy">{description}</div></div>);
  }

  switch (type) {
    case 'gradientText': return shell(<GradientText {...m<typeof GradientText>('GradientText')} text={p.title || ''} style={officialStyle(textStyle, (m<typeof GradientText>('GradientText')).style)} />);
    case 'morphingText': return shell(<MorphingText text={texts} {...m<typeof MorphingText>('MorphingText')} style={officialStyle(textStyle, (m<typeof MorphingText>('MorphingText')).style)} />);
    case 'rollingText': return shell(<RollingText {...m<typeof RollingText>('RollingText')} text={p.title || ''} style={officialStyle(textStyle, (m<typeof RollingText>('RollingText')).style)} />);
    case 'rotatingText': {
      const props = m<typeof RotatingTextContainer>('RotatingTextContainer');
      if (raw('RotatingTextContainer').align === 'none') delete props.align;
      return shell(<RotatingTextContainer text={texts} {...props} style={officialStyle(textStyle, (props).style)}><RotatingText {...m<typeof RotatingText>('RotatingText')}/></RotatingTextContainer>);
    }
    case 'shimmeringText': return shell(<ShimmeringText color={p.color || 'var(--page-ink)'} shimmeringColor="var(--page-muted)" text={p.title || ''} {...m<typeof ShimmeringText>('ShimmeringText')} style={officialStyle(textStyle, (m<typeof ShimmeringText>('ShimmeringText')).style)} />);
    case 'slidingText': return shell(<SlidingText {...m<typeof SlidingText>('SlidingText')} text={p.title || ''} style={officialStyle(textStyle, (m<typeof SlidingText>('SlidingText')).style)} />);
    case 'splittingText': {
      const props = m<typeof SplittingText>('SplittingText');
      const { animation } = raw('SplittingText');
      delete (props as Record<string, unknown>).animation;
      const presets: Record<string, Partial<ComponentProps<typeof SplittingText>>> = {
        default: {},
        vibe: { initial: { y:50,scale:0.5,opacity:0,x:50,rotate:90 }, animate: { y:0,scale:1,opacity:1,x:0,rotate:0 }, transition: { duration:0.5,ease:'easeOut' } },
        writing: { initial: { y:10,opacity:0 }, animate: { y:0,opacity:1 }, transition: { type:'spring',bounce:0,duration:2 } },
      };
      const {type: splitType, ...shared} = {...presets[String(animation)],...props};
      return shell(splitType === 'lines' ? <SplittingText {...shared} type="lines" text={(p.title || '').split('\n')} style={officialStyle(textStyle, shared.style)}/> : <SplittingText {...shared} type={splitType} text={p.title || ''} style={officialStyle(textStyle, shared.style)}/>);
    }
    case 'swappingText': return shell(<SwappingText text={texts} {...m<typeof SwappingText>('SwappingText')} style={officialStyle(textStyle, (m<typeof SwappingText>('SwappingText')).style)} />);
    case 'typingText': {
      const { cursor, ...props } = raw('TypingText');
      return shell(<TypingText text={p.title || ''} {...props} style={officialStyle(textStyle, (props).style)}>{cursor && <TypingTextCursor {...m<typeof TypingTextCursor>('TypingTextCursor')}/>}</TypingText>);
    }
    case 'countingNumber': return shell(<><p>{p.label}</p><CountingNumber number={number} {...m<typeof CountingNumber>('CountingNumber')} {...(snapshot ? {fromNumber:number,initiallyStable:true} : {})} style={officialStyle(numberStyle, (m<typeof CountingNumber>('CountingNumber')).style)} /></>);
    case 'slidingNumber': return shell(<><p>{p.label}</p><SlidingNumber number={number} {...m<typeof SlidingNumber>('SlidingNumber')} fromNumber={snapshot ? number : typeof raw('SlidingNumber').fromNumber === 'number' ? Number(raw('SlidingNumber').fromNumber) : raw('SlidingNumber').fromNumber ? 0 : undefined} initiallyStable={snapshot || m<typeof SlidingNumber>('SlidingNumber').initiallyStable} style={officialStyle(numberStyle, (m<typeof SlidingNumber>('SlidingNumber')).style)} /></>);
    case 'scrollingNumber': {
      const props = m<typeof ScrollingNumberContainer>('ScrollingNumberContainer');
      const bounded = scrollingNumberOptions(number, p.fontSize, props.step);
      const vertical = !props.direction || ['btt','ttb'].includes(props.direction);
      const itemsSize = vertical ? Math.max(40,Math.ceil((p.fontSize ?? 18)*1.3)) : Math.max(75,Math.ceil(String(number).length*(p.fontSize ?? 18)*.65));
      return shell(<><p>{p.label}</p>{snapshot ? <span style={numberStyle}>{number.toLocaleString()}</span> : <ScrollingNumberContainer number={Math.abs(number)} {...props} data-negative={number < 0 || undefined} step={bounded.step} itemsSize={props.itemsSize ?? itemsSize} className={officialClass("native-scrolling-number", (props).className)} style={officialStyle({fontSize:p.fontSize ?? 18,fontWeight:500, ...(vertical ? {width:72} : {height:40})}, (props).style)}><ScrollingNumber {...m<typeof ScrollingNumber>('ScrollingNumber')}><ScrollingNumberItems {...m<typeof ScrollingNumberItems>('ScrollingNumberItems')} className={officialClass("native-scrolling-item", (m<typeof ScrollingNumberItems>('ScrollingNumberItems')).className)}/></ScrollingNumber><ScrollingNumberHighlight {...m<typeof ScrollingNumberHighlight>('ScrollingNumberHighlight')} className={officialClass("native-scrolling-highlight", (m<typeof ScrollingNumberHighlight>('ScrollingNumberHighlight')).className)}/></ScrollingNumberContainer>}{bounded.adjusted && <small>数值范围较大，预览步长已调整为 {bounded.step}。</small>}</>);
    }
    case 'copyButton': {const {variant,size,...settings}=raw('CopyButton');return shell(<CopyButton {...settings} content={p.text || ''} data-variant={String(variant)} data-size={String(size)} className={officialClass('native-square-button',settings.className)} aria-label={String(settings['aria-label'] ?? label)}><CopyButtonIcon {...m<typeof CopyButtonIcon>('CopyButtonIcon')} icon={m<typeof CopyButtonIcon>('CopyButtonIcon').icon ?? <Copy size={16}/>} copiedIcon={m<typeof CopyButtonIcon>('CopyButtonIcon').copiedIcon ?? <Check size={16}/>} /></CopyButton>);}
    case 'iconButton': {
      const Icon = { star: Star, heart: Heart, plus: Plus, arrow: ArrowRight }[p.variant || 'heart'] || Heart;
      const {variant,size,...settings}=raw('IconButton');
      return shell(<IconButton {...settings} data-variant={String(variant)} data-size={String(size)} className={officialClass('native-square-button',settings.className)} aria-label={String(settings['aria-label'] ?? label)} aria-pressed={checked} onClick={event=>{setChecked(!checked);action(event);}}><motion.span initial={false} animate={{scale:reduce?1:checked?[1,1.3,1]:[1,.85,1]}} transition={{duration:.4,times:[0,.4,1]}}><Icon size={16} fill={checked?'currentColor':'none'} style={{color:checked?'#ef4444':undefined}}/></motion.span>{checked&&<IconButtonParticles {...m<typeof IconButtonParticles>('IconButtonParticles')} style={officialStyle({color:'#ef4444'},m<typeof IconButtonParticles>('IconButtonParticles').style)}/>}</IconButton>);
    }
    case 'rippleButton': return shell(<RippleButton {...m<typeof RippleButton>('RippleButton')} className={officialClass(buttonClass, (m<typeof RippleButton>('RippleButton')).className)} onClick={action}>{label}<RippleButtonRipples color="var(--page-on-accent, #fff)" {...m<typeof RippleButtonRipples>('RippleButtonRipples')} /></RippleButton>);
    case 'liquidButton': return shell(<LiquidButton {...m<typeof LiquidButton>('LiquidButton')} delay={String(raw('LiquidButton').delay)} fillHeight={String(raw('LiquidButton').fillHeight)} className={officialClass("native-liquid-button", (m<typeof LiquidButton>('LiquidButton')).className)} onClick={action}>{label}</LiquidButton>);
    case 'flipButton': return shell(<FlipButton {...m<typeof FlipButton>('FlipButton')} aria-label={m<typeof FlipButton>('FlipButton')['aria-label'] ?? label} onClick={action}><FlipButtonFront {...motionProps<typeof FlipButtonFront>(block,'FlipButtonFront')}>{label}</FlipButtonFront><FlipButtonBack {...motionProps<typeof FlipButtonBack>(block,'FlipButtonBack')}>{p.text || label}</FlipButtonBack></FlipButton>);
    case 'themeTogglerButton': return shell(<ThemeTogglerButton {...m<typeof ThemeTogglerButton>('ThemeTogglerButton')} theme={selection} resolvedTheme={resolvedTheme} setTheme={changeTheme} className={officialClass("native-theme-toggle", (m<typeof ThemeTogglerButton>('ThemeTogglerButton')).className)} aria-label={m<typeof ThemeTogglerButton>('ThemeTogglerButton')['aria-label'] ?? label}><ThemeTogglerButtonIcon {...m<typeof ThemeTogglerButtonIcon>('ThemeTogglerButtonIcon')} light={m<typeof ThemeTogglerButtonIcon>('ThemeTogglerButtonIcon').light ?? <Sun size={16}/>} dark={m<typeof ThemeTogglerButtonIcon>('ThemeTogglerButtonIcon').dark ?? <Moon size={16}/>} /></ThemeTogglerButton>);
    case 'githubStars':
    case 'githubStarsButton': return shell(<CatalogStars block={block}/>);
    case 'avatarGroup': return shell(<CatalogAvatars block={block}/>);
    case 'inputOtp': return shell(<label className="as-page-input-label">{label}<OTPInput {...m<typeof OTPInput>('InputOTP')} value={inputValue} onChange={setInputValue} maxLength={Math.min(12, Math.max(1, Number(raw('InputOTP').maxLength ?? p.max ?? 6)))} pattern={String(raw('InputOTP').pattern ?? REGEXP_ONLY_DIGITS)} aria-label={m<typeof OTPInput>('InputOTP')['aria-label'] ?? label} render={({ slots }) => <div className="native-catalog-otp">{Array.from({length:Math.ceil(slots.length/3)},(_,group) => <span className="native-otp-segment" key={group}>{group > 0 && <span data-slot="input-otp-separator" aria-hidden="true">−</span>}<span data-slot="input-otp-group">{slots.slice(group*3,group*3+3).map((slot, i) => <span data-slot="input-otp-slot" key={i} data-active={slot.isActive}>{slot.char}{slot.hasFakeCaret && <span className="native-otp-caret" aria-hidden="true"/>}</span>)}</span></span>)}</div>} /><small>{p.text}</small></label>);
    case 'imageZoom': return shell(<ImageZoom {...m<typeof ImageZoom>('ImageZoom')} className={officialClass("native-image-zoom", m<typeof ImageZoom>('ImageZoom').className)} role="button" tabIndex={m<typeof ImageZoom>('ImageZoom').tabIndex ?? 0} aria-label={m<typeof ImageZoom>('ImageZoom')['aria-label'] ?? `缩放图片：${p.title || '图片'}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} onMouseMove={imageOrigin} onClick={imageOrigin}><Image {...m<typeof Image>('Image')} src={imageSource === '#' ? undefined : imageSource} alt={m<typeof Image>('Image').alt ?? p.title ?? '图片'} style={officialStyle({ width: m<typeof Image<'img'>>('Image').width ?? '100%', height:m<typeof Image<'img'>>('Image').height ?? '100%', objectFit:m<typeof Image<'img'>>('Image').objectFit ?? 'cover', userSelect:'none', pointerEvents:'none',borderRadius:p.radius }, m<typeof Image>('Image').style)} /></ImageZoom>);
    case 'dialog':
    case 'alertDialog': return shell(<CatalogDialog block={block} />);
    case 'sheet':
    case 'drawer': return shell(<CatalogPanels block={block}/>);
    case 'popover':
    case 'hoverCard':
    case 'tooltip': return shell(<CatalogOverlays block={block}/>);
    case 'previewLinkCard': return shell(<CatalogLinkPreview key={p.url + ':' + p.imageUrl} block={block}/>);
    case 'dropdownMenu':
    case 'contextMenu': return shell(<CatalogMenus key={JSON.stringify(p.motion?.['MenuStructure.items'])} block={block}/>);
    case 'collapsible': {const fields=raw('CollapsibleFields');return shell(<Collapsible.Root {...m<typeof Collapsible.Root>('Collapsible')} className={officialClass('native-collapsible-root',m<typeof Collapsible.Root>('Collapsible').className)} open={checked} onOpenChange={setChecked}><header><h4>{p.title || '订单详情'}</h4><Collapsible.Trigger {...m<typeof Collapsible.Trigger>('CollapsibleTrigger')} className={officialClass('native-collapsible-trigger',m<typeof Collapsible.Trigger>('CollapsibleTrigger').className)} aria-label={m<typeof Collapsible.Trigger>('CollapsibleTrigger')['aria-label'] ?? label}><ChevronsUpDown size={16}/></Collapsible.Trigger></header><div className="native-collapsible-status"><span>{String(fields.statusLabel)}</span><strong>{String(fields.statusValue)}</strong></div><Collapsible.Content {...m<typeof Collapsible.Content>('CollapsibleContent')} className={officialClass('native-collapsible-details',m<typeof Collapsible.Content>('CollapsibleContent').className)}>{options.length?options.map(([title,text],i)=><div key={i}><strong>{title}</strong><p>{text}</p></div>):<div><p>{p.text}</p></div>}</Collapsible.Content></Collapsible.Root>);}
    case 'toggle': {const {variant,size,...settings}=raw('Toggle');return shell(<Toggle.Root {...settings} data-variant={String(variant)} data-size={String(size)} className={officialClass('native-toggle',settings.className)} pressed={checked} onPressedChange={setChecked}><motion.span initial={false} animate={{scale:reduce?1:checked?[1,1.2,1]:[1,.9,1]}} transition={{duration:.35,times:[0,.4,1]}}><Bookmark size={16} fill={checked?'currentColor':'none'}/></motion.span>{label}</Toggle.Root>);}
    case 'toggleGroup': {
      const settings=m<typeof ToggleGroup.Root>('ToggleGroup');
      const direction=raw('ToggleGroup').orientation === 'vertical' ? 'vertical' : 'horizontal';
      const {type:mode,...rootProps}=settings;
      delete (rootProps as Record<string,unknown>).spacing;
      delete (rootProps as Record<string,unknown>).variant;delete (rootProps as Record<string,unknown>).size;
      const items=options.map(([name,iconName],i)=>{const Icon=({bold:Bold,italic:Italic,underline:Underline})[iconName as 'bold'|'italic'|'underline'];return <ToggleGroup.Item {...m<typeof ToggleGroup.Item>('ToggleGroupItem')} key={i} value={String(i)} data-size={String(raw('ToggleGroup').size)} data-variant={String(raw('ToggleGroup').variant)} className={officialClass('native-toggle',m<typeof ToggleGroup.Item>('ToggleGroupItem').className)} aria-label={m<typeof ToggleGroup.Item>('ToggleGroupItem')['aria-label'] ?? name}>{Icon?<Icon size={16}/>:name}</ToggleGroup.Item>;});
      const style={gap:Number(raw('ToggleGroup').spacing)*4,flexDirection:direction === 'vertical' ? 'column' as const : 'row' as const};
      return shell(mode === 'multiple' ? <ToggleGroup.Root {...rootProps} type="multiple" value={multiSelection} onValueChange={setMultiSelection} aria-label={settings['aria-label'] ?? label} data-orientation={direction} className={officialClass("as-page-catalog-toggle-group", (rootProps).className)} style={officialStyle(style, (rootProps).style)}>{items}</ToggleGroup.Root> : <ToggleGroup.Root {...rootProps} type="single" value={index < 0 ? '' : String(index)} onValueChange={v=>setIndex(v===''?-1:Number(v))} aria-label={settings['aria-label'] ?? label} data-orientation={direction} className={officialClass("as-page-catalog-toggle-group", (rootProps).className)} style={officialStyle(style, (rootProps).style)}>{items}</ToggleGroup.Root>);
    }
    case 'menubar': return shell(<CatalogMenus key={JSON.stringify(p.motion?.['MenuStructure.items'])} block={block}/>);
    case 'navigationMenu': return shell(<CatalogNavigation block={block}/>);
    // Business composites keep their saved semantics and use v2 controls in the shared tree.
    default: return <CatalogComposites block={block} />;
  }
}
