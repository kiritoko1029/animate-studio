import test from 'node:test';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
import { parse as parseVueSfc, compileScript as compileVueScript, compileTemplate as compileVueTemplate, compileStyle as compileVueStyle } from 'vue/compiler-sfc';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createDocument, createWorkspaceDocument, createDefaultWorkspace } from '../src/model.ts';
import { isSafeWorkspacePath, validateWorkspace, workspaceLimits } from '../shared/workspace.mjs';
import { validatePage, validateSite } from '../server/validation.mjs';
import { toSiteDocument, composeSitePage } from '../shared/site-document.mjs';
import { compileWorkspace, verifyWorkspacePreviewOnServer } from '../server/workspace-compiler.ts';
import { verifyWorkspacePreview } from '../src/lib/workspace/compiler-client.ts';
import { applyAiOperation, parseAiOperation, AiOperationDecoder, buildAiContext } from '../src/lib/ai/protocol.ts';
import { AiRunner } from '../src/lib/ai/runner.ts';
import { newAiSession } from '../src/lib/ai/storage.ts';
import { defaultAiSettings } from '../src/lib/ai/config.ts';
import { inspectAiPage } from '../src/lib/ai/quality.ts';
import { generateNativeCode } from '../src/lib/code-export/native.ts';
import { exportWorkspaceCode, exportWorkspaceProjectFiles } from '../src/lib/code-export/workspace-export.ts';
import { checkoutWorkspaceCommit, computeUnifiedDiff, highlightCodeLine } from '../src/lib/workspace/git-diff.ts';
import { ANIMATE_UI_WORKSPACE_COMPONENTS } from '../src/lib/workspace/animate-ui-kit.ts';
import { runWorkspaceCodeCheck, runWorkspaceTestSuite } from '../src/lib/workspace/tools.ts';

const profile = { ...defaultAiSettings().profiles.openai, apiKey: 'test-key', model: 'test-model' };

function loadDom(t, html) {
  const errors = [];
  const vConsole = new VirtualConsole();
  vConsole.on('jsdomError', error => {
    if (error.type !== 'css parsing') errors.push(error.message);
  });
  const dom = new JSDOM(html, {
    url: 'https://workspace.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vConsole,
    beforeParse(window) {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    },
  });
  t.after(() => dom.window.close());
  return { window: dom.window, document: dom.window.document, errors };
}

const until = async (predicate, description) => {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(description);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
};

test('workspace contract validates safe paths, frameworks, entry existence, and site preservation', () => {
  assert.equal(isSafeWorkspacePath('src/App.tsx'), true);
  assert.equal(isSafeWorkspacePath('src/components/FilterBar.tsx'), true);
  assert.equal(isSafeWorkspacePath('src/App.vue'), true);
  assert.equal(isSafeWorkspacePath('index.html'), true);
  assert.equal(isSafeWorkspacePath('/etc/passwd'), false);
  assert.equal(isSafeWorkspacePath('../secret.ts'), false);
  assert.equal(isSafeWorkspacePath('node_modules/react/index.js'), false);
  assert.equal(isSafeWorkspacePath('src/bad.exe'), false);

  for (const fw of ['react', 'vue', 'html']) {
    const doc = createWorkspaceDocument(fw);
    assert.equal(doc.workspace.framework, fw);
    assert.doesNotThrow(() => validatePage(doc));
    const site = toSiteDocument(doc);
    assert.doesNotThrow(() => validateSite(site));
    const composed = composeSitePage(site, site.pages[0], 1440);
    assert.ok(composed.workspace);
    assert.equal(composed.workspace.framework, fw);
  }

  assert.throws(
    () => validateWorkspace({ version: 1, framework: 'react', entry: 'src/Missing.tsx', files: { 'src/App.tsx': { content: 'export default function App() { return null; }' } } }),
    /入口文件.*不存在/,
  );
  assert.throws(
    () => validateWorkspace({ version: 1, framework: 'svelte', entry: 'src/App.tsx', files: { 'src/App.tsx': { content: '' } } }),
    /必须是 react、vue 或 html/,
  );
  assert.equal(workspaceLimits.maxFiles, 32);
});

