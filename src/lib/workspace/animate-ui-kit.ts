import type { WorkspaceSpec } from '../../../shared/workspace.mjs';
import { commitWorkspaceGit } from '../../../shared/workspace.mjs';

export type AnimateUiComponentSpec = {
  id: string;
  name: string;
  category: '文字动效' | '数字动效' | '动效按钮' | '动态背景' | '交互容器';
  description: string;
  propsSignature: string;
  reactUsage: string;
  vueUsage: string;
};

export const ANIMATE_UI_WORKSPACE_COMPONENTS: AnimateUiComponentSpec[] = [
  {
    id: 'GradientText',
    name: '流光渐变文字 (GradientText)',
    category: '文字动效',
    description: '带动态流动渐变光泽的标题或重点文字组件，适合 Hero 主标题与品牌标语。',
    propsSignature: '{ text: string; gradient?: string; className?: string }',
    reactUsage: `<GradientText text="智能工作流引擎 2.0" />`,
    vueUsage: `<AnimateUi type="GradientText" text="智能工作流引擎 2.0" />`,
  },
  {
    id: 'ShimmeringText',
    name: '微光扫过文字 (ShimmeringText)',
    category: '文字动效',
    description: '高光束周期性扫过文字表面的精致动效，适合副标题、AI 状态提示与徽章文字。',
    propsSignature: '{ text: string; color?: string; shimmeringColor?: string; className?: string }',
    reactUsage: `<ShimmeringText text="AI 实时推理引擎已就绪" />`,
    vueUsage: `<AnimateUi type="ShimmeringText" text="AI 实时推理引擎已就绪" />`,
  },
  {
    id: 'TypingText',
    name: '打字机文字 (TypingText)',
    category: '文字动效',
    description: '逐字打印输出并带闪烁光标的动态文本组件，适合终端提示、AI 对话引导与动态标语。',
    propsSignature: '{ text: string; speed?: number; cursor?: boolean; className?: string }',
    reactUsage: `<TypingText text="正在为您实时编排多模态工作流…" cursor />`,
    vueUsage: `<AnimateUi type="TypingText" text="正在为您实时编排多模态工作流…" />`,
  },
  {
    id: 'CountingNumber',
    name: '动态跳动数字 (CountingNumber)',
    category: '数字动效',
    description: '从初始值平滑缓动增长到目标数值的 KPI 数字组件，适合数据看板与核心指标卡。',
    propsSignature: '{ number: number; prefix?: string; suffix?: string; decimals?: number; duration?: number }',
    reactUsage: `<CountingNumber number={12840} prefix="¥" suffix="+" />`,
    vueUsage: `<AnimateUi type="CountingNumber" :number="12840" prefix="¥" suffix="+" />`,
  },
  {
    id: 'SlidingNumber',
    name: '滚轮滑动数字 (SlidingNumber)',
    category: '数字动效',
    description: '每位数字独立上下滚动切换的里程碑/计数器组件，适合实时监控、价格切换与得展示。',
    propsSignature: '{ number: number; prefix?: string; suffix?: string }',
    reactUsage: `<SlidingNumber number={99.8} suffix="%" />`,
    vueUsage: `<AnimateUi type="SlidingNumber" :number="99.8" suffix="%" />`,
  },
  {
    id: 'RippleButton',
    name: '水波纹动效按钮 (RippleButton)',
    category: '动效按钮',
    description: '点击处向外扩散柔和波纹的交互按钮，支持主要/次要变体与图标组合。',
    propsSignature: '{ children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost"; className?: string }',
    reactUsage: `<RippleButton variant="primary" onClick={handleAction}>立即启动工作流</RippleButton>`,
    vueUsage: `<AnimateUi type="RippleButton" text="立即启动工作流" @click="handleAction" />`,
  },
  {
    id: 'LiquidButton',
    name: '液态填充按钮 (LiquidButton)',
    category: '动效按钮',
    description: '悬停时液态色彩从底部平滑涌起填充的高级按钮，适合核心 CTA 操作。',
    propsSignature: '{ children: ReactNode; onClick?: () => void; className?: string }',
    reactUsage: `<LiquidButton onClick={handleOpen}>探索完整方案</LiquidButton>`,
    vueUsage: `<AnimateUi type="LiquidButton" text="探索完整方案" @click="handleOpen" />`,
  },
  {
    id: 'FlipButton',
    name: '3D 翻转按钮 (FlipButton)',
    category: '动效按钮',
    description: '悬停时正反双面 3D 翻转切换文案的动效按钮，适合状态切换与行动召唤。',
    propsSignature: '{ frontText: string; backText: string; onClick?: () => void; className?: string }',
    reactUsage: `<FlipButton frontText="查看技术架构" backText="立即展开详情 →" onClick={handleOpen} />`,
    vueUsage: `<AnimateUi type="FlipButton" text="查看技术架构" backText="立即展开详情 →" @click="handleOpen" />`,
  },
  {
    id: 'StarsBackground',
    name: '星空粒子背景 (StarsBackground)',
    category: '动态背景',
    description: '多层视差闪烁星群与流光背景容器，适合深色科技感 Hero 横幅或数据大屏背景。',
    propsSignature: '{ children?: ReactNode; starCount?: number; className?: string }',
    reactUsage: `<StarsBackground className="hero-banner">{children}</StarsBackground>`,
    vueUsage: `<AnimateUi type="StarsBackground"><slot /></AnimateUi>`,
  },
  {
    id: 'BubbleBackground',
    name: '流体光斑背景 (BubbleBackground)',
    category: '动态背景',
    description: '柔和漂浮的渐变极光气泡背景容器，适合现代 SaaS 首屏、登录卡片与高亮模块。',
    propsSignature: '{ children?: ReactNode; className?: string }',
    reactUsage: `<BubbleBackground className="hero-banner">{children}</BubbleBackground>`,
    vueUsage: `<AnimateUi type="BubbleBackground"><slot /></AnimateUi>`,
  },
  {
    id: 'GradientBackground',
    name: '极光网格背景 (GradientBackground)',
    category: '动态背景',
    description: '多色平滑流转的动态极光渐变背景面板，支持自适应内部内容布局。',
    propsSignature: '{ children?: ReactNode; className?: string }',
    reactUsage: `<GradientBackground className="feature-banner">{children}</GradientBackground>`,
    vueUsage: `<AnimateUi type="GradientBackground"><slot /></AnimateUi>`,
  },
  {
    id: 'HexagonBackground',
    name: '几何蜂巢背景 (HexagonBackground)',
    category: '动态背景',
    description: '带呼吸光效的几何网格装饰背景，适合开发者工具、安全监控与架构模块。',
    propsSignature: '{ children?: ReactNode; className?: string }',
    reactUsage: `<HexagonBackground>{children}</HexagonBackground>`,
    vueUsage: `<AnimateUi type="HexagonBackground"><slot /></AnimateUi>`,
  },
  {
    id: 'AnimateCard',
    name: '悬浮流光卡片 (AnimateCard)',
    category: '交互容器',
    description: '带悬停微抬升、光泽边框与春季阻尼过渡的交互卡片容器。',
    propsSignature: '{ title?: string; subtitle?: string; badge?: string; children?: ReactNode; onClick?: () => void; className?: string }',
    reactUsage: `<AnimateCard title="智能调度中心" badge="运行中" subtitle="实时吞吐 99.98%">{children}</AnimateCard>`,
    vueUsage: `<AnimateUi type="AnimateCard" title="智能调度中心" badge="运行中"><slot /></AnimateUi>`,
  },
  {
    id: 'AnimateTabs',
    name: '弹簧胶囊标签页 (AnimateTabs)',
    category: '交互容器',
    description: '带平滑胶囊指示器过渡的交互式标签切换组件，支持受控或非受控切换。',
    propsSignature: '{ tabs: Array<{ id: string; label: string; badge?: string | number; content?: ReactNode }>; activeTab?: string; onChange?: (id: string) => void }',
    reactUsage: `<AnimateTabs tabs={[{ id: 'all', label: '全部模块', badge: 6 }, { id: 'ai', label: 'AI 引擎', badge: 3 }]} activeTab={tab} onChange={setTab} />`,
    vueUsage: `<AnimateUi type="AnimateTabs" :tabs="tabs" :activeTab="tab" @change="tab = $event" />`,
  },
  {
    id: 'AnimateAccordion',
    name: '动效手风琴面板 (AnimateAccordion)',
    category: '交互容器',
    description: '带平滑高度展开与箭头旋转动效的手风琴折叠列表，适合 FAQ、配置项与步骤详情。',
    propsSignature: '{ items: Array<{ id: string; title: string; content: string }>; defaultOpenId?: string }',
    reactUsage: `<AnimateAccordion items={[{ id: 'q1', title: '如何接入工作流？', content: '支持一键导出原生 React/Vue/HTML 代码。' }]} />`,
    vueUsage: `<AnimateUi type="AnimateAccordion" :items="faqItems" />`,
  },
  {
    id: 'AnimateModal',
    name: '动效毛玻璃弹窗 (AnimateModal)',
    category: '交互容器',
    description: '带背景模糊、ESC 关闭与弹簧缩放进场动画的模态对话框组件。',
    propsSignature: '{ open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }',
    reactUsage: `<AnimateModal open={Boolean(selected)} title="模块详情" onClose={() => setSelected(null)}>{children}</AnimateModal>`,
    vueUsage: `<AnimateUi type="AnimateModal" :open="Boolean(selected)" title="模块详情" @close="selected = null"><slot /></AnimateUi>`,
  },
  {
    id: 'CodeBlock',
    name: '多色高亮代码块 (CodeBlock)',
    category: '交互容器',
    description: '带语法高亮、行号展示与一键复制按钮的代码展示组件。',
    propsSignature: '{ code: string; lang?: string; title?: string; copyButton?: boolean }',
    reactUsage: `<CodeBlock title="config.ts" lang="ts" code={snippet} />`,
    vueUsage: `<AnimateUi type="CodeBlock" title="config.ts" lang="ts" :code="snippet" />`,
  },
];

