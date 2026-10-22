// Build the editable public API from the installed, pinned declarations without executing them.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { bundledLanguagesInfo, bundledThemesInfo } from 'shiki';
const base='@animate-ui/react/primitives/';
const check = process.argv.includes('--check');
const outputs = new Map();
function output(file, value) { outputs.set(file, value); }
const bindings=[];
const bind=(type,module,parts)=>{for(const [group,exportName] of Object.entries(parts))bindings.push({type,module:module.startsWith('.')?module:base+module,group,exportName:module==='sidebar'?exportName:({Image:"Image<'img'>",Highlight:"Highlight<'div'>",HighlightItem:"HighlightItem<'div'>"})[exportName] ?? exportName});};
for(const [type,file,parts] of [
 ['gradientText','gradient',['GradientText']],['morphingText','morphing',['MorphingText']],['rollingText','rolling',['RollingText']],['rotatingText','rotating',['RotatingTextContainer','RotatingText']],['shimmeringText','shimmering',['ShimmeringText']],['slidingText','sliding',['SlidingText']],['splittingText','splitting',['SplittingText']],['swappingText','swapping',['SwappingText']],['typingText','typing',['TypingText','TypingTextCursor']],['countingNumber','counting-number',['CountingNumber']],['slidingNumber','sliding-number',['SlidingNumber']],['scrollingNumber','scrolling-number',['ScrollingNumberContainer','ScrollingNumber','ScrollingNumberItems','ScrollingNumberHighlight']],
]) bind(type,'texts/'+file,Object.fromEntries(parts.map(p=>[p,p])));
for(const [type,module,parts] of [
 ['button','buttons/button',['Button']],['copyButton','buttons/copy',['CopyButton','CopyButtonIcon']],['iconButton','buttons/icon',['IconButton','IconButtonParticles']],['rippleButton','buttons/ripple',['RippleButton','RippleButtonRipples']],
 ['avatarGroup','avatar-group',['AvatarGroup','AvatarGroupTooltip','AvatarGroupTooltipArrow']],['githubStars','github-stars',['GithubStars','GithubStarsNumber','GithubStarsParticles']],['pinnedList','pinned-list',['PinnedList','PinnedListPinned','PinnedListUnpinned','PinnedListItem','PinnedListItems','PinnedListTrigger','PinnedListLabel']],['scrollProgress','scroll-progress',['ScrollProgressProvider','ScrollProgress','ScrollProgressContainer']],['imageZoom','effects/image-zoom',['ImageZoom','Image']],
])bind(type,module,Object.fromEntries(parts.map(p=>[p,p])));
for(const [type,dir,part] of [['liquidButton','buttons/liquid','LiquidButton'],['flipButton','buttons/flip','FlipButton'],['themeTogglerButton','buttons/theme-toggler','ThemeTogglerButton'],['githubStarsButton','buttons/github-stars','GitHubStarsButton'],['codeBlock','code-block','CodeBlock']])bind(type,'./src/components/animate-ui/registry/'+dir,{[part]:part});
for(const name of ['Bubble','Fireworks','Glyph','Gradient','GravityStars','Hexagon','Hole','Stars','Topography'])bind(name[0].toLowerCase()+name.slice(1)+'Background','./src/components/animate-ui/registry/backgrounds/'+name.replace(/([a-z])([A-Z])/g,'$1-$2').toLowerCase(),{[name+'Background']:name+'Background'});
for(const [effect,parts] of [['auto-height',['AutoHeight']],['blur',['Blur']],['click',['Click']],['effect',['Effect']],['fade',['Fade']],['highlight',['Highlight','HighlightItem']],['magnetic',['Magnetic']],['particles',['Particles','ParticlesEffect']],['scroll-fade',['ScrollFade']],['shine',['Shine']],['slide',['Slide']],['theme-toggler',['ThemeToggler']],['tilt',['Tilt','TiltContent']],['zoom',['Zoom']]])bind('effect:'+effect,'effects/'+effect,Object.fromEntries(parts.map(p=>[p,p])));
bind('effect:spring','spring',{SpringProvider:'SpringProvider',Spring:'Spring',SpringElement:'SpringElement'});
bind('effect:cursor','cursor',{CursorProvider:'CursorProvider',Cursor:'Cursor',CursorFollow:'CursorFollow',CursorContainer:'CursorContainer'});
bind('effect:page-transition','./src/components/animate-ui/registry/page-transition',{PageTransition:'PageTransition'});
// Root and part aliases match the renderer's stored group names.
for(const [type,file,prefix] of [['dialog','dialog','Dialog'],['alertDialog','alert-dialog','AlertDialog'],['sheet','dialog','Sheet'],['popover','popover','Popover'],['hoverCard','hover-card','HoverCard'],['tooltip','tooltip','Tooltip'],['dropdownMenu','dropdown-menu','DropdownMenu'],['contextMenu','context-menu','ContextMenu'],['collapsible','collapsible','Collapsible'],['toggle','toggle','Toggle'],['toggleGroup','toggle-group','ToggleGroup'],['select','select','Select'],['checkbox','checkbox','Checkbox'],['radio','radio-group','RadioGroup'],['slider','slider','Slider'],['progress','progress','Progress'],['tabs','tabs','Tabs']]) {
 const parts={ [prefix]: 'Root' };
 const extras={dialog:['Trigger','Content','Overlay','Title','Description','Close'], 'alert-dialog':['Trigger','Content','Overlay','Title','Description','Cancel','Action'],popover:['Trigger','Content'], 'hover-card':['Trigger','Content'],tooltip:['Trigger','Content'], 'dropdown-menu':['Trigger','Content','Item','Group','Label','Separator','CheckboxItem','RadioGroup','RadioItem','ItemIndicator','Sub','SubTrigger','SubContent'], 'context-menu':['Trigger','Content','Item','Group','Label','Separator','CheckboxItem','RadioGroup','RadioItem','ItemIndicator','Sub','SubTrigger','SubContent'],collapsible:['Trigger','Content'],toggle:[], 'toggle-group':['Item'],select:['Trigger','Value','Icon','Viewport','ItemText','Content','Item','ItemIndicator'],checkbox:['Indicator'], 'radio-group':['Item','Indicator'],slider:['Track','Range','Thumb'],progress:['Indicator'],tabs:['List','Trigger','Content']}[file]??[];
 if(['dialog','alert-dialog','popover','hover-card','tooltip','dropdown-menu','context-menu','select'].includes(file))extras.push('Portal');
 for(const part of extras)parts[prefix+part]=part;
 bind(type,'radix-ui/'+file,parts);
}
bind('themeTogglerButton','./src/components/animate-ui/registry/buttons/theme-toggler',{ThemeTogglerButtonIcon:'ThemeTogglerButtonIcon'});
for(const n of [1,2,3])bind('starsBackground','./src/components/animate-ui/registry/backgrounds/stars',{['StarLayer'+n]:'StarLayer'});
bind('effect:page-transition','./src/components/animate-ui/registry/page-transition',{PageTransitionShared:'PageTransitionShared'});
bind('motionGrid','motion-grid',{MotionGrid:'MotionGrid',MotionGridCells:'MotionGridCells'});
bind('tooltip','radix-ui/tooltip',{TooltipProvider:'Provider',TooltipArrow:'Arrow'});
bind('switch','radix-ui/switch',{Switch:'Root',SwitchThumb:'Thumb'});
bind('sidebar','sidebar',{SidebarProvider:'Provider',SidebarContainer:'Container',SidebarHighlight:'Highlight',SidebarGap:'Gap',SidebarTriggerIcon:'TriggerIcon'});
bind('githubStarsButton','./src/components/animate-ui/registry/buttons/github-stars',{GitHubStarsButtonNumber:'GitHubStarsButtonNumber',GitHubStarsButtonParticles:'GitHubStarsButtonParticles'});
bind('pagination','pagination',{Pagination:'Root'});
bind('inputOtp','input-otp',{InputOTP:'OTPInput'});
bind('heading','texts/highlight',{HighlightText:'HighlightText'});
bind('accordion','radix-ui/accordion',{Accordion:'Root',AccordionItem:'Item',AccordionTrigger:'Trigger',AccordionContent:'Content'});
bind('drawer','base-ui/drawer',{Drawer:'Drawer.Root',DrawerPopup:'Drawer.Popup',DrawerBackdrop:'Drawer.Backdrop'});
bind('combobox','base-ui/combobox',{Combobox:'Combobox.Root',ComboboxInput:'Combobox.Input',ComboboxContent:'Combobox.Positioner',ComboboxPopup:'Combobox.Popup',ComboboxItem:'Combobox.Item',ComboboxItemIndicator:'Combobox.ItemIndicator'});
bind('toast','base-ui/toast',{Toaster:'Toast.Provider',Toast:'Toast.Root',ToastViewport:'Toast.Viewport',ToastContent:'Toast.Content'});
bind('menubar','base-ui/menubar',{Menubar:'Menubar'});
bind('menubar','base-ui/menu',{Menu:'Menu.Root',MenuPositioner:'Menu.Positioner',MenuPopup:'Menu.Popup',MenuCheckboxItem:'Menu.CheckboxItem',MenuRadioItem:'Menu.RadioItem',MenuItem:'Menu.Item',MenuLinkItem:'Menu.LinkItem',MenuGroup:'Menu.Group',MenuGroupLabel:'Menu.GroupLabel',MenuTrigger:'Menu.Trigger',MenuSeparator:'Menu.Separator',MenuSubmenuTrigger:'Menu.SubmenuTrigger',MenuSubmenuRoot:'Menu.SubmenuRoot',MenuRadioGroup:'Menu.RadioGroup',MenuCheckboxItemIndicator:'Menu.CheckboxItemIndicator',MenuRadioItemIndicator:'Menu.RadioItemIndicator'});
bind('navigationMenu','base-ui/navigation-menu',{NavigationMenu:'NavigationMenu.Root',NavigationMenuPositioner:'NavigationMenu.Positioner',NavigationMenuPopup:'NavigationMenu.Popup',NavigationMenuViewport:'NavigationMenu.Viewport',NavigationMenuTrigger:'NavigationMenu.Trigger',NavigationMenuContent:'NavigationMenu.Content',NavigationMenuList:'NavigationMenu.List',NavigationMenuItem:'NavigationMenu.Item',NavigationMenuLink:'NavigationMenu.Link'});
bind('questionnaire','questionnaire',{Questionnaire:'Questionnaire.Root',QuestionnaireItem:'Questionnaire.Item',QuestionnaireInput:'Questionnaire.Input',QuestionnaireChoices:'Questionnaire.Choices'});
bind('previewLinkCard','radix-ui/preview-link-card',{PreviewLinkCard:'PreviewLinkCard',PreviewLinkCardPanel:'PreviewLinkCardContent',PreviewLinkCardImage:'PreviewLinkCardImage'});