test('pre-built compiler bundles React (.tsx), Vue 3 (.vue), and HTML multi-file workspaces and reports diagnostics on errors', async t => {
  // 1. React multi-file workspace compilation & JSDOM interactive verification
  const reactWs = createDefaultWorkspace('react');
  const reactResult = await compileWorkspace(reactWs);
  assert.equal(reactResult.ok, true, 'Default multi-file React workspace compiles cleanly');
  assert.ok(reactResult.compiled.js.length > 1000);
  assert.ok(reactResult.compiled.css.includes('.ws-grid'));

  const doc = createWorkspaceDocument('react');
  doc.workspace.compiled = reactResult.compiled;
  const htmlExport = exportWorkspaceCode(doc, 'html').content;
  const dom = loadDom(t, htmlExport);

  await until(() => dom.document.querySelectorAll('[data-ws-card]').length === 3, 'renders all 3 initial product cards');

  // Verify category filter interaction
  const aiCategoryTab = dom.document.querySelector('[data-ws-category="智能工作流"]');
  assert.ok(aiCategoryTab, 'category tab exists');
  aiCategoryTab.click();
  await until(() => dom.document.querySelectorAll('[data-ws-card]').length === 1, 'filtering by 智能工作流 updates visible cards to 1');

  // Verify star toggle interaction
  const allTab = dom.document.querySelector('[data-ws-category="全部"]');
  allTab.click();
  await until(() => dom.document.querySelectorAll('[data-ws-card]').length === 3, 'switching back to 全部 shows all 3 cards');

  // Verify detail modal open & close interaction
  const detailBtn = dom.document.querySelector('[data-ws-detail="flow-engine"]');
  assert.ok(detailBtn, 'detail trigger button exists');
  detailBtn.click();
  await until(() => Boolean(dom.document.querySelector('[data-ws-modal]')), 'clicking detail button opens modal');
  assert.match(dom.document.querySelector('[data-ws-modal]').textContent, /自动化编排引擎/);
  dom.document.querySelector('[data-ws-modal-close]').click();
  await until(() => !dom.document.querySelector('[data-ws-modal]'), 'clicking close button dismisses modal');
  assert.deepEqual(dom.errors, []);

  // 2. Vue 3 SFC multi-file workspace compilation
  const vueWs = createDefaultWorkspace('vue');
  vueWs.files['src/data/extra.ts'] = { content: 'export const EXTRA_TAG = "Vue3 Ready";' };
  const vueResult = await compileWorkspace(vueWs);
  assert.equal(vueResult.ok, true, 'Vue 3 SFC workspace compiles cleanly');
  assert.ok(vueResult.compiled.js.length > 1000);
  assert.ok(vueResult.compiled.css.includes('data-v-'), 'Vue scoped CSS attributes are compiled');

  // 3. HTML multi-file workspace compilation
  const htmlWs = createDefaultWorkspace('html');
  const htmlResult = await compileWorkspace(htmlWs);
  assert.equal(htmlResult.ok, true, 'HTML workspace compiles cleanly');
  assert.ok(htmlResult.compiled.html.includes('ws-app-root'));

  // 4. Missing import & syntax error diagnostics
  const brokenWs = createDefaultWorkspace('react');
  brokenWs.files['src/App.tsx'] = {
    content: `import React from 'react';\nimport { NonExistent } from './components/DoesNotExist';\nexport default function App() { return <NonExistent />; }`,
  };
  const brokenResult = await compileWorkspace(brokenWs);
  assert.equal(brokenResult.ok, false);
  assert.ok(brokenResult.errors.some(err => err.file === 'src/App.tsx' && err.message.includes('DoesNotExist')));
});

