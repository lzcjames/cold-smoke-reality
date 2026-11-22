'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {split}=require('../tools/reality/tile_measured_dem.cjs');
const {audit}=require('../tools/reality/audit_real_dem_mesh.cjs');
function fixture(visit){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'ign-mesh-source-'));
 const source={schema:'cold-smoke-measured-dem-staging/v1',
   resortId:'les-deux-alpes',routeName:'Jandri 2',
   approvedForGameplay:false,mergedIntoResort:false,
   sourceOSMSHA256:'a'.repeat(64),
   grid:{cols:5,rows:4,step:15,east:947000,north:6440000,
     heights:Array.from({length:20},(_,i)=>2350-0.5*(i%5)-i/5)}};
 try{
  const packed=split(source,{tileCells:3});
  fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(packed.manifest));
  for(const tile of packed.tiles)fs.writeFileSync(path.join(folder,tile.name),tile.raw);
  return visit(source,folder,packed);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
}
test('verified original source-only terrain meshes have identical geographic edge vertices',()=>{
 fixture((source,folder)=>{
  const report=audit(source,folder);
  assert.equal(report.originalSourceTiles,4);
  assert.equal(report.originalGridHeightSamples,20);
  assert.equal(report.meshedVertexCount,30);
  assert.equal(report.meshedTriangleCount,24);
  assert.ok(report.sharedMeshVertexPairs>0);
  assert.equal(report.maxSharedPositionErrorM,0);
  assert.equal(report.approvedForGameplay,false);
 });
});
test('source hash mismatch stops original DEM mesh audit',()=>{
 fixture((source,folder)=>{
  source.grid.heights[3]+=2;
  assert.throws(()=>audit(source,folder),/does not match original/);
 });
});
test('missing original source tile fails before rendering any terrain mesh',()=>{
 fixture((source,folder)=>{
  fs.unlinkSync(path.join(folder,'tile-0-0.json'));
  assert.throws(()=>audit(source,folder),/ENOENT/);
 });
});
