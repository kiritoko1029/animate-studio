import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
// Usage: node scripts/sync-official-controls.mjs <pinned-upstream-demos-directory> [--check]
// Parses literals with TypeScript; never executes downloaded code.
import { isDeepStrictEqual } from 'node:util';
const root=process.argv[2];
if(!root || root.startsWith('--'))throw new Error('Provide the demos directory from the commit in docs/animate-ui-version.json');
const excluded=new Set(['number','checked','href','size','variant','multiple','system','picker','shared']);
function readFile(file){
 const source=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declarations=new Map();
 for(const s of source.statements)if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations)declarations.set(d.name.getText(source),d.initializer);
 const visiting=new Set();
 function literal(n){
  if(ts.isObjectLiteralExpression(n))return Object.fromEntries(n.properties.map(p=>{if(!ts.isPropertyAssignment(p))throw new Error('non-literal property');return [p.name.text,literal(p.initializer)]}));
  if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
  if(ts.isNumericLiteral(n))return Number(n.text);
  if(n.kind===ts.SyntaxKind.TrueKeyword)return true;
  if(n.kind===ts.SyntaxKind.FalseKeyword)return false;
  if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.MinusToken)return -literal(n.operand);
  if(ts.isAsExpression(n)||ts.isSatisfiesExpression(n))return literal(n.expression);
  if(ts.isIdentifier(n)&&declarations.has(n.text)&&!visiting.has(n.text)){visiting.add(n.text);const value=literal(declarations.get(n.text));visiting.delete(n.text);return value;}
  throw new Error('unsupported '+n.getText(source).slice(0,100));
 }
 return declarations.has('controls')?literal(declarations.get('controls')):{};
}
const controls={};
for(const file of fs.readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.tsx')))controls[file.replace(/\.tsx$/,'')]=readFile(file);
const catalog=JSON.parse(fs.readFileSync('shared/extended-components.json','utf8'));
const source={...Object.fromEntries(Object.entries(catalog).map(([type,item])=>[type,item.docs.replace('https://animate-ui.com/docs/primitives/','').replace('https://animate-ui.com/docs/','')])),button:'animate-ui/button',heading:'animate-ui/highlight-text',accordion:'base-ui/accordion',tabs:'base-ui/tabs',switch:'base-ui/switch',checkbox:'base-ui/checkbox',radio:'base-ui/radio-group',select:'base-ui/select',slider:'base-ui/slider',progress:'base-ui/progress',pagination:'base-ui/pagination'};
const effects=['auto-height','blur','click','effect','fade','highlight','magnetic','particles','scroll-fade','shine','slide','theme-toggler','tilt','zoom','spring','page-transition','cursor'];
for(const effect of effects)source['effect:'+effect]='animate-ui/'+effect;
const schema={};
for(const [type,name] of Object.entries(source)){
 const groups={};for(const [group,fields] of Object.entries(controls[name]??{})){
  const kept=Object.fromEntries(Object.entries(fields).filter(([key])=>!excluded.has(key)));
  if(Object.keys(kept).length)groups[group]=kept;
 }
 schema[type]={source:name,groups};
}
const overrides=JSON.parse(fs.readFileSync('shared/official-animation-overrides.json','utf8'));
for(const [type,groups] of Object.entries(overrides))for(const [group,fields] of Object.entries(groups)){
 const target=schema[type].groups[group]??={};
 for(const [key,field] of Object.entries(fields)){if(field===null)delete target[key];else target[key]=field;}
 if(!Object.keys(target).length)delete schema[type].groups[group];
}
const file='shared/official-animation-controls.json';
if(process.argv.includes('--check')){
 if(!isDeepStrictEqual(schema,JSON.parse(fs.readFileSync(file,'utf8'))))throw new Error('Official control schema differs from pinned sources and reviewed API overrides');
}else fs.writeFileSync(file,JSON.stringify(schema,null,2)+'\n');
console.log({components:Object.keys(source).length,groups:Object.values(schema).reduce((n,item)=>n+Object.keys(item.groups).length,0)});