/** Map catalog block types from the left component library to Animate UI workspace component IDs. */
const CATALOG_TO_WORKSPACE_MAP: Record<string, string> = {
  gradientText: 'GradientText',
  shimmeringText: 'ShimmeringText',
  typingText: 'TypingText',
  slidingText: 'GradientText',
  rollingText: 'GradientText',
  morphingText: 'GradientText',
  rotatingText: 'GradientText',
  splittingText: 'ShimmeringText',
  swappingText: 'GradientText',
  countingNumber: 'CountingNumber',
  slidingNumber: 'SlidingNumber',
  scrollingNumber: 'CountingNumber',
  rippleButton: 'RippleButton',
  liquidButton: 'LiquidButton',
  flipButton: 'FlipButton',
  button: 'RippleButton',
  starsBackground: 'StarsBackground',
  bubbleBackground: 'BubbleBackground',
  gradientBackground: 'GradientBackground',
  hexagonBackground: 'HexagonBackground',
  fireworksBackground: 'StarsBackground',
  glyphBackground: 'HexagonBackground',
  gravityStarsBackground: 'StarsBackground',
  holeBackground: 'BubbleBackground',
  topographyBackground: 'GradientBackground',
  card: 'AnimateCard',
  tabs: 'AnimateTabs',
  accordion: 'AnimateAccordion',
  codeBlock: 'CodeBlock',
};

export function mapCatalogTypeToAnimateUiId(catalogType: string): string {
  return CATALOG_TO_WORKSPACE_MAP[catalogType] || 'AnimateCard';
}

