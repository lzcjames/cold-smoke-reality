'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('src/02j_terrain_tile_cache.js','utf8');
const Cache=vm.runInNewContext(code+'\nTerrainTileCache',{TextEncoder}).create;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function sample(){
 const source=sha('osm'),raws=new Map(),tiles=[];
 for(let i=0;i<3;i++){
  const name='tile-'+i+'-0.json',tile={schema:'cold-smoke-dem-source-tile/v1',
    resortId:'les-deux-alpes',routeName:'Jandri 2',sourceOSMSHA256:source,
    approvedForGameplay:false,startCol:i*2,startRow:0,
    grid:{cols:3,rows:3,step:15,east:100+i*30,north:300,
      heights:Array.from({length:9},(_,j)=>2400-i*2-j)}};
  const raw=JSON.stringify(tile)+'\n';raws.set(name,raw);
  tiles.push({filename:name,sha256:sha(raw),bytes:Buffer.byteLength(raw),
    startCol:i*2,startRow:0,cols:3,rows:3,
    boundsLambert93:[100+i*30,270,130+i*30,300]});
 }
 return {raws,manifest:{schema:'cold-smoke-measured-tiles-staging/v1',
   sourceOnly:true,approvedForGameplay:false,readyForRuntime:false,
   resortId:'les-deux-alpes',routeName:'Jandri 2',sourceOSMSHA256:source,
   grid:{cols:7,rows:3,step:15,east:100,north:300},tiles}};
}
test('only nearby real DEM chunks load, and LRU remains bounded',async()=>{
 const {raws,manifest}=sample(),calls=[];
 const cache=Cache(manifest,{fetchTile:async n=>{calls.push(n);return raws.get(n);},
   digest:async sha1=>sha(sha1),maxResident:2});
 assert.deepEqual(Array.from(cache.nearby(105,285)),['tile-0-0.json']);
 assert.equal(calls.length,0);
 const a=await cache.acquire('tile-0-0.json');
 assert.equal(a.grid.heights[0],2400);
 await cache.acquire('tile-1-0.json');
 await cache.acquire('tile-0-0.json');
 assert.equal(calls.length,2);
 await cache.acquire('tile-2-0.json');
 assert.deepEqual(Array.from(cache.residentNames()),['tile-0-0.json','tile-2-0.json']);
 assert.equal(cache.approvedForGameplay,false);
 assert.equal(cache.residentCount(),2);
});
test('parallel duplicate requests share one fetch but integrity is still checked',async()=>{
 const {raws,manifest}=sample();let calls=0;
 const cache=Cache(manifest,{fetchTile:async n=>{calls++;await Promise.resolve();return raws.get(n);},
   digest:async x=>sha(x)});
 const [a,b]=await Promise.all([cache.acquire('tile-1-0.json'),cache.acquire('tile-1-0.json')]);
 assert.equal(calls,1);assert.strictEqual(a,b);
});
test('failed integrity never enters cache and can retry',async()=>{
 const {raws,manifest}=sample();let corrupt=true;
 const cache=Cache(manifest,{fetchTile:async n=>corrupt?'{}':raws.get(n),digest:async x=>sha(x)});
 await assert.rejects(()=>cache.acquire('tile-0-0.json'),/integrity/);
 assert.equal(cache.residentCount(),0);
 corrupt=false;
 assert.equal((await cache.acquire('tile-0-0.json')).grid.cols,3);
});
test('manifest cannot mark incomplete source as ready for live ski gameplay',()=>{
 const {raws,manifest}=sample();
 manifest.readyForRuntime=true;
 assert.throws(()=>Cache(manifest,{fetchTile:async n=>raws.get(n),digest:async x=>sha(x)}),/Invalid source-only/);
});
test('unlisted tiles, huge radius and mismatched geo elevation are rejected',async()=>{
 const {raws,manifest}=sample();
 const cache=Cache(manifest,{fetchTile:async n=>raws.get(n),digest:async x=>sha(x)});
 await assert.rejects(()=>cache.acquire('tile-33-0.json'),/Unlisted/);
 assert.throws(()=>cache.nearby(0,0,5000),/neighbourhood/);
 const named=manifest.tiles[0].filename;
 const bad=JSON.parse(raws.get(named));
 bad.grid.east+=30;
 const raw=JSON.stringify(bad)+'\n';
 manifest.tiles[0].sha256=sha(raw);
 manifest.tiles[0].bytes=Buffer.byteLength(raw);
 const checked=Cache(manifest,{fetchTile:async n=>n===named?raw:raws.get(n),digest:async x=>sha(x)});
 await assert.rejects(()=>checked.acquire(named),/georeference/);
});
