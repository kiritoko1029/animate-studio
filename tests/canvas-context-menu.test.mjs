import { installMatchMedia } from './helpers/media-query.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

test('canvas menu targets the clicked component, supports keyboard dismissal and creates variables through a validated dialog', async t => {
  const errors = [], console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.join(' ')));
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: console });
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
      import { CanvasComponentMenu } from './src/components/CanvasComponentMenu';
      import { ComponentVariableDialog } from './src/components/ComponentVariableDialog';
      import { createComponentVariable } from './src/lib/interactions/component-variable';
      import { createBlock, createDocument } from './src/model';
      const slider = {...createBlock('slider'),id:'slider'}, button = {...createBlock('button'),id:'button'};
      window.actions = []; window.commits = []; window.inspections = [];
      function Demo() {
        const [page, setPage] = useState({...createDocument(), blocks:[slider,button]});
        const [selected, setSelected] = useState('slider'), [creating, setCreating] = useState(null), [menuId,setMenuId]=useState(null), [selectionCount,setSelectionCount]=useState(1);
        window.page = page; window.selected = selected; window.setSelectionCount = setSelectionCount;
        return <><div data-free-stage>{page.blocks.map((block,index)=><CanvasComponentMenu key={block.id} block={block} selectionCount={selectionCount} settings={page.settings} onBlockChange={next=>setPage(current=>({...current,blocks:current.blocks.map(item=>item.id===next.id?next:item)}))} layerIndex={index} layerCount={page.blocks.length} onLayerChange={(id,action)=>window.actions.push(action+':'+id)} open={menuId===block.id} disabled={false}
          onOpenChange={open=>{setMenuId(open?block.id:null);if(open)setSelected(block.id);}}
          onInspect={(id,tab,advanced)=>{window.actions.push(tab+':'+id);window.inspections.push({id,tab,advanced});}} onCreateVariable={setCreating}
          onAlign={(id,alignment)=>window.actions.push(alignment+':'+id)}
          onFillWidth={id=>window.actions.push('fill:'+id)}
          onDelete={id=>window.actions.push('delete:'+id)} onDuplicate={id=>window.actions.push('copy:'+id)}>
          <div tabIndex={0} data-block-id={block.id}>{block.type}</div></CanvasComponentMenu>)}</div>
          {creating && <ComponentVariableDialog page={page} block={page.blocks.find(b=>b.id===creating)} onClose={()=>setCreating(null)}
            onCreate={(key,variable)=>{const next=createComponentVariable(page,creating,key,variable);window.commits.push(next);setPage(next);setCreating(null);}}/>}</>;
      }
      const root=createRoot(document.getElementById('root'));
      window.perform=action=>flushSync(action);
      window.unmount=()=>flushSync(()=>root.unmount());
      window.perform(()=>root.render(<Demo/>));
    `, loader: 'jsx', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',

  });
  window.eval(bundle.outputFiles[0].text);
  const doc = window.document;
  const frame = id => doc.querySelector(`[data-block-id="${id}"]`);
  const menu = () => doc.querySelector('[role="menu"][data-state="open"]');
  const open = id => window.perform(() => frame(id).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 100 })));
  const choose = text => window.perform(() => [...menu().querySelectorAll('[role="menuitem"]')].find(item => item.getAttribute('aria-label') === text || item.textContent === text).click());
  const key = (target, key, extra = {}) => window.perform(() => target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })));
  const fill = (label, value) => window.perform(() => {
    const input = doc.querySelector(`[aria-label="${label}"]`);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const click = text => window.perform(() => [...doc.querySelectorAll('button')].find(item => item.textContent === text).click());
  open('button');
  assert.equal(window.selected, 'button');
  assert.equal(menu().getAttribute('aria-label'), '动效按钮操作');
  assert.equal(menu().closest('[data-free-stage]'), null, 'menu escapes the scaled and clipped stage');
  const scaleRow = menu().querySelector('[role="menuitem"][aria-label="整体缩放"]');
  window.perform(() => scaleRow.focus());
  key(scaleRow, 'Enter');
  assert.equal(doc.activeElement.getAttribute('aria-label'), '组件整体缩放百分比', 'keyboard users can enter the inline scale control');
  fill('组件整体缩放百分比', '200');
  key(doc.activeElement, 'Enter');
  assert.ok(menu(), 'editing a percentage must keep the menu open');
  assert.equal(window.page.blocks[1].props.contentScale, 200);
  assert.equal(window.page.blocks[1].frame.width, 480);
  assert.equal(window.page.blocks[0].props.contentScale, undefined, 'scale only the context-menu target');
  fill('组件整体缩放百分比', '250');
  key(doc.activeElement, 'Escape');
  assert.equal(doc.activeElement.value, '200', 'Escape cancels the number draft');
  assert.equal(window.page.blocks[1].props.contentScale, 200);
  fill('组件整体缩放滑杆', '150');
  assert.equal(window.page.blocks[1].props.contentScale, 150);
  assert.ok(menu(), 'slider changes must keep the menu open');
  click('重置');
  assert.equal(window.page.blocks[1].props.contentScale, 100);
  assert.equal(window.page.blocks[1].frame.width, 240);
  assert.ok(menu(), 'reset must keep the menu open');
  assert.equal(window.actions.length, 0, 'scale controls must not trigger other menu actions');
  choose('编辑属性');
  assert.equal(window.actions.at(-1), 'component:button');
  assert.equal(window.inspections.at(-1).advanced, undefined);
  open('button'); choose('高级设置…');
  assert.equal(window.actions.at(-1), 'component:button');
  assert.equal(window.inspections.at(-1).advanced, true);
  open('slider'); choose('绑定属性');
  assert.equal(window.actions.at(-1), 'logic:slider');
  assert.equal(window.inspections.at(-1).advanced, undefined);
  window.perform(() => window.setSelectionCount(2));
  open('button');
  assert.equal(menu().getAttribute('aria-label'), '所选组件操作');
  choose('高级设置…');
  assert.equal(window.actions.at(-1), 'component:button');
  assert.equal(window.inspections.at(-1).id, 'button');
  assert.equal(window.inspections.at(-1).tab, 'component');
  assert.equal(window.inspections.at(-1).advanced, true);
  window.perform(() => window.setSelectionCount(1));
  open('button'); choose('一键宽度填充');
  assert.equal(window.selected, 'button');
  assert.equal(window.actions.at(-1), 'fill:button');
  assert.equal(menu(), null);
  for (const [id,label,action] of [['slider','置于上一层','raise'],['slider','置于顶层','top'],['button','置于下一层','lower'],['button','置于底层','bottom']]) {
    open(id); choose(label);
    assert.equal(window.actions.at(-1), action+':'+id);
    assert.equal(window.selected, id);
    assert.equal(menu(), null);
  }
  open('slider');
  assert.equal(menu().querySelector('[aria-label="置于底层"]').disabled, true);
  assert.equal(menu().querySelector('[aria-label="置于下一层"]').disabled, true);
  const raise = menu().querySelector('[aria-label="置于上一层"]');
  window.perform(() => raise.focus());
  key(raise, 'ArrowLeft');
  assert.equal(doc.activeElement.getAttribute('aria-label'), '置于顶层', 'horizontal navigation skips unavailable layer actions');
  key(menu(), 'Escape');
  for (const [label,alignment] of [['左对齐','left'],['居中对齐','center'],['右对齐','right']]) {
    open('button'); choose(label);
    assert.equal(window.selected, 'button');
    assert.equal(window.actions.at(-1), alignment+':button');
    assert.equal(menu(), null);
  }
  open('button');
  const alignButtons = [...menu().querySelector('[role="group"][aria-label="对齐到页面边距"]').querySelectorAll('[role="menuitem"]')];
  window.perform(() => alignButtons[0].focus());
  key(alignButtons[0], 'ArrowRight');
  assert.equal(doc.activeElement, alignButtons[1]);
  assert.equal(doc.activeElement.getAttribute('title'), '居中对齐');
  key(alignButtons[1], 'ArrowLeft');
  assert.equal(doc.activeElement, alignButtons[0]);
  key(alignButtons[0], 'ArrowLeft');
  assert.equal(doc.activeElement, alignButtons[2]);
  key(alignButtons[2], 'Enter');
  assert.equal(window.actions.at(-1), 'right:button');
  assert.equal(menu(), null);
  window.perform(() => frame('slider').focus());
  key(frame('slider'), 'F10', { shiftKey: true });
  assert.ok(menu());
  key(menu(), 'Escape');
  assert.equal(menu(), null);
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  assert.equal(doc.activeElement, frame('slider'));
  open('button'); choose('复制组件');
  assert.equal(window.actions.at(-1), 'copy:button');
  open('button'); choose('删除组件');
  assert.equal(window.actions.at(-1), 'delete:button');
  open('slider'); choose('创建变量并绑定…');
  assert.equal(doc.querySelector('[aria-label="变量名称"]').value, 'slider_value');
  assert.equal(doc.querySelector('[aria-label="初始值"]').value, '60');
  fill('变量名称', '1invalid'); click('创建并绑定');
  assert.equal(window.commits.length, 0);
  assert.match(doc.querySelector('[role="alert"]').textContent, /英文字母/);
  fill('变量名称', 'volume'); click('创建并绑定');
  assert.equal(window.commits.length, 1);
  assert.equal(window.page.variables[0].initial, 60);
  assert.equal(window.page.blocks[0].bindings.value.value, 'volume');
  assert.equal(window.page.blocks[1].bindings, undefined);
  open('button'); choose('创建变量并绑定…'); click('取消');
  assert.equal(window.commits.length, 1, 'cancel does not create anything');
  assert.deepEqual(errors, []);
});