bind('drawer','base-ui/drawer',{DrawerTrigger:'Drawer.Trigger',DrawerViewport:'Drawer.Viewport',DrawerContent:'Drawer.Content',DrawerTitle:'Drawer.Title',DrawerDescription:'Drawer.Description',DrawerClose:'Drawer.Close'});
bind('combobox','base-ui/combobox',{ComboboxClear:'Combobox.Clear',ComboboxTrigger:'Combobox.Trigger',ComboboxEmpty:'Combobox.Empty',ComboboxList:'Combobox.List',ComboboxChips:'Combobox.Chips',ComboboxChip:'Combobox.Chip',ComboboxChipRemove:'Combobox.ChipRemove'});
bind('toast','base-ui/toast',{ToastTitle:'Toast.Title',ToastDescription:'Toast.Description',ToastAction:'Toast.Action',ToastClose:'Toast.Close'});
bind('questionnaire','questionnaire',{QuestionnaireProgress:'Questionnaire.Progress',QuestionnaireTitle:'Questionnaire.Title',QuestionnaireDescription:'Questionnaire.Description',QuestionnaireChoice:'Questionnaire.Choice',QuestionnaireChoiceInput:'Questionnaire.ChoiceInput',QuestionnaireChoiceLabel:'Questionnaire.ChoiceLabel',QuestionnaireChoiceShortcut:'Questionnaire.ChoiceShortcut',QuestionnaireError:'Questionnaire.Error',QuestionnairePrevious:'Questionnaire.Previous',QuestionnaireSkip:'Questionnaire.Skip',QuestionnaireNext:'Questionnaire.Next',QuestionnaireSubmit:'Questionnaire.Submit'});
bind('flipButton','./src/components/animate-ui/registry/buttons/flip',{FlipButtonFront:'FlipButtonFront',FlipButtonBack:'FlipButtonBack'});
bind('previewLinkCard','radix-ui/preview-link-card',{PreviewLinkCardTrigger:'PreviewLinkCardTrigger'});
bind('githubStars','github-stars',{GithubStarsIcon:"GithubStarsIcon<'svg'>",GithubStarsLogo:'GithubStarsLogo'});
bind('githubStarsButton','./src/components/animate-ui/registry/buttons/github-stars',{GitHubStarsButtonIcon:"GitHubStarsButtonIcon<'svg'>",GitHubStarsButtonLogo:'GitHubStarsButtonLogo'});
bind('drawer','base-ui/drawer',{DrawerPortal:'Drawer.Portal'});
bind('combobox','base-ui/combobox',{ComboboxPortal:'Combobox.Portal'});
bind('toast','base-ui/toast',{ToastPortal:'Toast.Portal'});
bind('menubar','base-ui/menu',{MenuPortal:'Menu.Portal'});
bind('navigationMenu','base-ui/navigation-menu',{NavigationMenuPortal:'NavigationMenu.Portal'});
bind('previewLinkCard','radix-ui/preview-link-card',{PreviewLinkCardPortal:'PreviewLinkCardPortal'});
const managed=new Set(['children','ref','asChild','render','key','dangerouslySetInnerHTML','container','scope','actionsRef','handle','scrollContainerRef','inViewRoot','deps','items','text','texts','code','number','content','value','defaultValue','checked','defaultChecked','item','defaultItem','setTheme','getValueLabel','collisionBoundary','root','theme','resolvedTheme','layerOptions','payload','toast','toastManager','render','anchor','itemToStringLabel','itemToStringValue','isItemEqualToValue' ]);
const inherited=new Set(['color','target','rel','download','hrefLang','ping','referrerPolicy','inputMode','spellCheck','noValidate','lang','alt','containerClassName','noScriptCSSFallback','nonce','placeholderChar','pushPasswordManagerStrategy','textAlign','objectFit','as','aria-label','disabled','readOnly','required','name','form','id','title','tabIndex','autoFocus','loop','orientation','dir','className','style','min','max','step','placeholder','autoComplete','maxLength','pattern']);
const motionKeys=new Set(['variants','transition','exitTransition','initial','animate','exit','whileHover','whileTap','whileFocus','whileInView','layout','layoutId','layoutDependency','drag','dragConstraints','dragElastic','dragMomentum','dragSnapToOrigin','dragDirectionLock','viewport']);
const file=path.resolve('.studio-official-api-types.ts');
fs.writeFileSync(file,"import type {ComponentProps,CSSProperties} from 'react';type CssFields=CSSProperties;\n"+bindings.map((b,i)=>`import * as B${i} from ${JSON.stringify(b.module)};type P${i}=ComponentProps<typeof B${i}.${b.exportName}>;`).join('\n'));
try {
const program=ts.createProgram([file],{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,strict:true,skipLibCheck:true,allowSyntheticDefaultImports:true,baseUrl:'.',paths:{'@/*':['src/*']}});
const checker=program.getTypeChecker(),source=program.getSourceFile(file),schemas={},report=[];
const F=ts.TypeFlags;
function schema(type,depth=0,seen=new Set()) {
 if(depth>4||seen.has(type))return null;
 const next=new Set(seen);next.add(type);
 if(type.isUnion()){const types=type.types.filter(t=>!(t.flags&(F.Undefined|F.Never)));let parts=types.map(t=>schema(t,depth,next)).filter(Boolean);parts=[...new Map(parts.map(p=>[JSON.stringify(p),p])).values()];if(parts.some(p=>p.type==='string'))parts=parts.filter(p=>!p.enum?.every(v=>typeof v==='string')); if(!parts.length)return null;if(parts.every(p=>p.enum))return {enum:[...new Set(parts.flatMap(p=>p.enum))]};return parts.length===1?parts[0]:{anyOf:parts};}
 if(checker.typeToString(type).includes('RefObject<'))return null;
 if(type.flags&F.StringLiteral)return {enum:[type.value]};if(type.flags&F.NumberLiteral)return {enum:[type.value]};if(type.flags&F.BooleanLiteral)return {enum:[type.intrinsicName==='true']};
 if(type.flags&(F.String|F.TemplateLiteral))return {type:'string',maxLength:2000};if(type.flags&F.Number)return {type:'number',min:-1e6,max:1e6};if(type.flags&F.Boolean)return {type:'boolean'};if(type.flags&F.Null)return {enum:[null]};
 if(type.getCallSignatures().length)return null;
 if(checker.isTupleType(type)){const entries=checker.getTypeArguments(type).map(t=>schema(t,depth+1,next));return entries.every(Boolean)?{type:'array',tuple:entries}:null;}
 if(checker.isArrayType(type)){const item=schema(checker.getTypeArguments(type)[0],depth+1,next);return item?{type:'array',items:item,maxItems:100}:null;}
 if(type.flags&F.Object){const props=type.getProperties();if(!props.length||props.length>120||checker.getIndexTypeOfType(type,ts.IndexKind.String))return null;const properties={},required=[];
 for(const p of props){if(managed.has(p.name)||p.name.startsWith('on'))continue;const s=schema(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??p.declarations?.[0]??source),depth+1,next);if(!s)continue;properties[p.name]=s;if(!(p.flags&ts.SymbolFlags.Optional))required.push(p.name);}
 return Object.keys(properties).length?{type:'object',properties,...required.length?{required}:{}}:null;}
 return null;
}
for(const node of source.statements){if(!ts.isTypeAliasDeclaration(node))continue;if(node.name.text==='CssFields'){output('shared/official-css-properties.json',JSON.stringify(checker.getTypeFromTypeNode(node.type).getProperties().map(p=>p.name))+'\n');continue;}const i=Number(node.name.text.slice(1)),b=bindings[i];if(!b)continue;const type=checker.getTypeFromTypeNode(node.type);const fields={};
 const symbols=[...type.getProperties()];if(type.isUnion())for(const variant of type.types)for(const p of variant.getProperties())if(!symbols.some(s=>s.name===p.name))symbols.push(p);
 for(const prop of symbols){
  const decl=prop.valueDeclaration??prop.declarations?.[0]??node;
  const propType=checker.getTypeOfSymbolAtLocation(prop,decl),declFile=decl.getSourceFile().fileName;
  if(managed.has(prop.name)&&!(b.type==='checkbox'&&prop.name==='checked'||b.type==='codeBlock'&&prop.name==='theme')||prop.name.startsWith('on')){report.push({...b,name:prop.name,status:'managed-or-framework'});continue;}
  if(!declFile.includes('@animate-ui')&&!declFile.includes('src/components/animate-ui/registry')&&!declFile.includes('@radix-ui')&&!declFile.includes('@base-ui')&&!declFile.includes('@shadcn')&&!inherited.has(prop.name)&&!motionKeys.has(prop.name))continue;
  let field;
  if(b.type==='codeBlock'&&prop.name==='lang')field={options:Object.fromEntries(['text','plain','txt',...bundledLanguagesInfo.flatMap(l=>[l.id,...l.aliases??[]])].map(v=>[v,v]))};
  else if(b.type==='codeBlock'&&prop.name==='themes')field={kind:'json',schema:{type:'object',required:['light','dark'],properties:Object.fromEntries(['light','dark'].map(v=>[v,{enum:bundledThemesInfo.map(t=>t.id)}]))}};
  else if(prop.name==='download')field={kind:'json',schema:{anyOf:[{type:'boolean'},{type:'string',maxLength:2000}]}};
  else if(prop.name==='variants')field={kind:'variants'};
  else if(prop.name==='gridSize'&&b.type==='motionGrid')field={kind:'grid-size'};
  else if(prop.name==='frames'&&b.type==='motionGrid')field={kind:'frames'};
  else if(['activeProps','inactiveProps'].includes(prop.name)&&b.type==='motionGrid')field={kind:'motion-element-props'};
  else if(['icon','copiedIcon','light','dark','system'].includes(prop.name)||b.group==='SidebarTriggerIcon'&&['open','closed'].includes(prop.name))field={kind:'json',schema:{anyOf:[{type:'string',maxLength:100},{type:'number',min:-10000,max:10000},{type:'boolean'},{enum:[null]}]}};
  else if(prop.name==='style')field={kind:'style'};
  else if(prop.name==='className')field={kind:'string',maxLength:2000};
  else if(['canvasProps','hexagonProps'].includes(prop.name))field={kind:'element-props'};
  else if(prop.name==='filteredItems'&&b.type==='combobox')field={kind:'json',schema:{type:'array',items:{type:'string',maxLength:200},maxItems:100}};
  else if(['initial','animate','exit','whileHover','whileTap','whileFocus','whileInView'].includes(prop.name)){const shape=schema(propType),booleans=(propType.isUnion()?propType.types:[propType]).flatMap(t=>t.flags&F.BooleanLiteral?[t.intrinsicName==='true']:t.flags&F.Boolean?[true,false]:[]);field=shape?.enum?.every(v=>typeof v==='boolean')?{options:Object.fromEntries(shape.enum.map(v=>[String(v),v]))}:{kind:'motion-target',booleans};}
  else if(prop.name==='layoutDependency')field={kind:'json',schema:{anyOf:[{type:'string',maxLength:200},{type:'number',min:-1e6,max:1e6},{type:'boolean'}]}};
  else if(prop.name==='inViewMargin')field={kind:'margin'};
  else if(/transition$/i.test(prop.name)||prop.name==='followCursorSpringOptions'){const shape=schema(propType);field=shape?.enum?.every(v=>typeof v==='boolean')?{options:Object.fromEntries(shape.enum.map(v=>[String(v),v]))}:{kind:checker.typeToString(propType).includes('SpringOptions')?'spring-options':'transition'};}
  else {const s=schema(propType);if(!s){report.push({...b,name:prop.name,status:'needs-schema',typeName:checker.typeToString(propType)});continue;}
   if(s.type==='string'||s.type==='number'||s.type==='boolean')field={kind:s.type,...s.type==='number'?{min:s.min,max:s.max}:{},...s.type==='string'?{maxLength:s.maxLength}:{}};
   else if(s.enum && s.enum.every(v=>(v===null||['string','number','boolean'].includes(typeof v))))field={options:Object.fromEntries(s.enum.map(v=>[String(v),v]))};
   else field={kind:'json',schema:s};
  }
  if(field.kind==='number'){
    if(/(?:count|numberOf|levels|population|fontSize|itemsSize|particleSize)/i.test(prop.name)){field.min=1;field.max=500;field.step=1;}
    if(/(?:delay|duration|speed|size|radius|thickness|padding|blur|offset|distance|scale)/i.test(prop.name)){field.min=0;field.max=10000;}
    if(prop.name==='sideItemsCount'){field.min=0;field.max=20;field.step=1;}
    if(prop.name==='step'){field.min=0.001;field.max=1e6;}
  }
  fields[prop.name]=field;report.push({...b,name:prop.name,status:'schema',source:declFile.replace(process.cwd()+'/','')});
 }
 if(Object.keys(fields).length)(schemas[b.type]??={groups:{}}).groups[b.group]=fields;
}
output('shared/official-api-controls.json',JSON.stringify(schemas,null,2)+'\n');
if (!check) { fs.mkdirSync('artifacts/component-acceptance',{recursive:true}); output('artifacts/component-acceptance/api-generation.json',JSON.stringify(report,null,2)+'\n'); }
const errors=program.getSemanticDiagnostics(source).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
for (const [target, content] of outputs) { if (check) { if (!fs.existsSync(target) || fs.readFileSync(target,'utf8') !== content) throw Error(`Generated file is stale: ${target}`); } else fs.writeFileSync(target, content); }
console.log(JSON.stringify({check,bindings:bindings.length,schemas:report.filter(r=>r.status==='schema').length,needsSchema:report.filter(r=>r.status==='needs-schema').length}));
} finally {fs.unlinkSync(file);}
