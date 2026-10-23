# 更新日志 / Changelog

## v2026.10.23 — 2026-10-23

### 中文

本次版本加入账号与云端页面管理。访客继续使用全部基础编辑、预览和导出功能，登录后可保存页面、分享预览链接并同步工作台外观。

- 支持邮箱验证码登录（Resend）和 GitHub OAuth 登录。
- 支持 Cloudflare D1，Node 部署可使用本地 SQLite 或 PostgreSQL；提供数据库迁移。
- 支持云端页面保存、列表、打开、重命名和删除，刷新后可恢复当前页面。
- 分享链接直接打开独立交互预览，支持更新已发布快照、保留链接以及撤销分享。
- 访客草稿在浏览器保存；登录不会自动上传或替换草稿。保存失败时保留编辑内容并阻止页面切换。
- 云端数据按账号隔离；同步工作台外观，保留原有匿名工作区恢复入口。
- Cloudflare 部署保留控制台设置的运行时变量和密钥。

**验证**：218 项自动化测试、16 项真实 PostgreSQL 测试、本地 workerd/D1 集成验证，以及 Node 和 Cloudflare 构建通过。真实邮件投递和用户 GitHub 授权需要生产凭据及实际登录验证。

### English

This release adds accounts and cloud page management. Guests retain basic editing, previews, and exports; signed-in users can save pages, share previews, and sync workbench appearance.

- Added email OTP sign-in through Resend and GitHub OAuth sign-in.
- Added Cloudflare D1 storage, with SQLite and PostgreSQL options for Node deployments and database migrations.
- Added cloud page saving, listing, opening, renaming, deletion, and restoration after reload.
- Shared links open standalone interactive previews. Published snapshots can be updated while retaining the link, or revoked.
- Guest drafts persist in the browser. Signing in does not upload or replace them; failed saves preserve edits and prevent page switching.
- Isolated cloud data by account, synchronized workbench appearance, and retained legacy workspace recovery.
- Cloudflare deployments preserve runtime variables and secrets managed in the dashboard.

**Validation**: 218 automated tests, 16 tests against PostgreSQL, local workerd/D1 integration checks, and Node and Cloudflare builds passed. Real email delivery and user GitHub authorization require production credentials and an actual sign-in.

## v2026.10.22 — 2026-10-22

### 中文

本次版本集中完善官方组件配置和画布编辑体验，新增多选批量编辑，并将组件整体缩放上限统一放开到 400%。

**新增与改进**

- 采用日期版本号 `2026.10.22`，系统左上角显示当前版本，并可直接打开对应 Release。界面版本读取 `package.json`，与发布标签保持一致。
- 点击画布或组件后，可用 ⌘/Ctrl+A 全选，使用 Shift、⌘ 或 Ctrl 点击增减选择；图层列表同步支持多选。支持整组移动、方向键微调、复制、删除和撤销。
- 批量修改组件主题、颜色、尺寸、整体缩放、内边距、圆角和动效。同类型组件可批量编辑内容和官方属性；不同配置显示“多种值”，未操作的字段保持原值。
- 属性面板和组件右键菜单提供紧凑的整体缩放控件，支持最高 400%。文字、图标、间距和外框一起缩放，选中框下方同时显示尺寸与倍率；多选时显示共同倍率或“多种缩放”。
- 官方属性按部件分组，增加 Motion transition、variants、CSS style、数组、元组和结构对象配置；非法 JSON 草稿不会进入预览或自动保存，支持恢复默认值。
- 完善菜单的分组、子菜单、复选和单选结构，以及导航、侧栏、问卷、头像组、代码块、星标按钮等组件的内容和交互配置。
- 支持多选控件与多滑块的数组变量绑定，并完善 checkbox 中间态、浮层初始状态、背景分层、数字显示及滚动进度配置。

**修复**