export const ANIMATE_UI_BASE_CSS = `
/* === Animate UI Workspace Runtime Styles === */
@keyframes aui-gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes aui-shimmer-sweep {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes aui-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes aui-ripple-expand {
  0% { transform: scale(0); opacity: 0.45; }
  100% { transform: scale(3.8); opacity: 0; }
}
@keyframes aui-float-bubble {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(18px, -16px, 0) scale(1.08); }
}
@keyframes aui-star-twinkle {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes aui-modal-in {
  0% { opacity: 0; transform: translateY(10px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.aui-gradient-text {
  display: inline-block;
  background: linear-gradient(90deg, #4f46e5, #06b6d4, #ec4899, #4f46e5);
  background-size: 260% 260%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: aui-gradient-shift 6s ease infinite;
  font-weight: 800;
}

.aui-shimmer-text {
  display: inline-block;
  background: linear-gradient(110deg, currentColor 35%, #38bdf8 50%, currentColor 65%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: aui-shimmer-sweep 3.2s linear infinite;
  font-weight: 600;
}

.aui-typing-cursor {
  display: inline-block;
  margin-left: 2px;
  font-weight: 700;
  color: #4f46e5;
  animation: aui-cursor-blink 0.9s step-end infinite;
}

.aui-number-counter {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.aui-ripple-btn {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.aui-ripple-btn:active { transform: scale(0.98); }
.aui-ripple-btn--primary {
  background: linear-gradient(135deg, #4f46e5, #2563eb);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.28);
}
.aui-ripple-btn--primary:hover {
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.38);
  transform: translateY(-1px);
}
.aui-ripple-btn--secondary {
  background: rgba(15, 23, 42, 0.05);
  border-color: rgba(148, 163, 184, 0.35);
  color: inherit;
}
.aui-ripple-btn--ghost {
  background: transparent;
  color: inherit;
}
.aui-ripple-wave {
  position: absolute;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  width: 24px;
  height: 24px;
  pointer-events: none;
  animation: aui-ripple-expand 0.6s ease-out forwards;
}

.aui-liquid-btn {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 999px;
  border: 1.5px solid #4f46e5;
  background: transparent;
  color: #4f46e5;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.28s ease, transform 0.2s ease;
  z-index: 1;
}
.aui-liquid-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #4f46e5, #06b6d4);
  transform: translateY(102%);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: -1;
}
.aui-liquid-btn:hover { color: #ffffff; transform: translateY(-1px); }
.aui-liquid-btn:hover::before { transform: translateY(0%); }

.aui-flip-btn {
  position: relative;
  display: inline-grid;
  perspective: 600px;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.aui-flip-btn-inner {
  display: grid;
  transform-style: preserve-3d;
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
.aui-flip-btn:hover .aui-flip-btn-inner { transform: rotateX(180deg); }
.aui-flip-face {
  grid-area: 1 / 1;
  backface-visibility: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}
.aui-flip-front {
  background: #0f172a;
  color: #ffffff;
}
.aui-flip-back {
  background: linear-gradient(135deg, #4f46e5, #06b6d4);
  color: #ffffff;
  transform: rotateX(180deg);
}

.aui-bg-surface {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  padding: clamp(20px, 3.5vw, 40px);
}
.aui-bg-stars {
  background: radial-gradient(ellipse at top, #1e1b4b 0%, #090d16 100%);
  color: #f8fafc;
}
.aui-star-dot {
  position: absolute;
  border-radius: 999px;
  background: #ffffff;
  pointer-events: none;
  animation: aui-star-twinkle 3.4s ease-in-out infinite;
}
.aui-bg-bubble {
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(6, 182, 212, 0.1));
  border: 1px solid rgba(99, 102, 241, 0.18);
}
.aui-bubble-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(36px);
  pointer-events: none;
  opacity: 0.45;
  animation: aui-float-bubble 8s ease-in-out infinite;
}
.aui-bg-gradient {
  background: linear-gradient(125deg, #312e81 0%, #1e3a8a 45%, #0f766e 100%);
  background-size: 220% 220%;
  animation: aui-gradient-shift 9s ease infinite;
  color: #ffffff;
}
.aui-bg-hexagon {
  background-color: #0f172a;
  background-image: radial-gradient(rgba(56, 189, 248, 0.22) 1px, transparent 1px);
  background-size: 20px 20px;
  color: #f8fafc;
}
.aui-bg-content {
  position: relative;
  z-index: 2;
}

.aui-card {
  position: relative;
  border-radius: 16px;
  padding: 20px;
  background: var(--ws-surface, #ffffff);
  border: 1px solid rgba(148, 163, 184, 0.24);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.24s ease, border-color 0.24s ease;
}
.aui-card:hover {
  transform: translateY(-3px);
  border-color: rgba(79, 70, 229, 0.42);
  box-shadow: 0 12px 30px rgba(79, 70, 229, 0.11);
}
.aui-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.aui-card-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
}

.aui-tabs-bar {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.14);
}
.aui-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 9px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}
.aui-tab-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.09);
}
.aui-tab-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
}

.aui-accordion {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.aui-accordion-item {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 12px;
  background: var(--ws-surface, #ffffff);
  overflow: hidden;
}
.aui-accordion-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.aui-accordion-body {
  padding: 0 16px 14px;
  font-size: 13px;
  line-height: 1.65;
  opacity: 0.85;
}

.aui-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(15, 23, 42, 0.52);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.aui-modal-dialog {
  width: min(560px, 100%);
  max-height: 86vh;
  overflow: auto;
  border-radius: 18px;
  background: #ffffff;
  color: #0f172a;
  padding: 22px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.26);
  animation: aui-modal-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.aui-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.aui-code-block {
  position: relative;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 14px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  overflow: auto;
}
`;

