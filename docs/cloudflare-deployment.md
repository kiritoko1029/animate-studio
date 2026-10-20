# Void 与 Cloudflare 发布

本项目通过 [Void](https://void.cloud/guide/quickstart) 将 React 前端、页面 API 和 Durable Object 存储发布到同一个 Cloudflare Worker。Worker 名称默认为 `animate-studio`，在根目录 `void.config.ts` 中修改。

需要 Node.js **24.21.0 或更新版本**。仓库的 `.nvmrc` 和 GitHub Actions 使用 24.22.0。Void、Vite 及构建插件的版本固定在 `package-lock.json` 中，安装使用 `npm ci`。

## 本地运行与云端模式

| 命令 | 用途 | 数据位置 |
| --- | --- | --- |
| `npm run dev` | 本地 Express + Vite，端口 4173 | `data/page.json` |
| `npm run dev:cloudflare` | Void / Cloudflare 开发模式，端口 4174 | `.void/` 中模拟的 Durable Objects |
| `npm run build` | 构建本地 Node.js 版本 | `dist/` |
| `npm run build:cloudflare` | 类型检查并构建 Worker 与前端 | `dist/ssr/`、`dist/client/` |
| `npm run preview:cloudflare` | 在本机 workerd 中运行云端构建 | 本地模拟存储 |
| `npm run deploy:cloudflare` | 通过 Void 构建并发布到 Cloudflare | Cloudflare Durable Objects |

两种构建共用 `dist/`，运行预览前应先执行对应的构建。`npm run dev` 始终使用原来的本地文件数据，不会把本地页面上传到云端。

云端模式使用浏览器 `localStorage` 中随机生成的工作区标识，通过 `X-Studio-Workspace` 请求头选择一个独立的 Durable Object。相同浏览器、相同站点下的刷新和重新部署会恢复同一份页面；不同浏览器或不同站点地址各自独立。

这是匿名浏览器工作区，不提供账号登录、跨设备同步或协作。清除站点数据、使用无痕窗口，或切换域名都会改变工作区。工作区标识具有访问该页面的能力，请勿分享。重要页面应通过 **导出 → 页面 JSON** 备份，并通过导入迁移到另一浏览器或域名。

页面 API 沿用 512 KB 上限和原有结构校验；无效保存不会覆盖先前的页面。API 响应禁止缓存。Durable State 将同一工作区的操作串行执行，并在写入成功后确认保存；不同标签页同时编辑时，最后一次成功保存生效。

## 首次发布

```sh
npm ci
npm test
npm run build:cloudflare
npm run cloudflare:login
npm run cloudflare:status
npm run deploy:cloudflare
```

登录命令会打开浏览器，由你完成 Cloudflare 登录。拥有多个账号时，发布流程会要求选择目标账号。首次发布会创建 Worker 和 SQLite Durable Object 绑定，并输出 `https://animate-studio.<账户子域>.workers.dev` 形式的实际地址。

`void.config.ts` 已启用 `workers_dev` 和版本预览地址。原生应用和 SQLite Durable Objects 可在 Workers Free 的配额内运行；无需为本项目添加数据库、KV、R2 或域名。

发布后提交更新的 `void.lock.json`。其中记录资源身份和 Durable Object 迁移历史，可避免其他机器和 CI 把既有存储当成新资源。不要删除或重排已有迁移，也不要随意修改 `page-store` 资源名。

`.env`、`.dev.vars`、`.void/`、`.wrangler/` 和生成的 `.void-wrangler.jsonc` 不纳入 Git；Cloudflare 登录信息不放入仓库。

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

Token 需要目标账号的 **Workers Scripts: Edit**，以及 Void 所需的账号/资源读取权限。按 [Void 的 Cloudflare 指南](https://void.cloud/integrations/cloudflare#deploying-from-ci) 配置，不要将 Token 放在代码或聊天中。

未设置 Token 时，工作流会完成验证，并在摘要中明确标记“Deployment skipped”。配置后再次手动运行即可发布。建议先在本机完成首次发布并提交 lock 文件，再启用自动发布。

若首次发布在 CI 上完成，下载该次运行的 `void-resource-lock` artifact，将其中的 `void.lock.json` 提交回仓库。后续资源变更也要保留此文件的更新。

## 验证与恢复

打开实际发布地址，添加组件，等待“已保存”后刷新确认恢复。再用另一个浏览器打开，确认它显示独立页面。`/api/health` 应返回 `{"status":"ok"}`。

```sh
npx void project status --platform cloudflare
npx void project logs --platform cloudflare
```

发布失败时先检查错误及状态，不要删除持久化资源或 `void.lock.json`。如果 Cloudflare 明确提示现有 Durable Object Worker 无法暂存部署，按 [官方说明](https://void.cloud/integrations/cloudflare#readiness-and-rollback) 检查迁移后使用 `npm run deploy:cloudflare -- --atomic`；这会先切换流量再检查就绪，不能跨 Durable Object 类迁移边界回滚。

本地源码的 `npm test` 包含云端 API 的工作区隔离、大小限制、校验失败保护、存储错误处理，以及浏览器工作区在刷新后的稳定性测试。
