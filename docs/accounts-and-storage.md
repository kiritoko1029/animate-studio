# 账号、云端站点与分享

访客可使用全部编辑、预览、交互和导出功能。登录后可以管理多个云端站点、发布只读分享链接，并同步工作台外观与属性面板展开偏好。一个站点可包含多个页面和共享布局；旧云端页面会自动作为单页站点打开。邮箱使用 6 位验证码，5 分钟有效；GitHub 使用 OAuth 登录。

## 用户操作

1. 点击右上角 **登录**，选择邮箱验证码或 GitHub。
2. 在 **云端页面** 中点击 **保存当前页面到云端**。登录本身不会上传或替换浏览器草稿。
3. 从列表打开站点后，所有页面和共享布局作为一个草稿自动保存到原记录。顶部名称是当前页面；站点名称在左侧“页面”面板修改，列表支持删除。新建站点会开始新的浏览器草稿，已有云端作品保留；站点内新增页面不会创建另一条云端记录。
4. 云端编辑地址带有 `?page=<云端记录 ID>`，刷新后会在会话恢复后重新打开该站点。记录 ID 不授予访问权限，服务端仍按账号隔离查询。
5. 点击 **分享页面** 打开 **发布与分享**。打开时只读取发布状态，不会自动创建云端站点；首次确认发布才保存并公开整个站点，生成 `/p/<随机标识>`。访客无需登录即可直接预览，页面交互保留，编辑器工具栏不显示；子页面使用 `/p/<随机标识>/<页面路径>`。
6. 发布前显示当前公开快照与草稿的页面、组件、布局和数据源差异，可展开前后 JSON 核对。点击 **检查并发布** 或 **检查并更新分享**，再次确认后才公开；每次有效发布生成一个不可变版本。继续修改草稿不会更新公开内容，无变化的发布不会生成重复版本。
7. **版本记录** 保留最近 20 个发布版本。公开回滚以历史快照生成新版本并记录来源，不改变链接或当前草稿；恢复历史草稿是独立操作，形成一个编辑器撤销步骤，不会自动公开。**关闭分享** 后旧链接失效但历史保留，重新发布使用新链接；删除站点会同时删除其分享与全部历史。

未登录的草稿和面板展开偏好保存在当前浏览器；跨设备恢复页面需要保存到账号，账号偏好独立同步。退出登录会先保存当前云端修改，再返回浏览器草稿和游客展开偏好。如果另一个标签页改变登录状态，当前编辑内容保留为浏览器草稿，旧账号的自动保存停止。保存失败时不会自动切换页面，可重试或导出 JSON。面板偏好不进入页面文档或导出。

## 账号组件

自定义组件沿用同一登录会话与数据库，私有组件按账号隔离。组件库的“保存到账号”是显式操作，登录不会自动上传本机组件。组件分享使用独立的 `/c/<分享标识>` 页面，访客可复制组件。组件当前只保留单个最新分享快照，更新、关闭分享和删除行为不变；站点的发布版本历史不会自动为自定义组件创建历史。操作说明见 [自定义组件设计器](custom-components.zh-CN.md)。

新增组件存储表 `studio_component`、`studio_component_share`；Node 使用 `0002-components` 迁移，Cloudflare 使用生成的 D1 迁移。升级时沿用下述迁移流程，不要重建现有账号库。

## 环境配置

```sh
cp docs/env.example .env
```

编辑 `.env`，不要提交真实凭据。`npm run dev`、`npm start` 和 Node 迁移命令会读取它。Cloudflare 的配置键在 `env.ts` 声明；本地 Void 也读取 `.env`。没有可用登录提供商时，登录界面会提示暂不可用，访客功能仍然开放。

