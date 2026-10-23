import type { CustomComponentDefinition } from '../../../shared/custom-components.mjs';

export type ComponentTemplate = { id: string; name: string; summary: string; uses: string[]; definition: CustomComponentDefinition };

/** Starter templates. Each one runs as is and teaches one part of the contract. */
export const componentTemplates: ComponentTemplate[] = [
  {
    id: 'starter',
    name: '起步模板',
    summary: '带注释的最小结构，介绍三个面板和实例字段。',
    uses: ['HTML', 'CSS', 'JavaScript', '实例字段'],
    definition: {
      name: '我的组件',
      description: '从起步模板开始编写的组件。',
      size: { width: 360, height: 200 },
      fields: { title: '你好，组件' },
      html: `<!-- HTML：组件的结构。data-prop="title" 会自动显示实例字段“标题”。 -->
<section class="box">
  <h2 data-prop="title">你好，组件</h2>
  <p>修改代码后点击“运行”，右侧会立即显示结果。</p>
  <button type="button" class="action">点我试试</button>
</section>`,
      css: `/* CSS：只作用于这个组件，不会影响页面的其他部分。 */
.box {
  height: 100%;
  padding: 20px;
  border-radius: var(--as-radius);
  background: var(--as-surface);
  border: 1px solid var(--as-border);
}
h2 { margin: 0 0 6px; font-size: 20px; color: var(--as-accent); }
p { margin: 0 0 14px; color: var(--as-muted); font-size: 14px; }
.action {
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: var(--as-accent);
  color: var(--as-on-accent);
  font: inherit;
  cursor: pointer;
}`,
      js: `// JavaScript：在 HTML 加载完成后运行，可以直接使用 document。
const button = document.querySelector('.action');
let clicks = 0;

button.addEventListener('click', () => {
  clicks += 1;
  button.textContent = \`已点击 \${clicks} 次\`;
  component.log('按钮被点击', clicks); // 输出到设计器控制台
});

// 实例字段变化时（例如在属性面板修改标题）会调用这里。
component.onProps(props => {
  component.log('当前标题：', props.title);
});`,
    },
  },
  {
    id: 'counter',
    name: '计数按钮',
    summary: '用事件和状态做一个可交互的点赞按钮。',
    uses: ['JavaScript', '动画'],
    definition: {
      name: '点赞按钮',
      description: '点击后数字加一，并带有轻微弹跳。',
      size: { width: 240, height: 120 },
      fields: { label: '点赞' },
      html: `<button class="counter" type="button">
  <span data-prop="label">点赞</span>
  <strong class="count">0</strong>
</button>`,
      css: `body { display: grid; place-items: center; }
.counter {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border: 0;
  border-radius: 999px;
  background: var(--as-accent);
  color: var(--as-on-accent);
  font: 600 16px/1 var(--as-font);
  cursor: pointer;
}
.count {
  min-width: 2.2em;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / .22);
  font-variant-numeric: tabular-nums;
  text-align: center;
}`,
      js: `const button = document.querySelector('.counter');
const count = document.querySelector('.count');
let value = 0;

button.addEventListener('click', () => {
  value += 1;
  count.textContent = value;
  button.animate(
    [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
    { duration: 180, easing: 'ease-out' },
  );
});`,
    },
  },
  {
    id: 'card',
    name: '信息卡片',
    summary: '只用 HTML 和 CSS，标签、标题和正文都可在页面中修改。',
    uses: ['HTML', 'CSS', '实例字段', '主题变量'],
    definition: {
      name: '信息卡片',
      description: '带标签的卡片，文字可按实例修改并跟随页面主题。',
      size: { width: 380, height: 220 },
      fields: { label: '新功能', title: '自定义组件', text: '用 HTML、CSS 和 JavaScript 编写，保存后即可在页面中重复使用。' },
      html: `<article class="card">
  <span class="tag" data-prop="label">新功能</span>
  <h2 data-prop="title">自定义组件</h2>
  <p data-prop="text">用 HTML、CSS 和 JavaScript 编写。</p>
</article>`,
      css: `.card {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  border-radius: var(--as-radius);
  border: 1px solid var(--as-border);
  background: var(--as-surface);
}
.tag {
  align-self: flex-start;
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--as-accent) 14%, transparent);
  color: var(--as-accent);
  font-size: 12px;
  font-weight: 600;
}
h2 { margin: 0; font-size: 22px; line-height: 1.3; }
p { margin: 0; color: var(--as-muted); font-size: 14px; }`,
      js: `// 这个组件只用 HTML 和 CSS，不需要脚本。
// 插入页面后选中它，可以在属性面板修改标签、标题和正文。`,
    },
  },
  {
    id: 'clock',
    name: '实时时钟',
    summary: '用定时器每秒刷新时间，演示持续运行的脚本。',
    uses: ['JavaScript', '定时器'],
    definition: {
      name: '实时时钟',
      description: '显示当前时间和日期，每秒自动更新。',
      size: { width: 300, height: 160 },
      fields: { label: '现在时间' },
      html: `<div class="clock">
  <span class="label" data-prop="label">现在时间</span>
  <time class="time">--:--:--</time>
  <span class="date"></span>
</div>`,
      css: `.clock {
  height: 100%;
  display: grid;
  place-content: center;
  gap: 4px;
  text-align: center;
}
.label { color: var(--as-muted); font-size: 13px; }
.time { font: 700 40px/1.1 var(--as-font); font-variant-numeric: tabular-nums; color: var(--as-text); }
.date { color: var(--as-accent); font-size: 14px; }`,
      js: `const time = document.querySelector('.time');
const date = document.querySelector('.date');

function tick() {
  const now = new Date();
  time.textContent = now.toLocaleTimeString('zh-CN', { hour12: false });
  date.textContent = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
}

tick();
setInterval(tick, 1000);`,
    },
  },
  {
    id: 'link-button',
    name: '链接按钮',
    summary: '链接地址作为实例字段，点击后按页面链接规则打开。',
    uses: ['HTML', '链接字段'],
    definition: {
      name: '链接按钮',
      description: '带箭头的行动按钮，文字和链接可按实例修改。',
      size: { width: 240, height: 100 },
      fields: { label: '了解更多', url: 'https://animate-ui.com' },
      html: `<a class="cta" data-prop-href="url" href="https://animate-ui.com">
  <span data-prop="label">了解更多</span>
  <span class="arrow" aria-hidden="true">→</span>
</a>`,
      css: `body { display: grid; place-items: center; }
.cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: var(--as-radius);
  background: var(--as-text);
  color: var(--as-surface);
  font-weight: 600;
  text-decoration: none;
}
.arrow { transition: transform .2s ease; }
.cta:hover .arrow { transform: translateX(4px); }`,
      js: `// 链接由页面在新标签页打开，支持 https、mailto、tel 和页面锚点。
// 也可以在脚本中调用 component.openLink(url)。`,
    },
  },
];

export const starterTemplate = componentTemplates[0];
export const cloneTemplate = (template: ComponentTemplate): CustomComponentDefinition => JSON.parse(JSON.stringify(template.definition)) as CustomComponentDefinition;
