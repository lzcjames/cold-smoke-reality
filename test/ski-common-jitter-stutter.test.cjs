'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const game=fs.readFileSync('src/07_game.js','utf8');
const terrain=fs.readFileSync('src/04_terrain.js','utf8');
function helper(name) {
  const start=game.indexOf('  function '+name+'(');
  const end=game.indexOf('\n  }',start);
  assert.ok(start>=0 && end>start,'helper '+name+' exists');
  const fragment=game.slice(start,end+5);
  return vm.runInNewContext('(()=>{ const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));\n'+fragment+'\nreturn '+name+';})()');
}
const settle=helper('settleCameraClearance');
const stable=helper('stabilizeSkierVisualY');

test('ground-clearance camera follows rising snow immediately and falls gradually',()=>{
  assert.equal(settle(0.2,0.9,1/60),0.9,'must never cut into terrain');
  const low=settle(0.9,0,1/60);
  assert.ok(low>0.75&&low<0.9,'do not instantly snap lens down');
  let y=0.9;
  for(let i=0;i<120;i++) {
    y=settle(y,0,1/60);
    assert.ok(y>=0,'always preserves near-plane clearance');
  }
  assert.ok(y<0.00001,'must eventually return to true camera height');
});
test('camera easing is time-based, not dependent on frame rate',()=>{
  const once=settle(1,0,1/30);
  const twice=settle(settle(1,0,1/60),0,1/60);
  assert.ok(Math.abs(once-twice)<1e-12);
  assert.equal(settle(NaN,0.3,1/60),0.3);
  assert.match(game,/cam\.nearRaise = first \? clearance : settleCameraClearance/);
});
test('skier visible root height filters framewise bob without changing travel or collision',()=>{
  const dt=1/60, v=-1.2;
  let filtered=100, maxStep=0, last=filtered;
  for(let i=1;i<=90;i++) {
    const raw=100+v*i*dt+0.045*(i%2?1:-1);
    filtered=stable(filtered,raw,v,dt);
    assert.ok(Math.abs(filtered-raw)<=0.070000001);
    maxStep=Math.max(maxStep,Math.abs(filtered-last-v*dt));
    last=filtered;
  }
  assert.ok(maxStep<0.04,'visible body must not alternate with raw 9 cm contact shake');
  assert.match(game,/fl\.visY = first \|\| !S\.contact \|\| S\.crash > 0/);
  assert.match(game,/root\.pos\[1\] = fl\.visY/);
  assert.match(game,/fl\.fr = lerp\(fy/,'flight/camera collision still uses real feet');
});
test('visual smoothing has a bounded 7 cm error and resets on jumps',()=>{
  const dt=1/60;
  assert.equal(stable(NaN,50,0,dt),50);
  assert.equal(stable(0,30,0,dt),29.93);
  assert.equal(stable(90,60,0,dt),60.07);
  assert.equal(stable(1,2,0,0),2);
});
test('clipmap queues minor camera scrolling instead of forced full catch-up',()=>{
  assert.match(terrain,/Math\.abs\(tgt\[0\] - L\.cx\) > 12 \|\| Math\.abs\(tgt\[1\] - L\.cz\) > 12/);
  assert.match(terrain,/const SQ = \[\]/);
  assert.match(terrain,/runQueue\(Math\.max\(1, Math\.ceil\(SQ\.length \/ 12\)\)\)/);
  assert.match(terrain,/if \(!L\.valid \|\| force \|\| Math\.abs\(tx - L\.cx\) >= 200/,'large teleports still force full refresh');
});
