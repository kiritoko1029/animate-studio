import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { installMatchMedia } from './helpers/media-query.mjs';
import { validateAnimationSettings, officialAnimationProps } from '../shared/animation-settings.mjs';
import { createBlock, createDocument } from '../src/model.ts';
import { validatePage } from '../server/validation.mjs';
import { suggestComponentVariable } from '../src/lib/interactions/component-variable.ts';

 test('advanced API settings validate structured motion, CSS units and actual component-specific shapes',()=>{
  const values={'MorphingText.initial':{opacity:0,y:20},'MorphingText.animate':{opacity:1,y:0,transition:{duration:1,repeat:'Infinity'}},'MorphingText.style':{color:'#ff0000',fontWeight:600}};
  assert.doesNotThrow(()=>validateAnimationSettings('morphingText',values));
  assert.equal(officialAnimationProps('morphingText','MorphingText',values).animate.transition.repeat,Infinity);
  assert.doesNotThrow(()=>validateAnimationSettings('liquidButton',{'LiquidButton.delay':'300ms','LiquidButton.fillHeight':'0.5em'}));
  assert.equal(officialAnimationProps('liquidButton','LiquidButton',{'LiquidButton.delay':.3}).delay,'0.3s');
  for(const settings of [{'LiquidButton.delay':'later'},{'LiquidButton.fillHeight':-1}])assert.throws(()=>validateAnimationSettings('liquidButton',settings));
  for(const [type,settings] of [['themeTogglerButton',{'ThemeTogglerButton.modes':[]}],['inputOtp',{'InputOTP.pattern':'['}],['morphingText',{'MorphingText.style':{onClick:'oops'}}],['morphingText',{'MorphingText.animate':{constructor:{}}}],['motionGrid',{'MotionGrid.gridSize':[0,5]}],['motionGrid',{'MotionGrid.frames':[[[1.5,2]]]}]])assert.throws(()=>validateAnimationSettings(type,settings));
  assert.throws(()=>validateAnimationSettings('starsBackground',{'StarsBackground.transition':{type:'tween'}}));
  assert.doesNotThrow(()=>validateAnimationSettings('starsBackground',{'StarsBackground.transition':{stiffness:200,damping:20,bounce:-.5}}));
  assert.throws(()=>validateAnimationSettings('avatarGroup',{'AvatarGroupTooltipArrow.withTransition':{duration:.2}}));
  assert.doesNotThrow(()=>validateAnimationSettings('avatarGroup',{'AvatarGroupTooltipArrow.withTransition':false}));
  assert.throws(()=>validateAnimationSettings('effect:particles',{'Particles.animate':{opacity:1}}));
  assert.doesNotThrow(()=>validateAnimationSettings('effect:particles',{'Particles.animate':false}));
  assert.doesNotThrow(()=>validateAnimationSettings('motionGrid',{'MotionGrid.frames':[Array.from({length:400},(_,i)=>[i%20,Math.floor(i/20)])]}));
  assert.throws(()=>validateAnimationSettings('progress',{'Progress.max':0}));
  assert.throws(()=>validateAnimationSettings('inputOtp',{'InputOTP.maxLength':0}));
  for(const pinned of [[1.5],[1,1]])assert.throws(()=>validateAnimationSettings('pinnedList',{'PinnedListState.pinned':pinned}));
  assert.throws(()=>validateAnimationSettings('questionnaire',{'QuestionnaireStructure.items':[{name:'same',title:'A'},{name:'same',title:'B'}]}));
  for(const settings of [{'Slider.value':[]},{'Slider.value':['20',80]}])assert.throws(()=>validateAnimationSettings('slider',settings));
  for(const settings of [{'Drawer.snapPoints':[-.1,1]},{'Drawer.snapPoints':['bad']}])assert.throws(()=>validateAnimationSettings('drawer',settings));
  assert.doesNotThrow(()=>validateAnimationSettings('drawer',{'Drawer.snapPoints':[0,.5,1,300,'30rem'],'Drawer.snapPoint':null}));
  assert.doesNotThrow(()=>validateAnimationSettings('motionGrid',{'MotionGrid.gridSize':[5,5],'MotionGrid.frames':[[[1,2]],[]],'MotionGridCells.activeProps':{style:{backgroundColor:'red'},transition:{duration:.2}}}));
 });

test('multiple selection has an array binding contract, including suggested variables and saved documents',()=>{
 for(const [type,key,value] of [['toggleGroup','ToggleGroup.type','multiple'],['accordion','Accordion.type','multiple'],['combobox','Combobox.multiple',true],['slider','Slider.value',[20,80]]]){
  const block=createBlock(type),page=createDocument(true);block.props.motion={[key]:value};page.blocks=[block];
  const variable=suggestComponentVariable(page,block,'value');assert.equal(variable.type,'array');assert.deepEqual(variable.initial,type==='slider'?[20,80]:[]);
  page.variables=[variable];block.bindings={value:{kind:'variable',value:variable.name}};assert.doesNotThrow(()=>validatePage(page));
 }
});