- 调整对话框及确认对话框的宽度、间距、圆角、底部操作区与关闭行为，匹配固定版本的官方示例结构；修复 Portal 浮层的独立主题继承。
- 修复选中边框受组件主题影响而不可见，以及选中工具栏最右侧删除按钮和边距异常的问题。
- 修复满宽组件整体缩放被限制为 100% 的问题；放大后的外框和倍率可保存、重载与重置，重新打开时不会因缩放溢出而自动增大页面。
- 编辑画布、预览和代码导出保留一致的组件缩放、主题和属性配置。

**兼容性与范围**

- 旧页面未配置整体缩放时默认 100%；页面 JSON 格式版本仍为 `1`。
- 放大后的组件可以超出画布，预览与导出仍按页面边界裁切。
- React 回调、ref、组件构造器和 DOM 引用不属于可序列化的面板属性，由渲染集成管理。具体支持范围见[官方属性配置说明](https://github.com/kiritoko1029/animate-studio/blob/v2026.10.22/docs/animate-ui-properties.md)。
- 官方基线保持 Animate UI v2.1.2，React 包保持 `@animate-ui/react` 2.0.0。

**验证**

- 182 项自动化测试通过；Node 与 Cloudflare 构建通过（包含类型检查）。
- 官方示例 controls 与 API 属性生成产物校验通过。
- 浏览器实测整体缩放至 400%、尺寸标签、保存重载、重置及批量缩放。

### English

This release expands official component configuration and canvas editing, adds multi-selection with batch editing, and raises the overall component scale limit to 400%.

**Added and improved**

- Introduced the date-based version `2026.10.22`. The workbench header displays the version from `package.json` and links to its GitHub Release.
- Added ⌘/Ctrl+A to select all canvas components and Shift/⌘/Ctrl-click to toggle individual selections, including in the layer list. Selected groups support dragging, arrow-key movement, duplication, deletion, and undo.
- Added batch editing for themes, colors, dimensions, overall scale, padding, corner radius, and effects. Components of the same type also support shared content and official property editing. Mixed values are indicated, and unrelated fields remain unchanged.
- Added compact scaling controls in the inspector and component context menu, with a maximum of 400%. Text, icons, spacing, and frames scale together. Selection labels show dimensions and scale, including shared or mixed scales for groups.
- Expanded property groups with Motion transitions, variants, CSS styles, arrays, tuples, and structured objects. Invalid JSON drafts do not affect previews or autosave, and defaults can be restored.
- Expanded grouped menus, submenus, checkbox/radio items, navigation, sidebars, questionnaires, avatar groups, code blocks, and GitHub star buttons.
- Added array variable bindings for multi-select controls and multi-thumb sliders, and improved indeterminate checkboxes, initial overlay state, background layers, animated numbers, and scroll progress options.

**Fixed**

- Aligned dialog and alert dialog dimensions, spacing, corners, footer actions, and closing behavior with the pinned official examples. Fixed independent theme inheritance across portals.
- Fixed selection borders becoming invisible under component themes, and corrected the rightmost delete button and spacing in the selection toolbar.
- Removed the 100% scale cap affecting full-width components. Enlarged frames and their scale survive saving, reloading, and resetting without silently increasing the page size on reload.
- Preserved component scale, themes, and property settings across the editor, previews, and code exports.

**Compatibility and scope**

- Existing pages default to 100% component scale. The page JSON schema version remains `1`.
- Enlarged components may extend beyond the canvas; previews and exports remain clipped to the page boundaries.
- React callbacks, refs, component constructors, and DOM references are managed by the renderer rather than editable as serialized properties. See the [property configuration reference](https://github.com/kiritoko1029/animate-studio/blob/v2026.10.22/docs/animate-ui-properties.md) for supported interfaces.
- The upstream baseline remains Animate UI v2.1.2 with `@animate-ui/react` 2.0.0.

**Validation**

- All 182 automated tests passed. Node and Cloudflare builds passed, including type checks.
- Generated official example controls and API property schemas passed their consistency checks.
- Browser checks covered 400% scaling, selection labels, save/reload, reset, and batch scaling.