test('AI streaming protocol supports workspaceInit, writeFile, deleteFile and self-heals broken workspace imports before completion', async () => {
  let page = createDocument(true);
  page = applyAiOperation(page, parseAiOperation(JSON.stringify({
    v: 1,
    seq: 1,
    op: 'workspaceInit',
    framework: 'react',
    entry: 'src/App.tsx',
    summary: '初始化 React 工作区',
  }))).page;
  assert.equal(page.workspace.framework, 'react');

  page = applyAiOperation(page, parseAiOperation(JSON.stringify({
    v: 1,
    seq: 2,
    op: 'writeFile',
    path: 'src/data/metrics.ts',
    content: 'export const METRICS = [{ id: "m1", label: "转化率", value: "98.4%" }];',
    summary: '写入指标数据',
  }))).page;
  assert.ok(page.workspace.files['src/data/metrics.ts']);

  page = applyAiOperation(page, parseAiOperation(JSON.stringify({
    v: 1,
    seq: 3,
    op: 'deleteFile',
    path: 'src/data/metrics.ts',
    summary: '删除临时数据文件',
  }))).page;
  assert.equal(page.workspace.files['src/data/metrics.ts'], undefined);
  assert.throws(() => applyAiOperation(page, { v: 1, seq: 4, op: 'deleteFile', path: 'src/App.tsx' }), /入口文件/);

  // Test AiRunner self-healing loop when Round 1 writes a broken import in src/App.tsx and Round 2 fixes it by creating the missing component
  let round = 0;
  let lastErrorSeenByModel = '';
  const initialPage = createDocument(true);
  let currentPage = initialPage;
  let currentSession = newAiSession(initialPage);

  const runner = new AiRunner({
    getPage: () => currentPage,
    getOwner: () => 'guest',
    checkpoint: session => {
      currentSession = structuredClone(session);
      return currentSession;
    },
    commit: nextPage => {
      currentPage = nextPage;
    },
    onSession: session => {
      currentSession = session;
    },
    onRunning: () => {},
    yieldFrame: async () => {},
    stream: async function* (_provider, _profile, context) {
      round++;
      const parsedContext = JSON.parse(context.context);
      lastErrorSeenByModel = parsedContext.lastError || '';
      if (round === 1) {
        const ops = [
          { v: 1, seq: 1, op: 'workspaceInit', framework: 'react', entry: 'src/App.tsx', summary: 'Init workspace' },
          {
            v: 1,
            seq: 2,
            op: 'writeFile',
            path: 'src/App.tsx',
            content: `import React from 'react';\nimport { CounterPanel } from './components/CounterPanel';\nexport default function App() { return <CounterPanel />; }`,
            summary: 'Write App with missing import',
          },
          { v: 1, seq: 3, op: 'done', summary: 'Finished round 1' },
        ];
        yield { type: 'text', text: ops.map(o => JSON.stringify(o)).join('\n') + '\n' };
        yield { type: 'complete' };
      } else {
        const ops = [
          {
            v: 1,
            seq: 1,
            op: 'writeFile',
            path: 'src/components/CounterPanel.tsx',
            content: `import React, { useState } from 'react';\nexport function CounterPanel() { const [n, setN] = useState(1); return <button onClick={() => setN(n + 1)}>Count: {n}</button>; }`,
            summary: 'Create missing CounterPanel component',
          },
          { v: 1, seq: 2, op: 'done', summary: 'Fixed missing import and compiled' },
        ];
        yield { type: 'text', text: ops.map(o => JSON.stringify(o)).join('\n') + '\n' };
        yield { type: 'complete' };
      }
    },
  });

  await runner.start(currentSession, 'openai', profile, 'Build an interactive counter workspace', 'zh-CN');
  assert.equal(round, 2, 'AiRunner automatically triggered round 2 to heal compile error');
  assert.match(lastErrorSeenByModel, /CounterPanel/, 'Round 2 received exact missing module diagnostic');
  assert.equal(currentSession.status, 'complete');
  assert.ok(currentPage.workspace?.compiled?.js, 'Final workspace has compiled bundle attached');

  // Verify buildAiContext omits compiled bundle from LLM prompt to save tokens
  const builtCtx = buildAiContext(currentPage, currentSession, 'zh-CN', false);
  const ctxJson = JSON.parse(builtCtx.context);
  assert.equal(ctxJson.page.workspace.compiled, undefined);
  assert.ok(ctxJson.page.workspace.files['src/components/CounterPanel.tsx']);

  // Verify inspectAiPage reports zero compile issues on healed page
  const quality = inspectAiPage(currentPage);
  assert.equal(quality.issues.length, 0);
});

