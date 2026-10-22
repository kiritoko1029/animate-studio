# Animate UI 目录覆盖与适配范围

核对日期：2026-10-22。官方发布：v2.1.2；官方 npm 包：`@animate-ui/react` 2.0.0。来源：[官方文档](https://animate-ui.com/docs)。

编辑器共有 85 种可拖拽组件（原有 30 项 + 新增 55 项），另有 17 种附加动效。官网当前目录下 83 个组件、背景和动效条目均有对应入口；这些入口包含已有组件复用，不代表新增了 83 个独立组件。图标文档、安装工具和开发者工具不属于独立画布组件。

工作台与画布使用官方 v2 npm 原语，9 种背景和 4 种样式按钮来自 v2.1.2 固定提交。旧 v1 原语已移除。安装版本、源码提交和校验值见 [版本记录](animate-ui-version.json)。官网版本号与 React npm 包独立：2.1.1 / 2.1.2 更新的是上游 AI 技能，npm 包仍为 2.0.0。

## 渲染与动效

- 编辑画布、普通预览、带变量/脚本的预览共用原生 React 渲染器。脚本仍在独立 sandbox iframe + Worker 中执行，不因原生 UI 渲染获得 DOM 权限。
- 文字、数字、按钮、菜单、表单和弹层使用 `@animate-ui/react` 官方原语；背景、样式按钮、代码块外观和 Page Transition 使用固定提交的 Registry 源码。数字和文字不再套用平台统一时长。
- Dialog 默认从顶部以透视、旋转、缩放、模糊和透明度组合进入，关闭保留官方退出动画。Sheet 使用官方 Dialog 的侧边模式，Drawer 使用官方 Base UI Drawer，包含滑动关闭。
- Sidebar、Combobox、Toast、Questionnaire 和 Motion Grid 使用各自的官方原语。Motion Grid 是官网的点阵状态动画；不再用选择卡片代替。
- 17 种附加动效使用对应官方实现。Spring 为弹簧拖拽，Scroll Fade 为滚动边缘渐隐，Page Transition 随绑定内容变化触发过渡，遵守浏览器 View Transitions 支持及减少动态效果偏好。
- 属性面板的“官方属性”按部件分组，合并固定版本的示例 controls、API 声明和人工适配。支持 transition、Motion target、variants、CSS style、数组、元组及受约束对象；非法草稿不应用到预览或自动保存。普通组件配置保存在 `props.motion`，附加动效保存在 `props.effectOptions`。留空的可选项沿用原语默认值。内容、状态和框架接口的对应见 [属性配置说明](animate-ui-properties.md)。
- “恢复官方动效默认”只清除组件动效覆盖。“恢复组件默认属性”同时恢复内容和外观，保留位置、尺寸、图层和联动，支持撤销。未设置新字段的旧页面自动采用官方动效默认值；原有内容和布局继续保留。
- HTML 下载内嵌同一套官方运行时和样式，无需 CDN。React / Vue 下载是承载同一独立页面的 iframe 包装组件，隔离宿主样式及 React 版本；默认高度最高为视口高度，长页面可在内部滚动。需要修改页面结构时保留 JSON 并回到编辑器继续编辑。
- `src/lib/code-export/generate.ts` 的旧兼容生成器保留用于历史导出契约测试及静态加载占位；当前下载入口不使用它。
- 编辑画布默认选择和拖动组件；双击或工具栏“交互”测试自身交互，Esc 返回编辑。重播重置临时状态，变量与脚本在页面预览中运行。

## 属性适配边界

- 基础文字、导航、业务卡片、表格等平台业务区块没有一一对应的官网示例；它们保留平台内容和布局。官方原语的动效与组件的业务内容、主题、固定画布尺寸分别配置。
- 下拉菜单、右键菜单、菜单栏分别提供分组、分隔线、快捷键、禁用、复选、单选和子菜单的结构配置。导航菜单支持说明、图标、双列与直接链接；侧栏包含团队、折叠导航、项目和账户区域。Combobox 支持单选/多选与标签移除；问卷支持单选/多选、文本、必填、跳过和快捷键。OTP 可配置长度和 pattern。
- Avatar Group 支持姓名缩写或图片、提示与箭头；图标按钮支持星星、爱心、加号和箭头，并有选中反馈。GitHub 星标使用真实 Number/Icon/Particles 结构；指定 username/repo 时使用官方原语的公开仓库请求，未指定时展示本地数值；不引入认证凭据。
- 背景按组件本地尺寸绘制，避免画布缩放改变分辨率或鼠标坐标。滚动数字保留官网侧项与高亮，step 和 itemsSize 可改；大范围会调整步长，将候选行限制在约 1000 行并显示提示。负数使用绝对值动画与负号。
- Scroll Progress 默认使用官网局部滚动示例；可切换水平/垂直及全局模式。全局模式使用官方平滑进度条，并将滚动源适配到编辑器的平移/预览容器；无可滚动距离时为 0%。
- Auto Height 改变内部内容高度；固定画布的外部占位仍由设计尺寸决定。图片悬停/点击默认放大 3 倍，使用画布本地坐标定位放大中心。
- 代码块支持 lang、theme/themes、复制按钮、逐字、光标、时长和延迟；显式深浅主题同步代码表面颜色。剪贴板、外部图片、脚本 HTTP 请求仍遵循浏览器权限和 CORS。

## 核对状态

目录映射覆盖 85 个组件与 17 种附加动效，其中 19 个是业务组合。生成的 API 字段数不是验收通过数。最新场景证据位于 `artifacts/component-acceptance/`：运行检查、打开状态、属性修改和原生导出分开记录。不能把默认视图能渲染当作每个状态、每个参数均与官方一致。

## 官方条目对应入口

| 官方条目 | 编辑器入口 | 形式 |
| --- | --- | --- |
| [bubble](https://animate-ui.com/docs/backgrounds/bubble) | 气泡背景 | 组件 |
| [fireworks](https://animate-ui.com/docs/backgrounds/fireworks) | 烟花背景 | 组件 |
| [glyph](https://animate-ui.com/docs/backgrounds/glyph) | 字符背景 | 组件 |
| [gradient](https://animate-ui.com/docs/backgrounds/gradient) | 渐变背景 | 组件 |
| [gravity-stars](https://animate-ui.com/docs/backgrounds/gravity-stars) | 引力星空 | 组件 |
| [hexagon](https://animate-ui.com/docs/backgrounds/hexagon) | 六边形背景 | 组件 |
| [hole](https://animate-ui.com/docs/backgrounds/hole) | 黑洞背景 | 组件 |
| [stars](https://animate-ui.com/docs/backgrounds/stars) | 星空背景 | 组件 |
| [topography](https://animate-ui.com/docs/backgrounds/topography) | 等高线背景 | 组件 |
| [auto-height](https://animate-ui.com/docs/primitives/animate-ui/auto-height) | 组件属性 → 附加动效 → 自动高度 | 附加动效 |
| [avatar-group](https://animate-ui.com/docs/primitives/animate-ui/avatar-group) | 头像组 | 组件 |
| [blur](https://animate-ui.com/docs/primitives/animate-ui/blur) | 组件属性 → 附加动效 → 模糊渐入 | 附加动效 |
| [button](https://animate-ui.com/docs/primitives/animate-ui/button) | 动效按钮 | 已有组件 |
| [click](https://animate-ui.com/docs/primitives/animate-ui/click) | 组件属性 → 附加动效 → 点击反馈 | 附加动效 |
| [code-block](https://animate-ui.com/docs/primitives/animate-ui/code-block) | 代码展示 | 组件 |
| [copy-button](https://animate-ui.com/docs/primitives/animate-ui/copy-button) | 复制按钮 | 组件 |
| [counting-number](https://animate-ui.com/docs/primitives/animate-ui/counting-number) | 递增数字 | 组件 |
| [cursor](https://animate-ui.com/docs/primitives/animate-ui/cursor) | 组件属性 → 附加动效 → 光标跟随 | 附加动效 |
| [effect](https://animate-ui.com/docs/primitives/animate-ui/effect) | 组件属性 → 附加动效 → 组合入场 | 附加动效 |
| [fade](https://animate-ui.com/docs/primitives/animate-ui/fade) | 组件属性 → 附加动效 → 淡入 | 附加动效 |
| [flip-button](https://animate-ui.com/docs/primitives/animate-ui/flip-button) | 翻转按钮 | 组件 |
| [github-stars](https://animate-ui.com/docs/primitives/animate-ui/github-stars) | GitHub 星标 | 组件 |
| [github-stars-button](https://animate-ui.com/docs/primitives/animate-ui/github-stars-button) | GitHub 星标按钮 | 组件 |
| [gradient-text](https://animate-ui.com/docs/primitives/animate-ui/gradient-text) | 渐变文字 | 组件 |
| [highlight](https://animate-ui.com/docs/primitives/animate-ui/highlight) | 组件属性 → 附加动效 → 高亮扫过 | 附加动效 |
| [highlight-text](https://animate-ui.com/docs/primitives/animate-ui/highlight-text) | 动态标题 | 已有组件 |
| [icon-button](https://animate-ui.com/docs/primitives/animate-ui/icon-button) | 图标按钮 | 组件 |
| [image-zoom](https://animate-ui.com/docs/primitives/animate-ui/image-zoom) | 图片放大 | 组件 |
| [input-otp](https://animate-ui.com/docs/primitives/animate-ui/input-otp) | 验证码输入 | 组件 |
| [liquid-button](https://animate-ui.com/docs/primitives/animate-ui/liquid-button) | 流体按钮 | 组件 |
| [magnetic](https://animate-ui.com/docs/primitives/animate-ui/magnetic) | 组件属性 → 附加动效 → 磁吸跟随 | 附加动效 |
| [morphing-text](https://animate-ui.com/docs/primitives/animate-ui/morphing-text) | 变形文字 | 组件 |
| [motion-grid](https://animate-ui.com/docs/primitives/animate-ui/motion-grid) | 动效网格 | 组件 |
| [page-transition](https://animate-ui.com/docs/primitives/animate-ui/page-transition) | 组件属性 → 附加动效 → 页面切换入场 | 附加动效 |
| [particles](https://animate-ui.com/docs/primitives/animate-ui/particles) | 组件属性 → 附加动效 → 点击粒子 | 附加动效 |
| [pinned-list](https://animate-ui.com/docs/primitives/animate-ui/pinned-list) | 可置顶列表 | 组件 |
| [ripple-button](https://animate-ui.com/docs/primitives/animate-ui/ripple-button) | 涟漪按钮 | 组件 |
| [rolling-text](https://animate-ui.com/docs/primitives/animate-ui/rolling-text) | 滚动文字 | 组件 |
| [rotating-text](https://animate-ui.com/docs/primitives/animate-ui/rotating-text) | 旋转文字 | 组件 |
| [scroll-fade](https://animate-ui.com/docs/primitives/animate-ui/scroll-fade) | 组件属性 → 附加动效 → 滚动渐显 | 附加动效 |
| [scroll-progress](https://animate-ui.com/docs/primitives/animate-ui/scroll-progress) | 滚动进度 | 组件 |
| [scrolling-number](https://animate-ui.com/docs/primitives/animate-ui/scrolling-number) | 滚动数字 | 组件 |
| [shimmering-text](https://animate-ui.com/docs/primitives/animate-ui/shimmering-text) | 流光文字 | 组件 |
| [shine](https://animate-ui.com/docs/primitives/animate-ui/shine) | 组件属性 → 附加动效 → 光泽扫过 | 附加动效 |
| [slide](https://animate-ui.com/docs/primitives/animate-ui/slide) | 组件属性 → 附加动效 → 滑入 | 附加动效 |
| [sliding-number](https://animate-ui.com/docs/primitives/animate-ui/sliding-number) | 滑动数字 | 组件 |
| [sliding-text](https://animate-ui.com/docs/primitives/animate-ui/sliding-text) | 滑入文字 | 组件 |
| [splitting-text](https://animate-ui.com/docs/primitives/animate-ui/splitting-text) | 拆分文字 | 组件 |
| [spring](https://animate-ui.com/docs/primitives/animate-ui/spring) | 组件属性 → 附加动效 → 弹簧进入 | 附加动效 |
| [swapping-text](https://animate-ui.com/docs/primitives/animate-ui/swapping-text) | 交替文字 | 组件 |
| [theme-toggler](https://animate-ui.com/docs/primitives/animate-ui/theme-toggler) | 组件属性 → 附加动效 → 点击切换主题 | 附加动效 |
| [theme-toggler-button](https://animate-ui.com/docs/primitives/animate-ui/theme-toggler-button) | 主题切换按钮 | 组件 |
| [tilt](https://animate-ui.com/docs/primitives/animate-ui/tilt) | 组件属性 → 附加动效 → 悬浮倾斜 | 附加动效 |
| [typing-text](https://animate-ui.com/docs/primitives/animate-ui/typing-text) | 打字文字 | 组件 |
| [zoom](https://animate-ui.com/docs/primitives/animate-ui/zoom) | 组件属性 → 附加动效 → 缩放进入 | 附加动效 |
| [accordion](https://animate-ui.com/docs/primitives/base-ui/accordion) | 折叠面板 | 已有组件 |
| [alert-dialog](https://animate-ui.com/docs/primitives/base-ui/alert-dialog) | 确认对话框 | 组件 |
| [checkbox](https://animate-ui.com/docs/primitives/base-ui/checkbox) | 复选框 | 已有组件 |
| [collapsible](https://animate-ui.com/docs/primitives/base-ui/collapsible) | 可折叠内容 | 组件 |
| [combobox](https://animate-ui.com/docs/primitives/base-ui/combobox) | 可搜索选择 | 组件 |
| [context-menu](https://animate-ui.com/docs/primitives/base-ui/context-menu) | 右键菜单 | 组件 |
| [dialog](https://animate-ui.com/docs/primitives/base-ui/dialog) | 对话框 | 组件 |
| [drawer](https://animate-ui.com/docs/primitives/base-ui/drawer) | 抽屉 | 组件 |
| [dropdown-menu](https://animate-ui.com/docs/primitives/base-ui/dropdown-menu) | 下拉菜单 | 组件 |
| [hover-card](https://animate-ui.com/docs/primitives/base-ui/hover-card) | 悬浮卡片 | 组件 |
| [menubar](https://animate-ui.com/docs/primitives/base-ui/menubar) | 菜单栏 | 组件 |
| [navigation-menu](https://animate-ui.com/docs/primitives/base-ui/navigation-menu) | 导航菜单 | 组件 |
| [pagination](https://animate-ui.com/docs/primitives/base-ui/pagination) | 分页 | 已有组件 |
| [popover](https://animate-ui.com/docs/primitives/base-ui/popover) | 气泡面板 | 组件 |
| [preview-link-card](https://animate-ui.com/docs/primitives/base-ui/preview-link-card) | 链接预览 | 组件 |
| [progress](https://animate-ui.com/docs/primitives/base-ui/progress) | 进度条 | 已有组件 |
| [questionnaire](https://animate-ui.com/docs/primitives/base-ui/questionnaire) | 分步问卷 | 组件 |
| [radio-group](https://animate-ui.com/docs/primitives/base-ui/radio-group) | 单选组 | 已有组件 |
| [select](https://animate-ui.com/docs/primitives/base-ui/select) | 下拉选择 | 已有组件 |
| [sheet](https://animate-ui.com/docs/primitives/base-ui/sheet) | 侧边面板 | 组件 |
| [sidebar](https://animate-ui.com/docs/primitives/base-ui/sidebar) | 页面侧栏 | 组件 |
| [slider](https://animate-ui.com/docs/primitives/base-ui/slider) | 滑块 | 已有组件 |
| [switch](https://animate-ui.com/docs/primitives/base-ui/switch) | 开关 | 已有组件 |
| [tabs](https://animate-ui.com/docs/primitives/base-ui/tabs) | 标签页 | 已有组件 |
| [toast](https://animate-ui.com/docs/primitives/base-ui/toast) | 通知消息 | 组件 |
| [toggle](https://animate-ui.com/docs/primitives/base-ui/toggle) | 切换按钮 | 组件 |
| [toggle-group](https://animate-ui.com/docs/primitives/base-ui/toggle-group) | 切换按钮组 | 组件 |
| [tooltip](https://animate-ui.com/docs/primitives/base-ui/tooltip) | 文字提示 | 组件 |
