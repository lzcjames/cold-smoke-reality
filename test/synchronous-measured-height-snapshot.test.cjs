'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('src/02l_terrain_height_snapshot.js','utf8');
const Height=vm.runInNewContext(code+'\nTerrainHeightSnapshot').create;
function fixture(){
 const manifest={schema:'cold-smoke-measured-tiles-staging/v1',
   sourceOnly:true,approvedForGameplay:false,readyForRuntime:false,
   grid:{cols:5,rows:3,step:15,east:100,north:300},
   tiles:[{filename:'tile-0-0.json',startCol:0,startRow:0,cols:3,rows:3},
     {filename:'tile-1-0.json',startCol:2,startRow:0,cols:3,rows:3}]};
 function tile(index,adjust=0) {
   const east=100+index*30;
   return {name:'tile-'+index+'-0.json',grid:{cols:3,rows:3,step:15,east,north:300,
     heights:Float32Array.from({length:9},(_,k)=>{
       const row=Math.floor(k/3),col=k%3;
       return 2500-(index*2+col)*2-row*3 + (index===1&&col===0?adjust:0);
     })}};
 }
 return {manifest,tile};
}
test('synchronous samples agree across adjacent real original DEM nodes',()=>{
 const {manifest,tile}=fixture();
 const t0=tile(0),t1=tile(1);
 const snapshot=Height(manifest,[t0,t1]);
 assert.equal(snapshot.sample(100,300),2500);
 assert.equal(snapshot.sample(115,285),2496.5);
 assert.equal(snapshot.sample(130,285),2493);
 assert.equal(snapshot.sample(145,285),2491);
 assert.equal(snapshot.sample(160,270),2486);
 assert.equal(snapshot.readyForPhysics,false);
 assert.equal(snapshot.residentTiles,2);
});
test('missing tile always yields null, never manufactured skiing ground',()=>{
 const {manifest,tile}=fixture();
 const view=Height(manifest,[tile(0)]);
 assert.equal(view.sample(160,285),null);
 assert.equal(view.sample(-100,300),null);
 assert.equal(view.sample(Number.NaN,300),null);
});
test('prevalidated seam inconsistency is rejected before physics sampling',()=>{
 const {manifest,tile}=fixture();
 assert.throws(()=>Height(manifest,[tile(0),tile(1,0.5)]),/seam disagrees/);
});
test('snapshot copies source heights so eviction and later mutation cannot jitter results',()=>{
 const {manifest,tile}=fixture(),first=tile(0);
 const view=Height(manifest,[first]);
 const stable=view.sample(115,285);
 first.grid.heights.fill(1);
 assert.equal(view.sample(115,285),stable);
});
test('refuses unapproved gameplay, alien tile or huge resident set',()=>{
 const {manifest,tile}=fixture();
 manifest.readyForRuntime=true;
 assert.throws(()=>Height(manifest,[tile(0)]),/non-playable/);
 manifest.readyForRuntime=false;
 const stranger=tile(0);stranger.name='tile-99-0.json';
 assert.throws(()=>Height(manifest,[stranger]),/Unlisted/);
 assert.throws(()=>Height(manifest,[tile(0),tile(0)]),/Unlisted/);
});