| 配置 | 用途 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 至少 32 字符的随机会话密钥；生产环境必须设置，并在重新部署后保持稳定 |
| `BETTER_AUTH_URL` | 实际访问的站点 origin，例如 `https://animate-studio.vme5.de`；Node 反向代理也使用此值 |
| `RESEND_API_KEY` | Resend 的邮件发送 API Key |
| `RESEND_FROM` | Resend 已验证域名下的发件地址，例如 `Animate Studio <login@example.com>` |
| `AUTH_GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID |
| `AUTH_GITHUB_CLIENT_SECRET` | 同一个 OAuth App 的 Client Secret |
| `DATABASE_URL` | Node 使用 PostgreSQL 时设置；未设置时使用本地 SQLite |
| `STUDIO_TRUSTED_ORIGINS` | 可选的明确受信任 origin 列表，逗号分隔；通常留空 |
| `STUDIO_DATA_ALLOWED_HOSTS` | 可选的数据代理本机测试主机白名单，逗号分隔，可含端口；生产环境默认留空 |

邮箱验证码通过 [Resend](https://resend.com/domains) 发送，需要验证发件域名。验证码不返回给客户端、不写入日志，数据库保存哈希；连续 3 次验证码错误会使该验证码失效，发送接口也有限流。

在 [GitHub Developer settings](https://github.com/settings/developers) 创建 OAuth App：Homepage URL 填站点地址，Authorization callback URL 填 **`<BETTER_AUTH_URL>/api/auth/callback/github`**。本地开发建议单独创建 OAuth App。GitHub 必须提供已验证邮箱才能安全关联已有的同邮箱账号。

## 数据库与迁移

| 运行方式 | 账号、页面、分享与设置 | 迁移 |
| --- | --- | --- |
| Node，未配置 `DATABASE_URL` | `data/studio-accounts.sqlite` | 启动时应用 `db/migrations-node/sqlite-*.sql` |
| Node，配置 PostgreSQL URL | PostgreSQL | 启动时应用 `db/migrations-node/pg-*.sql` |
| Cloudflare 默认部署 | D1，绑定 `DB` | Void 使用 `db/migrations/` 的 SQL 和元数据 |

Node 迁移也可以在启动前单独执行：

```sh
npm run db:migrate:node
npm run build
NODE_ENV=production npm start
```

迁移记录在 `studio_migration` 表，重复执行只应用新迁移。PostgreSQL 迁移使用独立连接和 advisory lock；不会因为填写了无效的 `DATABASE_URL` 而静默改用 SQLite。生产 PostgreSQL 的 TLS/连接参数由数据库提供商给出。两种数据库共用账号 API 和页面仓储，数据库切换不会自动搬运已有数据，需要单独迁移数据。

Cloudflare 本地验证：

```sh
npx void prepare
npx void db migrate
npm run dev:cloudflare
```

本地站点使用 `http://127.0.0.1:4174`，对应 `.env` 中的 `BETTER_AUTH_URL` 也应使用这个地址。默认 Node 开发地址是 `http://127.0.0.1:4173`。

正式 Cloudflare 部署前配置服务器密钥，例如通过 `npx void secret put BETTER_AUTH_SECRET`、`npx void secret put RESEND_API_KEY` 等交互命令设置上述值；不要把它们放入 `VITE_*` 变量。然后运行原有 `npm run deploy:cloudflare` 流程。Void 的数据库推断已显式启用，首次部署会创建或采用 `animate-studio-accounts`，把本地 `local` 占位替换为实际 D1 ID，应用迁移并记录在 `void.lock.json`。发布后保留 lock 文件的变化。Cloudflare Token 还需要目标账号的 **D1 Edit** 权限。远端资源创建和部署需要在自己的 Cloudflare 账号中执行。

Cloudflare 默认使用 D1。高级部署也可提供 `HYPERDRIVE.connectionString` 或 `DATABASE_URL` 使用 PostgreSQL，此时优先选择 PostgreSQL，并在每次请求结束时关闭连接池；数据库需事先执行 Node 的 PostgreSQL 迁移。该分支未在真实 Hyperdrive 上验证，常规 PostgreSQL 部署建议使用已验证的 Node 入口。

## 数据凭据与受控代理

公开 REST 和静态 JSON 可直接用于预览、分享与导出，不要求账号。需要服务端凭据或受控代理时，先在 **数据源 → 请求与凭据（高级）** 中创建 Bearer Token 或 API Key，并限制允许访问的主机。密钥使用从 `BETTER_AUTH_SECRET` 派生的 AES-256-GCM 密钥加密后存入 `studio_data_credential`，页面只保存凭据 ID；列表、分享、导出和模型上下文都不返回密钥明文。更换账号密钥后旧数据凭据无法解密，需要重新创建。

`POST /api/account/data/query` 只接受当前账号已保存站点的 `pageId`、`sourceId` 和运行参数，不能传入任意 URL 或覆盖凭据。服务端逐跳检查重定向、允许主机、DNS、环回和私网地址，实际连接使用已校验的地址，原主机名仅用于 HTTP Host 与 TLS 校验，避免校验后重新解析。请求体与响应上限均为 1 MiB，总超时上限 15 秒，并按实例限制每个账号的数据查询频率。本地测试主机只有显式列入 `STUDIO_DATA_ALLOWED_HOSTS` 才允许访问。私有读取只在登录后的编辑预览中可用；分享和导出会明确提示改用公开接口，不能调用账号私有接口。

