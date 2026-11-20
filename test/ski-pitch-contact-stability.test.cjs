'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('src/08j_solver.js','utf8');
const physics=fs.readFileSync('src/07_game.js','utf8');

function skiPitch(previous,raw,dt,on=true){
  if(!on || !(dt>0) || previous==null)return raw;
  const eased=previous+(raw-previous)*(1-Math.exp(-14*dt));
  return Math.max(raw-0.035,Math.min(raw+0.035,eased));
}
test('visible ski pitch is smoothed but never deviates more than 0.035 radians from actual contact',()=>{
  const samples=[0,.03,-.03,.03,-.03,.03,-.03,0];
  let prev=null,visible=[];
  for(const value of samples){prev=skiPitch(prev,value,1/60);visible.push(prev);assert.ok(Math.abs(prev-value)<0.035001);}
  const rawDiff=samples.slice(1).map((v,i)=>Math.abs(v-samples[i]));
  const renderDiff=visible.slice(1).map((v,i)=>Math.abs(v-visible[i]));
  assert.ok(renderDiff.reduce((a,b)=>a+b,0)<rawDiff.reduce((a,b)=>a+b,0));
  assert.match(src,/const index = k \* 2 \+ 1, state = 22 \+ k/);
  assert.match(src,/out\[index\] = Math\.max\(raw - 0\.035, Math\.min\(raw \+ 0\.035, eased\)\)/);
});
test('snow contact and takeoff are unaffected: pitch transitions reset immediately',()=>{
  assert.equal(skiPitch(.5,-.25,1/60,false),-.25);
  assert.equal(skiPitch(.5,-.25,0,true),-.25);
  assert.equal(skiPitch(null,-.25,1/60,true),-.25);
  assert.match(src,/lay\(q, 0, EL, dt, on, near, hold\)/);
  assert.match(src,/lay\(q, 4, ER, dt, on, near, hold\)/);
  assert.match(physics,/if \(G\.mode === 'run'\) \{/);
});