test('workspace native exports produce real HTML, React (.jsx), and Vue 3 (.vue) code without iframe wrappers', async () => {
  const reactDoc = createWorkspaceDocument('react');
  const compiledReact = await compileWorkspace(reactDoc.workspace);
  assert.equal(compiledReact.ok, true);
  reactDoc.workspace.compiled = compiledReact.compiled;

  const dummyBundle = { code: '', css: '' };
  const htmlOut = generateNativeCode(reactDoc, 'html', dummyBundle);
  const reactOut = generateNativeCode(reactDoc, 'react', dummyBundle);
  const vueOut = generateNativeCode(reactDoc, 'vue', dummyBundle);

  // 1. Assert zero iframe / srcDoc wrappers in all 3 formats
  for (const [fmt, out] of [['html', htmlOut], ['react', reactOut], ['vue', vueOut]]) {
    assert.ok(!/<iframe\b/i.test(out.content), `${fmt} export must NOT contain an <iframe> wrapper`);
    assert.ok(!/\bsrcDoc=/i.test(out.content), `${fmt} export must NOT use srcDoc`);
    assert.ok(!/:srcdoc=/i.test(out.content), `${fmt} export must NOT use :srcdoc`);
  }

  // 2. Verify React export (GeneratedPage.jsx) is real compilable JSX containing the workspace components and hooks
  assert.equal(reactOut.filename, 'GeneratedPage.jsx');
  assert.match(reactOut.content, /useState/);
  assert.match(reactOut.content, /WORKSPACE_PROJECT_FILES/);
  assert.match(reactOut.content, /export default function GeneratedPage/);
  const transformedReact = transformSync(reactOut.content, { loader: 'jsx', format: 'esm' });
  assert.ok(transformedReact.code.includes('function GeneratedPage'));

  // 3. Verify Vue 3 SFC export (GeneratedPage.vue) from a Vue workspace is a real compilable Vue 3 SFC
  const vueDoc = createWorkspaceDocument('vue');
  const compiledVue = await compileWorkspace(vueDoc.workspace);
  assert.equal(compiledVue.ok, true);
  vueDoc.workspace.compiled = compiledVue.compiled;
  const nativeVueSfc = generateNativeCode(vueDoc, 'vue', dummyBundle);
  assert.equal(nativeVueSfc.filename, 'GeneratedPage.vue');
  assert.ok(!/<iframe\b/i.test(nativeVueSfc.content));

  const parsedSfc = parseVueSfc(nativeVueSfc.content, { filename: 'GeneratedPage.vue' });
  assert.equal(parsedSfc.errors.length, 0, 'GeneratedPage.vue parses with 0 errors');
  assert.ok(parsedSfc.descriptor.scriptSetup, 'GeneratedPage.vue uses <script setup>');
  assert.ok(parsedSfc.descriptor.template, 'GeneratedPage.vue has <template>');
  const compiledSfcScript = compileVueScript(parsedSfc.descriptor, { id: 'export-test' });
  assert.ok(compiledSfcScript.content.length > 100);
  const compiledSfcTemplate = compileVueTemplate({
    source: parsedSfc.descriptor.template.content,
    filename: 'GeneratedPage.vue',
    id: 'export-test',
  });
  assert.equal(compiledSfcTemplate.errors.length, 0);
  const compiledSfcStyle = compileVueStyle({
    source: parsedSfc.descriptor.styles[0].content,
    filename: 'GeneratedPage.vue',
    id: 'data-v-export',
    scoped: false,
  });
  assert.equal(compiledSfcStyle.errors.length, 0);

  // 4. Verify multi-file project export dictionary contains locked package.json and source files
  const projectFiles = exportWorkspaceProjectFiles(reactDoc, 'react');
  assert.ok(projectFiles['package.json']);
  assert.ok(projectFiles['src/App.tsx']);
  assert.ok(projectFiles['src/components/Navbar.tsx']);
  assert.ok(projectFiles['src/components/DetailModal.tsx']);
  assert.ok(projectFiles['src/data/mockData.ts']);
  assert.ok(projectFiles['src/styles.css']);
});

