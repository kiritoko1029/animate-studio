# 更新日志 / Changelog

## v2026.10.27 — 2026-10-27

### 中文

本次版本完善内容维护、站点媒体、响应式布局和发布治理，同时保留自由画布、AI 对话、自定义组件与既有导出能力。用户可以不写 JSON 维护数据内容，并在确认后发布、回滚或离线交付完整站点。

- 发布中心支持公开差异检查、最近 20 个不可变版本、历史对比、公开回滚和恢复草稿。发布同时校验草稿修订与当前公开版本；回滚生成带来源的新版本，不覆盖编辑草稿，关闭分享保留历史。
- 逐页 SEO 支持标题、描述、分享图与收录设置。Node 和 Cloudflare 公开 HTML 注入 canonical、Open Graph/Twitter 和 robots；静态页面提供 sitemap，动态详情和 404 默认不收录，离线 HTML 使用保守 noindex。
- 站点媒体库支持 PNG/JPEG/WebP/GIF 上传、搜索与复用，单张 5 MiB、每站 100 张 / 50 MiB。游客使用 IndexedDB，云端使用私有文件或 R2；迁移失败阻止发布，历史素材按版本保留，导出内嵌实际使用的图片。
- CMS 内容集合支持文本、多行文本、数字、布尔、链接和图片字段，可新增、编辑、复制和删除记录，并绑定列表、表格、图表及路由详情。缺失详情明确报错；集合随站点保存、发布和回滚，不是公共写库。
- 可选响应式布局保留桌面原文档，分别编辑平板和手机的 frame、页面高度和显隐，支持候选重置、撤销与恢复固定画布。预览、分享与离线导出按真实容器宽度选择布局，窄屏共享侧栏改为上下排列；旧页面不自动重排。
- AI 整站支持内容集合结构和明确标记的示例内容，不发送现有记录正文，不上传或伪造素材。修复整站画布高度校验、组件文字选择、集合编辑状态、子模板响应式校验和跨断点隐藏恢复。

**升级说明**：页面与站点结构版本保持 `1`。发布历史和媒体库分别新增 0007、0008 SQLite/PostgreSQL/D1 迁移，Node 启动时应用，Cloudflare 由部署工作流应用。内容集合嵌入站点文档；响应式默认关闭，候选布局需逐页审阅，不保证所有艺术排版自动无损转换。

**验证**：525 项自动化测试通过，双端类型检查、Node 与 Cloudflare 串行构建及差异格式检查通过。真实 Chrome 验证集合编辑、公开发布与回滚、SEO、媒体上传与迁移失败重试、320/390/768px 响应式、动态表单和离线 HTML；隔离 D1/R2 验证发布、素材访问与配额。验收使用临时 SQLite、真实本地 OTP、独立浏览器和确定性 AI 输出；未配置一次性 PostgreSQL 测试库，未调用真实模型或在线上账号、远端资源中直接验收。远端部署与迁移由工作流执行。

### English

This release completes content management, site media, responsive layouts, and publishing governance while preserving the free-form canvas, AI chat, custom components, and existing exports. Users can maintain structured content without JSON, then review, publish, roll back, or deliver a complete site offline.

- The publish center adds public diff review, the latest 20 immutable versions, historical comparisons, public rollback, and draft restoration. Publishing checks both draft revision and published version. Rollback creates a source-linked version without replacing the current draft; sharing history is retained when disabled.
- Per-page SEO covers titles, descriptions, social images, and indexing. Node and Cloudflare inject canonical, Open Graph/Twitter, and robots metadata into public HTML. Static pages receive a sitemap; dynamic details and 404 routes stay unindexed by default, while offline HTML uses conservative noindex.
- The media library uploads, searches, and reuses PNG/JPEG/WebP/GIF images with 5 MiB per file and 100 images / 50 MiB per site. Guests use IndexedDB; cloud sites use private files or R2. Failed migrations block publication, historical assets remain available for rollback, and exports embed the images actually used.
- Embedded content collections support text, long text, number, boolean, URL, and image fields with record creation, editing, duplication, and deletion. Bind them to lists, tables, charts, and route-matched details with explicit missing-record errors. Collections travel with site drafts, publication, and rollback; they are not a public write database.
- Optional responsive layouts preserve desktop blocks while editing tablet/mobile frames, page height, and visibility with reset, undo, and fixed-canvas restoration. Preview, sharing, and offline exports use the real container width. Narrow shared sidebars stack above content; existing pages never opt in automatically.
- AI site creation accepts collection schemas and clearly marked sample records without exposing existing record bodies or fabricating media. Also fixes AI canvas-height validation, text selection, collection editor state, responsive child-template validation, and visibility inheritance.

