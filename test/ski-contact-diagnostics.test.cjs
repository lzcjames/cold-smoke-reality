'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('src/08j_solver.js','utf8');
function instantiate(search) {
  const sandbox={
    location:{search},
    Skier:{},
    Variants:{val:{solver:'b'},def(){}},
    Course:{mogK:1,height(x,z){return 200 + 0.12*x + 0.04*z;}},
  };
  vm.runInNewContext(source+'\nthis.contact=Skier.ground;',sandbox);
  return sandbox;
}
function simulate(sandbox,frames=300) {
  const output=[],sec={},Y=[0,1,0];
  for(let i=0;i<frames;i++){
    const root={pos:[i*0.11,200,0],fwd:[0,0,-1]},
      toW=q=>[root.pos[0]+q[0],root.pos[1]+q[1],root.pos[2]+q[2]];
    const out=sandbox.contact({onSnow:1,stance:0.31,sink:0,mogK:1,
      crouch:.2,lead:0},root,Y,toW,sec,1/60);
    output.push(Array.from(out));
  }
  return output;
}
test('telemetry is absent by default and never modifies ski solver output',()=>{
  const regular=instantiate(''),traced=instantiate('?skiDiag=1');
  const a=simulate(regular),b=simulate(traced);
  assert.equal(regular.__skiSkiDiag,undefined);
  assert.deepEqual(b,a,'diagnostic recording cannot change ski physics or visuals');
  assert.equal(traced.__skiSkiDiag.snapshot().length,240);
  const summary=traced.__skiSkiDiag.summary();
  assert.equal(summary.frames,240);
  assert.equal(summary.contactFrames,240);
  assert.equal(summary.pairs,239);
  assert.ok(Number.isFinite(summary.maxFrameSeconds));
  assert.ok(Number.isFinite(summary.maxDelta.leftPitchRad));
});
test('snapshot rows are copied and only latest 240 entries retained',()=>{
  const traced=instantiate('?skiDiag=1&backend=webgl2');
  simulate(traced,260);
  const a=traced.__skiSkiDiag.snapshot();
  assert.equal(a.length,240);
  assert.equal(a[0].frame,21);
  assert.equal(a.at(-1).frame,260);
  a[0].leftY=9999;
  assert.notEqual(traced.__skiSkiDiag.snapshot()[0].leftY,9999);
  traced.__skiSkiDiag.clear();
  assert.equal(traced.__skiSkiDiag.snapshot().length,0);
});
test('unrelated query parameters do not turn on profiling',()=>{
  for(const search of ['?skiDiag=0','?x=skiDiag=1','?skiDiag=11','?piste=644393970']){
    const sandbox=instantiate(search);
    simulate(sandbox,2);
    assert.equal(sandbox.__skiSkiDiag,undefined);
  }
});
