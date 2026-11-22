'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const asset=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes.json','utf8'));
const code=['src/02a_reality.js','src/02e_jandri_lower.js','src/02i_resort_routes.js']
  .map(p=>fs.readFileSync(p,'utf8')).join('\n');
const sandbox=vm.createContext({asset});
const context=vm.runInContext(code+'\n({adapter:ResortRoutes,terrain:Reality.create(asset)});',sandbox);
test('shared loader consumes the original verified Jandri clips unchanged',()=>{
 const prepared=context.adapter.current(asset,context.terrain);
 assert.equal(prepared.id,'les-deux-alpes');
 assert.equal(prepared.pistes.length,5);
 assert.equal(asset.pistes.length,3);
 assert.strictEqual(prepared.piste,asset.piste);
 assert.strictEqual(prepared.grid,asset.grid);
 assert.equal(prepared.pistes[3].osmWay,219275197);
 assert.equal(prepared.pistes[4].osmWay,644393970);
});
test('adapter preserves original routes and rejects fake duplicate append',()=>{
 const original=context.adapter.prepare(asset,context.terrain,[]);
 assert.strictEqual(original,asset);
 const bad={extend(input){
   return {...input,pistes:[...input.pistes,input.pistes[0]]};
 }};
 assert.throws(()=>context.adapter.prepare(asset,context.terrain,[bad]),/Invalid or duplicate/);
});
test('adapter rejects rewriting grid, primary route, or resort identity',()=>{
 const make=fn=>({extend:fn});
 for(const provider of [
   make(input=>({...input,grid:{...input.grid}})),
   make(input=>({...input,piste:{...input.piste}})),
   make(input=>({...input,id:'fake-resort'})),
   make(input=>({...input,pistes:input.pistes.slice(1)}))
 ])assert.throws(()=>context.adapter.prepare(asset,context.terrain,[provider]));
});
test('fresh load and cache load use identical shared adapter path',()=>{
 const loader=fs.readFileSync('src/02a_reality.js','utf8');
 const build=fs.readFileSync('build.js','utf8');
 assert.match(loader,/ResortRoutes\.current\(candidate, terrain\)/);
 assert.match(loader,/ResortRoutes\.current\(data, terrain\)/);
 assert.match(build,/ResortRoutes\.current\(asset, terrain\)/);
 assert.match(build,/02i_resort_routes\.js/);
});
