import { installMatchMedia } from './helpers/media-query.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

test('canvas menu edits page settings, mirrors view controls and leaves component menus independent', async t => {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://canvas-menu.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  installMatchMedia(window);
  t.after(() => { window.unmount?.(); window.close(); });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  const bundle = await build({
    stdin: { contents: `
      import { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { CanvasPageMenu } from './src/components/CanvasPageMenu';
      import { CanvasComponentMenu } from './src/components/CanvasComponentMenu';
      import { createDocument, createBlock } from './src/model';
      window.actions=[]; window.changes=[];
      function Demo(){
        const [settings,setSettings]=useState(createDocument().settings);
        const [grid,setGrid]=useState({showGrid:true,snapToGrid:true,gridSize:8});
        const [selected,setSelected]=useState('button'), [open,setOpen]=useState(false), [disabled,setDisabled]=useState(false);
        window.settings=settings; window.grid=grid; window.selected=selected; window.setDisabled=setDisabled;
        const change=patch=>{window.changes.push(patch);setSettings(current=>({...current,...patch}));};
        return <><CanvasPageMenu settings={settings} grid={grid} disabled={disabled} onSelectCanvas={()=>setSelected(null)}
          onSizeChange={({width,height})=>change({maxWidth:width,canvasHeight:height})} onMarginChange={padding=>change({padding})}
          onPageSettings={section=>{window.actions.push(section);document.getElementById('inspector').focus();}}
          onGridChange={patch=>setGrid(current=>({...current,...patch}))} onFit={()=>window.actions.push('fit')} onActualSize={()=>window.actions.push('100%')}>
          <div id="canvas" tabIndex={0}><div id="blank" data-free-stage/>
            <CanvasComponentMenu settings={createDocument().settings} onBlockChange={()=>{}} block={{...createBlock('button'),id:'button'}} open={open&&selected==='button'} disabled={disabled}
              onOpenChange={next=>{setOpen(next);if(next)setSelected('button');}} onInspect={()=>{}} onCreateVariable={()=>{}}
              onAlign={()=>{}} onFillWidth={()=>{}} onDuplicate={()=>{}} onDelete={()=>{}}>
              <div id="component" data-block-id="button" tabIndex={0}>Button</div>
            </CanvasComponentMenu>
          </div>
        </CanvasPageMenu><input id="inspector"/></>;
      }
      const root=createRoot(document.getElementById('root'));
      window.perform=action=>flushSync(action);
      window.unmount=()=>flushSync(()=>root.unmount());
      window.perform(()=>root.render(<Demo/>));
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, loader: { '.css': 'empty' }, write: false, format: 'iife', jsx: 'automatic', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
  });
  window.eval(bundle.outputFiles[0].text);
  const doc = window.document;
  const menu = label => doc.querySelector(`[role="menu"][data-state="open"][aria-label="${label}"]`);
  const open = (id = 'blank') => window.perform(() => doc.getElementById(id).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 100 })));
  const key = (target, key, extra = {}) => window.perform(() => target.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...extra })));
  const item = (label, role = 'menuitem', parent = doc) => [...parent.querySelectorAll(`[role="${role}"]`)].find(element => element.closest('[role="menu"]')?.getAttribute('data-state') === 'open' && element.textContent.startsWith(label));
  const click = (label, role) => window.perform(() => item(label, role).click());
  const sub = label => { const trigger = item(label); window.perform(() => trigger.focus()); key(trigger, 'ArrowRight'); assert.ok(menu(label)); };
  const settle = () => new Promise(resolve => window.requestAnimationFrame(resolve));

  open('component');
  assert.ok(menu('动效按钮操作'));
  assert.equal(Boolean(menu('画布与页面操作')), false);
  assert.equal(window.selected, 'button');
  key(menu('动效按钮操作'), 'Escape'); await settle();
  open();
  assert.ok(menu('画布与页面操作'));
  assert.equal(window.selected, null);
  assert.equal(menu('画布与页面操作').closest('#canvas'), null);
  sub('画布尺寸');
  assert.equal(item('1080p','menuitemradio',menu('画布尺寸')).getAttribute('aria-checked'), 'true');
  click('2K', 'menuitemradio'); await settle();
  assert.deepEqual([window.settings.maxWidth,window.settings.canvasHeight],[2560,1440]);
  assert.equal(window.changes.length,1);
  assert.equal(Boolean(menu('画布与页面操作')), false);
  open(); sub('页面边距'); click('48 px','menuitemradio'); await settle();
  assert.equal(window.settings.padding,48);
  assert.equal(window.changes.length,2);
  open();
  assert.equal(item('显示网格','menuitemcheckbox').getAttribute('aria-checked'),'true');
  click('显示网格','menuitemcheckbox'); await settle();
  assert.equal(window.grid.showGrid,false);
  open(); click('网格吸附','menuitemcheckbox'); await settle();
  assert.equal(window.grid.snapToGrid,false);
  open(); sub('网格间距'); click('24 px','menuitemradio'); await settle();
  assert.equal(window.grid.gridSize,24);
  open(); click('适应画布'); await settle();
  open(); click('恢复 100%'); await settle();
  assert.deepEqual(Array.from(window.actions),['fit','100%']);
  assert.equal(window.changes.length,2,'view preferences do not edit the document');
  for(const [label,section,parent] of [['页面设置…','size'],['自定义尺寸…','size','画布尺寸'],['自定义页边距…','margin','页面边距'],['页面背景…','background'],['页面主题…','theme']]) {
    open(); if(parent)sub(parent); click(label); await settle();
    assert.equal(window.actions.at(-1),section);
    assert.equal(doc.activeElement.id,'inspector','menu dismissal must not steal focus from settings');
  }
  window.perform(()=>doc.getElementById('canvas').focus());
  key(doc.getElementById('canvas'),'F10',{shiftKey:true});
  assert.ok(menu('画布与页面操作'));
  key(menu('画布与页面操作'),'Escape'); await settle();
  assert.equal(Boolean(menu('画布与页面操作')), false);
  assert.equal(doc.activeElement.id,'canvas');
  window.perform(()=>window.setDisabled(true));
  open(); open('component');
  assert.equal(Boolean(doc.querySelector('[role="menu"][data-state="open"]')),false,'no editor menus while dragging or resizing');
  assert.deepEqual(errors,[]);
});