export const ANIMATE_UI_REACT_SOURCE = `import React, { useEffect, useState } from 'react';

export function GradientText({
  text,
  children,
  className = '',
  style,
}: {
  text?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={\`aui-gradient-text \${className}\`.trim()} style={style} data-animate-ui="GradientText">
      {text ?? children}
    </span>
  );
}

export function ShimmeringText({
  text,
  children,
  className = '',
  style,
}: {
  text?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={\`aui-shimmer-text \${className}\`.trim()} style={style} data-animate-ui="ShimmeringText">
      {text ?? children}
    </span>
  );
}

export function TypingText({
  text = '',
  children,
  speed = 45,
  cursor = true,
  className = '',
}: {
  text?: string;
  children?: React.ReactNode;
  speed?: number;
  cursor?: boolean;
  className?: string;
}) {
  const fullText = typeof text === 'string' && text.length > 0 ? text : typeof children === 'string' ? children : '';
  const [index, setIndex] = useState(fullText.length);
  useEffect(() => {
    setIndex(0);
    const timer = window.setInterval(() => {
      setIndex(prev => (prev < fullText.length ? prev + 1 : prev));
    }, Math.max(16, speed));
    return () => window.clearInterval(timer);
  }, [fullText, speed]);

  return (
    <span className={className} data-animate-ui="TypingText">
      {fullText.slice(0, index || fullText.length)}
      {cursor && <span className="aui-typing-cursor">|</span>}
    </span>
  );
}

export function CountingNumber({
  number,
  value: propValue,
  fromNumber = 0,
  duration = 900,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}: {
  number?: number;
  value?: number;
  fromNumber?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const target = typeof number === 'number' && Number.isFinite(number) ? number : typeof propValue === 'number' && Number.isFinite(propValue) ? propValue : 0;
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / Math.max(120, duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(fromNumber + (target - fromNumber) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, fromNumber, duration]);

  const formatted = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
  return (
    <span className={\`aui-number-counter \${className}\`.trim()} data-animate-ui="CountingNumber">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export function SlidingNumber({
  number,
  value,
  prefix = '',
  suffix = '',
  className = '',
}: {
  number?: number;
  value?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const target = typeof number === 'number' ? number : typeof value === 'number' ? value : 0;
  return (
    <CountingNumber
      number={target}
      decimals={Number.isInteger(target) ? 0 : 1}
      prefix={prefix}
      suffix={suffix}
      className={className}
    />
  );
}

export function RippleButton({
  children,
  onClick,
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  return (
    <button
      type={type}
      className={\`aui-ripple-btn aui-ripple-btn--\${variant} \${className}\`.trim()}
      data-animate-ui="RippleButton"
      onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        const id = Date.now() + Math.random();
        setRipples(prev => [...prev.slice(-3), { id, x: e.clientX - rect.left - 12, y: e.clientY - rect.top - 12 }]);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
      {ripples.map(r => (
        <span key={r.id} className="aui-ripple-wave" style={{ left: r.x, top: r.y }} />
      ))}
    </button>
  );
}

export function LiquidButton({
  children,
  onClick,
  className = '',
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={\`aui-liquid-btn \${className}\`.trim()}
      data-animate-ui="LiquidButton"
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

export function FlipButton({
  frontText,
  text,
  backText,
  children,
  onClick,
  className = '',
}: {
  frontText?: string;
  text?: string;
  backText?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const front = frontText || text || (typeof children === 'string' ? children : '查看详情');
  return (
    <button type="button" className={\`aui-flip-btn \${className}\`.trim()} onClick={onClick} data-animate-ui="FlipButton">
      <span className="aui-flip-btn-inner">
        <span className="aui-flip-face aui-flip-front">{front}</span>
        <span className="aui-flip-face aui-flip-back">{backText || front}</span>
      </span>
    </button>
  );
}

export function StarsBackground({
  children,
  starCount = 24,
  className = '',
}: {
  children?: React.ReactNode;
  starCount?: number;
  className?: string;
}) {
  const stars = Array.from({ length: starCount }, (_, i) => ({
    id: i,
    left: \`\${(i * 37) % 98}%\`,
    top: \`\${(i * 53) % 94}%\`,
    size: (i % 3) + 2,
    delay: \`\${(i % 5) * 0.6}s\`,
  }));
  return (
    <div className={\`aui-bg-surface aui-bg-stars \${className}\`.trim()} data-animate-ui="StarsBackground">
      {stars.map(s => (
        <span
          key={s.id}
          className="aui-star-dot"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
        />
      ))}
      <div className="aui-bg-content">{children}</div>
    </div>
  );
}

export function BubbleBackground({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={\`aui-bg-surface aui-bg-bubble \${className}\`.trim()} data-animate-ui="BubbleBackground">
      <span className="aui-bubble-orb" style={{ width: 220, height: 220, left: '-40px', top: '-40px', background: '#6366f1' }} />
      <span className="aui-bubble-orb" style={{ width: 200, height: 200, right: '-30px', bottom: '-40px', background: '#06b6d4', animationDelay: '2s' }} />
      <div className="aui-bg-content">{children}</div>
    </div>
  );
}

export function GradientBackground({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={\`aui-bg-surface aui-bg-gradient \${className}\`.trim()} data-animate-ui="GradientBackground">
      <div className="aui-bg-content">{children}</div>
    </div>
  );
}

export function HexagonBackground({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={\`aui-bg-surface aui-bg-hexagon \${className}\`.trim()} data-animate-ui="HexagonBackground">
      <div className="aui-bg-content">{children}</div>
    </div>
  );
}

export function AnimateCard({
  title,
  subtitle,
  badge,
  children,
  onClick,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  badge?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <article className={\`aui-card \${className}\`.trim()} onClick={onClick} data-animate-ui="AnimateCard">
      {(title || badge) && (
        <div className="aui-card-head">
          {title && <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{title}</h3>}
          {badge && <span className="aui-card-badge">{badge}</span>}
        </div>
      )}
      {subtitle && <p style={{ margin: '0 0 12px', fontSize: '13px', opacity: 0.72 }}>{subtitle}</p>}
      {children}
    </article>
  );
}

export function AnimateTabs({
  tabs,
  items,
  activeTab,
  onChange,
  className = '',
}: {
  tabs?: Array<{ id: string; label: string; badge?: string | number; content?: React.ReactNode }>;
  items?: Array<{ id: string; label?: string; title?: string; badge?: string | number; content?: React.ReactNode }>;
  activeTab?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const list = Array.isArray(tabs)
    ? tabs
    : Array.isArray(items)
    ? items.map(it => ({ ...it, label: it.label ?? it.title ?? it.id }))
    : [];
  const [internal, setInternal] = useState(list[0]?.id ?? '');
  const current = activeTab ?? internal;
  const activeItem = list.find(t => t.id === current) ?? list[0];
  return (
    <div className={className} data-animate-ui="AnimateTabs">
      <div className="aui-tabs-bar" role="tablist">
        {list.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            className={\`aui-tab-btn \${current === t.id ? 'active' : ''}\`}
            onClick={() => {
              setInternal(t.id);
              onChange?.(t.id);
            }}
          >
            <span>{t.label}</span>
            {t.badge !== undefined && <span className="aui-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      {activeItem?.content && <div style={{ marginTop: 14 }}>{activeItem.content}</div>}
    </div>
  );
}

export function AnimateAccordion({
  items = [],
  defaultOpenId,
  className = '',
}: {
  items?: Array<{ id: string; title: string; content: string }>;
  defaultOpenId?: string;
  className?: string;
}) {
  const list = Array.isArray(items) ? items : [];
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? list[0]?.id ?? null);
  return (
    <div className={\`aui-accordion \${className}\`.trim()} data-animate-ui="AnimateAccordion">
      {list.map(item => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="aui-accordion-item">
            <button
              type="button"
              className="aui-accordion-trigger"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : item.id)}
            >
              <span>{item.title}</span>
              <span>{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && <div className="aui-accordion-body">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function AnimateModal({
  open,
  isOpen,
  title = '详情',
  onClose,
  children,
  footer,
}: {
  open?: boolean;
  isOpen?: boolean;
  title?: string;
  onClose?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!(open ?? isOpen)) return null;
  return (
    <div className="aui-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" data-animate-ui="AnimateModal">
      <div className="aui-modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="aui-modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            style={{ border: 0, background: 'rgba(148,163,184,0.16)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
        {footer && <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

export function CodeBlock({
  code = '',
  children,
  title,
  lang = 'tsx',
}: {
  code?: string;
  children?: React.ReactNode;
  title?: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);
  const textContent = typeof code === 'string' && code ? code : typeof children === 'string' ? children : '';
  return (
    <div className="aui-code-block" data-animate-ui="CodeBlock" data-lang={lang}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11, opacity: 0.75 }}>
          <span>{title}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(textContent);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'inherit', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', fontSize: 11 }}
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      )}
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        <code>{textContent}</code>
      </pre>
    </div>
  );
}

export const HighlightText = GradientText;
export const SlidingText = GradientText;
export const RollingText = GradientText;
export const MorphingText = GradientText;
export const RotatingText = GradientText;
export const SplittingText = ShimmeringText;
export const SwappingText = GradientText;
export const ScrollingNumber = CountingNumber;
export const FireworksBackground = StarsBackground;
export const GravityStarsBackground = StarsBackground;
export const HoleBackground = BubbleBackground;
export const TopographyBackground = GradientBackground;
export const GlyphBackground = HexagonBackground;
export const Card = AnimateCard;
export const Button = RippleButton;
export const Tabs = AnimateTabs;
export const Accordion = AnimateAccordion;
export const Modal = AnimateModal;
export const Dialog = AnimateModal;

export function Badge({
  children,
  text,
  label,
  className = '',
  style,
}: {
  children?: React.ReactNode;
  text?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={\`aui-card-badge \${className}\`.trim()} style={style} data-animate-ui="Badge">
      {label ?? text ?? children}
    </span>
  );
}

export function Alert({
  title,
  text,
  children,
  className = '',
  style,
}: {
  title?: string;
  text?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={\`aui-card \${className}\`.trim()} style={style} data-animate-ui="Alert">
      {title && <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>}
      <div>{text ?? children}</div>
    </div>
  );
}

export const SpotlightCard = AnimateCard;
export const GlowCard = AnimateCard;
export const TiltCard = AnimateCard;
export const MarqueeBanner = AnimateCard;
export const AuroraBackground = GradientBackground;
export const ParticlesBackground = StarsBackground;
export const GridBackground = HexagonBackground;
export const MagneticButton = RippleButton;
export const AnimateProgress = CountingNumber;
export const AnimateSwitch = RippleButton;
export const AnimateBadge = Badge;
export const AnimateAvatarGroup = AnimateCard;
export const AnimateTooltip = AnimateCard;
export const SpringContainer = AnimateCard;
export const StaggerGroup = AnimateCard;
export const Progress = CountingNumber;
export const Switch = RippleButton;
export const Tooltip = AnimateCard;

export function AnimateUi(props: Record<string, unknown>) {
  return <AnimateCard {...(props as any)} />;
}

export default AnimateUi;
`;

