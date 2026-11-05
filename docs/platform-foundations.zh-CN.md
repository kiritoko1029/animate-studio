# 平台基础契约与能力注册表方案

[返回路线图](low-code-platform-roadmap.zh-CN.md) · [M0 验收](m0-acceptance.zh-CN.md)

本文记录 M0 的站点/数据 Schema、旧文档迁移策略及能力注册表设计。现状以 `v2026.10.27` / `efd2bdd` 为基准；标为“方案”的部分尚未实现，不是可调用接口。

## 现有文档与数据契约

| 对象 | 权威定义与校验 | 所有权、保存与交付 |
| --- | --- | --- |
| 页面 `PageDocument` | [model.ts](../src/model.ts)、[validatePage](../server/validation.mjs) | `version: 1`；保存组件、frame、设置、变量和脚本。画布缩放、选择及工作台偏好不进入页面。 |
| 站点 `SiteDocument` | [site-document.mjs](../shared/site-document.mjs) 及同目录 `.d.mts`、`validateSite` | `version: 1, kind: "site"`；包含页面、首页 ID、路由、共享布局和数据源。每站 1–24 页、序列化后最多 2 MiB；每页仍使用页面校验。 |
| 数据源 | [data-sources.mjs](../shared/data-sources.mjs)、[collections.mjs](../shared/collections.mjs) | 位于站点根部，页面按 ID 引用；支持静态、REST、嵌入内容集合。每站最多 20 个数据源，集合最多 20 个字段、500 条记录。 |
| 路由与共享布局 | `matchSiteRoute`、`composeSitePage`，均在 `site-document.mjs` | 静态页、动态详情、404；共享页头/页脚/侧栏按页面引用。组合时保留独立内容，给组件、变量和脚本加前缀并检查总高度。 |
| 响应式覆盖 | [responsive.ts](../src/lib/responsive.ts) | 显式启用；桌面 blocks 保留，平板/手机记录位置、尺寸、高度与显隐覆盖。内容和事件共用；运行时按容器宽度解析。 |
| 工作台偏好 | [workbench-preferences.ts](../src/lib/workbench-preferences.ts)、[AccountProvider](../src/components/AccountProvider.tsx) | 游客在本机保存，账号按属主同步；展开状态按组件类型/设置组标识保存，搜索只临时展开。偏好不进入页面 JSON、撤销或导出。 |

数据运行时由 [runtime.ts](../src/lib/data/runtime.ts) 管理读取、取消、分页与加载/空/错误状态；图表、列表、表格和详情复用同一数据源。可视化表单写入每次确认方法和目标主机。凭据通过服务端属主校验及加密仓库管理，页面只持有引用；私有代理仅供属主编辑预览，分享与导出使用公开直连配置。完整使用边界见[使用指南](user-guide.zh-CN.md)。

编辑、预览、分享和原生 HTML 导出复用渲染器；Vue/React 下载包装同一 HTML。站点分享路径为 `/p/<token>/<path>`，单文件 HTML 用 `#/path`，因此导出刷新能够恢复路由。不要用旧的 `generateCode` 兼容测试生成器代表 UI 的实际导出入口；入口是 [download.ts](../src/lib/code-export/download.ts) → [native.ts](../src/lib/code-export/native.ts)。

## 旧文档迁移与失败处理

1. **先识别并校验**：[parseStudioDocument](../src/lib/studio-document.ts) 接受站点或旧页面；站点严格校验，旧页面校验后通过 `toFreeDocument` 处理早期流式布局。不认识的字段和版本不静默丢弃。
2. **单页升级**：`toSiteDocument` 将旧页面包装成单页站点，原页面 ID 和内容保留，站点拥有自己的 ID；旧作品不会自动启用响应式或被重排。
3. **游客草稿**：[guest-draft.ts](../src/lib/guest-draft.ts) 优先读取 `animate-studio:guest-site-draft:v1`，没有时读取旧的 `animate-studio:guest-draft:v1`，再尝试旧匿名 API。保存站点使用新键，不删除旧键。损坏的新草稿会报错并保留原文，不会自动退回旧草稿再覆盖；用户应先备份原始数据。
4. **账号与数据库**：完整站点仍保存在原 `studio_page` JSON 列，沿用账号记录和分享令牌；保存带 `expectedRevision`，冲突返回 409。失败保留当前编辑内容并阻止切换。数据库变更同时维护 SQLite、PostgreSQL 和 D1，迁移清单见 [index.json](../db/migrations-node/index.json)；不重命名原 Durable Object 或重排迁移。
5. **AI 会话**：[storage.ts](../src/lib/ai/storage.ts) 保留旧页面会话及损坏记录恢复路径；整站使用独立检查点。生成结果经校验后进入草稿，计划确认、最终修订检查和撤销入口独立于发布。详情见 [AI 协议与恢复设计](ai-generation.md)。

