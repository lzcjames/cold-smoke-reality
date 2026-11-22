'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const TiledDEM=require('../src/02a_tiled_dem.js');
const Stream=require('../src/02a_tile_stream.js');
const encoder=new TextEncoder();
const mk=(x,y)=>({x,y,heights:Array.from({length:9},(_,i)=>1800+
  2*(x*2+i%3)+3*(y*2+Math.floor(i/3)))});
function fixture(overrides={}) {
  const dem=TiledDEM.create({east:900000,north:6500000,step:10,cells:3});
  const tiles=[mk(0,0),mk(1,0),mk(0,1),mk(1,1)];
  const entries=tiles.map(t=>({id:t.x+':'+t.y,x:t.x,y:t.y,
    url:'tiles/t'+t.x+'_'+t.y+'.json',sha256:'a'.repeat(64)}));
  const calls=[];
  const mock=async url=>{calls.push(url);
    const entry=entries.find(e=>e.url===url),tile=tiles.find(t=>t.x===entry.x&&t.y===entry.y);
    return {ok:true,arrayBuffer:async()=>encoder.encode(JSON.stringify(tile)).buffer};
  };
  const api=Stream.create({dem,manifest:{schema:'cold-smoke-dem-tiles/v1',tiles:entries},
    fetchTile:overrides.fetchTile||mock,hashBytes:overrides.hashBytes||
    (async()=> 'a'.repeat(64)),capacity:overrides.capacity||2,
    concurrency:overrides.concurrency||2});
  return {dem,api,calls,entries,tiles};
}
test('source-pinned DEM tiles are loaded once, checked and stay seamed',async()=>{
  const {api,dem,calls}=fixture();
  await api.retain(['0:0','1:0']);
  assert.equal(dem.sample(900020,6499990),1800+2*2+3);
  assert.equal(dem.loaded(),2);
  await Promise.all([api.load('1:0'),api.load('1:0')]);
  assert.equal(calls.length,2);
  assert.deepEqual(api.status().protected,['0:0','1:0']);
});
test('pinned tiles are never evicted and unpinned tiles follow LRU',async()=>{
  const {api,dem}=fixture({capacity:2});
  await api.retain(['0:0','1:0']);
  await api.retain(['1:0','0:1']);
  assert.equal(dem.loaded(),2);
  assert.deepEqual(api.status().loaded,['1:0','0:1']);
  assert.equal(dem.has(900005,6499995),false);
  assert.equal(dem.has(900025,6499995),true);
});
test('corrupt checksum fails closed with no DEM mutation',async()=>{
  const {api,dem}=fixture({hashBytes:async()=> 'b'.repeat(64)});
  await assert.rejects(api.load('0:0'),/checksum mismatch/);
  assert.equal(dem.loaded(),0);
  assert.deepEqual(api.status().pending,[]);
});
test('unknown tile, invalid catalog URL, failed fetch do not fabricate terrain',async()=>{
  const {api,dem}=fixture({fetchTile:async()=>({ok:false})});
  await assert.rejects(api.load('99:99'),/Unknown verified/);
  await assert.rejects(api.retain(['0:0','99:99']),/Invalid DEM retention set/);
  await assert.rejects(api.load('0:0'),/HTTP failure/);
  assert.equal(dem.loaded(),0);
  assert.deepEqual(api.status().protected,[]);
  const base=fixture();
  base.entries[0].url='../untrusted.json';
  assert.throws(()=>Stream.create({dem:base.dem,
    manifest:{schema:'cold-smoke-dem-tiles/v1',tiles:base.entries},
    fetchTile:async()=>({ok:true})}),/Invalid or duplicate/);
});
test('fetch count respects bounded concurrency',async()=>{
  let active=0,max=0;
  const {api}=fixture({capacity:4,concurrency:2,
    fetchTile:async url=>{
      active++;max=Math.max(max,active);
      await new Promise(r=>setTimeout(r,5));
      active--;
      const [x,y]=url.match(/t(\d+)_(\d+)/).slice(1).map(Number);
      return {ok:true,arrayBuffer:async()=>encoder.encode(JSON.stringify(mk(x,y))).buffer};
    }});
  await api.retain(['0:0','1:0','0:1','1:1']);
  assert.equal(max,2);
  assert.equal(api.status().loaded.length,4);
});

test('overlapping retention requests settle in invocation order, keeping newest ground',async()=>{
  let releaseFirst;
  const gate=new Promise(resolve=>{releaseFirst=resolve;});
  const {api,dem}=fixture({capacity:1,fetchTile:async url=>{
    if(url.includes('t0_0')) await gate;
    const [x,y]=url.match(/t(\d+)_(\d+)/).slice(1).map(Number);
    return {ok:true,arrayBuffer:async()=>encoder.encode(JSON.stringify(mk(x,y))).buffer};
  }});
  const old=api.retain(['0:0']);
  const newer=api.retain(['1:0']);
  releaseFirst();
  await Promise.all([old,newer]);
  assert.deepEqual(api.status().protected,['1:0']);
  assert.deepEqual(api.status().loaded,['1:0']);
  assert.equal(dem.has(900025,6499990),true);
  assert.equal(dem.has(900005,6499990),false);
});
test('retention cannot exceed the configured tile budget',async()=>{
  const {api}=fixture({capacity:1});
  await assert.rejects(api.retain(['0:0','1:0']),/Invalid DEM retention set/);
  assert.equal(api.status().loaded.length,0);
});

test('speculative tile cannot report success when collision cache is full of protected ground',async()=>{
  const {api,dem}=fixture({capacity:1});
  await api.retain(['0:0']);
  await assert.rejects(api.load('1:0'),/cannot be retained within protected cache budget/);
  assert.deepEqual(api.status().protected,['0:0']);
  assert.deepEqual(api.status().loaded,['0:0']);
  assert.equal(dem.has(900005,6499995),true);
  assert.equal(dem.has(900025,6499995),false);
  await api.retain(['1:0']);
  assert.equal(dem.has(900025,6499995),true);
  assert.deepEqual(api.status().loaded,['1:0']);
});