`POST /api/account/data/credentials` 创建凭据，`GET` 只返回元数据，`DELETE /api/account/data/credentials/:id` 按账号删除。迁移为 Node 的 `0006-data-credentials` 与生成的 D1 迁移，只新增表，不重建账号、页面或分享数据。表单写入还必须由用户确认方法和主机；AI、测试连接、自动保存、发布和导出不会自动执行写入。

## 站点文档与并发保存

`studio_page` 的 JSON 文本列现在可以保存旧 `PageDocument` 或版本化 `SiteDocument`（`kind: "site"`），不建立第二套页面库，也不要求为 M1 新增数据库列。原记录 ID、分享表与令牌保持原关系；一条记录最多包含 24 页，完整站点上限 2 MiB。Node、Cloudflare 和分享快照共用相同的站点结构校验。

站点写入使用 `/api/account/sites`；原 `/api/account/pages` 继续兼容旧页面与记录列表。更新时客户端提供最后读取的 `updatedAt` 作为 `expectedRevision`，数据库在同一条件更新中检查记录 ID、账号与修订。冲突返回 **409**，不会覆盖另一标签页或设备的新草稿；先导出当前内容备份，再重新打开核对，或另存为新站点。修订号在快速连续保存时也保持递增。

AI 整站生成只更新当前草稿。游客自动保存到浏览器；已有云端站点显示“待保存”，由用户显式保存或发布，不自动替用户写入账号。发布操作始终重新读取已保存草稿，生成独立的整站快照。

## 内容集合与响应式文档

内容集合是 `SiteDocument.dataSources` 中 `kind:"collection"` 的嵌入数据，不新增独立公共内容数据库。每个集合有稳定 ID、字段 schema 和最多 500 条记录；每个站点所有数据源合计最多 20 个，仍受完整站点 2 MiB 限制。文本、长文本、数字、布尔、链接和图片字段使用严格类型校验，记录 ID 与字段 key 保持稳定。详情按 `detailField` 和 `detailParameter` 匹配路由，未命中显示错误而不是返回第一条。

集合与页面共享同一份草稿、云端修订、发布快照、版本历史和回滚，因此不需要新增数据库迁移；公开访客只能读取已发布快照中的集合。图片字段继续引用媒体库素材，素材公开权限、迁移失败处理和离线内嵌规则不变。外部 REST 的写入确认与凭据边界不适用于嵌入集合，集合不提供匿名新增、修改或删除接口。

`settings.responsive` 是可选的逐页布局定义。缺少该字段或 `mode:"fixed"` 时保留固定画布；`mode:"adaptive"` 保存平板和手机各自的设计宽度、页面高度、逐组件 frame 与 `null` 隐藏标记，桌面 blocks、内容、绑定和脚本不被复制成另一套运行时。断点布局也随站点保存、发布和回滚，候选生成、手动调整、隐藏和恢复不会自动公开。单页及各断点仍受 320–6000 px 限制，共享布局合并后也不能超过 6000 px。侧栏与正文无法并排容纳时改为上下排列，保留共享菜单、内容和脚本。

## 站点媒体存储

站点图片在页面、SEO 和数据字段中使用 `asset:<uuid>` 引用，二进制不写入站点 JSON。`studio_media` 只保存站点/属主、名称、MIME、大小、内容哈希、对象键、创建时间和软删除标记；新增 `sqlite-0008-media-library.sql`、`pg-0008-media-library.sql` 与对应的 D1 迁移。数据库触发器限制每站 **100 张、50 MiB**，上传接口逐字节限制单张 **5 MiB**，并按真实文件签名允许 PNG、JPEG、WebP、GIF；SVG、HTML 和伪装文件会被拒绝。

游客按站点在 IndexedDB 中保存图片，显式保存到云端时迁移实际引用的图片。Node 把对象保存在所选 `dataDir` 的私有媒体目录；Cloudflare 通过 `inference.bindings.storage` 使用 R2 的 `STORAGE` 绑定，Void 在部署时创建或采用对应资源并更新 `void.lock.json`。部署 Token 需要目标账号的 **Workers R2 Storage: Edit** 权限；远端资源创建与部署需另行授权。

