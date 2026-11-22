'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Gate=require('../src/02a_tile_motion_gate.js');
function fixture(){
  let accepted=true,active=true,retains=0,capacity=3;
  const dem={has:(x,y)=>active&&x>=0&&x<=40&&y>=-15&&y<=15};
  const neighborhood={select:(p)=>({ready:accepted&&p[0]>=0&&p[0]<=40,
    ids:p[0]<20?['0:0']:['1:0']})};
  const stream={retain:async(ids)=>{retains++;assert(ids.length<=capacity);},
    status:()=>({capacity})};
  const gate=Gate.create({neighborhood,stream,dem,footprintM:1,sampleStepM:2});
  return {gate,setCoverage:v=>active=v,setCatalog:v=>accepted=v,
    setCapacity:v=>capacity=v,count:()=>retains};
}
test('motion permit requires measured contact coverage across tile boundary',async()=>{
  const f=fixture();
  const from=[18,0],to=[22,0];
  assert.equal(f.gate.permit(null,from,to),false);
  const ticket=await f.gate.prepare(from,to,[4,0]);
  assert.ok(ticket);
  assert.equal(f.count(),1);
  assert.equal(f.gate.permit(ticket,from,to),true);
  assert.equal(f.gate.permit(ticket,from,[25,0]),false);
  f.setCoverage(false);
  assert.equal(f.gate.permit(ticket,from,to),false);
});
test('outside surveyed coverage never grants a motion permit',async()=>{
  const f=fixture();
  assert.equal(await f.gate.prepare([35,0],[45,0],[2,0]),null);
  assert.equal(await f.gate.prepare([10,14],[11,14]),null);
  assert.equal(f.count(),1,'missing catalog never requests tiles');
});
test('later motion invalidates earlier authorization and manual invalidation',async()=>{
  const f=fixture();
  const old=await f.gate.prepare([8,0],[9,0]);
  const next=await f.gate.prepare([9,0],[10,0]);
  assert.equal(f.gate.permit(old,[8,0],[9,0]),false);
  assert.equal(f.gate.permit(next,[9,0],[10,0]),true);
  f.gate.invalidate();
  assert.equal(f.gate.permit(next,[9,0],[10,0]),false);
});
test('unsafe capacity, invalid positions and missing measured footprint fail closed',async()=>{
  const f=fixture();
  f.setCapacity(1);
  assert.equal(await f.gate.prepare([18,0],[22,0]),null);
  assert.throws(()=>f.gate.prepare([NaN,0],[20,0]),/Invalid projected/);
  await assert.rejects(f.gate.prepare([0,0],[2500,0]),/Unbounded/);
});
