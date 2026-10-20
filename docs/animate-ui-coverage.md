# Animate UI 目录覆盖与适配范围

核对日期：2026-10-20。来源：[官方文档](https://animate-ui.com/docs)。

编辑器共有 85 种可拖拽组件（原有 30 项 + 新增 55 项），另有 17 种附加动效。官网当前目录下 83 个组件、背景和动效条目均有对应入口；这些入口包含已有组件复用，不代表新增了 83 个独立组件。图标文档、安装工具和开发者工具不属于独立画布组件。

新增实现使用共享元素树生成 HTML、Vue、React，兼容现有固定画布、属性与页面联动。这里的“覆盖”表示有可操作的功能适配，**不是官方 v2 包的完整源码移植或全部参数兼容**。

## 适配边界

- Drawer / Sheet 使用原生对话框和位置样式，支持打开、关闭与 Esc；未实现拖拽吸附手势或任意子组件嵌套。
- Combobox 使用原生 datalist，可筛选候选和自由输入；不包含多选及异步候选加载。Input OTP 使用单输入框处理数字和粘贴，不提供验证码发送服务。
- Questionnaire 支持单选和文本问题、必填检查、前后切换；未实现多选、跳题或后端提交。
- 动效网格、置顶列表、文字与数字动效提供常用交互及动画，动画曲线与视觉不保证逐像素等同官网。数字范围 0–1,000,000,000。
- Avatar Group 展示成员姓名缩写；图标按钮提供星星、爱心、加号和箭头，未把 Lucide / Hugeicons 的每个图标独立接入。
- 动态背景使用 CSS 图形和动画；不实现官方背景的全部鼠标物理参数。Page Transition 是页面内容入场效果，未接项目路由系统。
- Auto Height 改变组件内部内容区高度，固定画布的外部占位仍由设计尺寸决定。
- 代码展示的静态文本支持基础高亮；动态绑定文本保持原文和实时更新。剪贴板访问取决于浏览器权限。
- GitHub Stars 读取公开 API，受网络和接口限流影响。Scroll Progress 在导出页读取窗口进度，在编辑器读取可见预览区域。

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
