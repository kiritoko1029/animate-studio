import { usePageImage } from './PageAssets';
import { useContext, useState, type ReactNode, type ElementType, type ComponentProps } from 'react';
import { Check, Copy, Heart, Plus, Star, ArrowRight, Moon, Sun } from 'lucide-react';
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
import { AvatarGroup } from '@animate-ui/react/primitives/avatar-group';
import { Image, ImageZoom } from '@animate-ui/react/primitives/effects/image-zoom';
import { OTPInput, REGEXP_ONLY_DIGITS } from '@animate-ui/react/primitives/input-otp';
import * as Dialog from '@animate-ui/react/primitives/radix-ui/dialog';
import * as AlertDialog from '@animate-ui/react/primitives/radix-ui/alert-dialog';
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
import { Drawer } from '@animate-ui/react/primitives/base-ui/drawer';
import { motionProps, anchoredProps } from '../lib/official-motion';
import { officialAnimationProps } from '../../shared/animation-settings.mjs';
import { FlipButton, FlipButtonBack, FlipButtonFront } from './animate-ui/registry/buttons/flip';
import { LiquidButton } from './animate-ui/registry/buttons/liquid';
import { ThemeTogglerButton, ThemeTogglerButtonIcon } from './animate-ui/registry/buttons/theme-toggler';
import { GitHubStarsButton, GitHubStarsButtonNumber } from './animate-ui/registry/buttons/github-stars';
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
import { navigate } from '../lib/navigation';
import '../native-catalog.css';
import { CatalogComposites } from './CatalogComposites';
import { PagePreviewTheme } from './PagePreviewTheme';
import { localPointer } from '../lib/element-geometry';
import { useBlockValue } from './NativeInteractions';

const backgrounds = { bubbleBackground: BubbleBackground, fireworksBackground: FireworksBackground, glyphBackground: GlyphBackground, gradientBackground: GradientBackground, gravityStarsBackground: GravityStarsBackground, hexagonBackground: HexagonBackground, holeBackground: HoleBackground, starsBackground: StarsBackground, topographyBackground: TopographyBackground };
const buttonClass = 'as-page-catalog-button';
const popupClass = 'as-page-catalog-popup native-catalog-popup';

