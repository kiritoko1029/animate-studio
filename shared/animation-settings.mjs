import demoControls from './official-animation-controls.json' with { type: 'json' };
import cssProperties from './official-css-properties.json' with { type: 'json' };
import apiControls from './official-api-controls.json' with { type: 'json' };
const controls = {};
for (const type of new Set([...Object.keys(apiControls), ...Object.keys(demoControls)])) {
  const groups = {};
  for (const group of new Set([...Object.keys(demoControls[type]?.groups ?? {}), ...Object.keys(apiControls[type]?.groups ?? {})])) {
    groups[group] = { ...demoControls[type]?.groups[group], ...Object.fromEntries(Object.entries(apiControls[type]?.groups[group] ?? {}).filter(([key]) => !Object.hasOwn(demoControls[type]?.groups[group] ?? {},key)).map(([key,field])=>[key,{...field,advanced:true}])) };
  }
  controls[type] = { source: demoControls[type]?.source ?? 'pinned-api', groups };
}

export const officialAnimationControls = controls;
const cssKeys=new Set(cssProperties);
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const easings = ['linear','easeIn','easeOut','easeInOut','circIn','circOut','circInOut','backIn','backOut','backInOut','anticipate'];
const animatedKeys = new Set([...cssProperties,'originX','originY','originZ','translateZ','transformPerspective','d','attrX','attrY','attrScale','viewBox','transform','opacity','scale','scaleX','scaleY','scaleZ','x','y','z','rotate','rotateX','rotateY','rotateZ','skew','skewX','skewY','width','height','minWidth','maxWidth','minHeight','maxHeight','top','right','bottom','left','inset','color','background','backgroundColor','backgroundPosition','backgroundSize','borderColor','borderRadius','boxShadow','filter','clipPath','pathLength','pathOffset','pathSpacing','stroke','strokeWidth','fill','fontSize','letterSpacing','lineHeight','translateX','translateY','transformOrigin','gridTemplateRows','gridTemplateColumns']);
const numericTransitions = { elapsed:[0,1e9],startTime:[-1e9,1e9],duration:[0,3600],delay:[-3600,3600],repeat:[0,1000000],repeatDelay:[0,3600],stiffness:[0,100000],damping:[0,100000],mass:[0.001,10000],velocity:[-100000,100000],restSpeed:[0,10000],restDelta:[0,10000],bounce:[-1,1],visualDuration:[0,3600],power:[0,10000],timeConstant:[0,100000],min:[-1e9,1e9],max:[-1e9,1e9],bounceStiffness:[0,100000],bounceDamping:[0,100000],delayChildren:[-3600,3600],staggerChildren:[0,3600],staggerDirection:[-1,1] };
function invalid(name) { throw new Error(`${name} 的值无效`); }
function boundedJSON(value, name, depth = 0, arrayLimit = 100) {
  if (depth > (/^(MenuStructure|SidebarStructure)/.test(name) ? 14 : 6)) invalid(`${name}（嵌套层数过多）`);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value) || Math.abs(value) > 1e9) invalid(name); return; }
  if (typeof value === 'string') { if (value.length > 2000) invalid(name); return; }
  if (Array.isArray(value)) { if (value.length > arrayLimit) invalid(name); value.forEach(v => boundedJSON(v,name,depth+1,arrayLimit)); return; }
  if (!plain(value) || Object.keys(value).length > 100) invalid(name);
  for (const [key, v] of Object.entries(value)) { if (unsafeKeys.has(key) || key.length > 100) invalid(name); boundedJSON(v,name,depth+1,arrayLimit); }
}
function easing(value) {
  return easings.includes(value) || Array.isArray(value) && value.length === 4 && value.every(n => typeof n === 'number' && Number.isFinite(n)) && value[0] >= 0 && value[0] <= 1 && value[2] >= 0 && value[2] <= 1;
}
function transition(value, name, depth = 0) {
  if (!plain(value) || depth > 2) invalid(name);
  for (const [key, v] of Object.entries(value)) {
    if (key==='repeat' && v==='Infinity') continue;
    if (Object.hasOwn(numericTransitions,key)) { const [min,max]=numericTransitions[key]; if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || key==='repeat' && !Number.isInteger(v)) invalid(`${name}.${key}`); }
    else if (key === 'type') { if (!['tween','spring','inertia','decay','keyframes',false].includes(v)) invalid(name); }
    else if (key === 'ease') { if (!easing(v) && !(Array.isArray(v) && v.length > 0 && v.every(easing))) invalid(name); }
    else if (key === 'repeatType') { if (!['loop','reverse','mirror'].includes(v)) invalid(name); }
    else if (key === 'when') { if (typeof v!=='string'&&v!==false) invalid(name); }
    else if(['isSync','autoplay','inherit','skipAnimations'].includes(key)){if(typeof v!=='boolean')invalid(name);}
    else if(key==='from'){if(v!==null&&typeof v!=='string'&&typeof v!=='number'&&!Array.isArray(v))invalid(name);}
    else if (key === 'times') { if (!Array.isArray(v) || v.length < 2 || v.some((n,i) => typeof n !== 'number' || n < 0 || n > 1 || i > 0 && n < v[i-1])) invalid(name); }
    else if (key==='default'||key==='layout'||animatedKeys.has(key) || /^--[a-z][a-z0-9-]*$/i.test(key)) transition(v,`${name}.${key}`,depth+1);
    else invalid(`${name}.${key}`);
  }
}
function validateSchema(schema,value,name) {
  if (schema.enum) { if (!schema.enum.some(v => animationValuesEqual(v,value))) invalid(name); return; }
  if (schema.anyOf) { for (const candidate of schema.anyOf) { try { validateSchema(candidate,value,name); return; } catch {} } invalid(name); }
  if (schema.type === 'null') { if (value !== null) invalid(name); return; }
  if (schema.type === 'string') { if (typeof value !== 'string' || value.length > (schema.maxLength ?? 2000)) invalid(name); return; }
  if (schema.type === 'number') { if (typeof value !== 'number' || !Number.isFinite(value) || value < (schema.min ?? -1e6) || value > (schema.max ?? 1e6)) invalid(name); return; }
  if (schema.type === 'boolean') { if (typeof value !== 'boolean') invalid(name); return; }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 100) || schema.tuple && value.length !== schema.tuple.length) invalid(name);
    value.forEach((v,i) => validateSchema(schema.tuple?.[i] ?? schema.items,v,`${name}[${i}]`)); return;
  }
  if (schema.type === 'object') {
    if (!plain(value) || (schema.required ?? []).some(key => !Object.hasOwn(value,key))) invalid(name);
    for (const [key,v] of Object.entries(value)) { if (!Object.hasOwn(schema.properties,key)) invalid(`${name}.${key}`); validateSchema(schema.properties[key],v,`${name}.${key}`); }
    return;
  }
  invalid(name);
}
function motionTarget(value,name,depth=0) {
  if (typeof value === 'boolean' || typeof value === 'string' || Array.isArray(value) && value.every(v=>typeof v==='string')) return;
  if (!plain(value) || depth > 1) invalid(name);
  for (const [key,v] of Object.entries(value)) {
    if (key === 'transition') { transition(v,name); continue; }
    if (key === 'transitionEnd') { if(!plain(v))invalid(name);motionTarget(v,name,depth+1); continue; }
    if (!animatedKeys.has(key) && !/^--[a-z][a-z0-9-]*$/i.test(key)) invalid(`${name}.${key}`);
    if (typeof v !== 'number' && typeof v !== 'string' && !(Array.isArray(v) && v.every(item => item === null || typeof item === 'number' || typeof item === 'string'))) invalid(`${name}.${key}`);
  }
}
function cssStyle(value,name) {
  if(!plain(value))invalid(name);
  for(const [key,v] of Object.entries(value)){if(!cssKeys.has(key)&&!/^--[a-z][a-z0-9-]*$/i.test(key))invalid(`${name}.${key}`);if(v!==null&&typeof v!=='string'&&typeof v!=='number')invalid(`${name}.${key}`);}
}
export function validateAnimationSetting(field, value, name = '设置') {
  boundedJSON(value,name,0,field.kind==='frames'?400:100);
  if(field.kind==='spring-options'){if(!plain(value)||Object.keys(value).some(k=>!['duration','visualDuration','bounce','velocity','restSpeed','restDelta','stiffness','damping','mass'].includes(k)))invalid(name);return transition(value,name);}
  if (field.kind === 'transition') return transition(value,name);
  if(field.kind==='variants'){if(!plain(value))invalid(name);for(const [key,target] of Object.entries(value)){if(!plain(target))invalid(`${name}.${key}`);motionTarget(target,`${name}.${key}`);}return;}
  if(field.kind==='grid-size'){if(!Array.isArray(value)||value.length!==2||value.some(n=>!Number.isInteger(n)||n<1||n>20))invalid(`${name}（两项 1–20 整数）`);return;}
  if(field.kind==='frames'){if(!Array.isArray(value)||!value.length||value.some(frame=>!Array.isArray(frame)||frame.some(point=>!Array.isArray(point)||point.length!==2||point.some(n=>!Number.isInteger(n)||n<0||n>19))))invalid(name);return;}
  if(field.kind==='motion-element-props'){if(!plain(value))invalid(name);for(const [key,v] of Object.entries(value)){if(key==='style')cssStyle(v,name);else if(key==='transition')transition(v,name);else if(['initial','animate','exit','whileHover','whileTap'].includes(key))motionTarget(v,name);else if(!['id','className','title','aria-label'].includes(key)||typeof v!=='string')invalid(`${name}.${key}`);}return;}
  if(name==='Drawer.snapPoints'||name==='Drawer.snapPoint'||name==='Drawer.defaultSnapPoint'){const points=Array.isArray(value)?value:[value];if(points.some(v=>!(v===null&&name!=='Drawer.snapPoints')&&!(typeof v==='number'&&v>=0&&v<=1e6)&&!(typeof v==='string'&&/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem)$/.test(v)&&parseFloat(v)>=0)))invalid(name);}
  if(name.endsWith('.modes')&&Array.isArray(value)&&!value.length)invalid(`${name}（至少一个模式）`);
  if(name.endsWith('.viewport')&&plain(value)){if(value.amount!==undefined&&!['all','some'].includes(value.amount)&&!(typeof value.amount==='number'&&value.amount>=0&&value.amount<=1))invalid(name);if(value.margin!==undefined&&!/^-?\d+(?:\.\d+)?(?:px|%)(?:\s+-?\d+(?:\.\d+)?(?:px|%)){0,3}$/.test(value.margin))invalid(name);}
  if(field.kind==='style')return cssStyle(value,name);
  if(field.kind==='element-props'){if(!plain(value))invalid(name);for(const [key,v] of Object.entries(value)){if(key==='style')cssStyle(v,name);else if(!['className','id','title','role','width','height','tabIndex','aria-label','aria-hidden'].includes(key)||!['string','number','boolean'].includes(typeof v))invalid(`${name}.${key}`);}return;}
  if(name==='PinnedListState.pinned'&&(!Array.isArray(value)||value.some(v=>!Number.isInteger(v))||new Set(value).size!==value.length))invalid(`${name}（不重复的整数索引）`);
  if(name==='QuestionnaireStructure.items'&&Array.isArray(value)){const names=value.map(q=>q?.name);if(names.some(n=>typeof n!=='string'||!n.trim())||new Set(names).size!==names.length)invalid(`${name}（题目名称须唯一）`);for(const q of value){const choices=q?.choices;if(Array.isArray(choices)&&(choices.some(c=>typeof c?.value!=='string'||!c.value.trim())||new Set(choices.map(c=>c.value)).size!==choices.length))invalid(`${name}（选项值须唯一）`);}}
  if (field.kind === 'json') return validateSchema(field.schema,value,name);
  if (field.kind === 'motion-target') {if(typeof value==='boolean'&&field.booleans&&!field.booleans.includes(value))invalid(name);return motionTarget(value,name);}
  if (field.kind === 'css-time' || field.kind === 'css-length') {
    const unit = field.kind === 'css-time' ? /^(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/ : /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|%|vh|vw)$/;
    if (!(typeof value === 'number' && value >= 0 && value <= 10000) && !(typeof value === 'string' && unit.test(value))) invalid(`${name}（请填写带单位的值）`); return;
  }
  if (name.endsWith('.pattern')) { if (typeof value !== 'string') invalid(name); try { new RegExp(value); } catch { invalid(`${name}（正则表达式）`); } }
  if (field.kind === 'margin') { if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?(?:px|%)(?:\s+-?\d+(?:\.\d+)?(?:px|%)){0,3}$/.test(value)) invalid(`${name}（1–4 个 px 或 % 值）`); return; }
  if (field.kind === 'rgb') { if (!Array.isArray(value) || value.length !== 3 || value.some(n => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255)) invalid(`${name}（3 个 0–255 整数）`); return; }
  if (field.options) { if (!Object.values(field.options).includes(value)) invalid(name); }
  else if (typeof field.value === 'number' || field.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < (field.min ?? -10000) || value > (field.max ?? 100000) || field.step === 1 && !Number.isInteger(value)) throw new Error(`${name} 的数值超出范围`);
  } else if (typeof value !== (field.kind ?? typeof field.value) || typeof value === 'string' && value.length > (field.maxLength ?? 200)) invalid(name);
}
export function validateAnimationSettings(type, settings) {
  if (!plain(settings)) throw new Error('动效设置必须为普通对象');
  const fields = Object.fromEntries(Object.entries(controls[type]?.groups ?? {}).flatMap(([group, entries]) => Object.entries(entries).map(([key, field]) => [`${group}.${key}`, field])));
  for (const [key, value] of Object.entries(settings)) {
    const field = Object.hasOwn(fields,key) ? fields[key] : undefined;
    if (!field) throw new Error(`不支持的官方动效设置：${key}`);
    validateAnimationSetting(field,value,key);
  }
}
export function animationValuesEqual(a,b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v,i) => animationValuesEqual(v,b[i]));
  if (plain(a) && plain(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b,k) && animationValuesEqual(a[k],b[k]));
  return false;
}
function normalizeMotion(value){if(Array.isArray(value))return value.map(normalizeMotion);if(plain(value))return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='repeat'&&v==='Infinity'?Infinity:normalizeMotion(v)]));return value;}

/** Omitted optional fields leave the upstream default intact. Returned objects never alias saved state. */
export function officialAnimationProps(type, group, settings = {}) {
  return Object.fromEntries(Object.entries(controls[type]?.groups[group] ?? {}).flatMap(([key, field]) => {
    const name = `${group}.${key}`;
    const value = Object.hasOwn(settings,name) ? settings[name] : field.value;
    return value === undefined ? [] : [[key, typeof value === 'number' && field.kind === 'css-time' ? `${value}s` : typeof value === 'number' && field.kind === 'css-length' ? `${value}px` : ['transition','motion-target','motion-element-props','variants'].includes(field.kind) ? normalizeMotion(value) : JSON.parse(JSON.stringify(value))]];
  }));
}