**Upgrade notes**: Page and site schema versions remain `1`. Publish-history and media migrations are included as 0007 and 0008 for SQLite, PostgreSQL, and D1, applied by Node at startup and by the deployment workflow. Collections are embedded in the site document, not a public CMS. Responsive mode is opt-in; candidate layouts require review and do not guarantee lossless conversion of every artistic composition.

**Validation**: All 525 automated tests passed, along with both type checks, serial Node and Cloudflare builds, and diff-format checks. Real Chrome verified collection editing, publishing and rollback, SEO, media uploads and migration retries, 320/390/768px responsive layouts, dynamic forms, and offline HTML. Isolated D1/R2 checks covered publication, asset access, and quotas. Verification used temporary SQLite, local OTP, isolated browsers, and deterministic AI output. No disposable PostgreSQL database was configured, and no live model, online account, or remote resource was directly exercised; deployment and migrations run in the workflow.

## v2026.10.26.1 — 2026-10-26

### 中文

本次同日修订版把多页面站点扩展为可连接真实数据的低代码应用，并加入统一数据图表。普通用户无需编写脚本，即可完成后台列表、详情、表单和看板；旧页面、锚点、静态表格和导出行为保持兼容。

- 新增站点级静态 JSON 与公开 REST 数据源，支持数组集合、单对象详情、字段推断、响应路径、安全模板、超时和分页。动态列表、数据表格与详情绑定共用加载、空数据、错误和重试状态；共享侧栏可同步站点菜单，自定义组件可读取路由参数。
- 新增可视化表单字段配置、必填、邮箱、URL、数字和长度校验。POST、PUT、PATCH 每次实际提交前都确认方法和目标主机；生成配置、测试连接、自动保存、发布和导出不会自动写入。失败保留输入，成功后可查看结果并恢复提交前输入，但不自动撤销外部写入。
- 可选服务端凭据按账号使用 AES-256-GCM 加密保存，页面只保存引用。受控代理仅用于登录属主的已保存站点编辑预览，并校验主机、重定向、私网地址、响应大小与超时；公开分享和导出继续使用公开直连数据。
- 新增统一 `chart` 数据图表组件，组件总数达到 88。折线、面积、柱状、条形、饼图及环形变体使用原生 SVG，不新增图表库依赖。切换类型保留数据源与字段映射，支持维度、指标和多种聚合方式；静态数据汇总全部有效记录，REST 默认汇总当前页并明确标注。
- 图表支持点选筛选、再次点选清除、撤销重做及换源后复用筛选变量，不覆盖已有事件。提供等价数据表、真实 SVG 和 2 倍像素 PNG；导出颜色不依赖页面 CSS 变量。手机通过可读的放大视图操作，支持键盘点选和 Esc 焦点恢复，不改变固定画布契约。
- AI 整站任务可生成后台页面、共享侧栏、公开数据源和看板，继续执行计划确认、平台校验、独立检查点、修订检查和原子提交。已有数据源进入模型上下文前会脱敏；AI 不能添加凭据、代理或外部写入，也不会自动发布。

**升级说明**：`PageDocument` 与 `SiteDocument` 的结构版本保持不变。新增 `studio_data_credential` 的 SQLite、PostgreSQL 和 D1 迁移，Node 启动时应用，Cloudflare 由 Void 部署时应用。REST 图表默认统计当前页，点选筛选作用于已加载数据，不代表服务端全量分析。第二批图表、整页自动响应式重排、CMS、媒体库和发布治理不在本次范围。

**验证**：469 项自动化测试通过，双端类型检查、Node 与 Cloudflare 构建、完整差异格式检查通过。真实 Chrome 验证公开 REST 连接、动态列表与详情、确认后 POST/PUT、共享侧栏、全部图表类型、筛选与撤销、真实 SVG/PNG、HTML 导出刷新、分享深链、键盘操作及 390px 放大视图；深色图表文字对比度为 8.03:1。账号与凭据使用真实 SQLite 和本地可控 REST；分享使用本地快照，Cloudflare socket 使用模拟传输，AI 使用确定性模拟输出。未配置一次性 PostgreSQL 测试库，未调用真实模型、线上账号或远端 D1/Worker；远端部署与迁移由工作流执行。

### English

