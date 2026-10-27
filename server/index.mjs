import express from 'express';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPageStore } from './store.mjs';
import { ValidationError, validateSaveRequest } from './validation.mjs';
import { createNodeDatabase, applyNodeMigrations, newPageId, newShareToken } from './node-database.ts';
import { createAuthFactory, resolveCapabilities, resolveSessionUser } from './auth-factory.ts';
import { createPageRepository } from '../db/page-repository.ts';
import { createComponentRepository } from '../db/component-repository.ts';
import { handleAccountApi, toResponsePayload } from './account-api.ts';
import { createResendSender } from './resend-sender.ts';
import { createDataCredentialRepository } from '../db/data-credential-repository.ts';
import { lookupNode, fetchNodeData } from './data-query-node.ts';
import { normalizeAllowedHost } from './data-query.ts';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function createApp({
  dataDir = resolve(projectRoot, 'data'),
  serveFrontend = true,
  production = process.env.NODE_ENV === 'production',
  store = createPageStore({ dataDir }),
  accounts,
  viteConfig,
} = {}) {
  const accountStack = accounts === undefined ? await createAccountStack(production, dataDir) : accounts;
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', express.json({ limit: '512kb', strict: true }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/validate', (req, res) => res.json({ page: validateSaveRequest(req.body) }));
  // The legacy single-page endpoints stay for local development and the guest
  // editor migration path. In internet-facing production they only serve the
  // in-process guest store, never the shared data/page.json file.
  app.get('/api/page', async (_req, res) => {
    if (production && !(accountStack?.allowLegacyPageApi)) {
      return res.status(404).json({ error: '未找到 API。' });
    }
    try { res.json(await store.read()); }
    catch { res.status(500).json({ error: '无法读取已保存的页面，请检查服务数据。' }); }
  });
  app.put('/api/page', async (req, res) => {
    if (production && !(accountStack?.allowLegacyPageApi)) {
      return res.status(404).json({ error: '未找到 API。' });
    }
    const page = validateSaveRequest(req.body);
    try { res.json(await store.save(page)); }
    catch { res.status(500).json({ error: '页面保存失败，原有数据已保留，请重试。' }); }
  });
  if (accountStack) {
    // Better Auth owns session cookies, OAuth state and authentication limits.
    app.all('/api/auth/*splat', async (req, res) => {
      const request = toWebRequest(req, accountStack.factory.baseURL);
      const response = await accountStack.factory.handler(request);
      await forwardResponse(response, res);
    });
    app.all(['/api/account/*splat', '/api/shared/*splat'], async (req, res, next) => {
      try {
        const context = accountStack.context.canonicalOrigin
          ? accountStack.context
          : { canonicalOrigin: accountStack.factory.baseURL, ...accountStack.context };
        const result = await handleAccountApi(toWebRequest(req, accountStack.factory.baseURL), context, req.path);
        if (!result) return next();
        await sendApiResult(toResponsePayload(result), res);
      } catch (error) {
        res.status(500).json({ error: '服务暂时无法处理请求，请重试。' });
      }
    });
  }
  app.use('/api', (_req, res) => res.status(404).json({ error: '未找到 API。' }));

  let vite;
  if (serveFrontend) {
    if (production) {
      app.use(express.static(resolve(projectRoot, 'dist')));
      app.get('/{*path}', (_req, res) => res.sendFile(resolve(projectRoot, 'dist/index.html')));
    } else {
      const { createServer } = await import('vite');
      // The runner avoids generated config modules that would retrigger Node's watcher.
      vite = await createServer({ root: projectRoot, configLoader: 'runner', server: { ...viteConfig?.server, middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    }
  }

  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: '页面数据过大（上限 512 KB）。' });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: '请求正文必须是有效的 JSON。' });
    return res.status(500).json({ error: '服务暂时无法处理请求，请重试。' });
  });
  app.locals.closeFrontend = () => vite?.close();
  if (accountStack?.close) app.locals.closeAccounts = accountStack.close;
  return app;
}