test('real native multiple selection updates array variables and checkbox indeterminate can be toggled',async t=>{
 const errors=[],vc=new VirtualConsole();vc.on('error',(...args)=>errors.push(args.join(' ')));vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://native-api.test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});const {window}=dom;
 installMatchMedia(window,{reducedMotion:true});window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 t.after(()=>{window.unmount?.();window.close();});
 const bundle=await build({stdin:{contents:`
  import {useState,useMemo,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
  import {AnimateUIProvider} from '@animate-ui/react/provider';import {FreePage} from './src/components/PageRenderer';
  import {NativeRuntimeContext} from './src/components/NativeInteractions';import {createInteractionRuntime} from './shared/interactions.mjs';import {createDocument,createBlock} from './src/model';
  function Demo({page}){const [state,setState]=useState({});const runtime=useMemo(()=>createInteractionRuntime(page,{onState:setState}),[page]);window.runtime=runtime;useEffect(()=>{runtime.activate();setState(runtime.getState());return()=>runtime.dispose();},[runtime]);return <AnimateUIProvider reducedMotion="always"><NativeRuntimeContext.Provider value={{runtime,state}}><FreePage document={page}/></NativeRuntimeContext.Provider></AnimateUIProvider>}
  const root=createRoot(document.getElementById('root'));window.perform=f=>flushSync(f);window.unmount=()=>flushSync(()=>root.unmount());window.render=(type,motion,array)=>{const page=createDocument(true),block=createBlock(type);block.props.motion=motion;if(array){page.variables=[{name:'selection',type:'array',initial:[]}];block.bindings={value:{kind:'variable',value:'selection'}};}page.blocks=[block];window.perform(()=>root.render(<Demo page={page}/>));};
 `,loader:'jsx',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,format:'iife',jsx:'automatic',external:['shiki'],loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent',plugins:[{name:'raw',setup(build){build.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));build.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text',resolveDir:dirname(args.path)}));}}]});
 window.eval(bundle.outputFiles[0].text);const doc=window.document;
 const ready=predicate=>new Promise((yes,no)=>{const timer=setTimeout(()=>{observer.disconnect();no(Error('native UI timed out: '+errors.join('; ')));},3000);const observer=new window.MutationObserver(check);function check(){if(predicate()){observer.disconnect();clearTimeout(timer);yes();}}observer.observe(doc.body,{childList:true,subtree:true,attributes:true});check();});
 window.render('toggleGroup',{'ToggleGroup.type':'multiple'},true);await ready(()=>doc.querySelector('.native-catalog--toggleGroup .as-page-catalog-toggle-group button'));
 const buttons=[...doc.querySelectorAll('.as-page-catalog-toggle-group button')];window.perform(()=>buttons[0].click());window.perform(()=>buttons[1].click());
 assert.equal(JSON.stringify(window.runtime.getState().selection),'["0","1"]');window.perform(()=>buttons[0].click());assert.equal(JSON.stringify(window.runtime.getState().selection),'["1"]');
 window.render('accordion',{'Accordion.type':'multiple'},true);await ready(()=>doc.querySelector('.native-accordion-trigger'));const triggers=[...doc.querySelectorAll('.native-accordion-trigger')];window.perform(()=>triggers[0].click());window.perform(()=>triggers[1].click());assert.equal(JSON.stringify(window.runtime.getState().selection),'["item-0","item-1"]');assert.equal(doc.querySelectorAll('.native-accordion-trigger[aria-expanded=true]').length,2);
 window.render('checkbox',{'Checkbox.checked':'indeterminate'},false);await ready(()=>doc.querySelector('[role=checkbox]'));const checkbox=doc.querySelector('[role=checkbox]');assert.equal(checkbox.getAttribute('aria-checked'),'mixed');window.perform(()=>checkbox.click());assert.equal(checkbox.getAttribute('aria-checked'),'true');
 window.render('slider',{'Slider.value':[20,80],'Slider.min':0,'Slider.max':100},false);await ready(()=>doc.querySelectorAll('[role=slider]').length===2);const thumbs=[...doc.querySelectorAll('[role=slider]')];assert.deepEqual(thumbs.map(el=>el.getAttribute('aria-valuenow')),['20','80']);window.perform(()=>thumbs[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));assert.equal(thumbs[0].getAttribute('aria-valuenow'),'21');
 assert.deepEqual(errors,[]);
});