This same-day maintenance release turns multi-page sites into data-driven low-code applications and adds unified data charts. Users can build admin lists, details, forms, and dashboards without writing scripts, while existing pages, anchors, static tables, and export behavior remain compatible.

- Added site-level static JSON and public REST sources with collection and single-object modes, field inference, response paths, safe templates, timeouts, and pagination. Repeaters, data tables, and detail bindings share loading, empty, error, and retry states. Shared sidebars can follow the site page tree, and custom components can read route parameters.
- Added visual form fields with required, email, URL, numeric, and length validation. Every actual POST/PUT/PATCH submission requires confirmation of the method and host; generating configuration, testing connections, autosaving, publishing, and exporting never writes automatically. Failed submissions preserve input. Successful submissions expose the response and can restore prior input without reversing external writes.
- Optional server credentials are encrypted per account with AES-256-GCM, with only references stored in page JSON. The controlled proxy is limited to an owner's saved-site editor preview and validates hosts, redirects, private addresses, response size, and timeouts. Public sharing and exports continue to use direct public reads.
- Added a unified `chart` component, bringing the catalog to 88 types. Line, area, column, horizontal bar, pie, and donut charts use native SVG without a new chart-library dependency. Switching types preserves source and field mappings, with dimensions, metrics, and multiple aggregations. Static charts aggregate all valid records; REST charts aggregate the current page and disclose that scope.
- Charts support selection, clearing, undo/redo, and filter-variable reuse after source changes without replacing existing events. Includes an equivalent data table, real SVG, and 2x PNG exports whose colors do not depend on page CSS variables. A readable focus view supports mobile selection, keyboard interaction, and focus restoration on Escape without changing the fixed-canvas contract.
- AI site tasks can create admin pages, shared sidebars, public data sources, and dashboards while retaining plan confirmation, platform validation, isolated checkpoints, revision checks, and atomic commits. Existing data-source context is redacted before reaching the model. AI cannot add credentials, proxy transports, external writes, or publish automatically.

**Upgrade notes**: `PageDocument` and `SiteDocument` schema versions are unchanged. `studio_data_credential` migrations are included for SQLite, PostgreSQL, and D1, applied by Node at startup and by Void during Cloudflare deployment. REST charts aggregate the current page and selection filters apply to loaded records, not server-side analytics. Second-batch chart types, automatic responsive reflow, CMS, media libraries, and publishing governance are outside this release.

**Validation**: All 469 automated tests passed, along with both type checks, Node and Cloudflare builds, and complete diff-format checks. Real Chrome verified public REST connections, dynamic lists and details, confirmed POST/PUT, shared sidebars, every chart type, selection and undo, real SVG/PNG, HTML refresh after export, shared deep links, keyboard interaction, and a 390px focus view. Dark chart text contrast measured 8.03:1. Account and credential checks used real SQLite and controlled local REST endpoints; sharing used a local snapshot, Cloudflare sockets used simulated transport, and AI used deterministic mock output. No disposable PostgreSQL database was configured, and no live model, online account, or remote D1/Worker was called; remote deployment and migrations are handled by the workflow.

## v2026.10.26 — 2026-10-26

### 中文

本次版本将 Animate Studio 从单页编辑器扩展为多页面站点创作平台，同时保留原有组件、交互、AI 对话和导出能力，进一步降低新用户的学习成本。

- 新增任务式创建入口和常用属性直出；支持按名称或官方路径搜索高级设置，并按组件类型保存展开偏好。游客偏好保存在浏览器，账号偏好独立同步，搜索和右键临时展开不写入配置。
- 新增版本化 `SiteDocument` 与页面树，支持创建、复制、重命名、分组、排序、设为首页和删除确认。旧页面自动作为单页站点打开，游客与云端草稿均可继续编辑。
- 支持普通页面、详情页和 404，提供 `/products/:id` 路由参数、只读 `route` 表达式、站内页面选择器、返回动作与导航选中状态。预览、分享子路径和单文件 HTML 导出共用导航规则，刷新后仍可恢复子页面。
- 新增可编辑的共享页头和页脚，按确认范围批量应用到页面，整次操作可撤销。分享和导出使用同一布局组合，旧单页导出继续保留原运行入口。
- 新增 AI 整站创作：先说明页面、路由、共享布局和删除范围，用户确认后逐页生成到检查点，完成后一次应用，支持暂停、继续、结构解释和整次撤销。计划外内容不能被直接覆盖，单页与整站任务互斥。
- 云端站点使用原页面记录和分享令牌，保存时检查修订号，避免其他标签页或设备静默覆盖。AI 整站结果在云端账号中先标记待保存，只有用户显式保存或发布才写入；分享始终发布完整站点快照。
- 修复组件内容在固定外框内产生非预期滚动条的问题，并保留画布局部列表、代码区域等确有需要时的滚动能力。

