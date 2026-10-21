# Animate Studio 界面规范

更新：2026-10-20。范围：已有平台的视觉升级，保留编辑流程与布局。

## 方向

- 工作台采用 https://animate-ui.com/ 的黑白主题，并使用官方 Animate UI 组件。（用户确认）
- 画布是界面的主要内容；顶栏、组件库、属性面板提供紧凑的编辑工具。（沿用现有布局）
- 工作台支持浅色 / 深色切换并保存到浏览器。默认浅色。（Agent 推断）

## 品牌资产

- 保留 Animate Studio 名称和叠放方块标志；将原有彩色标志转为黑白。（名称沿用，配色用户确认）
- 不使用 Animate UI 的品牌标志替代本平台标志。（Agent 推断）

## 语义角色

- 平台颜色统一来自 `src/studio-tokens.css` 的 `--studio-*`，主背景和主文字用纯黑、纯白，其余灰阶用于层次与边框。
- `src/studio-ui.css` 负责官方控件在工作台中的密度与浮层布局；组件所属 CSS 负责各自布局。
- 主按钮为黑白反相；选中标签以滑动底板和字色区分。错误和禁用状态保留文本/图标，不能只靠颜色。
- 弹窗居中且受视口约束，只有内容区滚动；脚本编辑器保持可用的编辑高度。
- 按钮轻微缩放、标签高亮滑动、弹窗淡入；使用 `MotionConfig` 与 `AnimateUIProvider` 的 `reducedMotion="user"`。
- 上述细化规则为本次实现选择。（Agent 推断）

## 可用组件

- `components/animate-ui/components/`：基于官方 v2 npm 原语的 Button、Tabs、Dialog、DropdownMenu、Switch、Tooltip 样式封装。
- `components/animate-ui/registry/`：固定到官方 v2.1.2 的 9 种背景与 4 种样式按钮，来源见 `docs/animate-ui-version.json`。
- `components/StudioUI.tsx`：统一平台按钮、工具提示和弹窗适配。平台新增控件先复用这些组件。
- 文本输入、选择框、颜色与数值字段使用原生控件及共享平台配色；CodeMirror 负责脚本编辑。（Agent 推断）

## 页面与平台隔离

- 提供 Animate 浅色 / Animate 深色页面主题，在页面设置中一键应用当前工作台配色；明确同步画布与组件，并保留撤销。（用户请求增加适配页面主题；入口为 Agent 推断）
- 页面主题使用原有 `--page-*` 与保存的配置；工作台主题切换不能修改页面内容或影响三种代码导出。（Agent 推断）
- 色卡与页面预览保留实际颜色，不能为了平台单色主题将它们统一灰度化。（Agent 推断）

## 画布操作

- 编辑视野支持 macOS 上 ⌘ + 滚轮、Windows / Linux 上 Alt + 滚轮连续缩放、空格 / 中键拖动平移，缩放锚点保持在鼠标位置。适应画布与恢复 100% 同样使用 ⌘ / Alt + 0、1。（用户确认缩放快捷键及 macOS 映射；平移操作为 Agent 推断）
- 视野变换是编辑器状态，不能修改组件坐标或导出的设计画布；调整组件时固定视野比例，避免拖动距离变化。（实现约束）

## 样板界面

- 主工作台：`src/App.tsx`
- 数据与脚本：`src/components/InteractionStudio.tsx`
- 主题设计器：`src/components/ThemeDesigner.tsx`
- 效果与验证记录：`artifacts/monochrome/`