export const ANIMATE_UI_VUE_MODULE_SOURCE = `import { defineComponent, h, ref } from 'vue';

function makeVueAui(defaultType = 'AnimateCard') {
  return defineComponent({
    name: defaultType,
    props: {
      type: { type: String, default: defaultType },
      text: { type: String, default: '' },
      frontText: { type: String, default: '' },
      backText: { type: String, default: '' },
      title: { type: String, default: '' },
      subtitle: { type: String, default: '' },
      badge: { type: [String, Number], default: '' },
      label: { type: String, default: '' },
      number: { type: Number, default: 0 },
      value: { type: Number, default: undefined },
      prefix: { type: String, default: '' },
      suffix: { type: String, default: '' },
      open: { type: Boolean, default: false },
      code: { type: String, default: '' },
      tabs: { type: Array, default: () => [] },
      activeTab: { type: String, default: '' },
      items: { type: Array, default: () => [] },
      variant: { type: String, default: 'primary' },
    },
    emits: ['click', 'close', 'change'],
    setup(props, { slots, emit }) {
      const openAccordionId = ref(props.items?.[0]?.id ?? '');
      return () => {
        const kind = props.type || defaultType;
        if (kind === 'GradientText' || kind === 'HighlightText' || kind === 'SlidingText' || kind === 'RollingText' || kind === 'MorphingText' || kind === 'RotatingText' || kind === 'SwappingText') {
          return h('span', { class: 'aui-gradient-text', 'data-animate-ui': kind }, [props.text, slots.default?.()]);
        }
        if (kind === 'ShimmeringText' || kind === 'SplittingText') {
          return h('span', { class: 'aui-shimmer-text', 'data-animate-ui': kind }, [props.text, slots.default?.()]);
        }
        if (kind === 'TypingText') {
          return h('span', { 'data-animate-ui': 'TypingText' }, [props.text, slots.default?.(), h('span', { class: 'aui-typing-cursor' }, '|')]);
        }
        if (kind === 'CountingNumber' || kind === 'SlidingNumber' || kind === 'ScrollingNumber') {
          const num = typeof props.value === 'number' ? props.value : Number(props.number || 0);
          return h('span', { class: 'aui-number-counter', 'data-animate-ui': kind }, \`\${props.prefix}\${num.toLocaleString()}\${props.suffix}\`);
        }
        if (kind === 'RippleButton' || kind === 'Button') {
          return h('button', { type: 'button', class: \`aui-ripple-btn aui-ripple-btn--\${props.variant || 'primary'}\`, 'data-animate-ui': 'RippleButton', onClick: () => emit('click') }, [props.text || props.label, slots.default?.()]);
        }
        if (kind === 'LiquidButton') {
          return h('button', { type: 'button', class: 'aui-liquid-btn', 'data-animate-ui': 'LiquidButton', onClick: () => emit('click') }, [props.text || props.label, slots.default?.()]);
        }
        if (kind === 'FlipButton') {
          const front = props.frontText || props.text || props.label || '查看详情';
          return h('button', { type: 'button', class: 'aui-flip-btn', 'data-animate-ui': 'FlipButton', onClick: () => emit('click') }, [
            h('span', { class: 'aui-flip-btn-inner' }, [
              h('span', { class: 'aui-flip-face aui-flip-front' }, front),
              h('span', { class: 'aui-flip-face aui-flip-back' }, props.backText || front),
            ]),
          ]);
        }
        if (kind === 'StarsBackground' || kind === 'BubbleBackground' || kind === 'GradientBackground' || kind === 'HexagonBackground' || kind === 'FireworksBackground' || kind === 'GravityStarsBackground' || kind === 'HoleBackground' || kind === 'TopographyBackground' || kind === 'GlyphBackground') {
          const bgClass = kind.includes('Bubble') || kind.includes('Hole') ? 'aui-bg-bubble' : kind.includes('Gradient') || kind.includes('Topography') ? 'aui-bg-gradient' : kind.includes('Hexagon') || kind.includes('Glyph') ? 'aui-bg-hexagon' : 'aui-bg-stars';
          return h('div', { class: ['aui-bg-surface', bgClass], 'data-animate-ui': kind }, [
            h('div', { class: 'aui-bg-content' }, slots.default?.()),
          ]);
        }
        if (kind === 'AnimateTabs' || kind === 'Tabs') {
          const list = Array.isArray(props.tabs) && props.tabs.length ? props.tabs : Array.isArray(props.items) ? props.items : [];
          return h('div', { class: 'aui-tabs-bar', role: 'tablist', 'data-animate-ui': 'AnimateTabs' }, list.map((t) =>
            h('button', {
              key: t.id,
              type: 'button',
              class: ['aui-tab-btn', props.activeTab === t.id ? 'active' : ''],
              onClick: () => emit('change', t.id),
            }, [
              h('span', t.label || t.title),
              t.badge !== undefined ? h('span', { class: 'aui-tab-badge' }, String(t.badge)) : null,
            ])
          ));
        }
        if (kind === 'AnimateAccordion' || kind === 'Accordion') {
          const list = Array.isArray(props.items) ? props.items : [];
          return h('div', { class: 'aui-accordion', 'data-animate-ui': 'AnimateAccordion' }, list.map((item) =>
            h('div', { key: item.id, class: 'aui-accordion-item' }, [
              h('button', {
                type: 'button',
                class: 'aui-accordion-trigger',
                onClick: () => { openAccordionId.value = openAccordionId.value === item.id ? '' : item.id; },
              }, [
                h('span', item.title),
                h('span', openAccordionId.value === item.id ? '−' : '+'),
              ]),
              openAccordionId.value === item.id ? h('div', { class: 'aui-accordion-body' }, item.content) : null,
            ])
          ));
        }
        if (kind === 'AnimateModal' || kind === 'Modal' || kind === 'Dialog') {
          if (!props.open) return null;
          return h('div', { class: 'aui-modal-backdrop', 'data-animate-ui': 'AnimateModal', onClick: () => emit('close') }, [
            h('div', { class: 'aui-modal-dialog', onClick: (e) => e.stopPropagation() }, [
              h('div', { class: 'aui-modal-header' }, [
                h('h3', { style: 'margin:0;font-size:18px;font-weight:700' }, props.title || '详情'),
                h('button', { type: 'button', onClick: () => emit('close') }, '✕'),
              ]),
              slots.default?.(),
            ]),
          ]);
        }
        if (kind === 'CodeBlock') {
          return h('div', { class: 'aui-code-block', 'data-animate-ui': 'CodeBlock' }, [
            h('pre', { style: 'margin:0;white-space:pre-wrap' }, [h('code', props.code || slots.default?.())]),
          ]);
        }
        if (kind === 'Badge') {
          return h('span', { class: 'aui-card-badge', 'data-animate-ui': 'Badge' }, [props.label || props.text, slots.default?.()]);
        }
        return h('article', { class: 'aui-card', 'data-animate-ui': 'AnimateCard', onClick: () => emit('click') }, [
          (props.title || props.badge) ? h('div', { class: 'aui-card-head' }, [
            props.title ? h('h3', { style: 'margin:0;font-size:16px;font-weight:700' }, props.title) : null,
            props.badge ? h('span', { class: 'aui-card-badge' }, String(props.badge)) : null,
          ]) : null,
          props.subtitle ? h('p', { style: 'margin:0 0 12px;font-size:13px;opacity:0.72' }, props.subtitle) : null,
          slots.default?.(),
        ]);
      };
    },
  });
}

export const AnimateUi = makeVueAui('AnimateCard');
export const GradientText = makeVueAui('GradientText');
export const ShimmeringText = makeVueAui('ShimmeringText');
export const TypingText = makeVueAui('TypingText');
export const CountingNumber = makeVueAui('CountingNumber');
export const SlidingNumber = makeVueAui('SlidingNumber');
export const ScrollingNumber = makeVueAui('ScrollingNumber');
export const RippleButton = makeVueAui('RippleButton');
export const LiquidButton = makeVueAui('LiquidButton');
export const FlipButton = makeVueAui('FlipButton');
export const StarsBackground = makeVueAui('StarsBackground');
export const BubbleBackground = makeVueAui('BubbleBackground');
export const GradientBackground = makeVueAui('GradientBackground');
export const HexagonBackground = makeVueAui('HexagonBackground');
export const FireworksBackground = makeVueAui('FireworksBackground');
export const GravityStarsBackground = makeVueAui('GravityStarsBackground');
export const HoleBackground = makeVueAui('HoleBackground');
export const TopographyBackground = makeVueAui('TopographyBackground');
export const GlyphBackground = makeVueAui('GlyphBackground');
export const AnimateCard = makeVueAui('AnimateCard');
export const AnimateTabs = makeVueAui('AnimateTabs');
export const AnimateAccordion = makeVueAui('AnimateAccordion');
export const AnimateModal = makeVueAui('AnimateModal');
export const CodeBlock = makeVueAui('CodeBlock');
export const HighlightText = GradientText;
export const SlidingText = GradientText;
export const RollingText = GradientText;
export const MorphingText = GradientText;
export const RotatingText = GradientText;
export const SplittingText = ShimmeringText;
export const SwappingText = GradientText;
export const Card = AnimateCard;
export const SpotlightCard = AnimateCard;
export const GlowCard = AnimateCard;
export const TiltCard = AnimateCard;
export const MarqueeBanner = AnimateCard;
export const AuroraBackground = GradientBackground;
export const ParticlesBackground = StarsBackground;
export const GridBackground = HexagonBackground;
export const MagneticButton = RippleButton;
export const AnimateProgress = CountingNumber;
export const AnimateSwitch = RippleButton;
export const AnimateBadge = makeVueAui('Badge');
export const AnimateAvatarGroup = AnimateCard;
export const AnimateTooltip = AnimateCard;
export const SpringContainer = AnimateCard;
export const StaggerGroup = AnimateCard;
export const Progress = CountingNumber;
export const Switch = RippleButton;
export const Tooltip = AnimateCard;
export const Button = RippleButton;
export const Tabs = AnimateTabs;
export const Accordion = AnimateAccordion;
export const Modal = AnimateModal;
export const Dialog = AnimateModal;
export const Badge = makeVueAui('Badge');
export const Alert = AnimateCard;
export default AnimateUi;
`;