**升级说明**：旧 `PageDocument` 的版本仍为 `1`，新站点使用同样版本化的 `kind: "site"` 文档；旧页面 JSON、单页 AI 会话和原云端记录保持兼容。游客从旧 `guest-draft:v1` 迁移到 `guest-site-draft:v1`，原键保留只读备份。站点最多 24 页、2 MiB。账号展开偏好新增 SQLite、PostgreSQL 和 D1 迁移，Node 启动时应用，Cloudflare 由 Void 部署时应用。数据源、动态列表、图表、访问权限和 SEO 不属于本次交付，动态路由不等于已连接真实数据。

**验证**：427 项自动化测试通过，覆盖 SQLite 账号 API、站点校验、路由、共享布局、AI 检查点、旧组件和原生导出。Node 与 Cloudflare 构建通过。真实 Chromium 验证三页站点、共享导航、动态详情、AI 计划确认与撤销/重做、HTML 刷新、分享深链及 390px 窄屏。AI 使用确定性模拟响应，浏览器分享深链使用本地快照；未调用真实付费模型。PostgreSQL 迁移已提供，本版本未连接 PostgreSQL 测试库；线上账号与远端 D1 由部署工作流执行，未在本地验收中直接操作。

### English

This release expands Animate Studio from a single-page editor into a multi-page site creation platform while preserving existing components, interactions, AI conversations, and exports, with a lower learning curve for new users.

- Added task-based creation and direct access to common properties. Search advanced settings by name or official path and remember disclosure preferences by component type. Guest preferences stay in the browser, account preferences sync independently, and temporary search/context-menu expansion is not persisted.
- Added a versioned `SiteDocument` and page tree with creation, duplication, renaming, groups, ordering, home-page selection, and delete confirmation. Existing pages open as single-page sites, and guest and cloud drafts remain editable.
- Added normal, detail, and 404 pages with `/products/:id` parameters, read-only `route` expressions, page pickers, back actions, and selected-navigation states. Preview, shared deep links, and single-file HTML exports share navigation rules and restore the current route after refresh.
- Added editable shared headers and footers with confirmed per-page application and one-step undo. Sharing and exports use the same layout composition, while legacy single-page exports keep their original runtime.
- Added AI site creation: review pages, routes, shared layouts, and deletion scope before generating into checkpoints, then apply one undoable result. Supports pause/resume, structure explanations, and protection against out-of-scope edits and concurrent page/site AI tasks.
- Cloud sites reuse existing page records and share tokens, with revision checks preventing silent overwrites from other tabs or devices. AI site results start as pending drafts in cloud accounts and are written only after explicit save or publish. Sharing always publishes a complete site snapshot.
- Fixed unintended internal scrollbars in fixed-size components while retaining intentional scrolling in local lists and code regions.

**Upgrade notes**: Existing `PageDocument` remains version `1`; the new site document is also versioned and uses `kind: "site"`. Existing page JSON, single-page AI sessions, and cloud records remain compatible. Guest drafts migrate from the read-only `guest-draft:v1` source to `guest-site-draft:v1`, preserving the old key. Sites support up to 24 pages and 2 MiB. Inspector preference migrations are included for SQLite, PostgreSQL, and D1, applied by Node at startup and by Void during Cloudflare deployment. Data sources, dynamic collections, charts, access control, and SEO are outside this release; dynamic routes do not imply a live data connection.

**Validation**: All 427 automated tests passed, covering SQLite account APIs, site validation, routing, shared layouts, AI checkpoints, existing components, and native exports. Node and Cloudflare builds passed. Real Chromium checks covered a three-page site, shared navigation, dynamic details, AI plan confirmation and undo/redo, HTML refresh, shared deep links, and a 390px viewport. AI used deterministic mock responses and browser share checks used a local snapshot; no paid model calls were made. PostgreSQL migrations are included but were not integration-tested against a PostgreSQL database for this release. Online accounts and remote D1 are handled by the deployment workflow and were not directly modified during local verification.

## v2026.10.25 — 2026-10-25

### 中文

本次版本加入 AI 页面与组件创作，让自定义组件从生成、编辑、分组到云端复用形成完整流程，并完善双语工作台。

