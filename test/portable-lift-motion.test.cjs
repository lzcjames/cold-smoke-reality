'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {geometry,position,carrier}=require('../tools/reality/portable_lift_motion.cjs');
test('visual cabin uses lightweight track interpolation without gameplay state',()=>{
 const track=geometry({points:[[0,0],[50,0],[50,100]]},()=>200,{visualClearanceM:7});
 assert.equal(track.lengthM,150);
 assert.deepEqual(position(track,0),[0,207,0]);
 assert.deepEqual(position(track,0.5),[50,207,25]);
 const a=carrier(track,0,{durationSeconds:30});
 const b=carrier(track,15,{durationSeconds:30});
 const c=carrier(track,30,{durationSeconds:30});
 assert.deepEqual(a.position,[0,207,0]);
 assert.deepEqual(b.position,[50,207,25]);
 assert.deepEqual(c.position,[50,207,100]);
 assert.equal(a.approvedForBoarding,false);
 assert.equal(track.approvedForBoarding,false);
});
test('unknown altitude and invalid time cannot generate a fake lift path',()=>{
 assert.throws(()=>geometry({points:[[0,0],[1,1]]},()=>null),/coverage/);
 const t=geometry({points:[[0,0],[1,1]]},()=>200);
 assert.throws(()=>carrier(t,10,{durationSeconds:0}),/clock/);
 assert.throws(()=>geometry({points:[[0,0],[0,0]]},()=>200),/Duplicate/);
});