export const ANIMATE_UI_VUE_SOURCE = `<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';

const props = withDefaults(defineProps<{
  type?: 'GradientText' | 'ShimmeringText' | 'TypingText' | 'CountingNumber' | 'SlidingNumber' | 'RippleButton' | 'LiquidButton' | 'FlipButton' | 'StarsBackground' | 'BubbleBackground' | 'GradientBackground' | 'HexagonBackground' | 'AnimateCard' | 'AnimateTabs' | 'AnimateAccordion' | 'AnimateModal' | 'CodeBlock';
  text?: string;
  backText?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  number?: number;
  prefix?: string;
  suffix?: string;
  open?: boolean;
  code?: string;
  tabs?: Array<{ id: string; label: string; badge?: string | number }>;
  activeTab?: string;
  items?: Array<{ id: string; title: string; content: string }>;
}>(), {
  type: 'AnimateCard',
  text: '',
  number: 0,
  prefix: '',
  suffix: '',
  open: false,
});

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'close'): void;
  (e: 'change', id: string): void;
}>();

const displayNum = ref(0);
const typedLen = ref(0);
const openAccordionId = ref(props.items?.[0]?.id ?? '');

function animateNumber(target: number) {
  displayNum.value = target;
  if (typeof requestAnimationFrame === 'undefined') return;
  const start = performance.now();
  const from = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / 800);
    displayNum.value = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

onMounted(() => {
  if (props.type === 'CountingNumber' || props.type === 'SlidingNumber') {
    animateNumber(props.number ?? 0);
  }
  if (props.type === 'TypingText' && props.text) {
    typedLen.value = props.text.length;
  }
});

watch(() => props.number, val => {
  if (typeof val === 'number') animateNumber(val);
});
</script>

<template>
  <span v-if="type === 'GradientText'" class="aui-gradient-text" data-animate-ui="GradientText">{{ text }}<slot /></span>
  <span v-else-if="type === 'ShimmeringText'" class="aui-shimmer-text" data-animate-ui="ShimmeringText">{{ text }}<slot /></span>
  <span v-else-if="type === 'TypingText'" data-animate-ui="TypingText">{{ (text || '').slice(0, typedLen || (text || '').length) }}<span class="aui-typing-cursor">|</span></span>
  <span v-else-if="type === 'CountingNumber' || type === 'SlidingNumber'" class="aui-number-counter" :data-animate-ui="type">{{ prefix }}{{ displayNum.toLocaleString() }}{{ suffix }}</span>
  <button v-else-if="type === 'RippleButton'" type="button" class="aui-ripple-btn aui-ripple-btn--primary" data-animate-ui="RippleButton" @click="emit('click')">{{ text }}<slot /></button>
  <button v-else-if="type === 'LiquidButton'" type="button" class="aui-liquid-btn" data-animate-ui="LiquidButton" @click="emit('click')">{{ text }}<slot /></button>
  <button v-else-if="type === 'FlipButton'" type="button" class="aui-flip-btn" data-animate-ui="FlipButton" @click="emit('click')">
    <span class="aui-flip-btn-inner">
      <span class="aui-flip-face aui-flip-front">{{ text }}</span>
      <span class="aui-flip-face aui-flip-back">{{ backText || text }}</span>
    </span>
  </button>
  <div v-else-if="type === 'StarsBackground' || type === 'BubbleBackground' || type === 'GradientBackground' || type === 'HexagonBackground'" :class="['aui-bg-surface', type === 'StarsBackground' ? 'aui-bg-stars' : type === 'BubbleBackground' ? 'aui-bg-bubble' : type === 'GradientBackground' ? 'aui-bg-gradient' : 'aui-bg-hexagon']" :data-animate-ui="type">
    <div class="aui-bg-content"><slot /></div>
  </div>
  <div v-else-if="type === 'AnimateTabs' && tabs" class="aui-tabs-bar" role="tablist" data-animate-ui="AnimateTabs">
    <button v-for="t in tabs" :key="t.id" type="button" :class="['aui-tab-btn', activeTab === t.id ? 'active' : '']" @click="emit('change', t.id)">
      <span>{{ t.label }}</span>
      <span v-if="t.badge !== undefined" class="aui-tab-badge">{{ t.badge }}</span>
    </button>
  </div>
  <div v-else-if="type === 'AnimateAccordion' && items" class="aui-accordion" data-animate-ui="AnimateAccordion">
    <div v-for="item in items" :key="item.id" class="aui-accordion-item">
      <button type="button" class="aui-accordion-trigger" @click="openAccordionId = openAccordionId === item.id ? '' : item.id">
        <span>{{ item.title }}</span>
        <span>{{ openAccordionId === item.id ? '−' : '+' }}</span>
      </button>
      <div v-if="openAccordionId === item.id" class="aui-accordion-body">{{ item.content }}</div>
    </div>
  </div>
  <div v-else-if="type === 'AnimateModal' && open" class="aui-modal-backdrop" data-animate-ui="AnimateModal" @click="emit('close')">
    <div class="aui-modal-dialog" @click.stop>
      <div class="aui-modal-header">
        <h3 style="margin:0;font-size:18px;font-weight:700">{{ title }}</h3>
        <button type="button" @click="emit('close')">✕</button>
      </div>
      <slot />
    </div>
  </div>
  <article v-else class="aui-card" data-animate-ui="AnimateCard" @click="emit('click')">
    <div v-if="title || badge" class="aui-card-head">
      <h3 v-if="title" style="margin:0;font-size:16px;font-weight:700">{{ title }}</h3>
      <span v-if="badge" class="aui-card-badge">{{ badge }}</span>
    </div>
    <p v-if="subtitle" style="margin:0 0 12px;font-size:13px;opacity:0.72">{{ subtitle }}</p>
    <slot />
  </article>
</template>
`;