- 新增 AI 创作助手，支持 OpenAI Responses、Anthropic Messages 和兼容接口，可读取模型列表、配置思考强度，流式显示思考内容并点击展开。
- AI 可逐组件生成和修改页面，创建变量、脚本、属性绑定与事件；支持自动续写、暂停接手、检查点恢复、版本快照和整次生成撤销。
- 新增独立组件创作模式，可开发 HTML/CSS/JavaScript 自定义组件并自动保存到“我的组件”，不会替换当前页面；页面生成也可开发或引用本机与账号组件。
- 自定义组件设计器提供模板、代码编辑、沙箱交互预览、实例字段、账号保存和快照分享。生成结果可上传云端，后续 AI 修改可更新同一云端组件。
- 本机与账号组件支持一级文件夹：创建、重命名、筛选、移动和删除。删除文件夹保留组件，移动不改变源码版本；并发创建受数据库数量约束保护。
- 增加生成后辅助检查与组件定位，检查越界、重叠、失效锚点、内容溢出和可测量的文字对比度；稳定组件 ID 可作为页内导航目标。
- 完善中英文切换与顶栏分组；修复检查点覆盖、无效记录阻断历史、主题颜色不同步、关联属性误删、拒绝响应重复请求、提前显示完成以及云端列表竞态。

**升级说明**：页面 JSON 版本仍为 `1`，旧草稿和本机组件库兼容。新增自定义组件与文件夹的 SQLite、PostgreSQL 和 D1 迁移；Node 启动时应用迁移，Cloudflare 部署由 Void 应用 D1 迁移。AI 密钥保存在浏览器，请求直连用户配置的接口，需要服务商支持浏览器 CORS。

**验证**：394 项自动化测试通过，覆盖 SQLite API、D1 迁移、并发与恢复场景；Node 和 Cloudflare 构建通过。浏览器通过本机模拟接口验证组件生成、交互、分组、上传与刷新恢复，未产生真实 AI 调用费用。PostgreSQL 迁移已提供，本次未连接 PostgreSQL 测试数据库。

### English

This release adds AI page and component creation, completing the workflow from generating and editing custom components to organizing and reusing them in the cloud, alongside a bilingual workbench.

- Added an AI assistant for OpenAI Responses, Anthropic Messages, and compatible endpoints, with model discovery, reasoning controls, streaming thinking previews, and expandable text.
- AI can build and edit pages component by component, including variables, scripts, bindings, and events. Tasks support automatic continuation, pause and manual editing, checkpoint recovery, version snapshots, and one-step undo.
- Added a separate component creation mode for reusable HTML/CSS/JavaScript components. Generated components are saved to My Components without replacing the current page; page generation can also develop or reuse local and account components.
- Added a component designer with templates, code editing, sandboxed interactive previews, instance fields, account storage, and snapshot sharing. Generated components can be uploaded and later AI revisions can update the same cloud record.
- Added local and account component folders with creation, renaming, filtering, moving, and deletion. Deleting a folder preserves its components, moving does not change source revisions, and database constraints enforce folder limits during concurrent creation.
- Added advisory post-generation checks and component location for bounds, overlap, missing anchors, overflow, and measurable text contrast. Stable component IDs now work as in-page navigation targets.
- Added Chinese/English workbench switching and grouped header controls. Fixed checkpoint overwrites, unreadable history caused by invalid records, theme color mismatches, incorrect field repair, repeated refusal requests, premature completion, and cloud library races.

**Upgrade notes**: Page JSON remains version `1`; existing drafts and local libraries remain compatible. SQLite, PostgreSQL, and D1 migrations cover custom components and folders. Node applies migrations at startup, and Void applies D1 migrations during Cloudflare deployment. AI credentials stay in the browser; requests go directly to the configured endpoint, which must support browser CORS.

**Validation**: All 394 automated tests passed, covering SQLite APIs, D1 migrations, concurrency, and recovery. Node and Cloudflare builds passed. Browser checks used a local mock API to verify generation, interactions, folders, upload, and reload recovery without paid AI calls. PostgreSQL migrations are included but were not integration-tested against a PostgreSQL database for this release.

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
- 修正 Cloudflare 静态资源规范化跳转导致分享地址返回首页的问题，保留 `/p/<token>` 预览路径。

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
- Fixed Cloudflare asset canonicalization redirecting shared links to the homepage; preview URLs retain `/p/<token>`.

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
