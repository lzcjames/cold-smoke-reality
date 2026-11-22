'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('dev/ign-lab-ride.js','utf8');
const Ride=vm.runInNewContext(src+'\nIgnLabRide').create;
function fixture({seam=false,voidGround=false}={}){
 const g={east:947000,north:6439000,cols:140,rows:68,step:15};
 const manifest={schema:'cold-smoke-measured-tiles-staging/v1',
  sourceOSMSHA256:'a'.repeat(64),approvedForGameplay:false,
  readyForRuntime:false,grid:g};
 const sample=(east,north)=>{
  const x=east-g.east,z=g.north-north;
  if(x<0||z<0||x>(g.cols-1)*g.step||z>(g.rows-1)*g.step ||
     (voidGround&&x>700))return null;
  // Continuous two-patch source DEM with the same border values.
  return 2500-.10*x-.08*z+(seam&&x>945?.2:0);
 };
 return {manifest,snapshot:{sample,sourceOnly:true,approvedForGameplay:false,
  readyForPhysics:false}};
}
test('standing rider has zero drift and no snow-board oscillation on measured surface',()=>{
 const f=fixture(),r=Ride(f.snapshot,f.manifest);
 r.start();const initial=r.state();
 for(let i=0;i<720;i++)r.step(1/60,{});
 const state=r.state();
 assert.equal(state.speed,0);
 assert.equal(state.x,initial.x);assert.equal(state.z,initial.z);
 assert.equal(state.altitudeM,initial.altitudeM);
 assert.equal(state.verticalJitterM,0);
 assert.equal(state.approvedForGameplay,false);
});
test('push accelerates smoothly and updates board contact from genuine height',()=>{
 const f=fixture(),r=Ride(f.snapshot,f.manifest);r.start();
 let previous=r.state(),maxStep=0;
 for(let i=0;i<360;i++){
  const current=r.step(1/60,{push:i<40,steer:0,brake:false});
  maxStep=Math.max(maxStep,Math.abs(current.altitudeM-previous.altitudeM));
  assert.ok(Number.isFinite(current.speed)&&current.speed>=0&&current.speed<=17);
  assert.equal(current.altitudeM,r.sample(current.x,current.z));
  previous=current;
  if(current.stoppedAtBoundary)break;
 }
 assert.ok(previous.frames>100);
 assert.ok(maxStep<0.35,'Contact jump on continuous measured slope: '+maxStep);
 assert.ok(previous.speed>0);
});
test('unmeasured exterior is never filled with invented ski contact',()=>{
 const f=fixture({voidGround:true}),r=Ride(f.snapshot,f.manifest);
 const out=r.groundAt(800,300,0);
 assert.equal(out,null);
 assert.equal(r.sourceOnly,true);
 assert.equal(r.approvedForGameplay,false);
});
test('invalid unreviewed or gameplay-approved source is refused',()=>{
 const f=fixture();
 f.manifest.approvedForGameplay=true;
 assert.throws(()=>Ride(f.snapshot,f.manifest),/Measured IGN/);
 f.manifest.approvedForGameplay=false;
 f.snapshot.readyForPhysics=true;
 assert.throws(()=>Ride(f.snapshot,f.manifest),/Measured IGN/);
});
test('deterministic fixed step cannot use large uneven physics dt',()=>{
 const f=fixture(),r=Ride(f.snapshot,f.manifest);r.start();
 assert.throws(()=>r.step(0.12,{push:true}),/Fixed 60Hz/);
 const a=r.step(1/60,{push:true});
 assert.equal(a.frames,1);
});
