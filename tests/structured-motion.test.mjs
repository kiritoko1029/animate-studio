import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installMatchMedia } from './helpers/media-query.mjs';
import { createPageStore } from '../server/store.mjs';
import { validatePage } from '../server/validation.mjs';
import { createBlock, createDocument } from '../src/model.ts';
import { officialAnimationProps, validateAnimationSettings, animationValuesEqual } from '../shared/animation-settings.mjs';
import { generateNativeCode } from '../src/lib/code-export/native.ts';

test('structured official options survive storage/export without changing upstream defaults or saved references', async t => {
  const transition={type:'spring',stiffness:300,damping:30,opacity:{duration:.2,ease:[.2,0,.8,1]}};
  const page=createDocument(true);
  page.blocks=['dialog','gradientText','holeBackground'].map(type=>createBlock(type));
  page.blocks[0].props.motion={'DialogContent.transition':transition,'DialogOverlay.exitTransition':{duration:.12}};
  page.blocks[1].props.motion={'GradientText.transition':{duration:2,ease:'linear',repeat:3},'GradientText.gradient':'linear-gradient(90deg, red, blue)'};
  page.blocks[2].props.motion={'HoleBackground.particleRGBColor':[255,100,20]};
  validatePage(page);
  const dir=await mkdtemp(join(tmpdir(),'structured-motion-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await createPageStore({dataDir:dir}).save(page);
  const restored=(await createPageStore({dataDir:dir}).read()).page;
  assert.deepEqual(restored.blocks.map(b=>b.props.motion),page.blocks.map(b=>b.props.motion));
  const props=officialAnimationProps('dialog','DialogContent',restored.blocks[0].props.motion);
  props.transition.opacity.duration=10;
  assert.equal(restored.blocks[0].props.motion['DialogContent.transition'].opacity.duration,.2);
  assert.equal(Object.hasOwn(officialAnimationProps('dialog','DialogContent'),'transition'),false);
  assert.ok(animationValuesEqual({a:[1,2],b:3},{b:3,a:[1,2]}));
  const html=generateNativeCode(restored,'html',{code:'var AnimateStudioNative={mount(el,page){window.page=page;return ()=>{}}};',css:''});
  const dom=new JSDOM(html.content,{runScripts:'dangerously'});t.after(()=>dom.window.close());
  assert.deepEqual(JSON.parse(JSON.stringify(dom.window.page.blocks.map(b=>b.props.motion))),page.blocks.map(b=>b.props.motion));
});

test('structured controls reject invalid motion parameters, unsafe objects and malformed RGB', () => {
  for(const value of [{duration:-1},{duration:Infinity},{stiffness:'fast'},{mass:0},{ease:[2,0,1,1]},{unexpected:true},{opacity:{unexpected:1}},JSON.parse('{"__proto__":{"polluted":true}}'),{opacity:{constructor:{duration:1}}},Array(101).fill(1)]) {
    assert.throws(()=>validateAnimationSettings('dialog',{'DialogContent.transition':value}));
  }
  for(const value of [[255,0],[256,0,0],[0.5,0,0],['red',0,0]]) assert.throws(()=>validateAnimationSettings('holeBackground',{'HoleBackground.particleRGBColor':value}));
  assert.doesNotThrow(()=>validateAnimationSettings('dialog',{'DialogContent.transition':{opacity:{ease:[[.2,0,.8,1],'linear'],times:[0,.5,1],duration:.3}}}));
});

test('the real property panel keeps invalid JSON drafts out of the page, applies valid values and resets them', async t => {
  const errors=[],vc=new VirtualConsole();vc.on('error',(...args)=>errors.push(args.join(' ')));vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<div id="root"></div>',{url:'https://structured.test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
  const {window}=dom;installMatchMedia(window,{reducedMotion:true});
  window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  t.after(()=>{window.unmount?.();window.close();});
  const bundle=await build({stdin:{contents:`
    import {useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {AnimateUIProvider} from '@animate-ui/react/provider';import {AnimationSettings} from './src/components/AnimationSettings';
    import NativeCatalogBlock from './src/components/NativeCatalogBlock';import {createBlock} from './src/model';
    function Demo(){const [motion,setMotion]=useState({});window.settings=motion;return <AnimateUIProvider reducedMotion="always"><AnimationSettings type="gradientText" value={motion} onChange={setMotion}/><NativeCatalogBlock block={{...createBlock('gradientText'),props:{title:'Gradient',motion}}}/></AnimateUIProvider>}
    const root=createRoot(document.getElementById('root'));window.perform=f=>flushSync(f);window.unmount=()=>flushSync(()=>root.unmount());window.perform(()=>root.render(<Demo/>));
  `,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,jsx:'automatic',format:'iife',loader:{'.css':'empty'},external:['shiki'],define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
  window.eval(bundle.outputFiles[0].text);const doc=window.document;
  const fill=(selector,value)=>window.perform(()=>{const input=doc.querySelector(selector);const proto=input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});
  fill('textarea','{"duration":');
  assert.equal(doc.querySelector('textarea').value,'{"duration":');assert.ok(doc.querySelector('[role=alert]'));assert.equal(Object.keys(window.settings).length,0);
  fill('textarea','{"duration":2,"ease":"linear"}');assert.equal(window.settings['GradientText.transition'].duration,2);assert.equal(doc.querySelector('[role=alert]'),null);
  fill('textarea','{"duration":-2}');assert.equal(window.settings['GradientText.transition'].duration,2);
  fill('[aria-label="渐变（CSS）"]','linear-gradient(90deg, red, blue)');
  assert.match(doc.querySelector('[data-slot=gradient-text] > span').style.backgroundImage,/red, blue/);
  window.perform(()=>doc.querySelector('[aria-label="恢复官方动效默认"]').click());
  assert.equal(Object.keys(window.settings).length,0);assert.equal(doc.querySelector('textarea').value,'');assert.equal(doc.querySelector('[role=alert]'),null);
  assert.deepEqual(errors,[]);
});
