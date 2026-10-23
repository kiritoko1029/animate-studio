# 账号、云端页面与分享

访客可使用全部编辑、预览、交互和导出功能。登录后可以管理多个云端页面、发布只读分享链接，并同步工作台外观。邮箱使用 6 位验证码，5 分钟有效；GitHub 使用 OAuth 登录。

## 用户操作

1. 点击右上角 **登录**，选择邮箱验证码或 GitHub。
2. 在 **云端页面** 中点击 **保存当前页面到云端**。登录本身不会上传或替换浏览器草稿。
3. 从列表打开页面后，修改自动保存到该页面。名称在编辑器顶部修改；列表支持删除。新建页面会开始新的浏览器草稿，已有云端作品保留。
4. 云端编辑地址带有 `?page=<页面 ID>`，刷新后会在会话恢复后重新打开该页面。页面 ID 不授予访问权限。
5. 点击 **分享页面 → 创建分享链接**，生成 `/p/<随机标识>`。访客无需登录即可直接预览，页面交互保留，编辑器工具栏不显示。
6. 分享保存的是发布时的快照。继续修改草稿不会更新分享内容；点击 **更新分享内容** 才发布修改。**关闭分享** 或删除页面后，原链接返回不可用。

未登录的草稿保存在当前浏览器；跨设备恢复需要保存到账号。退出登录会先保存当前云端修改，再返回浏览器草稿。如果另一个标签页改变登录状态，当前编辑内容保留为浏览器草稿，旧账号的自动保存停止。保存失败时不会自动切换页面，可重试或导出 JSON。

## 账号组件

自定义组件沿用同一登录会话与数据库，私有组件按账号隔离。组件库的“保存到账号”是显式操作，登录不会自动上传本机组件。组件分享使用独立的 `/c/<分享标识>` 页面；发布快照、更新、撤销和删除的行为与页面分享一致，访客可复制组件。操作说明见 [自定义组件设计器](custom-components.zh-CN.md)。

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

## 旧版草稿

旧 Cloudflare Durable Object 工作区和迁移历史保留。浏览器没有新版草稿时，会尝试读取旧工作区内容；随后改为浏览器保存，用户可以显式保存到账号。旧工作区标识不作为分享标识。

本地开发模式可以读取旧 `data/page.json` 以恢复草稿，原文件不会删除。生产 Node 默认关闭这个所有访客共用的旧文件 API；账号页面只从数据库按当前用户读取。旧文件的外层是 `{page, savedAt}`，手工导入时取出 `page` 对象作为页面 JSON。

## 验证范围

`npm test` 包含邮箱 OTP、会话失效、两个账号的数据隔离、发布快照、撤销与删除、来源校验、请求字节上限、GitHub 模拟授权回调及编辑器保存切换。使用明确的、可丢弃的 PostgreSQL 测试库复测：

```sh
TEST_DATABASE_URL=postgresql://... node --test tests/account-api.test.mjs tests/account-security.test.mjs
```

真实邮件投递、GitHub 线上授权和远端部署需要配置自己的提供商凭据。测试中的邮件捕获器与 GitHub 模拟响应不会替代这些上线检查。
