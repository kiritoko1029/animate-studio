import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPageStore } from '../server/store.mjs';
import { validatePage } from '../server/validation.mjs';
import { createBlock, createDocument } from '../src/model.ts';
import { officialAnimationControls, officialAnimationProps, validateAnimationSettings } from '../shared/animation-settings.mjs';
import { generateNativeCode } from '../src/lib/code-export/native.ts';
import { transform } from 'esbuild';
import { parse, compileScript } from '@vue/compiler-sfc';
import { JSDOM } from 'jsdom';

test('official settings retain pinned defaults, reject invalid values, and survive persistence and reset', async t => {
  assert.deepEqual(officialAnimationProps('dialog','DialogContent'),{from:'top',showCloseButton:true});
  assert.equal(officialAnimationProps('morphingText','MorphingText').holdDelay,2500);
  assert.deepEqual(officialAnimationProps('imageZoom','ImageZoom'),{zoomScale:3,zoomOnHover:true,zoomOnClick:true});
  for (const [type,{groups}] of Object.entries(officialAnimationControls)) {
    const settings=Object.fromEntries(Object.entries(groups).flatMap(([group,fields])=>Object.entries(fields).map(([key,field])=>[`${group}.${key}`,field.value])));
    assert.doesNotThrow(()=>validateAnimationSettings(type,settings),type);
  }
  const bad = [null,[],{'DialogContent.from':'diagonal'},{'DialogContent.from':true},{'DialogContent.unknown':1},JSON.parse('{"__proto__":1}')];
  for (const settings of bad) assert.throws(()=>validateAnimationSettings('dialog',settings));
  assert.throws(()=>validateAnimationSettings('slidingNumber',{'SlidingNumber.decimalPlaces':1.5}));
  assert.throws(()=>validateAnimationSettings('imageZoom',{'ImageZoom.zoomScale':NaN}));
  const page=createDocument(true), block=createBlock('dialog');
  block.props.motion={'DialogContent.from':'right','DialogContent.showCloseButton':false};
  block.props.effect='blur';block.props.effectOptions={'Blur.initialBlur':20};page.blocks=[block];
  assert.equal(validatePage(page),page);
  const dataDir=await mkdtemp(join(tmpdir(),'official-motion-'));
  t.after(()=>rm(dataDir,{recursive:true,force:true}));
  await createPageStore({dataDir}).save(page);
  const saved=await createPageStore({dataDir}).read();
  assert.deepEqual(saved.page.blocks[0].props.motion,block.props.motion);
  assert.equal(officialAnimationProps('dialog','DialogContent',saved.page.blocks[0].props.motion).from,'right');
  const reset=createBlock('dialog');
  assert.equal(officialAnimationProps('dialog','DialogContent',reset.props.motion).from,'top');
  assert.throws(()=>validatePage({...page,blocks:[{...block,props:{...block.props,effect:'fade'}}]}),/不支持/);
});

test('native downloads embed the same runtime safely in HTML, React and Vue wrappers', async () => {
  const page=createDocument(true);page.name='测"试</script><script>window.injected=true</script>';
  page.blocks=[{...createBlock('dialog'),props:{label:'打开',motion:{'DialogContent.from':'right'}}}];
  const bundle={code:'var AnimateStudioNative={mount(element,page){element.textContent=page.name;window.saved=page;return ()=>{};}};',css:'body{margin:0}'};
  const html=generateNativeCode(page,'html',bundle);
  const dom=new JSDOM(html.content,{runScripts:'dangerously'});
  assert.equal(dom.window.injected,undefined);
  assert.equal(dom.window.saved.name,page.name);
  assert.equal(dom.window.saved.blocks[0].props.motion['DialogContent.from'],'right');
  dom.window.close();
  const react=generateNativeCode(page,'react',bundle);
  assert.ok(react.content.includes('srcDoc={html}'));
  await transform(react.content,{loader:'jsx'});
  const vue=generateNativeCode(page,'vue',bundle);
  const parsed=parse(vue.content);
  assert.deepEqual(parsed.errors,[]);
  assert.doesNotThrow(()=>compileScript(parsed.descriptor,{id:'native-page'}));
});

test('property controls update real native options, remove default overrides, and retain text-question behavior', async t => {
  const { build } = await import('esbuild');
  const { fileURLToPath } = await import('node:url');
  const { installMatchMedia } = await import('./helpers/media-query.mjs');
  const { VirtualConsole } = await import('jsdom');
  const errors=[],console=new VirtualConsole();console.on('error',(...args)=>errors.push(args.join(' ')));console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<div id="root"></div>',{url:'https://motion.test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console});
  const {window}=dom;installMatchMedia(window,{reducedMotion:true});
  window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  t.after(()=>{window.unmount?.();window.close();});
  const bundle=await build({stdin:{contents:`
    import {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {AnimateUIProvider} from '@animate-ui/react/provider';
    import {AnimationSettings} from './src/components/AnimationSettings';
    import NativeCatalogBlock from './src/components/NativeCatalogBlock';
    import {createBlock} from './src/model';
    function Demo(){
      const [motion,setMotion]=useState({});window.settings=motion;
      const number={...createBlock('countingNumber'),props:{value:12.345,motion}};
      const question={...createBlock('questionnaire'),props:{title:'文本题',items:'有什么想告诉我们？|',label:'提交'}};
      return <AnimateUIProvider reducedMotion="always"><AnimationSettings type="countingNumber" value={motion} onChange={setMotion}/><NativeCatalogBlock block={number}/><NativeCatalogBlock block={question}/></AnimateUIProvider>;
    }
    const root=createRoot(document.getElementById('root'));window.perform=action=>flushSync(action);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<Demo/>));
  `,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,jsx:'automatic',format:'iife',loader:{'.css':'empty'},external:['shiki'],define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
  window.eval(bundle.outputFiles[0].text);
  const doc=window.document;
  const fill=(label,value)=>window.perform(()=>{const input=doc.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  fill('小数位数','2');
  assert.equal(window.settings['CountingNumber.decimalPlaces'],2);
  assert.match(doc.querySelector('.native-catalog--countingNumber').textContent,/12\.35/);
  const input=doc.querySelector('.native-catalog--questionnaire input');
  assert.equal(input.getAttribute('aria-label'),'有什么想告诉我们？');
  assert.notEqual(input.type,'radio');
  fill('小数位数','0');
  assert.deepEqual(Object.keys(window.settings),[],'choosing the official default removes its override');
  fill('小数位数','3');
  window.perform(()=>doc.querySelector('[aria-label="恢复官方动效默认"]').click());
  assert.deepEqual(Object.keys(window.settings),[]);
  assert.deepEqual(errors,[]);
});