/**
 * Scaffolds the Animate UI component module + base CSS into a React, Vue 3, or HTML workspace,
 * returning the updated WorkspaceSpec (with an automatic Git commit) and usage instructions.
 */
export function scaffoldAnimateUiIntoWorkspace(
  workspace: WorkspaceSpec,
  requestedComponents?: string[],
  author: 'AI' | 'User' = 'User',
): { workspace: WorkspaceSpec; modulePath: string; importSnippet: string; components: AnimateUiComponentSpec[] } {
  const matched =
    requestedComponents && requestedComponents.length > 0
      ? ANIMATE_UI_WORKSPACE_COMPONENTS.filter(c =>
          requestedComponents.some(req => req.toLowerCase() === c.id.toLowerCase()),
        )
      : ANIMATE_UI_WORKSPACE_COMPONENTS;
  const selected = matched.length > 0 ? matched : ANIMATE_UI_WORKSPACE_COMPONENTS;

  const nextFiles = { ...workspace.files };
  const cssPath = Object.keys(nextFiles).find(p => p.endsWith('.css')) || 'src/styles.css';
  const existingCss = nextFiles[cssPath]?.content ?? '';
  if (!existingCss.includes('Animate UI Workspace Runtime Styles')) {
    nextFiles[cssPath] = {
      content: `${existingCss.trimEnd()}\n\n${ANIMATE_UI_BASE_CSS.trim()}\n`,
    };
  }

  let modulePath = 'src/components/animate-ui/index.tsx';
  let importSnippet = `import { ${selected.map(c => c.id).join(', ')} } from 'animate-ui';`;

  if (workspace.framework === 'vue') {
    modulePath = 'src/components/animate-ui/AnimateUi.vue';
    nextFiles[modulePath] = { content: ANIMATE_UI_VUE_SOURCE };
    importSnippet = `import AnimateUi from './components/animate-ui/AnimateUi.vue';`;
  } else if (workspace.framework === 'html') {
    modulePath = 'src/animate-ui.js';
    nextFiles[modulePath] = {
      content: `// Animate UI HTML Runtime Helper\nexport function mountAnimateNumbers(root = document) {\n  root.querySelectorAll('[data-aui-count]').forEach(el => {\n    const target = Number(el.getAttribute('data-aui-count') || 0);\n    el.textContent = target.toLocaleString();\n  });\n}\n`,
    };
    importSnippet = `import { mountAnimateNumbers } from './animate-ui.js';`;
  } else {
    modulePath = 'src/components/animate-ui/index.tsx';
    nextFiles[modulePath] = { content: ANIMATE_UI_REACT_SOURCE };
    importSnippet = `import { ${selected.map(c => c.id).join(', ')} } from 'animate-ui';`;
  }

  const { compiled: _staleCompiled, ...restWorkspace } = workspace;
  const nextWs: WorkspaceSpec = {
    ...restWorkspace,
    files: nextFiles,
  };

  const committed = commitWorkspaceGit(nextWs, {
    author,
    message: `feat(animate-ui): 注入 Animate UI 组件套件 (${selected.slice(0, 4).map(c => c.id).join(', ')}${selected.length > 4 ? ' 等' : ''})`,
    baselineFiles: workspace.files,
  });

  return {
    workspace: committed,
    modulePath,
    importSnippet,
    components: selected,
  };
}
