'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {split}=require('../tools/reality/tile_measured_dem.cjs');
const {audit}=require('../tools/reality/audit_real_dem_snapshot.cjs');
function testData(cols=7,rows=5){
 return {schema:'cold-smoke-measured-dem-staging/v1',
  resortId:'les-deux-alpes',routeName:'Jandri 2',
  sourceOSMSHA256:'f'.repeat(64),approvedForGameplay:false,
  mergedIntoResort:false,grid:{cols,rows,step:15,east:947000,north:6438000,
  heights:Array.from({length:cols*rows},(_,k)=>2100+(k%cols)*1.2-
    Math.floor(k/cols)*2.5)}};
}
function withSource(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'measured-height-audit-'));
 const source=testData(),packed=split(source,{tileCells:4});
 try {
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(packed.manifest));
  for(const tile of packed.tiles)fs.writeFileSync(path.join(dir,tile.name),tile.raw);
  return run(source,dir,packed);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('source-only sampler proves every measured node and cell midpoint',()=>{
 withSource((data,dir,packed)=>{
  const report=audit(data,dir);
  assert.equal(report.vertexSamples,35);
  assert.equal(report.midpointSamples,24);
  assert.ok(report.seamSamples>0);
  assert.ok(report.maxVertexErrorM<0.001);
  assert.ok(report.maxMidpointErrorM<0.001);
  assert.equal(report.outsideCoverageReturnedNull,true);
  assert.equal(report.networkFetchesDuringSamples,0);
  assert.equal(report.approvedForGameplay,false);
 });
});
test('do not authorize forged measurements or changed archive chunks',()=>{
 withSource((data,dir)=>{
  data.grid.heights[0]+=1;
  assert.throws(()=>audit(data,dir),/does not match original/);
 });
 withSource((data,dir)=>{
  const file=path.join(dir,'tile-0-0.json');
  const contents=JSON.parse(fs.readFileSync(file,'utf8'));
  contents.grid.heights[0]+=10;
  fs.writeFileSync(file,JSON.stringify(contents)+'\n');
  assert.throws(()=>audit(data,dir),/hash/);
 });
});
test('a missing actual terrain chunk fails before any live height query',()=>{
 withSource((data,dir)=>{
  fs.unlinkSync(path.join(dir,'tile-0-0.json'));
  assert.throws(()=>audit(data,dir),/ENOENT/);
 });
});