test('workspace automatically maintains Git commit history, unified diff, syntax highlighting, and live AI streaming extraction', () => {
  // 1. Default workspace initializes with an automatic Git repository and initial commit
  const ws = createDefaultWorkspace('react', 'Git Demo');
  assert.ok(ws.git, 'workspace.git is initialized');
  assert.equal(ws.git.branch, 'main');
  assert.equal(ws.git.commits.length, 1);
  assert.equal(ws.git.commits[0].author, 'System');
  assert.equal(ws.git.head, ws.git.commits[0].hash);

  // 2. AI writeFile automatically creates a new Git commit with author="AI" and accurate line diff stats
  let page = createDocument(true);
  page.workspace = ws;
  page = applyAiOperation(page, parseAiOperation(JSON.stringify({
    v: 1,
    seq: 1,
    op: 'writeFile',
    path: 'src/data/mockData.ts',
    content: `${ws.files['src/data/mockData.ts'].content}\nexport const NEW_FEATURE_ENABLED = true;\n`,
    summary: '开启新特性常量',
  }))).page;

  assert.equal(page.workspace.git.commits.length, 2);
  assert.equal(page.workspace.git.commits[0].author, 'AI');
  assert.match(page.workspace.git.commits[0].message, /开启新特性常量/);
  const mockDataChange = page.workspace.git.commits[0].changes.find(c => c.path === 'src/data/mockData.ts');
  assert.ok(mockDataChange);
  assert.equal(mockDataChange.status, 'M');
  assert.ok(mockDataChange.additions >= 1);

  // 3. Checkout / rollback restores files to the initial commit and records a revert commit
  const initialCommit = page.workspace.git.commits[1];
  const rolledBack = checkoutWorkspaceCommit(page.workspace, initialCommit);
  assert.ok(rolledBack);
  assert.ok(!rolledBack.files['src/data/mockData.ts'].content.includes('NEW_FEATURE_ENABLED'));
  assert.equal(rolledBack.git.commits.length, 3);
  assert.match(rolledBack.git.commits[0].message, /revert:/);

  // 4. Unified Diff & Multi-Color Syntax Highlighting
  const diff = computeUnifiedDiff(
    'import React from "react";\nconst count = 1;\n',
    'import React, { useState } from "react";\nconst count = 2;\nexport default App;\n',
  );
  assert.equal(diff.additions, 3);
  assert.equal(diff.deletions, 2);
  assert.ok(diff.lines.some(l => l.type === 'add' && l.text.includes('useState')));
  assert.ok(diff.lines.some(l => l.type === 'del' && l.text.includes('count = 1')));

  const tokens = highlightCodeLine('import React, { useState } from "react"; // comment 42');
  assert.ok(tokens.some(t => t.kind === 'keyword' && t.text === 'import'));
  assert.ok(tokens.some(t => t.kind === 'string' && t.text === '"react"'));
  assert.ok(tokens.some(t => t.kind === 'comment' && t.text.includes('// comment 42')));

  // 5. Live AI streaming extraction while a writeFile JSONL line is only partially streamed
  const decoder = new AiOperationDecoder();
  const partialLine = '{"v":1,"seq":1,"op":"writeFile","path":"src/App.tsx","summary":"实时生成主视图","content":"import React from \\"react\\";\\nexport function App() {\\n  return <h1>Live Diff';
  const ops = [...decoder.push(partialLine)];
  assert.equal(ops.length, 0, 'Incomplete JSONL line has not emitted a completed operation yet');
  const liveFile = decoder.peekStreamingWorkspaceWrite();
  assert.ok(liveFile, 'peekStreamingWorkspaceWrite extracts in-progress file from buffer');
  assert.equal(liveFile.path, 'src/App.tsx');
  assert.equal(liveFile.summary, '实时生成主视图');
  assert.equal(liveFile.content, 'import React from "react";\nexport function App() {\n  return <h1>Live Diff');
});

