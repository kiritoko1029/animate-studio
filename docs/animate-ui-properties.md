# 官方属性配置

基线为 Animate UI v2.1.2，提交 `e6cea6b5ae5a4985d3bf3cc0ebea173555eafd72`，React 包版本 2.0.0。组件面板的“官方属性”按实际部件分组；页面内容、主题和变量仍在原来的编辑入口配置。

## 多选与批量编辑

点击画布或组件后，⌘/Ctrl+A 全选当前画布组件；Shift、⌘ 或 Ctrl 点击组件可增减选择，图层列表也支持同样的多选操作。点击空白或按 Esc 取消选择。输入框、富文本/脚本编辑区和组件交互预览保留各自的文本全选行为。

多选后右侧切换为批量属性面板，可统一主题、颜色、尺寸、整体缩放、内边距、圆角和动效。同类型组件还可批量编辑内容和官方属性。不同值显示为“多种值”；只修改所操作的字段，保留其他组件配置。主题切换重置所选组件的颜色与圆角覆盖，不改写页面主题。自定义主题可直接应用到整组选中组件。

拖动已选组件或选区工具条可整组移动，方向键微调（Shift 为 8px），组件之间的相对位置保持不变。⌘/Ctrl+D 复制所选组件，Delete/Backspace 删除所选组件。多选右键菜单提供批量属性、复制和删除；每次批量修改、移动、复制或删除都是一次可撤销操作。

## 修改、保存与恢复

选中组件后，属性面板顶部的“整体缩放”可通过滑杆或百分比输入调节；组件右键菜单也提供相同的控件。它把文字、图标、内边距、圆角与外框一起按比例调整；宽高字段和边框拖动继续用于改变布局区域。缩放上限固定为 400%，不受画布可用空间限制；放大后的外框可超出画布，页面尺寸保持不变，预览与导出按页面边界裁切。选中框下方的尺寸标签同时显示当前缩放百分比，多选时显示共同倍率或“多种缩放”。数值输入按 Enter 或移开焦点应用，Esc 取消；“重置”恢复 100%。缩放和外框作为一次操作保存、撤销，旧页面默认 100%。

缩放保存为 `props.contentScale`，取 25–400 的整数百分比。原生预览与导出使用相同渲染器，弹层内容也随组件缩放，并受视口大小约束。组件“恢复默认属性”保留几何尺寸和整体缩放；缩放区的“重置”专门恢复原始倍率。

- 普通组件保存到 `props.motion['部件.属性']`，附加动效保存到 `props.effectOptions['部件.属性']`。
- 没有填写的可选项不传给原语，保留其默认值。明确的 `false`、`0`、空字符串与未设置不同。修改到示例默认值时移除多余的覆盖。
- 对象和数组使用 JSON 编辑框。非法草稿不会更新页面或自动保存；错误提示显示在当前字段。字段恢复或整体“恢复默认”会清除草稿。
- transition 接受 spring、tween、Bezier、每属性 transition 和循环设置。声明为 SpringOptions 的字段只接受弹簧参数（stiffness、damping、mass、bounce 等），不提供 tween/repeat；withTransition、Particles.animate 等布尔属性保留开关类型。无限循环使用 JSON 字符串 `"Infinity"`，进入 Motion 时才转成数值 Infinity。
- style 接受已知 CSS 属性及 CSS 变量；variants 和 Motion target 接受动画目标、关键帧和受约束 transition。没有任意代码求值。
- LiquidButton.delay 支持 `300ms`、`0.3s`，fillHeight 支持 `12px`、`0.5em`、`30%` 等。旧数字值分别按秒和像素解释。
- Drawer 的数字 snap point 支持 0–1 的视口比例及大于 1 的像素值；字符串使用 px/rem。snapPoint/defaultSnapPoint 可为 null，空 snapPoints 数组关闭停靠点。
- MotionGrid.gridSize 是两项 1–20 整数；frames 是坐标帧数组。StarsBackground 的三层分别在 StarLayer1/2/3 配置。

示例：

```json
{
  "DialogContent.transition": {"type":"spring","stiffness":300,"damping":24},
  "DialogContent.style": {"width":420},
  "DialogTitle.style": {"fontWeight":600}
}
```

每项值都由共享校验器验证。前端编辑、后端保存和导入使用同一 schema；HTML 导出内嵌相同 React 渲染器，保留这些设置。

## 内容和状态的对应

