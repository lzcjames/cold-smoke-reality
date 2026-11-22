'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {split,verify}=require('../tools/reality/tile_measured_dem.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function source(cols=5,rows=4) {
 return {schema:'cold-smoke-measured-dem-staging/v1',
 resortId:'les-deux-alpes',routeName:'Jandri 2',
 sourceOSMSHA256:'a'.repeat(64),approvedForGameplay:false,
 mergedIntoResort:false,grid:{cols,rows,step:15,east:947000,north:6440000,
 heights:Array.from({length:cols*rows},(_,i)=>2200+i/5)}};
}
test('overlap tiling reproduces original finite 3D height grid exactly',()=>{
 const data=source(),packed=split(data,{tileCells:3});
 assert.equal(packed.manifest.tiles.length,4);
 const tileByName=new Map(packed.tiles.map(x=>[x.name,x.raw]));
 const out=verify(packed.manifest,name=>tileByName.get(name));
 assert.deepEqual(out,{tiles:4,cols:5,rows:4,
  originalGridVerified:true,approvedForGameplay:false});
 assert.equal(packed.manifest.approvedForGameplay,false);
 assert.equal(packed.manifest.readyForRuntime,false);
 assert.deepEqual(packed.manifest.tiles[0].boundsLambert93,
  [947000,6439970,947030,6440000]);
});
test('detects missing tile and corrupted payload',()=>{
 const packed=split(source(),{tileCells:3});
 const tiles=new Map(packed.tiles.map(x=>[x.name,x.raw]));
 tiles.delete('tile-0-0.json');
 assert.throws(()=>verify(packed.manifest,n=>tiles.get(n)),/hash/);
 tiles.set('tile-0-0.json','{}');
 assert.throws(()=>verify(packed.manifest,n=>tiles.get(n)),/hash/);
});
test('detects cross-tile edge disagreements even if tile hash was recomputed',()=>{
 const packed=split(source(),{tileCells:3});
 const tiles=new Map(packed.tiles.map(x=>[x.name,x.raw]));
 const name='tile-1-0.json';
 const tile=JSON.parse(tiles.get(name));
 tile.grid.heights[0]+=1;
 const raw=JSON.stringify(tile)+'\n';
 tiles.set(name,raw);
 const entry=packed.manifest.tiles.find(x=>x.filename===name);
 entry.sha256=sha(raw);
 entry.bytes=Buffer.byteLength(raw);
 assert.throws(()=>verify(packed.manifest,n=>tiles.get(n)),/shared tile border/);
});
test('refuses fake gameplay, unknown DEM and oversized tile packaging',()=>{
 const bad=source();bad.approvedForGameplay=true;
 assert.throws(()=>split(bad),/Only finite/);
 const malformed=source();malformed.grid.heights[3]=NaN;
 assert.throws(()=>split(malformed),/Only finite/);
 assert.throws(()=>split(source(100,100),{tileCells:100,maxTileBytes:1024}),/tile exceeds budget/);
});
test('140 by 68 candidate becomes six independent <=64 cell tiles',()=>{
 const packed=split(source(140,68),{tileCells:64});
 assert.equal(packed.manifest.tiles.length,6);
 const tiles=new Map(packed.tiles.map(x=>[x.name,x.raw]));
 assert.equal(verify(packed.manifest,n=>tiles.get(n)).originalGridVerified,true);
 assert.ok(packed.manifest.tiles.every(t=>t.bytes<=256*1024));
});