/** v2 primitives retain the document's property schema; portable exports have their own runtime. */
export default function NativeCatalogBlock({ block, snapshot = false }: { block: Block & { type: ExtendedComponentType }; snapshot?: boolean }) {
  const { type, props: p } = block;
  const imageSource = usePageImage(p.imageUrl);
  const [inputValue, setInputValue] = useBlockValue<string>('');
  const [checked, setChecked] = useBlockValue(p.checked ?? false, 'checked');
  const [index, setIndex] = useBlockValue(p.value ?? 0);
  const [localDark, setLocalDark] = useState(false);
  const previewTheme = useContext(PagePreviewTheme);
  const dark = previewTheme ? previewTheme.scheme === 'dark' : localDark;
  const setDark = (dark: boolean) => { setLocalDark(dark); previewTheme?.setScheme(dark ? 'dark' : 'light'); };
  const options = (p.items || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => line.split('|').map(cell => cell.trim()));
  const groups = new Map<string, string[][]>();
  for (const row of options) groups.set(row[0], [...groups.get(row[0]) || [], row]);
  const texts = options.length ? options.map(([text]) => text) : [p.title || ''];
  function m<C extends ElementType>(group: string) { return motionProps<C>(block, group); }
  function anchored<C extends ElementType>(group: string) { return anchoredProps<C>(block, group); }
  const raw = (group: string) => officialAnimationProps(type, group, p.motion);
  const textStyle = { fontSize: p.fontSize };
  const number = p.value ?? 0;
  const numberStyle = { fontSize: p.fontSize ?? 44, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' } as const;

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
    const settings = raw(type[0].toUpperCase() + type.slice(1));
    for (const key of ['glowColor','shapeColor','lineColor'] as const) if (key in settings && (settings as Record<string, unknown>)[key] === '') delete (settings as Record<string, unknown>)[key];
    return shell(<div className={`native-catalog-background-frame native-catalog-background-frame--${type}`}><Background {...settings} className="native-catalog-background" /><div className="native-catalog-background-copy">{description}</div></div>);
  }

  switch (type) {
    case 'gradientText': return shell(<GradientText {...m<typeof GradientText>('GradientText')} text={p.title || ''} style={textStyle} />);
    case 'morphingText': return shell(<MorphingText text={texts} {...m<typeof MorphingText>('MorphingText')} style={textStyle} />);
    case 'rollingText': return shell(<RollingText {...m<typeof RollingText>('RollingText')} text={p.title || ''} style={textStyle} />);
    case 'rotatingText': {
      const props = m<typeof RotatingTextContainer>('RotatingTextContainer');
      if (raw('RotatingTextContainer').align === 'none') delete props.align;
      return shell(<RotatingTextContainer text={texts} {...props} style={textStyle}><RotatingText /></RotatingTextContainer>);
    }
    case 'shimmeringText': return shell(<ShimmeringText text={p.title || ''} {...m<typeof ShimmeringText>('ShimmeringText')} style={textStyle} />);
    case 'slidingText': return shell(<SlidingText {...m<typeof SlidingText>('SlidingText')} text={p.title || ''} style={textStyle} />);
    case 'splittingText': {
      const props = m<typeof SplittingText>('SplittingText');
      const { animation } = raw('SplittingText');
      delete (props as Record<string, unknown>).animation;
      const presets: Record<string, Partial<ComponentProps<typeof SplittingText>>> = {
        default: {},
        vibe: { initial: { y:50,scale:0.5,opacity:0,x:50,rotate:90 }, animate: { y:0,scale:1,opacity:1,x:0,rotate:0 }, transition: { duration:0.5,ease:'easeOut' } },
        writing: { initial: { y:10,opacity:0 }, animate: { y:0,opacity:1 }, transition: { type:'spring',bounce:0,duration:2 } },
      };
      const {type: splitType, ...shared} = {...props,...presets[String(animation)]};
      return shell(splitType === 'lines' ? <SplittingText {...shared} type="lines" text={(p.title || '').split('\n')} style={textStyle}/> : <SplittingText {...shared} type={splitType} text={p.title || ''} style={textStyle}/>);
    }
    case 'swappingText': return shell(<SwappingText text={texts} {...m<typeof SwappingText>('SwappingText')} style={textStyle} />);
    case 'typingText': {
      const { cursor, ...props } = raw('TypingText');
      return shell(<TypingText text={p.title || ''} {...props} style={textStyle}>{cursor && <TypingTextCursor/>}</TypingText>);
    }
    case 'countingNumber': return shell(<><p>{p.label}</p><CountingNumber number={number} {...m<typeof CountingNumber>('CountingNumber')} {...(snapshot ? {fromNumber:number,initiallyStable:true} : {})} style={numberStyle} /></>);
    case 'slidingNumber': return shell(<><p>{p.label}</p><SlidingNumber number={number} {...m<typeof SlidingNumber>('SlidingNumber')} fromNumber={snapshot ? number : raw('SlidingNumber').fromNumber ? 0 : undefined} initiallyStable={snapshot} style={numberStyle} /></>);
    case 'scrollingNumber': {
      const props = m<typeof ScrollingNumberContainer>('ScrollingNumberContainer');
      const vertical = !props.direction || ['btt','ttb'].includes(props.direction);
      const itemsSize = vertical ? Math.max(40,Math.ceil((p.fontSize ?? 18)*1.3)) : Math.max(75,Math.ceil(String(number).length*(p.fontSize ?? 18)*.65));
      return shell(<><p>{p.label}</p>{snapshot ? <span style={numberStyle}>{number.toLocaleString()}</span> : <ScrollingNumberContainer number={number} {...props} step={Math.max(1, Math.ceil(Math.abs(number) / 10))} itemsSize={itemsSize} className="native-scrolling-number" style={{fontSize:p.fontSize ?? 18, ...(vertical ? {width:90} : {height:40})}}><ScrollingNumber {...m<typeof ScrollingNumber>('ScrollingNumber')}><ScrollingNumberItems className="native-scrolling-item"/></ScrollingNumber><ScrollingNumberHighlight className="native-scrolling-highlight"/></ScrollingNumberContainer>}</>);
    }
    case 'copyButton': return shell(<CopyButton {...m<typeof CopyButton>('CopyButton')} content={p.text || ''} className={buttonClass} aria-label={label}><CopyButtonIcon icon={<Copy size={16}/>} copiedIcon={<Check size={16}/>} />{label}</CopyButton>);
    case 'iconButton': {
      const Icon = { star: Star, heart: Heart, plus: Plus, arrow: ArrowRight }[p.variant || 'star'] || Star;
      return shell(<IconButton {...m<typeof IconButton>('IconButton')} className={buttonClass} aria-label={label} onClick={action}><Icon size={20}/><IconButtonParticles {...m<typeof IconButtonParticles>('IconButtonParticles')} style={{ backgroundColor: 'var(--page-accent)' }} /></IconButton>);
    }
    case 'rippleButton': return shell(<RippleButton {...m<typeof RippleButton>('RippleButton')} className={buttonClass} onClick={action}>{label}<RippleButtonRipples /></RippleButton>);
    case 'liquidButton': return shell(<LiquidButton {...m<typeof LiquidButton>('LiquidButton')} className={buttonClass} onClick={action}>{label}</LiquidButton>);
    case 'flipButton': return shell(<FlipButton {...m<typeof FlipButton>('FlipButton')} aria-label={label} onClick={action}><FlipButtonFront className={buttonClass}>{label}</FlipButtonFront><FlipButtonBack className={buttonClass}>{p.text || label}</FlipButtonBack></FlipButton>);
    case 'themeTogglerButton': return shell(<ThemeTogglerButton theme={dark ? 'dark' : 'light'} resolvedTheme={dark ? 'dark' : 'light'} setTheme={theme => setDark(theme === 'dark')} className={buttonClass} aria-label={label}><ThemeTogglerButtonIcon light={<Sun size={16}/>} dark={<Moon size={16}/>} /><span>{label}</span></ThemeTogglerButton>);
    case 'githubStars':
    case 'githubStarsButton': return shell(<GitHubStarsButton value={p.value ?? 0} className={buttonClass} onClick={action}><Star size={16}/>{p.title || label}<GitHubStarsButtonNumber /></GitHubStarsButton>);
    case 'avatarGroup': return shell(<><AvatarGroup className="native-catalog-avatars">{options.map(([name], index) => <span key={index} title={name} aria-label={name}>{Array.from(name).slice(0, 2).join('')}</span>)}</AvatarGroup><p>{p.label}</p></>);
    case 'inputOtp': return shell(<label className="as-page-input-label">{label}<OTPInput value={inputValue} onChange={setInputValue} maxLength={Math.min(12, Math.max(1, p.max ?? 6))} pattern={REGEXP_ONLY_DIGITS} aria-label={label} render={({ slots }) => <div className="native-catalog-otp">{slots.map((slot, index) => <span key={index} data-active={slot.isActive}>{slot.char || (slot.hasFakeCaret ? '│' : '·')}</span>)}</div>} /><small>{p.text}</small></label>);
    case 'imageZoom': return shell(<ImageZoom className="native-image-zoom" {...m<typeof ImageZoom>('ImageZoom')} role="button" tabIndex={0} aria-label={`缩放图片：${p.title || '图片'}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }} onMouseMove={imageOrigin} onClick={imageOrigin}><Image src={imageSource === '#' ? undefined : imageSource} alt={p.title || '图片'} style={{ width: '100%', borderRadius: p.radius }} /></ImageZoom>);
    case 'dialog':
    case 'sheet':
      return shell(<Dialog.Root><Dialog.Trigger asChild>{trigger}</Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="native-catalog-overlay"/><Dialog.Content from={raw('DialogContent').from as 'top'|'bottom'|'left'|'right'|undefined} data-side={type === 'sheet' ? String(raw('SheetContent').side) : undefined} className={`as-page-catalog-dialog native-catalog-dialog native-catalog-dialog--${type === 'sheet' ? String(raw('SheetContent').side) : 'center'}`}>{raw(type === 'sheet' ? 'SheetContent' : 'DialogContent').showCloseButton && <Dialog.Close className="native-popup-close" aria-label="关闭">×</Dialog.Close>}<Dialog.Title>{p.title || '详情'}</Dialog.Title><Dialog.Description>{p.text}</Dialog.Description><Dialog.Close asChild><Button className={buttonClass}>关闭</Button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>);
    case 'drawer': {
      const side = String(raw('Drawer').direction);
      const swipeDirection = ({top:'up',bottom:'down',left:'left',right:'right'} as const)[side as 'top'|'bottom'|'left'|'right'];
      return shell(<Drawer.Root swipeDirection={swipeDirection}><Drawer.Trigger render={trigger}/><Drawer.Portal><Drawer.Backdrop className="native-catalog-overlay native-drawer-overlay"/><Drawer.Viewport className="native-drawer-viewport"><Drawer.Popup className={`as-page-catalog-dialog native-catalog-dialog native-catalog-dialog--${side}`}><Drawer.Title>{p.title}</Drawer.Title><Drawer.Description>{p.text}</Drawer.Description><Drawer.Close render={<Button className={buttonClass}/>}>关闭</Drawer.Close></Drawer.Popup></Drawer.Viewport></Drawer.Portal></Drawer.Root>);
    }
    case 'alertDialog': return shell(<AlertDialog.Root><AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="native-catalog-overlay"/><AlertDialog.Content {...m<typeof AlertDialog.Content>('AlertDialogContent')} className="as-page-catalog-dialog native-catalog-dialog"><AlertDialog.Title>{p.title || '确认操作'}</AlertDialog.Title><AlertDialog.Description>{p.text}</AlertDialog.Description><div className="as-page-catalog-actions"><AlertDialog.Cancel asChild><Button className={buttonClass}>取消</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button className={buttonClass}>确认</Button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>);
    case 'popover': return shell(<Popover.Root><Popover.Trigger asChild>{trigger}</Popover.Trigger><Popover.Portal><Popover.Content {...anchored<typeof Popover.Content>('PopoverContent')} className={popupClass}>{description}</Popover.Content></Popover.Portal></Popover.Root>);
    case 'hoverCard':
    case 'previewLinkCard': return shell(<HoverCard.Root {...m<typeof HoverCard.Root>(type === 'hoverCard' ? 'HoverCard' : 'PreviewLinkCard')}><HoverCard.Trigger asChild><a className={buttonClass} href={safeUrl(p.url)} onClick={action}>{label}</a></HoverCard.Trigger><HoverCard.Portal><HoverCard.Content {...anchored<typeof HoverCard.Content>(type === 'hoverCard' ? 'HoverCardContent' : 'PreviewLinkCardPanel')} className={popupClass}>{description}</HoverCard.Content></HoverCard.Portal></HoverCard.Root>);
    case 'tooltip': return shell(<Tooltip.Provider><Tooltip.Root {...m<typeof Tooltip.Root>('Tooltip')}><Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content {...anchored<typeof Tooltip.Content>('TooltipContent')} className={popupClass}>{p.text || p.title || label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>);
    case 'dropdownMenu': return shell(<DropdownMenu.Root><DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content {...anchored<typeof DropdownMenu.Content>('DropdownMenuContent')} className={popupClass}>{options.map(([name, url], index) => <DropdownMenu.Item asChild key={index}><a href={safeUrl(url)} onClick={event => navigate(event, url)} className="as-page-catalog-menu-item">{name}</a></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>);
    case 'contextMenu': return shell(<ContextMenu.Root><ContextMenu.Trigger asChild>{trigger}</ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className={popupClass}>{options.map(([name, url], index) => <ContextMenu.Item asChild key={index}><a href={safeUrl(url)} onClick={event => navigate(event, url)} className="as-page-catalog-menu-item">{name}</a></ContextMenu.Item>)}</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>);
    case 'collapsible': return shell(<Collapsible.Root open={checked} onOpenChange={setChecked}><Collapsible.Trigger asChild>{trigger}</Collapsible.Trigger><Collapsible.Content className="native-catalog-reveal">{description}</Collapsible.Content></Collapsible.Root>);
    case 'toggle': return shell(<Toggle.Root className={buttonClass} pressed={checked} onPressedChange={setChecked}>{label}</Toggle.Root>);
    case 'toggleGroup': return shell(<ToggleGroup.Root {...m<typeof ToggleGroup.Root>('ToggleGroup')} type="single" value={String(index)} onValueChange={value => { if (value) setIndex(Number(value)); }} aria-label={label} className="as-page-catalog-toggle-group" style={{gap:Number(raw('ToggleGroup').spacing)*4}}>{options.map(([name], index) => <ToggleGroup.Item key={index} value={String(index)}>{name}</ToggleGroup.Item>)}</ToggleGroup.Root>);
    case 'menubar': {
      return shell(<Menubar className="as-page-catalog-nav native-menubar" aria-label={label}>{[...groups].map(([group, items]) => <Menu.Root key={group}>
        <Menu.Trigger className="native-menubar-trigger">{group}</Menu.Trigger>
        <Menu.Portal><Menu.Positioner className="native-menubar-positioner" sideOffset={6} align="start">
          <Menu.Popup className={`${popupClass} native-menubar-popup`}>
            {items.map(([, name, url], index) => <Menu.LinkItem key={index} className="as-page-catalog-menu-item" href={safeUrl(url)} onClick={event => navigate(event, url)}>{name || group}</Menu.LinkItem>)}
          </Menu.Popup>
        </Menu.Positioner></Menu.Portal>
      </Menu.Root>)}</Menubar>);
    }
    case 'navigationMenu': return shell(<NavigationMenu.Root><NavigationMenu.List className="as-page-catalog-nav">{[...groups].map(([group, items]) => <NavigationMenu.Item key={group}><NavigationMenu.Trigger className={buttonClass}>{group}</NavigationMenu.Trigger><NavigationMenu.Content className="native-navigation-content">{items.map(([, name, url], index) => <NavigationMenu.Link key={index} href={safeUrl(url)} onClick={event => navigate(event, url)}>{name || group}</NavigationMenu.Link>)}</NavigationMenu.Content></NavigationMenu.Item>)}</NavigationMenu.List><NavigationMenu.Portal><NavigationMenu.Positioner className="native-menubar-positioner" sideOffset={8}><NavigationMenu.Popup className="native-navigation-popup"><NavigationMenu.Viewport className="native-navigation-viewport"/></NavigationMenu.Popup></NavigationMenu.Positioner></NavigationMenu.Portal></NavigationMenu.Root>);
    // Business composites keep their saved semantics and use v2 controls in the shared tree.
    default: return <CatalogComposites block={block} />;
  }
}