| 官方接口 | 编辑入口与运行行为 |
| --- | --- |
| text / texts / code / number / content | 标题、文本、条目、数值等内容字段。复制按钮的 content 对应文本；代码块 code 对应文本；动态数字 number 对应数值。 |
| children | 固定的官方部件树及对应内容字段。菜单与导航支持结构 JSON，不把 children 当作任意 JSX 字符串。 |
| value / defaultValue / onValueChange | 输入、选择、标签页、分页等使用本地预览状态或“当前值”变量绑定；变化发出 change。页内普通选择使用既有数字索引或字符串值。 |
| ToggleGroup / Accordion 多选、Combobox.multiple | 当前值使用数组变量。新 ToggleGroup 默认多选；已有未设置 type 的页面保留旧单选语义。 |
| Slider.value / Slider.defaultValue | 数组配置生成多个 thumb，范围受 min/max 约束；绑定变量为数组。未设置数组的旧滑块仍使用数字值。value 优先于 defaultValue。 |
| checked / pressed | 复选、开关、Toggle、IconButton 使用本地状态或“选中状态”变量。Checkbox.checked 还支持 `"indeterminate"`；布尔绑定仍对应两态。 |
| open / defaultOpen / onOpenChange | 属性建立预览初始状态，随后开关由原语交互维护；修改属性会同步预览。Sidebar 的 open 对应选中状态变量。 |
| 菜单 checkbox / radio 的状态 | 在 MenuStructure.items 的 checked / value 中设置初始值，实际选择由菜单本地状态维护。它们没有逐菜单项变量绑定。 |
| PinnedList 的置顶状态 | 由 PinnedListState.pinned 的条目索引建立初始状态（默认第 2、3 项置顶），随后置顶/取消由本地状态维护。 |
| Questionnaire.item | 页面的当前值使用题目索引；题目支持 QuestionnaireStructure.items 的独立名称、描述、选项、多选、禁用和自由输入；旧文本列表按索引生成名称。提交由本地完成状态处理。 |
| href / src | 链接和图片字段，或部件提供的图片 src；链接仍走页面的安全 URL 处理和导航。 |
| ThemeToggler.theme / resolvedTheme / setTheme | 页面预览主题上下文，支持 light/dark/system；不会改写工作台主题或持久化页面主题。 |
| AutoHeight.deps | 跟随块内容和设置变化重测高度。 |
| ScrollProgress 的容器引用 | 局部示例使用原语容器；页面模式由编辑器/预览的实际滚动容器提供。 |

菜单栏、右键菜单和下拉菜单的 `MenuStructure.items` 支持 group、separator、item、submenu、checkbox、radio-group、radio。菜单栏顶层 group 是独立菜单；其他菜单顶层是菜单内容。行内可设置 label、href、shortcut、disabled、checked、value 和 destructive 变体。导航菜单的 `NavigationStructure.items` 支持说明、图标、列数、宽度和直接链接。问卷的 `QuestionnaireStructure.items` 支持同一题并列选择项与自由输入，及逐题必填/多选/禁用。侧栏在 `SidebarStructure.content` 中配置团队、导航、项目、账户；`SidebarLayout` 控制 variant 和 collapsible。

有些属性只在特定模式下生效：Accordion.collapsible 仅用于单选模式；Highlight 的 boundsOffset/containerClassName 属于 parent 模式，itemsClassName 用于非 controlledItems 模式；Sheet 的方向由 side 控制。这些条件沿用官方接口语义，不表示所有属性组合都同时有效。

## 框架接口

回调函数、React ref、DOM 元素、Hook、组件构造器和 render prop 不是 JSON 值。它们不能通过对象编辑框直接传入。函数与对象不能混为一类：例如 transition 对象可编辑，Transition 回调或 AnimationControls 实例不能序列化。

`asChild` / render、Portal container、collisionBoundary 的 DOM 元素、anchor/ref、actionsRef、toastManager 等由渲染集成管理。initialFocus/finalFocus 的布尔形式可配置，函数/ref 形式仍属于框架接口。图标构造器使用提供的图标选择或文字内容代替。页面脚本可通过点击/值变化事件响应用户操作，但不能替代每一种原语生命周期回调，也不能访问 DOM。新增声明字段数不表示这些框架接口已获得等价的面板能力。

## 生成和核对

`shared/official-animation-controls.json` 由固定示例和人工 overrides 生成；`shared/official-api-controls.json` 与 CSS 属性白名单由安装声明生成。生成器不会执行下载的示例代码。demo/人工默认值优先，API 的其他字段放入“更多官方属性”。

```sh
node scripts/sync-official-controls.mjs artifacts/kimi-component-audit/sources/v2-pinned/demos --check
node scripts/generate-official-api.mjs --check
npm run typecheck
npm test
npm run build
```

`--check` 核对产物而不覆盖 schema；主动更新时省略该参数。示例目录是本地核对材料，不随发布产物安装；其他环境应提供版本记录对应提交的 demos 目录。生成器提供声明覆盖证据，实际接线、样式、交互和浏览器支持仍需逐项验收。
