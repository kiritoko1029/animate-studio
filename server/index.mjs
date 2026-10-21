import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPageStore } from './store.mjs';
import { ValidationError, validateSaveRequest } from './validation.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function createApp({
  dataDir = resolve(projectRoot, 'data'),
  serveFrontend = true,
  production = process.env.NODE_ENV === 'production',
  store = createPageStore({ dataDir }),
} = {}) {
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
  app.get('/api/page', async (_req, res) => {
    try { res.json(await store.read()); }
    catch { res.status(500).json({ error: '无法读取已保存的页面，请检查服务数据。' }); }
  });
  app.put('/api/page', async (req, res) => {
    const page = validateSaveRequest(req.body);
    try { res.json(await store.save(page)); }
    catch { res.status(500).json({ error: '页面保存失败，原有数据已保留，请重试。' }); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '未找到 API。' }));

  let vite;
  if (serveFrontend) {
    if (production) {
      app.use(express.static(resolve(projectRoot, 'dist')));
      app.get('/{*path}', (_req, res) => res.sendFile(resolve(projectRoot, 'dist/index.html')));
    } else {
      const { createServer } = await import('vite');
      // The runner avoids generated config modules that would retrigger Node's watcher.
      vite = await createServer({ root: projectRoot, configLoader: 'runner', server: { middlewareMode: true }, appType: 'spa' });
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
  return app;
}

export async function closeServer(server, closeFrontend, { graceMs = 3000 } = {}) {
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
      await closeServer(server, app.locals.closeFrontend);
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
