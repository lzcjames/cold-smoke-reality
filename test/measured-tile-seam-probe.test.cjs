'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs'),vm=require('node:vm');
const files=['src/02j_terrain_tile_cache.js','src/02k_terrain_tile_probe.js']
 .map(f=>fs.readFileSync(f,'utf8')).join('\n');
const code=vm.runInNewContext(files+'\n({Cache:TerrainTileCache,Probe:TerrainTileProbe})',{TextEncoder});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function make(tamper=false){
 const raw=new Map(),tiles=[],source='a'.repeat(64);
 for(let id=0;id<2;id++){
  const east=100+id*30;
  const heights=[];
  for(let j=0;j<3;j++)for(let i=0;i<3;i++)
   heights.push(2500-(id*2+i)-j+(tamper&&id===1&&i===0?1:0));
  const tile={schema:'cold-smoke-dem-source-tile/v1',
   resortId:'les-deux-alpes',routeName:'Jandri 2',
   sourceOSMSHA256:source,approvedForGameplay:false,
   startCol:id*2,startRow:0,
   grid:{cols:3,rows:3,east,north:300,step:15,heights}};
  const name='tile-'+id+'-0.json',body=JSON.stringify(tile)+'\n';
  raw.set(name,body);tiles.push({filename:name,sha256:sha(body),
   bytes:Buffer.byteLength(body),cols:3,rows:3,startCol:id*2,startRow:0,
   boundsLambert93:[east,270,east+30,300]});
 }
 const manifest={schema:'cold-smoke-measured-tiles-staging/v1',
  sourceOnly:true,approvedForGameplay:false,readyForRuntime:false,
  resortId:'les-deux-alpes',routeName:'Jandri 2',sourceOSMSHA256:source,
  grid:{cols:5,rows:3,step:15,east:100,north:300},tiles};
 let calls=0;
 const cache=code.Cache.create(manifest,{fetchTile:async name=>{calls++;return raw.get(name);},
  digest:async bytes=>sha(bytes),maxResident:2});
 return {probe:code.Probe.create(cache),cache,calls:()=>calls};
}
test('exact shared DEM seam matches and height is continuous across split',async()=>{
 const {probe,cache}=make();
 assert.equal(await probe.sample(115,285),2498);
 assert.equal(await probe.sample(130,285),2497);
 assert.equal(await probe.sample(145,285),2496);
 assert.equal(cache.residentCount(),2);
 assert.equal(probe.approvedForGameplay,false);
});
test('detects even source-hash-valid but mutually inconsistent shared seam',async()=>{
 const {probe}=make(true);
 await assert.rejects(()=>probe.sample(130,285),/shared border height mismatch/);
});
test('out of coverage never invents ground and invalid coordinates are rejected',async()=>{
 const {probe,calls}=make();
 assert.equal(await probe.sample(400,285),null);
 assert.equal(calls(),0);
 await assert.rejects(()=>probe.sample(NaN,280),/Invalid/);
});
test('diagnostic module cannot accept gameplay-enabled cache',()=>{
 assert.throws(()=>code.Probe.create({sourceOnly:false,approvedForGameplay:true,
  nearby:()=>[],acquire:()=>{}}),/Only audited/);
});
