# Void 与 Cloudflare 发布

本项目通过 [Void](https://void.cloud/guide/quickstart) 将 React 前端、页面 API、D1 账号存储和旧 Durable Object 工作区发布到同一个 Cloudflare Worker。Worker 名称默认为 `animate-studio`，在根目录 `void.config.ts` 中修改。

需要 Node.js **24.21.0 或更新版本**。仓库的 `.nvmrc` 和 GitHub Actions 使用 24.22.0。Void、Vite 及构建插件的版本固定在 `package-lock.json` 中，安装使用 `npm ci`。

## 本地运行与云端模式

| 命令 | 用途 | 数据位置 |
| --- | --- | --- |
| `npm run dev` | 本地 Express + Vite，端口 4173 | 浏览器草稿；账号使用本地 SQLite 或 PostgreSQL |
| `npm run dev:cloudflare` | Void / Cloudflare 开发模式，端口 4174 | `.void/` 中的 D1 与旧 Durable Objects |
| `npm run build` | 构建本地 Node.js 版本 | `dist/` |
| `npm run build:cloudflare` | 类型检查并构建 Worker 与前端 | `dist/ssr/`、`dist/client/` |
| `npm run preview:cloudflare` | 在本机 workerd 中运行云端构建 | 本地模拟存储 |
| `npm run deploy:cloudflare` | 通过 Void 构建并发布到 Cloudflare | Cloudflare D1；旧 Durable Objects 保留 |

两种构建共用 `dist/`，运行预览前应先执行对应的构建。`npm run dev` 始终使用原来的本地文件数据，不会把本地页面上传到云端。

Void 直接发布会调用默认的 Vite production 构建，因此 production 和 cloudflare 模式均启用云端插件；`npm run build` 显式使用 node 模式，输出供 Express 运行的本地版本。前端工作区开关由 Vite 配置自动注入，无需手动设置环境变量。

未登录时，草稿保存在当前浏览器，基础编辑功能不要求账号。登录后可在 D1 中保存多个页面、发布分享快照并同步个人设置。邮箱验证码使用 Resend，GitHub 使用 OAuth；完整配置与数据库迁移说明见 [账号与存储指南](accounts-and-storage.md)。

旧匿名工作区的 Durable Object 和资源身份保留，用于恢复旧草稿。页面 API 仍限制 512 KB 并校验页面结构；账号页面的所有读写都检查当前用户归属。分享链接只读取已发布快照，关闭分享后返回 404。多个设备同时编辑同一页面时，最后一次成功保存生效。

## 首次发布

```sh
npm ci
npm test
npm run build:cloudflare
npm run cloudflare:login
npm run cloudflare:status
npm run deploy:cloudflare
```

登录命令会打开浏览器，由你完成 Cloudflare 登录。拥有多个账号时，发布流程会要求选择目标账号。首次发布会创建 Worker、D1 数据库和所需的 Durable Object 绑定，并输出 `https://animate-studio.<账户子域>.workers.dev` 形式的实际地址。

`void.config.ts` 已启用 `workers_dev` 和版本预览地址。账号数据使用 D1；Void 会把本地数据库占位 ID 替换为实际 ID，并应用 `db/migrations/`。部署前按账号指南设置认证、邮件和 GitHub 密钥。

运行时配置可在 Cloudflare 控制台管理，`keep_vars` 和 `keep_secrets` 会在部署时保留已有变量及密钥。`AUTH_GITHUB_CLIENT_SECRET`、`BETTER_AUTH_SECRET`、`RESEND_API_KEY` 使用 Secret 类型；同时配置站点 `BETTER_AUTH_URL`、GitHub Client ID 和已验证域名的 `RESEND_FROM`。不要把控制台提示中的密钥复制进 `void.config.ts` 或生成的 Wrangler 文件。

发布后提交更新的 `void.lock.json`。其中记录资源身份和 Durable Object 迁移历史，可避免其他机器和 CI 把既有存储当成新资源。不要删除或重排已有迁移，也不要随意修改 `page-store` 资源名。

`.env`、`.dev.vars`、`.void/`、`.wrangler/` 和生成的 `.void-wrangler.jsonc` 不纳入 Git；Cloudflare 登录信息不放入仓库。

数据源的受控代理复用账号密钥派生加密密钥，将密文保存在 D1；列表与页面快照只返回凭据引用和允许主机，不返回密钥。Worker 通过 `cloudflare-dns.com` 的 DNS-over-HTTPS 检查代理目标的解析地址，Node 使用系统 DNS；解析服务会看到目标主机名，但不会收到数据凭据。`STUDIO_DATA_ALLOWED_HOSTS` 只用于显式允许本机测试主机，不能作为生产环境的通用内网放行开关。公开读取优先使用浏览器直接请求，无需代理。

## GitHub Actions 自动发布

工作流位于 [.github/workflows/cloudflare.yml](../.github/workflows/cloudflare.yml)：

1. Pull request 和推送到 `main` 时，执行测试、本地构建及 Cloudflare 构建。
2. `main` 验证成功后部署；也可在 GitHub 的 **Actions → Verify and deploy Cloudflare → Run workflow** 手动触发。
3. 发布按顺序执行，不中途取消正在运行的部署。PR 不读取部署凭据，也不发布生产站点。

在仓库 **Settings → Secrets and variables → Actions** 中设置：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 可部署目标 Worker 的 API Token |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | 目标 Cloudflare Account ID，尤其是 Token 可访问多个账号时 |
| Variable | `CLOUDFLARE_WORKERS_SUBDOMAIN` | 账户的 Workers 子域，如 `my-team`；没有版本预览地址时用于就绪检查 |

Token 需要目标账号的 **Workers Scripts: Edit**，**D1: Edit**，以及 Void 所需的账号/资源读取权限。按 [Void 的 Cloudflare 指南](https://void.cloud/integrations/cloudflare#deploying-from-ci) 配置，不要将 Token 放在代码或聊天中。

未设置 Token 时，工作流会完成验证，并在摘要中明确标记“Deployment skipped”。配置后再次手动运行即可发布。建议先在本机完成首次发布并提交 lock 文件，再启用自动发布。

若首次发布在 CI 上完成，下载该次运行的 `void-resource-lock` artifact，将其中的 `void.lock.json` 提交回仓库。后续资源变更也要保留此文件的更新。

## 验证与恢复

打开实际发布地址，确认访客编辑可用；登录后保存一个云端页面，在另一个浏览器登录同一账号确认恢复。发布分享后用未登录浏览器打开，并验证关闭分享后原链接失效。`/api/health` 应返回 `{"status":"ok"}`。

```sh
npx void connect --platform cloudflare
npx void project status
npx void project logs
```

发布失败时先检查错误及状态，不要删除持久化资源或 `void.lock.json`。如果 Cloudflare 明确提示现有 Durable Object Worker 无法暂存部署，按 [官方说明](https://void.cloud/integrations/cloudflare#readiness-and-rollback) 检查迁移后使用 `npm run deploy:cloudflare -- --atomic`；这会先切换流量再检查就绪，不能跨 Durable Object 类迁移边界回滚。

本地源码的 `npm test` 包含云端 API 的工作区隔离、大小限制、校验失败保护、存储错误处理，以及浏览器工作区在刷新后的稳定性测试。