test('workspace supports Animate UI components (animate-ui virtual module & useAnimateUi) and AI workspace tools (codeCheck, testRunner, patchFile, themeTokens, responsiveFix, mockStore)', async t => {
  assert.ok(ANIMATE_UI_WORKSPACE_COMPONENTS.length >= 15, 'At least 15 Animate UI components are registered for workspaces');

  // 1. AI useAnimateUi operation scaffolds Animate UI into workspace
  let page = createWorkspaceDocument('react');
  page = applyAiOperation(page, parseAiOperation(JSON.stringify({
    v: 1,
    seq: 1,
    op: 'useAnimateUi',
    components: ['GradientText', 'RippleButton', 'CountingNumber', 'StarsBackground', 'AnimateTabs', 'AnimateModal'],
    summary: '挂载 Animate UI 核心动效组件',
  }))).page;
  assert.ok(page.workspace.files['src/components/animate-ui/index.tsx'], 'src/components/animate-ui/index.tsx is created');

  // 2. AI writes App.tsx importing directly from "animate-ui" and uses patchFile + runTool
  page = applyAiOperation(page, parseAiOperation(JSON.stringify({
    v: 1,
    seq: 2,
    op: 'writeFile',
    path: 'src/App.tsx',
    content: `import React, { useState } from 'react';
import { GradientText, RippleButton, CountingNumber, StarsBackground, AnimateTabs, AnimateModal } from 'animate-ui';
import './styles.css';

export default function App() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1200);
  return (
    <div className="ws-app">
      <StarsBackground>
        <GradientText text="Animate UI Multi-File Workspace" />
        <CountingNumber number={count} prefix="¥" suffix="+" />
        <RippleButton onClick={() => { setCount(c => c + 100); setOpen(true); }}>增加计数并打开详情</RippleButton>
      </StarsBackground>
      <AnimateTabs tabs={[{ id: 'a', label: '概览', content: '概览内容' }, { id: 'b', label: '详情', content: '详情内容' }]} />
      <AnimateModal open={open} title="动效详情弹窗" onClose={() => setOpen(false)}>
        <p data-testid="modal-text">当前计数：{count}</p>
      </AnimateModal>
    </div>
  );
}
`,
    summary: '使用 Animate UI 组件构建主界面',
  }))).page;

  // 3. Test patchFile operation
  page = applyAiOperation(page, parseAiOperation(JSON.stringify({
    v: 1,
    seq: 3,
    op: 'patchFile',
    path: 'src/App.tsx',
    search: 'const [count, setCount] = useState(1200);',
    replace: 'const [count, setCount] = useState(2500);',
    summary: '将初始计数调整为 2500',
  }))).page;
  assert.match(page.workspace.files['src/App.tsx'].content, /useState\(2500\)/);

  // 4. Test runTool operations (inspectAnimateUi, searchCode, themeTokens, responsiveFix, mockStore, codeCheck, testRunner)
  for (const [idx, toolPayload] of [
    [4, { tool: 'inspectAnimateUi', args: { component: 'RippleButton' } }],
    [5, { tool: 'searchCode', args: { query: 'useState' } }],
    [6, { tool: 'themeTokens', args: { preset: 'cyber-dark' } }],
    [7, { tool: 'responsiveFix', args: {} }],
    [8, { tool: 'mockStore', args: { storeKey: 'demo_store' } }],
    [9, { tool: 'codeCheck', args: {} }],
    [10, { tool: 'testRunner', args: {} }],
  ]) {
    const res = applyAiOperation(page, parseAiOperation(JSON.stringify({
      v: 1,
      seq: idx,
      op: 'runTool',
      ...toolPayload,
      summary: `运行工具 ${toolPayload.tool}`,
    })));
    page = res.page;
    assert.ok(res.warnings.length >= 1, `runTool(${toolPayload.tool}) emits AI diagnostic feedback via warnings`);
  }
  assert.ok(page.workspace.files['src/data/storage.ts'], 'mockStore generated src/data/storage.ts');

  // Verify buildAiContext injects workspaceToolkit (Animate UI catalog + codeCheck + testSuite) for AI consumption
  const aiCtx = JSON.parse(buildAiContext(page, newAiSession(page), 'zh-CN', false).context);
  assert.ok(aiCtx.workspaceToolkit, 'buildAiContext includes workspaceToolkit for AI');
  assert.ok(aiCtx.workspaceToolkit.animateUiComponents.length >= 15);
  assert.equal(aiCtx.workspaceToolkit.codeCheck.ok, true);
  assert.equal(aiCtx.workspaceToolkit.testSuite.ok, true);

  // 5. Verify codeCheck and testRunner reports
  const checkReport = runWorkspaceCodeCheck(page.workspace);
  assert.equal(checkReport.ok, true, 'Workspace passes static code check');
  assert.ok(checkReport.score >= 85);

  const testReport = runWorkspaceTestSuite(page.workspace);
  assert.equal(testReport.ok, true, 'Workspace passes all 5 automated test suites');
  assert.equal(testReport.passed, 5);

  // 6. Compile and execute in JSDOM to verify Animate UI components render and interact properly
  const compiled = await compileWorkspace(page.workspace);
  assert.equal(compiled.ok, true, 'Workspace importing from animate-ui compiles cleanly');
  page.workspace.compiled = compiled.compiled;

  const html = exportWorkspaceCode(page, 'html').content;
  const dom = loadDom(t, html);
  await until(() => Boolean(dom.document.querySelector('[data-animate-ui="GradientText"]')), 'renders GradientText component');
  assert.match(dom.document.querySelector('[data-animate-ui="GradientText"]').textContent, /Animate UI Multi-File Workspace/);

  const rippleBtn = dom.document.querySelector('[data-animate-ui="RippleButton"]');
  assert.ok(rippleBtn, 'renders RippleButton component');
  rippleBtn.click();
  await until(() => Boolean(dom.document.querySelector('[data-animate-ui="AnimateModal"]')), 'clicking RippleButton opens AnimateModal');
  assert.match(dom.document.querySelector('[data-testid="modal-text"]').textContent, /2600/);
});

