'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('src/08j_solver.js','utf8');

function run({movePerFrame=0,gradientX=0.12,gradientZ=0.04,frames=360}={}){
 const sandbox={location:{search:''},Skier:{},
   Variants:{val:{solver:'b'},def(){}},
   Course:{mogK:1,height(x,z){return 200+gradientX*x+gradientZ*z;}}};
 vm.runInNewContext(code+'\nthis.contact=Skier.ground;',sandbox);
 const output=[],sec={};
 for(let frame=0;frame<frames;frame++){
  const root={pos:[frame*movePerFrame,200,0],fwd:[0,0,-1]};
  const toW=q=>[root.pos[0]+q[0],root.pos[1]+q[1],root.pos[2]+q[2]];
  const pair=sandbox.contact({onSnow:1,stance:0.31,sink:0,mogK:1,
   crouch:0.2,lead:0},root,[0,1,0],toW,sec,1/60);
  assert.equal(pair.length,5);
  assert.ok(Array.from(pair).every(Number.isFinite));
  output.push(Array.from(pair));
 }
 return output.slice(-120);
}
const span=xs=>Math.max(...xs)-Math.min(...xs);
test('standing on measured-style static inclined snow cannot continuously bounce skis',()=>{
 for(const gradient of [[0,0],[0.12,0.04],[-0.18,0.09]]){
  const recent=run({gradientX:gradient[0],gradientZ:gradient[1]});
  for(let field=0;field<5;field++){
   const values=recent.map(x=>x[field]);
   assert.ok(span(values)<1e-4,
    'standing snowboard/skis contact field '+field+' remains unsettled: '+span(values));
  }
 }
});
test('uniform descent on a smooth gradient has no alternating contact jumps',()=>{
 const recent=run({movePerFrame:0.11,gradientX:0.12,gradientZ:0.04});
 for(let field=0;field<5;field++){
  const values=recent.map(x=>x[field]);
  const deltas=values.slice(1).map((x,j)=>x-values[j]);
  assert.ok(span(deltas)<1e-4,
   'contact field '+field+' alternates frame-to-frame on constant source slope');
 }
});
test('diagnostic URL remains disabled by default in steady-state regression',()=>{
 const sandbox={location:{search:''},Skier:{},
   Variants:{val:{solver:'b'},def(){}},
   Course:{mogK:1,height:()=>200}};
 vm.runInNewContext(code,sandbox);
 assert.equal(sandbox.__skiSkiDiag,undefined);
});
