'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('src/02d_jandri_quick_transition.js','utf8');
const moduleUnderTest=vm.runInNewContext(src+'\nJandriQuickTransition;');

function plan(destination='jandri-3200') {
  return {
    type:'jandri_verified_quick_arrival',season:'winter',
    destination,mode:'express_to_terminal',transitionMs:1800,
    needsCabinAnimation:false,needsLiftPhysics:false,
    arrival:{source:'verified_lift_top_terminal',stationId:'station-top',
      x:123,y:3200,z:456}
  };
}
function hooks(log, overrides={}) {
  return {
    async loadDestination() {log.push('load');return {id:'authenticated-terrain'};},
    async validateArrival(p,terrain) {log.push('validate');return terrain.id==='authenticated-terrain';},
    async cover(ms) {log.push('cover:'+ms);},
    async placePlayer() {log.push('place');},
    async reveal(ms) {log.push('reveal:'+ms);},
    async rollback() {log.push('rollback');},
    ...overrides,
  };
}
test('a verified 1800ms trip loads and validates before any visual transition or placement',async()=>{
  const events=[];
  const result=await moduleUnderTest.run(plan(),hooks(events));
  assert.equal(result.status,'arrived');
  assert.equal(result.stationId,'station-top');
  assert.deepEqual(events,['load','validate','cover:1800','place','reveal:1800']);
  assert.equal(moduleUnderTest.busy,false);
});
test('failed terrain validation refuses both fade and teleport',async()=>{
  const events=[];
  await assert.rejects(moduleUnderTest.run(plan(),hooks(events,{
    async validateArrival(){events.push('reject');return false;}
  })),/not verified/);
  assert.deepEqual(events,['load','reject']);
});
test('a failed position commit rolls back and uncovers the screen',async()=>{
  const events=[];
  await assert.rejects(moduleUnderTest.run(plan(),hooks(events,{
    async placePlayer(){events.push('failed-place');throw Error('GPU terrain not ready');}
  })),/GPU terrain not ready/);
  assert.deepEqual(events,['load','validate','cover:1800','failed-place','rollback','reveal:1800']);
});
test('rejects unverified positions, untrusted destinations and missing safety hooks',async()=>{
  const events=[];
  await assert.rejects(moduleUnderTest.run({...plan(),destination:'jandri-3500'},hooks(events)),/verified arrival plan/);
  await assert.rejects(moduleUnderTest.run({...plan(),arrival:{...plan().arrival,x:NaN}},hooks(events)),/verified arrival plan/);
  await assert.rejects(moduleUnderTest.run(plan(),{}),/complete safe transition adapter/);
  assert.deepEqual(events,[]);
});
test('concurrent quick travel is blocked without duplicate terrain loading',async()=>{
  const events=[];
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const first=moduleUnderTest.run(plan(),hooks(events,{
    async loadDestination(){events.push('loading');await gate;return {id:'authenticated-terrain'};}
  }));
  await assert.rejects(moduleUnderTest.run(plan('jandri-2600'),hooks(events)),/already in progress/);
  release();
  await first;
  assert.equal(events.filter(e=>e==='loading').length,1);
});