属主接口为 `/api/account/sites/:id/media`（列表/上传）和 `/api/account/sites/:id/media/:assetId`（读取/移除）。公开 `/api/shared/:token/media/:assetId` 还要求当前已发布快照实际引用该素材，因此未上传、未公开或已撤销分享的图片不能读取。发布前会检查素材是否已迁移到当前站点。关闭分享后旧公开地址失效，当前快照移除引用后该地址也失效，回滚恢复引用时恢复。

当前草稿引用的素材不能移除。只被公开历史或版本引用的素材从媒体库软删除并保留对象，保证公开回滚；未引用素材会同时删除元数据与对象。删除站点会级联删除元数据，并清理对应对象。历史软删除素材仍占用站点配额，不能用它伪造容量释放。上传先写对象再登记元数据，失败会清理新建对象；R2 使用条件创建，避免覆盖已有素材。

## 发布版本存储与接口

`studio_page_version` 保存不可变的完整站点快照，每个站点保留最近 **20 个发布版本**，不记录每次自动保存。`studio_page_share.activeVersion` 指向当前公开版本；正常发布与公开回滚复用原令牌，回滚生成的版本通过 `sourceVersion` 记录来源，不改写历史。版本写入、公开指针更新和历史清理在同一事务或 D1 原子批次中完成，不能只留下孤立版本或半更新的公开快照。Node SQLite 使用同步事务，PostgreSQL 使用异步事务，D1 使用带修订条件的原子批处理。

`POST /api/account/pages/:id/share` 需要 `expectedRevision` 和 `expectedPublishedVersion`，首次发布或关闭后的重新发布以 `null` 表示没有当前公开版本。接口只发布数据库中已经保存的草稿；无实际变化时不新增版本，修订或公开版本过期返回 409。`DELETE /share` 只撤销公开访问，不删除历史，重新发布不会复活已撤销的旧令牌。

历史接口只允许属主访问：`GET /api/account/sites/:id/versions` 返回元数据，`GET /api/account/sites/:id/versions/:version` 返回单个快照，`POST /api/account/sites/:id/versions/:version/rollback` 以当前公开版本为前提执行回滚。回滚不修改草稿，关闭分享后不能公开回滚。恢复历史草稿由编辑器按正常保存与撤销流程处理，不经过公开接口自动发布。删除站点时，分享和全部版本随外键级联删除。

Node 的 `sqlite-0007-publish-versions.sql`、`pg-0007-publish-versions.sql` 与生成的 D1 迁移同步增加版本表和当前版本指针。已有分享回填为版本 1，保留原快照、令牌和发布时间。`db/migrations-node/index.json` 只追加新迁移，不重排历史。

## 旧版草稿

旧 Cloudflare Durable Object 工作区和迁移历史保留。浏览器没有新版草稿时，会尝试读取旧工作区内容；随后改为浏览器保存，用户可以显式保存到账号。旧工作区标识不作为分享标识。

游客旧键 `animate-studio:guest-draft:v1` 保留只读兼容，新站点写入 `animate-studio:guest-site-draft:v1`。新键损坏时不会自动用空白页面覆盖；旧文件和外层 `{page, savedAt}` 结构不变，旧页面在内存中包装为单页站点。旧页面 API 仍使用 512 KB 限制，完整站点接口使用 2 MiB 限制。

本地开发模式可以读取旧 `data/page.json` 以恢复草稿，原文件不会删除。生产 Node 默认关闭这个所有访客共用的旧文件 API；账号页面只从数据库按当前用户读取。旧文件的外层是 `{page, savedAt}`，手工导入时取出 `page` 对象作为页面 JSON。

## 验证范围

`npm test` 包含邮箱 OTP、会话失效、两个账号的数据隔离、整站保存与修订冲突、发布快照、撤销与删除、来源校验、请求字节上限、GitHub 模拟授权回调及编辑器保存切换。站点模型、路由、共享布局和 AI 计划/恢复由 `tests/site-document.test.mjs`、`tests/site-preview.test.mjs` 与 `tests/site-ai.test.mjs` 覆盖；真实编辑器页面树与 AI 流程在 `tests/account-editor.test.mjs` 中验证。使用明确的、可丢弃的 PostgreSQL 测试库复测：

```sh
TEST_DATABASE_URL=postgresql://... node --test tests/account-api.test.mjs tests/account-security.test.mjs
```

真实邮件投递、GitHub 线上授权和远端部署需要配置自己的提供商凭据。测试中的邮件捕获器与 GitHub 模拟响应不会替代这些上线检查。
