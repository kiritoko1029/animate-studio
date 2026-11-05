import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../server/index.mjs';
import { createWorkspaceDocument } from '../src/model.ts';
import { toSiteDocument } from '../shared/site-document.mjs';
import { compileWorkspace } from '../server/workspace-compiler.ts';
import { exportWorkspaceCode } from '../src/lib/code-export/workspace-export.ts';

const CHROME_BIN =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACT_DIR =
  process.env.ARTIFACT_DIR ||
  '/Users/chenxiangcai/.gemini/antigravity/brain/6f499656-1133-4604-a262-816df7ece1b5';

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.contexts = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    ws.addEventListener('message', event => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject: rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method === 'Runtime.executionContextCreated') {
        const ctx = msg.params?.context;
        if (ctx?.id) this.contexts.set(ctx.id, ctx);
      } else if (msg.method === 'Runtime.executionContextDestroyed') {
        const id = msg.params?.executionContextId;
        if (id) this.contexts.delete(id);
      } else if (msg.method === 'Runtime.executionContextsCleared') {
        this.contexts.clear();
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const text =
          msg.params?.exceptionDetails?.exception?.description ||
          msg.params?.exceptionDetails?.text ||
          'Runtime exception';
        this.pageErrors.push(text);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
        if (!text.includes('favicon')) this.consoleErrors.push(text);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, contextId) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      ...(contextId ? { contextId } : {}),
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Eval exception: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`,
      );
    }
    return res.result?.value;
  }

  async evalInWorkspaceFrame(expression) {
    const ids = [...this.contexts.keys()].reverse();
    for (const id of ids) {
      try {
        const hasRoot = await this.eval(
          `Boolean(typeof document !== 'undefined' && document.getElementById('workspace-root') && document.querySelectorAll('[data-ws-card]').length > 0)`,
          id,
        );
        if (hasRoot) {
          return await this.eval(expression, id);
        }
      } catch {
        // ignore stale context
      }
    }
    throw new Error('Workspace iframe execution context not ready yet');
  }

  async setViewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile,
    });
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor(
      `document.readyState === 'complete'`,
      `Document readyState complete for ${url}`,
    );
  }

  async waitFor(expr, description, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const val = await this.eval(`Boolean(${expr})`);
        if (val) return;
      } catch {
        // ignore transient navigation errors
      }
      await new Promise(r => setTimeout(r, 80));
    }
    throw new Error(`Timed out waiting for: ${description}`);
  }

  async screenshot(outputPath) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(outputPath, Buffer.from(data, 'base64'));
  }

  close() {
    this.ws.close();
  }
}

async function launchChrome(userDataDir) {
  const proc = spawn(
    CHROME_BIN,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-site-isolation-trials',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const wsUrl = await new Promise((res, rej) => {
    let stderr = '';
    const timer = setTimeout(() => rej(new Error(`Chrome startup timeout: ${stderr}`)), 12000);
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (match) {
        clearTimeout(timer);
        res(match[1]);
      }
    });
    proc.on('exit', code => {
      clearTimeout(timer);
      rej(new Error(`Chrome exited early (${code}): ${stderr}`));
    });
  });

  const httpBase = wsUrl.replace(/^ws:\/\//, 'http://').replace(/\/devtools\/browser\/.*$/, '');
  const targets = await fetch(`${httpBase}/json/list`).then(r => r.json());
  const pageTarget = targets.find(t => t.type === 'page');
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'Found Chrome page target');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  const session = new CdpSession(ws);
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('DOM.enable');

  return { proc, session };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), 'studio-ws-verify-'));
  let server;
  let exportServer;
  let chrome;

  try {
    const workspaceDoc = createWorkspaceDocument('react', '智绘企业级工作流平台');
    const compiled = await compileWorkspace(workspaceDoc.workspace);
    assert.equal(compiled.ok, true, 'Workspace compiled cleanly');
    workspaceDoc.workspace.compiled = compiled.compiled;

    const siteDoc = toSiteDocument(workspaceDoc);
    const shareToken = 'wsverifysharetoken2026';
    const publishedSnapshot = {
      name: siteDoc.name,
      page: siteDoc,
      publishedAt: new Date().toISOString(),
      version: 1,
    };

    // Also write standalone HTML export to serve and verify
    const exportedHtml = exportWorkspaceCode(workspaceDoc, 'html').content;
    await writeFile(join(tempDir, 'exported-workspace.html'), exportedHtml, 'utf8');

    const repository = {
      findPublished: async token => (token === shareToken ? publishedSnapshot : null),
    };
    const accounts = {
      factory: {
        baseURL: 'http://127.0.0.1:4173',
        capabilities: { cloudEnabled: false, emailEnabled: false, githubEnabled: false },
        handler: async () => new Response(JSON.stringify({ session: null, user: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      },
      context: {
        repository,
        newPageId: () => crypto.randomUUID(),
        newShareToken: () => shareToken,
        capabilities: { cloudEnabled: false, emailEnabled: false, githubEnabled: false },
        resolveUser: async () => null,
      },
      allowLegacyPageApi: false,
      close: () => {},
    };

    const app = await createApp({ serveFrontend: true, production: true, accounts });
    exportServer = await new Promise(res => {
      const s = createHttpServer((_req, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(exportedHtml);
      }).listen(0, '127.0.0.1', () => res(s));
    });
    const exportUrl = `http://127.0.0.1:${exportServer.address().port}/`;

    server = await new Promise(res => {
      const s = app.listen(0, '127.0.0.1', () => res(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    console.log(`[verify] Server listening at ${baseUrl}`);

    chrome = await launchChrome(join(tempDir, 'chrome-profile'));
    const { session } = chrome;

    // =========================================================================
    // 1. Verify Shared Page (/p/:token) across Desktop, Tablet, and Mobile
    // =========================================================================
    const viewports = [
      { name: 'desktop', width: 1440, height: 900, mobile: false, screenshot: 'ws_shared_desktop_1440.png' },
      { name: 'tablet', width: 768, height: 1024, mobile: false, screenshot: 'ws_shared_tablet_768.png' },
      { name: 'mobile', width: 390, height: 844, mobile: true, screenshot: 'ws_shared_mobile_390.png' },
    ];

    const viewportMetrics = {};

    for (const vp of viewports) {
      await session.setViewport(vp.width, vp.height, vp.mobile);
      await session.navigate(`${baseUrl}/p/${shareToken}`);
      await session.waitFor(
        `document.querySelector('[data-workspace-preview]')?.getAttribute('data-workspace-ready') === 'true'`,
        `Shared page workspace ready at ${vp.name} (${vp.width}x${vp.height})`,
      );
      await new Promise(r => setTimeout(r, 250));

      const outerMetrics = await session.eval(`(() => {
        const outerDoc = document.documentElement;
        const surface = document.querySelector('[data-workspace-preview]');
        const iframe = surface.querySelector('iframe');
        return {
          outerClientWidth: outerDoc.clientWidth,
          outerScrollWidth: outerDoc.scrollWidth,
          outerOverflowX: outerDoc.scrollWidth > outerDoc.clientWidth + 2,
          iframeWidth: Math.round(iframe.getBoundingClientRect().width),
          reportedOverflowX: surface.getAttribute('data-workspace-overflow-x') === 'true',
          interactiveCount: Number(surface.getAttribute('data-workspace-interactive-count') || 0),
        };
      })()`);

      const innerMetrics = await session.evalInWorkspaceFrame(`(() => {
        const innerDoc = document.documentElement;
        const h1 = document.querySelector('.ws-hero h1');
        const h1FontPx = parseFloat(window.getComputedStyle(h1).fontSize);
        const cardRect = document.querySelector('[data-ws-card]').getBoundingClientRect();
        return {
          innerClientWidth: innerDoc.clientWidth,
          innerScrollWidth: innerDoc.scrollWidth,
          innerOverflowX: innerDoc.scrollWidth > innerDoc.clientWidth + 2,
          h1FontPx: Math.round(h1FontPx * 10) / 10,
          firstCardWidth: Math.round(cardRect.width),
          cardCount: document.querySelectorAll('[data-ws-card]').length,
        };
      })()`);

      const metrics = { ...outerMetrics, ...innerMetrics };
      viewportMetrics[vp.name] = metrics;
      assert.equal(metrics.outerOverflowX, false, `Outer shared page has zero horizontal overflow on ${vp.name}`);
      assert.equal(metrics.innerOverflowX, false, `Inner workspace document has zero horizontal overflow on ${vp.name}`);
      assert.ok(metrics.h1FontPx >= 24, `Hero headline preserves readable 1:1 typography (${metrics.h1FontPx}px) on ${vp.name}`);
      assert.ok(metrics.firstCardWidth >= 260, `Product card preserves readable width (${metrics.firstCardWidth}px) on ${vp.name}`);

      await session.screenshot(resolve(ARTIFACT_DIR, vp.screenshot));
    }

    // =========================================================================
    // 2. Verify Real Interactive Flows on Shared Page (/p/:token)
    // =========================================================================
    await session.setViewport(1440, 900, false);
    await session.navigate(`${baseUrl}/p/${shareToken}`);
    await session.waitFor(
      `document.querySelector('[data-workspace-preview]')?.getAttribute('data-workspace-ready') === 'true'`,
      'Shared page ready for interactive flow check',
    );

    const interactionReport = await session.evalInWorkspaceFrame(`(async () => {
      const doc = document;
      const win = window;
      const wait = ms => new Promise(r => setTimeout(r, ms));

      // Step A: Filter by category '智能工作流'
      doc.querySelector('[data-ws-category="智能工作流"]').click();
      await wait(80);
      const filteredByCategoryCount = doc.querySelectorAll('[data-ws-card]').length;

      // Step B: Switch back to '全部'
      doc.querySelector('[data-ws-category="全部"]').click();
      await wait(80);
      const restoredCount = doc.querySelectorAll('[data-ws-card]').length;

      // Step C: Toggle Star on 'realtime-bi'
      const starBadgeBefore = doc.querySelector('[data-testid="starred-count"]').textContent;
      doc.querySelector('[data-ws-star="realtime-bi"]').click();
      await wait(80);
      const starBadgeAfter = doc.querySelector('[data-testid="starred-count"]').textContent;

      // Step D: Create a new module via the input & create button
      const input = doc.querySelector('[data-ws-new-input]');
      const tracker = input._valueTracker;
      const nativeSetter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'AI 智能质检中心');
      if (tracker) tracker.setValue('');
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
      await wait(80);
      doc.querySelector('[data-ws-create]').click();
      await wait(120);
      const countAfterCreate = doc.querySelectorAll('[data-ws-card]').length;

      // Step E: Open Detail Modal on 'flow-engine'
      doc.querySelector('[data-ws-detail="flow-engine"]').click();
      await wait(100);
      const modalTitle = doc.querySelector('[data-ws-modal] h2')?.textContent || '';

      return {
        filteredByCategoryCount,
        restoredCount,
        starBadgeBefore,
        starBadgeAfter,
        countAfterCreate,
        modalTitle,
      };
    })()`);

    assert.equal(interactionReport.filteredByCategoryCount, 1, 'Category filter narrows cards to 1');
    assert.equal(interactionReport.restoredCount, 3, 'Switching back to 全部 restores 3 cards');
    assert.equal(interactionReport.starBadgeBefore, '1', 'Initial starred count is 1');
    assert.equal(interactionReport.starBadgeAfter, '2', 'Clicking star button increments starred count to 2');
    assert.equal(interactionReport.countAfterCreate, 4, 'Submitting create form adds new card (4 total)');
    assert.equal(interactionReport.modalTitle, '自动化编排引擎', 'Clicking 查看详情 opens modal with item details');

    await session.screenshot(resolve(ARTIFACT_DIR, 'ws_shared_interactive_modal.png'));

    // Close modal and verify it disappears
    const modalClosed = await session.evalInWorkspaceFrame(`(async () => {
      document.querySelector('[data-ws-modal-close]').click();
      await new Promise(r => setTimeout(r, 80));
      return !document.querySelector('[data-ws-modal]');
    })()`);
    assert.equal(modalClosed, true, 'Modal closes cleanly');

    // =========================================================================
    // 3. Verify Workbench Multi-File Workspace Editor UI in Real Chrome
    // =========================================================================
    await session.setViewport(1440, 900, false);
    await session.navigate(`${baseUrl}/`);
    await session.waitFor(
      `Boolean(document.querySelector('[aria-label="代码工作区"]'))`,
      'Workbench loaded with workspace toggle button',
    );
    await session.eval(`(() => {
      document.querySelector('[aria-label="代码工作区"]').click();
    })()`);
    await session.waitFor(
      `Boolean(document.querySelector('[data-workspace-studio]')) && Boolean(document.querySelector('[data-workspace-preview]'))`,
      'Multi-file WorkspaceEditor and live preview mounted',
    );
    await new Promise(r => setTimeout(r, 800));
    await session.screenshot(resolve(ARTIFACT_DIR, 'ws_workbench_editor.png'));

    // =========================================================================
    // 4. Verify Standalone Exported HTML in Real Chrome (Zero iframe wrappers)
    // =========================================================================
    await session.navigate(exportUrl);
    await session.waitFor(
      `document.querySelectorAll('[data-ws-card]').length === 3`,
      'Standalone exported HTML rendered 3 cards directly in document body',
    );
    const exportCheck = await session.eval(`(() => {
      return {
        iframeCount: document.querySelectorAll('iframe').length,
        cardCount: document.querySelectorAll('[data-ws-card]').length,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      };
    })()`);
    exportServer.close();
    assert.equal(exportCheck.iframeCount, 0, 'Exported HTML has zero iframes');
    assert.equal(exportCheck.cardCount, 3, 'Exported HTML renders 3 cards');
    assert.equal(exportCheck.overflowX, false, 'Exported HTML has zero horizontal overflow');

    assert.deepEqual(session.pageErrors, [], 'Zero uncaught page exceptions across all browser checks');
    assert.deepEqual(session.consoleErrors, [], 'Zero console errors across all browser checks');

    console.log(
      JSON.stringify(
        {
          ok: true,
          viewportMetrics,
          interactionReport,
          exportCheck,
          screenshots: [
            resolve(ARTIFACT_DIR, 'ws_workbench_editor.png'),
            resolve(ARTIFACT_DIR, 'ws_shared_desktop_1440.png'),
            resolve(ARTIFACT_DIR, 'ws_shared_tablet_768.png'),
            resolve(ARTIFACT_DIR, 'ws_shared_mobile_390.png'),
            resolve(ARTIFACT_DIR, 'ws_shared_interactive_modal.png'),
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      chrome?.session?.close();
    } catch {}
    try {
      chrome?.proc?.kill('SIGKILL');
    } catch {}
    if (exportServer) await new Promise(r => exportServer.close(r));
    if (server) await new Promise(r => server.close(r));
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