async function createAccountStack(production, dataDir) {
  let database;
  try {
    const env = process.env;
    // The account database lives beside the page store the caller chose, so
    // temporary servers (tests, tools) never touch the project's real file.
    database = await createNodeDatabase(env, { file: join(dataDir, 'studio-accounts.sqlite') });
    // Production requires an explicit secret. Without one, auth is disabled
    // (guests keep working) instead of signing sessions with a known value.
    if (production && !env.BETTER_AUTH_SECRET) {
      await database.close();
      return null;
    }
    await applyNodeMigrations(database);
    const baseURL = env.BETTER_AUTH_URL || `http://127.0.0.1:${env.PORT || 4173}`;
    const capabilities = resolveCapabilities(env);
    const factory = createAuthFactory({
      baseURL,
      secret: env.BETTER_AUTH_SECRET || 'animate-studio-development-secret',
      database: { db: database.db, provider: database.provider, schema: database.schema },
      emailEnabled: capabilities.emailEnabled,
      sender: capabilities.emailEnabled ? createResendSender(env.RESEND_API_KEY, env.RESEND_FROM) : undefined,
      githubEnabled: capabilities.githubEnabled,
      githubClientId: env.AUTH_GITHUB_CLIENT_ID,
      githubClientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
      trustedOrigins: env.STUDIO_TRUSTED_ORIGINS ? env.STUDIO_TRUSTED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    });
    const repository = createPageRepository(database.db, database.schema, database.dialect);
    const context = {
      repository,
      components: createComponentRepository(database.db, database.schema, database.dialect),
      newPageId,
      newShareToken,
      canonicalOrigin: factory.baseURL,
      capabilities: factory.capabilities,
      trustedOrigins: env.STUDIO_TRUSTED_ORIGINS ? env.STUDIO_TRUSTED_ORIGINS.split(',').map(v => v.trim()).filter(Boolean) : undefined,
      resolveUser: request => resolveSessionUser(factory.auth, request),
      data: {
        credentials: createDataCredentialRepository(database.db, database.schema.studioDataCredentials, database.dialect),
        encryptionSecret: env.BETTER_AUTH_SECRET || 'animate-studio-development-secret',
        query: { lookup: lookupNode, connect: fetchNodeData, allowedHosts: (env.STUDIO_DATA_ALLOWED_HOSTS ?? '').split(',').map(value => value.trim()).filter(Boolean).map(normalizeAllowedHost) },
      },
    };
    return { factory, context, allowLegacyPageApi: env.STUDIO_ALLOW_LEGACY_PAGE_API === '1', close: () => database.close() };
  } catch (error) {
    // Auth unavailability must never block the anonymous editor, but it must
    // not leak a half-open database handle either.
    await database?.close().catch(() => {});
    return null;
  }
}

function toWebRequest(req, baseURL) {
  // The configured public URL is authoritative behind a reverse proxy.
  const url = new URL(req.originalUrl, baseURL || `http://${req.headers.host || '127.0.0.1'}`).href;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) for (const item of value) headers.append(key, item);
  }
  const method = req.method;
  const body = ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(req.body ?? {});
  return new Request(url, { method, headers, body });
}

async function sendApiResult(result, res) {
  for (const [key, value] of Object.entries(result.headers ?? {})) res.set(key, value);
  if (result.status === 204) return res.status(204).end();
  res.status(result.status).json(result.body);
}

async function forwardResponse(response, res) {
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() !== 'set-cookie') res.set(key, value);
  }
  for (const cookie of response.headers.getSetCookie()) res.append('Set-Cookie', cookie);
  res.status(response.status);
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}

export async function closeServer(server, closeFrontend, { graceMs = 3000, closeAccounts } = {}) {
  let frontendError;
  // Vite owns HMR WebSockets. Close those before awaiting HTTP shutdown;
  // otherwise upgraded connections can keep the server close callback pending.
  try { await closeFrontend(); }
  catch (error) { frontendError = error; }
  await new Promise((resolveClose, rejectClose) => {
    const forceClose = setTimeout(() => server.closeAllConnections?.(), graceMs);
    forceClose.unref?.();
    server.close(error => {
      clearTimeout(forceClose);
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') rejectClose(error);
      else resolveClose();
    });
    server.closeIdleConnections?.();
  });
  try { await closeAccounts?.(); } catch (error) { frontendError ??= error; }
  if (frontendError) throw frontendError;
}

async function start() {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const app = await createApp();
  const server = app.listen(port, host, () => console.log(`Animate Studio is running at http://${host}:${port}`));
  server.on('error', async (error) => {
    console.error(`Cannot start server: ${error.code || 'unknown error'}`);
    await app.locals.closeFrontend();
    await app.locals.closeAccounts?.();
    process.exitCode = 1;
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // A final deadline also covers a frontend shutdown that never resolves.
    const deadline = setTimeout(() => {
      server.closeAllConnections?.();
      process.exit(1);
    }, 6000);
    deadline.unref();
    try {
      await closeServer(server, app.locals.closeFrontend, { closeAccounts: app.locals.closeAccounts });
      clearTimeout(deadline);
      process.exit(0);
    } catch (error) {
      clearTimeout(deadline);
      console.error(`Cannot close server cleanly: ${error.code || 'unknown error'}`);
      process.exit(1);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  start().catch(error => {
    console.error(`Cannot start server: ${error.code || error.message}`);
    process.exitCode = 1;
  });
}
