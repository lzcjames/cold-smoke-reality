'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {split}=require('../tools/reality/tile_measured_dem.cjs');
const {audit}=require('../tools/reality/audit_real_ign_ski_contact.cjs');
function fixture(fn){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'real-ski-contact-'));
 const cols=100,rows=36;
 const data={schema:'cold-smoke-measured-dem-staging/v1',
  resortId:'les-deux-alpes',routeName:'Jandri 2',
  approvedForGameplay:false,mergedIntoResort:false,
  sourceOSMSHA256:'b'.repeat(64),
  grid:{cols,rows,step:15,east:947000,north:6439000,
   heights:Array.from({length:cols*rows},(_,i)=>2300+
     0.12*(i%cols)*15+0.04*Math.floor(i/cols)*15)}};
 try{
  const pieces=split(data,{tileCells:64});
  fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(pieces.manifest));
  for(const tile of pieces.tiles)fs.writeFileSync(path.join(folder,tile.name),tile.raw);
  fn(data,folder);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
}
test('original ski contact settles on grounded DEM and traverses measured seams',()=>{
 fixture((data,folder)=>{
  const report=audit(data,folder);
  assert.equal(report.cases.length,5);
  assert.equal(report.originalMeasuredCells,3600);
  assert.ok(report.cases.filter(x=>x.moveMPerFrame===0).every(
   x=>x.last120Range.every(v=>v<0.002)));
  assert.equal(report.actualGameContactSolverUnmodified,true);
  assert.equal(report.approvedForGameplay,false);
  assert.equal(report.networkCallsDuringContact,0);
 });
});
test('changed source height is rejected before contact solve',()=>{
 fixture((data,folder)=>{
  data.grid.heights[10]+=1;
  assert.throws(()=>audit(data,folder),/does not match original/);
 });
});
test('missing measured chunk does not silently synthesize ground',()=>{
 fixture((data,folder)=>{
  fs.unlinkSync(path.join(folder,'tile-0-0.json'));
  assert.throws(()=>audit(data,folder),/ENOENT/);
 });
});
