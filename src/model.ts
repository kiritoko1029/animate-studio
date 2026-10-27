import extendedComponents from '../shared/extended-components.json' with { type: 'json' };
import navbarIcons from '../shared/navbar-icons.json' with { type: 'json' };
import type { AnimationSettings } from '../shared/animation-settings.mjs';
import { canvasLimits, defaultCanvasSize } from '../shared/canvas-sizes.mjs';
import { canvasBounds, clampFrame } from './lib/canvas-bounds.ts';
import type { CatalogEffect } from './lib/catalog-effects';
import type { CustomComponentSnapshot } from '../shared/custom-components.mjs';
export type ExtendedComponentType = keyof typeof extendedComponents;
export const extendedCatalog = extendedComponents;
export const isExtendedComponent = (type: string): type is ExtendedComponentType => Object.hasOwn(extendedComponents, type);
import type { Bindings, Action, Variable, Script } from './lib/interactions/types';
import type { CustomTheme, ThemeId } from './lib/themes';
export type { SiteDocument, StudioDocument } from '../shared/site-document.mjs';

export const componentTypes = ['navbar', 'hero', 'heading', 'text', 'button', 'card', 'image', 'input', 'accordion', 'tabs', 'switch', 'alert', 'badge', 'separator', 'footer', 'textarea', 'select', 'checkbox', 'radio', 'slider', 'avatar', 'progress', 'statistic', 'table', 'timeline', 'testimonial', 'pricing', 'breadcrumb', 'pagination', 'rating', 'repeater', 'form', 'chart', ...Object.keys(extendedComponents) as ExtendedComponentType[]] as const;
/** Built-in library types, created from catalog defaults. */
export type BuiltinComponentType = typeof componentTypes[number];
/** `custom` blocks are user-written components created from a definition, never from defaults. */
export type ComponentType = BuiltinComponentType | 'custom';
export type BlockProps = {
  duration?: number; effect?: CatalogEffect;
  motion?: AnimationSettings; effectOptions?: AnimationSettings;
  title?: string; text?: string; label?: string; url?: string; imageUrl?: string;
  brandIcon?: keyof typeof navbarIcons | 'none';
  items?: string; variant?: string; align?: 'left' | 'center' | 'right';
  fontSize?: number; padding?: number; radius?: number; background?: string; color?: string;
  contentScale?: number;
  value?: number; max?: number; checked?: boolean;
  theme?: ThemeId; accent?: string;
  animation?: 'none' | 'fade' | 'slide' | 'scale';
  navigation?: 'custom' | 'site';
  sourceId?: string; submitSourceId?: string;
  dataFields?: Record<string, Partial<Record<'title' | 'text' | 'label' | 'url', string>>>;
  dataColumns?: { key: string; label: string; path: string; aggregate?: 'sum' | 'count' | 'avg' | 'min' | 'max' }[];
  chartType?: 'line' | 'area' | 'column' | 'bar' | 'pie'; categoryField?: string;
  chartColors?: string[]; showLegend?: boolean; showGrid?: boolean; showTooltip?: boolean; showValues?: boolean; innerRadius?: number;
  filterField?: string; filterVariable?: string;
  name?: string; required?: boolean; format?: 'text' | 'email' | 'url' | 'number'; minLength?: number; maxLength?: number; error?: string;
  successUrl?: string; successText?: string; errorText?: string;
  /** `custom` blocks only: the component definition copied into the page. */
  custom?: CustomComponentSnapshot;
};
export type BlockFrame = { x: number; y: number; width: number; height: number };
export type Block = { id: string; type: ComponentType; props: BlockProps; frame?: BlockFrame; children?: Block[]; bindings?: Bindings; events?: { click?: Action[]; change?: Action[] } };
export type PageDocument = {
  version: 1; name: string; id?: string;
  settings: { background: string; accent: string; theme?: ThemeId; customThemes?: CustomTheme[]; maxWidth: number; padding: number; layout?: 'flow' | 'free'; canvasHeight?: number };
  blocks: Block[]; variables?: Variable[]; scripts?: Script[];
};
export const catalog: {type: BuiltinComponentType; name: string; english: string; group: string; description: string}[] = [
  { type: 'navbar', name: '导航栏', english: 'Navigation', group: '布局', description: '品牌与页面导航' },
  { type: 'hero', name: '首屏区块', english: 'Hero', group: '布局', description: '引人注目的页面开场' },
  { type: 'heading', name: '动态标题', english: 'Highlight', group: '基础', description: '带高亮动画的标题' },
  { type: 'text', name: '正文', english: 'Text', group: '基础', description: '段落与描述文字' },
  { type: 'button', name: '动效按钮', english: 'Button', group: '基础', description: '带弹簧反馈的操作按钮' },
  { type: 'badge', name: '标签', english: 'Badge', group: '基础', description: '状态与分类标签' },
  { type: 'card', name: '内容卡片', english: 'Card', group: '展示', description: '突出一个功能或想法' },
  { type: 'image', name: '图片', english: 'Image', group: '展示', description: '展示图片与文字说明' },
  { type: 'accordion', name: '折叠面板', english: 'Accordion', group: '交互', description: '可展开的常见问题' },
  { type: 'tabs', name: '标签页', english: 'Tabs', group: '交互', description: '切换不同的内容视图' },
  { type: 'input', name: '输入框', english: 'Input', group: '表单', description: '收集文字或邮箱' },
  { type: 'switch', name: '开关', english: 'Switch', group: '表单', description: '切换偏好与设置' },
  { type: 'alert', name: '提示框', english: 'Alert', group: '展示', description: '展示重要的信息' },
  { type: 'separator', name: '分割线', english: 'Separator', group: '布局', description: '划分不同内容区块' },
  { type: 'footer', name: '页脚', english: 'Footer', group: '布局', description: '页面底部与版权说明' },
  { type: 'textarea', name: '多行输入', english: 'Textarea', group: '表单', description: '收集留言与长篇文字' },
  { type: 'select', name: '下拉选择', english: 'Select', group: '表单', description: '从选项中选择一个项目' },
  { type: 'checkbox', name: '复选框', english: 'Checkbox', group: '表单', description: '勾选协议或个人偏好' },
  { type: 'radio', name: '单选组', english: 'Radio group', group: '表单', description: '展示互斥选项与说明' },
  { type: 'slider', name: '滑块', english: 'Slider', group: '表单', description: '拖动调整数值与比例' },
  { type: 'avatar', name: '头像', english: 'Avatar', group: '展示', description: '人物头像、姓名与身份' },
  { type: 'progress', name: '进度条', english: 'Progress', group: '展示', description: '清晰呈现任务完成进度' },
  { type: 'statistic', name: '统计卡片', english: 'Statistic', group: '展示', description: '突出核心数据与变化趋势' },
  { type: 'table', name: '数据表格', english: 'Table', group: '展示', description: '有序展示多列结构化数据' },
  { type: 'timeline', name: '时间线', english: 'Timeline', group: '展示', description: '记录里程碑与项目进展' },
  { type: 'testimonial', name: '用户评价', english: 'Testimonial', group: '展示', description: '引用用户反馈与推荐语' },
  { type: 'pricing', name: '价格卡片', english: 'Pricing', group: '展示', description: '介绍方案价格与功能清单' },
  { type: 'breadcrumb', name: '面包屑', english: 'Breadcrumb', group: '布局', description: '展示当前位置与导航层级' },
  { type: 'pagination', name: '分页', english: 'Pagination', group: '交互', description: '切换页码与前后页状态' },
  { type: 'rating', name: '评分', english: 'Rating', group: '交互', description: '交互式五星评分与反馈' },
  { type: 'repeater', name: '动态列表', english: 'Repeater', group: '数据', description: '连接数据源，重复渲染每条记录' },
  { type: 'form', name: '数据表单', english: 'Data form', group: '数据', description: '校验并提交创建或更新请求' },
  { type: 'chart', name: '数据图表', english: 'Data chart', group: '数据', description: '用统一数据源展示趋势、比较与构成' },
  ...Object.entries(extendedComponents).map(([type, entry]) => ({ type: type as ExtendedComponentType, name: entry.name, english: entry.english, group: entry.group, description: entry.description })),
];
const defaults: Record<BuiltinComponentType, BlockProps> = {
  ...Object.fromEntries(Object.entries(extendedComponents).map(([type, entry]) => [type, entry.props])) as Record<ExtendedComponentType, BlockProps>,
  navbar: {title:'Forma', brandIcon:'leaf', items:'产品,关于我们,联系我们', padding:20},
  hero: {label:'让每一个想法，都能被看见',title:'好想法，\n值得一个好页面。',text:'从一个灵感开始，把想象变成触手可及的体验。\n自由搭建，让创作自然发生。',variant:'开始探索',url:'#features',align:'center',padding:46,animation:'fade'},
  heading: {title:'为灵感，留一点空间。',fontSize:28,align:'left',padding:20},
  text: {text:'把复杂留给工具，把专注留给创作。用简单、自然的方式，讲好你的故事。',fontSize:15,align:'left',padding:20},
  button: {label:'开始探索',url:'#features',variant:'primary',align:'left',padding:20,radius:10,animation:'none'},
  badge: {label:'为创作者而生',padding:16,align:'left'},
  card: {title:'从想法，到现实',text:'灵活的组件，自然的动效。每一个细节，都由你来定义。',label:'了解更多',url:'#about',padding:24,radius:16,background:'#f5f7f5',animation:'fade'},
  image: {imageUrl:'/landscape.svg',title:'让灵感自由生长',text:'给好想法一个可以落地的地方。',padding:20,radius:12},
  input: {label:'你的邮箱',text:'hello@example.com',padding:20},
  accordion: {title:'常见问题',items:'如何开始创建页面？|从左侧拖入组件，然后在属性面板中调整文字、颜色和动效。\n可以在手机上预览吗？|可以。使用画布上方的设备按钮，切换桌面与移动端视图。\n我的修改会自动保存吗？|编辑内容会自动保存，刷新后可以继续创作。',padding:24},
  tabs: {items:'设计|用组件表达想法，让布局自然呈现。\n交互|给页面添加自然、流畅的动态体验。\n交付|保存你的创作，分享页面配置。',padding:24},
  switch: {label:'开启消息通知',text:'及时获取与你相关的更新。',padding:20},
  alert: {title:'一点灵感提示',text:'选中任意组件，即可在右侧修改内容和样式。',padding:20},
  separator: {padding:20},
  footer: {title:'Forma',text:'© 2026 Forma. 用设计，让想法发生。',padding:24},
  textarea: {label:'说说你的想法',text:'分享你的灵感，或留下想对我们说的话…',padding:20,radius:8},
  select: {label:'你感兴趣的方向',text:'请选择一个方向',items:'界面设计\n产品开发\n品牌创意',padding:20,radius:8},
  checkbox: {label:'订阅灵感周刊',text:'每周一封，发现设计与创作的新可能。',checked:false,padding:20},
  radio: {label:'选择你的计划',items:'个人创作|适合独立创作者与日常灵感\n团队协作|与伙伴一起，把好想法落地\n企业方案|为更大的创作规模做好准备',padding:20},
  slider: {label:'调整创作节奏',text:'找到适合自己的节奏。',value:60,max:100,padding:20},
  avatar: {title:'林晓',text:'产品设计师 · 保持好奇',imageUrl:'',padding:20,radius:28},
  progress: {label:'项目完成进度',text:'一步一步，让想法成为现实。',value:72,max:100,padding:20},
  statistic: {title:'本月访问量',text:'12,840',label:'+18.6% 较上月',padding:24,radius:16,background:'#f5f7f5',animation:'fade'},
  table: {title:'项目一览',items:'项目名称|负责人|状态\n品牌官网|林晓|进行中\n设计系统|陈默|已完成\n灵感周刊|许宁|计划中',padding:20,radius:10},
  repeater: {title:'动态列表',sourceId:'books',dataFields:{title:{title:'title'},description:{text:'text'},more:{url:'/details/{{item.id}}'}},padding:20},
  form: {title:'新建记录',submitSourceId:'',successText:'提交成功',errorText:'提交失败，请检查后重试。',padding:24,radius:12},
  chart: {title:'访问量趋势',sourceId:'',chartType:'line',categoryField:'category',dataColumns:[{key:'visits',label:'访问量',path:'value',aggregate:'sum'},{key:'target',label:'目标',path:'target',aggregate:'sum'}],showLegend:true,showGrid:true,showTooltip:true,showValues:false,innerRadius:50,padding:20,radius:12},
  timeline: {title:'从灵感到上线',items:'发现灵感|记录想法，找到值得解决的问题。|01\n打磨设计|用细节和交互，让体验更自然。|02\n准备出发|完成检查，把作品带给更多人。|03',padding:24},
  testimonial: {title:'林晓',label:'独立设计师',text:'终于可以把时间花在创意本身。从一个想法到完整页面，比想象中更简单。',padding:24,radius:16,background:'#f5f7f5',animation:'fade'},
  pricing: {title:'创作进阶',variant:'¥99 / 月',text:'为持续生长的好想法，准备更多可能。',items:'无限创意项目\n完整组件与动效\n导出与备份\n优先获得产品更新',label:'选择这个方案',url:'#contact',padding:24,radius:16,background:'#f5f7f5',animation:'fade'},
  breadcrumb: {items:'首页|#\n灵感空间|#features\n当前页面',padding:20},
  pagination: {label:'作品列表',value:1,max:5,padding:20},
  rating: {label:'这次体验怎么样？',text:'你的反馈，让下一次体验更好。',value:4,padding:20},
};
export const createBlock = (type: BuiltinComponentType): Block => {
  const block: Block = { id: crypto.randomUUID(), type, props: JSON.parse(JSON.stringify(defaults[type])) };
  if (type === 'repeater') block.children = [
    { id: 'title', type: 'heading', props: { title: '条目标题', fontSize: 20, padding: 12 } },
    { id: 'description', type: 'text', props: { text: '条目描述', fontSize: 14, padding: 12 } },
    { id: 'more', type: 'button', props: { label: '查看详情', url: '/details/example', padding: 12, radius: 8 } },
  ];
  if (type === 'form') block.children = [
    { id: 'title', type: 'input', props: { label: '标题', name: 'title', text: '请输入标题', required: true, maxLength: 120, padding: 8 } },
    { id: 'description', type: 'textarea', props: { label: '描述', name: 'description', text: '补充说明（选填）', maxLength: 1000, padding: 8 } },
    { id: 'submit', type: 'button', props: { label: '提交', padding: 8, radius: 8 } },
  ];
  return block;
};
export const frameSizes: Record<ComponentType, {width:number;height:number}> = {
  ...Object.fromEntries(Object.entries(extendedComponents).map(([type, entry]) => [type, entry.frame])) as Record<ExtendedComponentType, {width:number;height:number}>,
  // hero fits its default copy even when the headline reaches its 58px cap (wide or scaled frames); image fits its caption.
  navbar:{width:1000,height:85},hero:{width:800,height:460},heading:{width:460,height:130},
  text:{width:380,height:160},button:{width:240,height:100},badge:{width:220,height:80},
  card:{width:400,height:260},image:{width:440,height:340},input:{width:330,height:130},
  accordion:{width:500,height:370},tabs:{width:420,height:300},switch:{width:340,height:120},
  alert:{width:400,height:170},separator:{width:360,height:48},footer:{width:1000,height:110},
  textarea:{width:400,height:230},select:{width:340,height:130},checkbox:{width:380,height:120},
  radio:{width:400,height:310},slider:{width:360,height:160},avatar:{width:340,height:120},
  progress:{width:380,height:150},statistic:{width:300,height:200},table:{width:560,height:310},
  timeline:{width:440,height:370},testimonial:{width:400,height:280},pricing:{width:360,height:480},
  breadcrumb:{width:440,height:90},pagination:{width:440,height:150},rating:{width:360,height:180},repeater:{width:560,height:820},form:{width:480,height:640},chart:{width:640,height:440},
  custom:{width:360,height:240},
};
export function defaultFrame(type: ComponentType, canvasWidth: number, x = 32, y = 32): BlockFrame {
  const size=frameSizes[type];const width=Math.min(canvasWidth,size.width);
  return {x:Math.max(0,Math.min(x,canvasWidth-width)),y:Math.max(0,y),width,height:size.height};
}
/** Upgrade older vertical documents and keep frames within the page margins. */
export function toFreeDocument(document: PageDocument): PageDocument {
  const { margin, width }=canvasBounds(document.settings);
  let cursor=margin,contentBottom=0;
  const blocks=document.blocks.map(block=>{
    if(block.frame){
      const scaled=(block.props.contentScale??100)>100;
      const frame=clampFrame(block.frame,scaled?document.settings:{...document.settings,canvasHeight:canvasLimits.maxHeight},block.props.contentScale);
      // Enlarging a component must not silently enlarge the page when it reloads.
      if(!scaled)contentBottom=Math.max(contentBottom,frame.y+frame.height);
      cursor=Math.max(cursor,(scaled?Math.min(frame.y+frame.height,document.settings.canvasHeight??1400):frame.y+frame.height)+16);
      return {...block,frame};
    }
    const frame=clampFrame({...defaultFrame(block.type,width,margin,cursor),x:margin,width},{...document.settings,canvasHeight:canvasLimits.maxHeight});
    contentBottom=Math.max(contentBottom,frame.y+frame.height);
    cursor+=frame.height+16;
    return {...block,frame};
  });
  return {...document,id:document.id??crypto.randomUUID(),settings:{...document.settings,layout:'free',canvasHeight:Math.min(canvasLimits.maxHeight,Math.max(document.settings.canvasHeight||1400,contentBottom+margin))},blocks};
}
export function createDocument(blank = false): PageDocument {
  const types:BuiltinComponentType[]=['navbar','hero','card','card','accordion','footer'];
  const frames:BlockFrame[]=[{x:0,y:0,width:1920,height:85},{x:480,y:100,width:960,height:460},{x:40,y:580,width:440,height:260},{x:520,y:580,width:440,height:260},{x:1040,y:580,width:800,height:370},{x:0,y:970,width:1920,height:110}];
  return {version:1,id:crypto.randomUUID(),name:blank?'未命名页面':'灵感，从这里开始',settings:{background:'#ffffff',accent:'#408668',maxWidth:defaultCanvasSize.width,padding:0,layout:'free',canvasHeight:defaultCanvasSize.height},blocks:blank?[]:types.map((type,i)=>{const block=createBlock(type);return {...block,frame:frames[i],props:i===3?{...block.props,title:'每一个细节，都有回应',text:'从轻盈的过渡到自然的反馈，让页面拥有自己的节奏。',background:'#f3f3ec'}:block.props};})};
}
export const blockName = (type: ComponentType) => type==='custom' ? '自定义组件' : catalog.find(c=>c.type===type)?.name ?? type;
/** Display name of a placed block; custom instances show their component name. */
export const blockLabel = (block: Pick<Block,'type'|'props'>) => block.type==='custom' ? block.props.custom?.name || '自定义组件' : blockName(block.type);
export function safeUrl(value?: string) {
  if (!value) return '#';
  if (/[\s\\\u0000-\u001f\u007f]/u.test(value)) return '#';
  if (value.startsWith('#') || (value.startsWith('/')&&!value.startsWith('//'))) return value;
  try {const url=new URL(value);if(['http:','https:'].includes(url.protocol)&&/^https?:\/\//i.test(value)&&url.hostname)return value;if(['mailto:','tel:'].includes(url.protocol)&&url.pathname)return value;} catch { /* Invalid URLs are inert in the preview. */ }
  return '#';
}