test('verifyWorkspacePreview detects blank/crashing previews and AiRunner automatically self-heals until preview renders visible DOM', async () => {
  // 1. Free-canvas block operations are rejected when page.workspace is active
  const wsPage = createWorkspaceDocument('vue');
  assert.throws(
    () =>
      applyAiOperation(
        wsPage,
        parseAiOperation(
          JSON.stringify({
            v: 1,
            seq: 1,
            op: 'add',
            id: 'hero-1',
            type: 'hero',
            props: { title: 'Wrong mode' },
            frame: { x: 48, y: 48, width: 800, height: 400 },
            summary: 'Wrong mode',
          }),
        ),
      ),
    /不支持自由画布组件操作/,
  );

  // 2. Vue 3 workspace with lucide-vue-next, animate-ui, and unimported ref/computed compiles and renders non-empty preview
  const vueWs = createDefaultWorkspace('vue', 'Vue 3 Preview Test');
  vueWs.files['src/App.vue'] = {
    content: `<script setup>
import { Rocket, Compass, CustomMagicIcon } from 'lucide-vue-next';
import { GradientText, RippleButton, SpotlightCard } from 'animate-ui';
const count = ref(42);
const doubled = computed(() => count.value * 2);
</script>
<template>
  <main class="vue-preview-shell">
    <GradientText text="Vue 3 智能预览工作台" />
    <SpotlightCard>
      <Rocket :size="20" />
      <Compass :size="20" />
      <CustomMagicIcon :size="20" />
      <p>计数：{{ count }} / 双倍：{{ doubled }}</p>
      <RippleButton @click="count++">增加</RippleButton>
    </SpotlightCard>
  </main>
</template>`,
  };
  const vuePreviewReport = await verifyWorkspacePreviewOnServer(vueWs);
  assert.equal(vuePreviewReport.ok, true, `Vue 3 preview should succeed: ${vuePreviewReport.summary}`);
  assert.equal(vuePreviewReport.rendered, true);
  assert.ok(vuePreviewReport.rootChildCount >= 1);
  assert.ok(vuePreviewReport.textLength >= 5);

  // 3. Blank React workspace (returns null) is caught by verifyWorkspacePreview
  const blankWs = createDefaultWorkspace('react', 'Blank App');
  blankWs.files['src/App.tsx'] = {
    content: `import React from 'react';
export default function App() {
  return null;
}`,
  };
  const blankReport = await verifyWorkspacePreview(blankWs);
  assert.equal(blankReport.ok, false, 'Blank component returning null must fail preview verification');
  assert.equal(blankReport.rendered, false);
  assert.match(blankReport.summary, /为空|空白/);

  // 4. AiRunner automatically rejects done when preview crashes at runtime and continues into round 2 to heal the preview
  let currentPage = createWorkspaceDocument('react');
  let currentSession = newAiSession(currentPage);
  let round = 0;
  let secondRoundError = '';

  const runner = new AiRunner({
    getPage: () => currentPage,
    getOwner: () => 'guest',
    commit: next => {
      currentPage = next;
    },
    checkpoint: session => {
      currentSession = session;
      return session;
    },
    onSession: session => {
      currentSession = session;
    },
    onRunning: () => {},
    compileWorkspace,
    async *stream(_provider, _profile, context) {
      round += 1;
      const parsedContext = JSON.parse(context.context);
      if (round === 1) {
        // Round 1: compiles statically, but crashes at runtime when rendering (undefined property access)
        const ops = [
          {
            v: 1,
            seq: 1,
            op: 'writeFile',
            path: 'src/App.tsx',
            content: `import React, { useState } from 'react';
export default function App() {
  const [items] = useState(undefined as any);
  return <div className="crash-shell"><h1>{items.nonExistentMap.title}</h1><button onClick={() => {}}>操作</button></div>;
}`,
            summary: '写入存在运行时白屏错误的组件',
          },
          { v: 1, seq: 2, op: 'done', summary: 'First attempt done' },
        ];
        yield { type: 'text', text: ops.map(o => JSON.stringify(o)).join('\n') + '\n' };
        yield { type: 'complete' };
      } else {
        secondRoundError = parsedContext.lastError || '';
        const ops = [
          {
            v: 1,
            seq: 1,
            op: 'writeFile',
            path: 'src/App.tsx',
            content: `import React from 'react';
import { Sparkles, UncommonChartIcon } from 'lucide-react';
import { GradientText, RippleButton } from 'animate-ui';
export default function App() {
  const [count, setCount] = useState(1);
  return (
    <main className="healed-shell">
      <GradientText text="自愈后的多文件预览画面" />
      <Sparkles size={18} />
      <UncommonChartIcon size={18} />
      <p>当前状态：{count}</p>
      <RippleButton onClick={() => setCount(c => c + 1)}>点击交互</RippleButton>
    </main>
  );
}`,
            summary: '根据预览自检诊断修复运行时错误',
          },
          { v: 1, seq: 2, op: 'runTool', tool: 'inspectPreview', summary: '执行预览前置自检' },
          { v: 1, seq: 3, op: 'done', summary: 'Healed runtime crash and verified preview' },
        ];
        yield { type: 'text', text: ops.map(o => JSON.stringify(o)).join('\n') + '\n' };
        yield { type: 'complete' };
      }
    },
  });

  await runner.start(currentSession, 'openai', profile, '生成带实时预览自检的多文件应用', 'zh-CN');
  assert.equal(round, 2, 'AiRunner automatically triggered round 2 when round 1 preview crashed into blank screen');
  assert.match(secondRoundError, /工作区预览页面自检未通过/, 'Round 2 received preview verification failure diagnostic');
  assert.equal(currentSession.status, 'complete');
  const finalPreview = await verifyWorkspacePreview(currentPage.workspace);
  assert.equal(finalPreview.ok, true);
  assert.equal(finalPreview.rendered, true);
  assert.ok(finalPreview.rootChildCount >= 1);
});