后续破坏性变更必须定义版本升级函数、保留原始输入和失败恢复路径，并覆盖旧页面、账号、AI、预览及三种代码导出。新增可选字段仍需更新严格白名单与 `.d.mts`，不能只扩展 TypeScript 类型。M0 当前不引入版本 2。

## 能力信息的现状

目前已有共享目录和校验，但还没有覆盖所有维度的统一能力注册表。下表是维护入口，不能再建立一份手抄的 88 组件目录作为新的真源。

| 能力 | 当前来源 | 消费方与限制 |
| --- | --- | --- |
| 类型、名称、分组、默认值、默认尺寸 | [model.ts](../src/model.ts) 的 `componentTypes/catalog/createBlock/frameSizes`；[extended-components.json](../shared/extended-components.json) | 组件库、模板与 AI 目录。88 种内置组件；`custom` 使用独立的定义与沙箱契约，不算第 89 个内置组件。 |
| 可绑定属性、变量类型、事件 | [interaction-schema.mjs](../shared/interaction-schema.mjs) 的 `bindingKeys/bindingVariableTypes/eventNames` | 联动面板及严格校验；绑定能力可能取决于实例属性，应使用查询函数而非静态布尔表。 |
| 官方属性与动效 | `shared/official-api-controls.json`、`shared/official-animation-controls.json`、[animation-settings.mjs](../shared/animation-settings.mjs) | 官方属性编辑器与保存校验。生成源和命令见 [AGENTS.md](../AGENTS.md)，不手改生成文件。 |
| 数据消费、写入与渲染 | [DataSourceManager](../src/components/DataSourceManager.tsx)、[数据组件](../src/components/data)、[data-sources.mjs](../shared/data-sources.mjs) | 当前分散在属性面板、组件与运行时；列表/表格/图表读取集合，表单确认后写入，详情也可以用属性表达式订阅。 |
| AI 组件指南与允许操作 | [protocol.ts](../src/lib/ai/protocol.ts)、[site-ai.ts](../src/lib/ai/site-ai.ts) | `componentGuide()` 从目录和尺寸派生，但 `builtinGuide` 等语义说明仍手工维护；整站计划与单页操作分开。 |
| 质量检查 | [quality.ts](../src/lib/ai/quality.ts) | 已有越界、重叠、链接、溢出和对比度检查；带真实 DOM 时才有相应测量，不是完整无障碍审计。 |

## 统一注册表方案（设计交付，尚未实施）

目标是在现有模块外增加只读能力查询，先减少目录、面板和 AI 指南的漂移；保存校验与运行时继续承担最终约束。

| 拟提供的维度 | 生成或组合方式 |
| --- | --- |
| 稳定类型与展示信息 | 从现有目录读取类型、名称、分组、官方文档地址；本地化在展示层处理。 |
| 默认配置与尺寸 | 调用现有工厂并返回独立副本，避免实例共享可变状态。 |
| 属性、绑定与事件 | 复用官方生成 Schema 和现有实例查询函数，不复制白名单。 |
| 数据能力 | 显式描述集合读取、详情表达式、字段映射、确认后写入；区分编辑预览、公开分享和导出中的可用范围。 |
| AI 指南与质量规则 | 从上述信息派生机器可读上下文，保留必要的手工语义说明；声明所需文档/DOM 上下文，不能仅看 JSON 就宣称测量通过。 |

建议分三次独立改动实施：先增加查询适配层及目录一致性验证，再迁移组件库/面板/AI 消费方，最后清除没有调用者的重复映射。无需为此修改已有页面结构、默认值或发布行为。禁止为了让目录“统一”而扩大 AI 的写入权限。

实施验收条件：

- 88 个内置类型一一对应、无遗漏重复；自定义组件保留独立契约。
- 默认实例、可绑定字段、事件和官方属性与现有校验相符；按实例变化的能力不丢失。
- 从同一能力信息构造的页面在编辑、分享和 HTML/Vue/React 导出中可用。
- AI 指南不宣告未实现能力；凭据、私有数据和外部写入确认不被适配层绕过。
- 每个调用方迁移后保留行为测试，再删除其重复映射。

这份方案满足 M0 的“能力注册表方案”交付；运行时代码统一化应另立实施任务，不在本轮文档收尾中标为完成。
