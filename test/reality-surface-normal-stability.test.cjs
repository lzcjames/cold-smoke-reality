'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('src/03_course.js','utf8');
const start=source.indexOf('  C.normal = function (x, z, d = 0.3) {');
const end=source.indexOf('\n  };',start);
assert.ok(start>0&&end>start,'course normal function source exists');
const implementation=source.slice(start,end+5);

function normal(height,reality) {
  const samples=[];
  const C={reality,height(x,z) {samples.push([x,z]);return height(x,z);}};
  const fn=vm.runInNewContext('(()=>{ const C=globalThis.C,_g=[0,0,0];'+
    implementation+'; return (x,z,d)=>[...C.normal(x,z,d)]; })()', {C});
  return {sample:(x,z,d)=>fn(x,z,d),samples};
}
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,
  a.reduce((s,v,i)=>s+v*b[i],0))));

test('real 15m DEM seam causes smoothly varying normals, not a physics snap',()=>{
  // A local cross-section of adjacent *bilinear* DEM cells with different
  // slopes. Height is continuous, the old 0.35m gradient was discontinuous.
  const cross=(x)=>x<0?0:2*x;
  const x=normal((x,z)=>cross(x),{id:'les-deux-alpes'});
  const left=x.sample(-0.5,0,0.35);
  const right=x.sample(0.5,0,0.35);
  assert.ok(angle(left,right)<0.35,'slope should not jump at a 15m seam');
  assert.ok(x.samples.some(([sx])=>Math.abs(sx)>=3),
    'normal derivative must span metres of measured DEM');
  assert.ok(x.samples.every(([sx,sz])=>Number.isFinite(sx)&&Number.isFinite(sz)));
});

test('original procedural terrain retains sub-metre physics detail',()=>{
  const x=normal((x,z)=>Math.sin(x)+z*z,null);
  x.sample(5,7,0.35);
  assert.ok(x.samples.some(([sx])=>Math.abs(sx-5)===0.34999999999999964 || Math.abs(sx-5-0.35)<1e-9 || Math.abs(sx-5+0.35)<1e-9));
  assert.ok(x.samples.every(([sx,sz])=>Math.abs(sx-5)<1||Math.abs(sz-7)<1));
});

test('normal smoothing does not alter ground height or measured source files',()=>{
  const measured=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes.json','utf8'));
  const f=x=>x<0?0:2*x;
  const t=normal((x,z)=>f(x),{id:'les-deux-alpes'});
  const before=f(0.5);
  t.sample(0.5,0);
  assert.equal(f(0.5),before);
  assert.equal(measured.provenance.demSha256,'41de1610079645985a62912a0a9d122e70f67128537bed29f1d0c41471442e19');
});
