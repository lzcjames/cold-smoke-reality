'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {split}=require('../tools/reality/tile_measured_dem.cjs');
const {check}=require('../tools/reality/check_measured_tiles.cjs');
function source(){
 return {schema:'cold-smoke-measured-dem-staging/v1',
  resortId:'les-deux-alpes',routeName:'Jandri 2',
  sourceOSMSHA256:'a'.repeat(64),approvedForGameplay:false,
  mergedIntoResort:false,grid:{cols:5,rows:4,east:947000,north:6439000,
  step:15,heights:Array.from({length:20},(_,i)=>2400-i)}};
}
function withTiles(visit){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dem-tile-proof-'));
 try{
  const data=source(),pieces=split(data,{tileCells:3});
  fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(pieces.manifest)+'\n');
  for(const tile of pieces.tiles)fs.writeFileSync(path.join(folder,tile.name),tile.raw);
  return visit(data,folder);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
}
test('authentic staged original reconstructs identically and stays unplayable',()=>{
 withTiles((data,folder)=>{
  const result=check(data,folder);
  assert.equal(result.measuredHeightSamples,20);
  assert.equal(result.sourceTileCount,4);
  assert.equal(result.sourceGridReconstructedExactly,true);
  assert.equal(result.approvedForGameplay,false);
  assert.equal(result.readyForRuntime,false);
 });
});
test('manifest of another measured DEM fails before any tile can load',()=>{
 withTiles((data,folder)=>{
  data.grid.heights[0]=3999;
  assert.throws(()=>check(data,folder),/does not match original/);
 });
});
test('missing source tile never silently interpolates a height',()=>{
 withTiles((data,folder)=>{
  fs.rmSync(path.join(folder,'tile-1-0.json'));
  assert.throws(()=>check(data,folder),/ENOENT/);
 });
});
