'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Neighborhood=require('../src/02a_tile_neighborhood.js');
const ids=[];
for(let y=-1;y<=2;y++)for(let x=-1;x<=2;x++)ids.push(x+':'+y);
const setup=(budget=9)=>Neighborhood.create({scheme:{east:900000,north:6500000,span:20},
  tileIds:ids,radius:1,lookaheadSeconds:2,budget});
test('keeps current skier tile ahead of speculative neighbors',()=>{
  const p=setup(3);
  const result=p.select([900005,6499995],[20,0]);
  assert.equal(result.ready,true);
  assert.equal(result.center,'0:0');
  assert.equal(result.ids[0],'0:0');
  assert.equal(result.ids.length,3);
  assert.equal(result.ids[1],'1:0');
});
test('missing source tile fails closed without a stream request',async()=>{
  const p=Neighborhood.create({scheme:{east:0,north:0,span:20},
    tileIds:['0:0'],radius:1,budget:4});
  let called=false;
  const result=await p.loadFor({retain:async()=>{called=true;}},[55,-5],[0,0]);
  assert.equal(result.ready,false);
  assert.equal(result.missingCenter,true);
  assert.equal(called,false);
});
test('planner requests only source-known IDs and retains selected footprint',async()=>{
  const p=setup(4);
  let captured;
  const choice=await p.loadFor({retain:async ids=>{captured=ids.slice();}},
    [900005,6499995],[8,-2]);
  assert.deepEqual(captured,choice.ids);
  assert.ok(captured.every(id=>ids.includes(id)));
  assert.ok(captured.length<=4);
});
test('invalid projected coordinates, duplicate catalog and excess budget fail closed',()=>{
  assert.throws(()=>setup(0),/Invalid terrain neighborhood/);
  assert.throws(()=>Neighborhood.create({scheme:{east:0,north:0,span:20},
    tileIds:['0:0','0:0']}),/Invalid terrain neighborhood/);
  assert.throws(()=>setup().select([NaN,0]),/Invalid skier/);
});
