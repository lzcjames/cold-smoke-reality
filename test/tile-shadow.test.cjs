'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const DEM=require('../src/02a_tiled_dem.js');
const Stream=require('../src/02a_tile_stream.js');
const Neighborhood=require('../src/02a_tile_neighborhood.js');
const Shadow=require('../src/02a_tile_shadow.js');
const enc=new TextEncoder();
function fixture({delay=false,corrupt=false,partial=false}={}){
  const asset={id:'les-deux-alpes',grid:{east:900000,north:6500000,step:10,
    cols:7,rows:3,heights:Array.from({length:21},(_,i)=>
      1800+(i%7)*2+Math.floor(i/7)*3)}};
  const manifest={schema:'cold-smoke-dem-tiles/v1',resortId:asset.id,
    grid:{east:900000,north:6500000,step:10,cells:3},
    bounds:{cols:7,rows:3},tiles:[]};
  const files=new Map();let calls=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  for(let x=0;x<3;x++){
    const tile={x,y:0,heights:[]};
    for(let row=0;row<3;row++)for(let col=0;col<3;col++)
      tile.heights.push(asset.grid.heights[row*7+x*2+col]);
    // Deliberately signed but undersized tile: correct hash must not make
    // unmeasured ski-contact samples pass the height continuity audit.
    if(partial&&x===1){
      tile.cols=2;
      tile.heights=[tile.heights[0],tile.heights[1],
        tile.heights[3],tile.heights[4],tile.heights[6],tile.heights[7]];
    }
    const url='tile_'+x+'.json';
    const bytes=enc.encode(JSON.stringify(tile));
    files.set(url,bytes);
    manifest.tiles.push({id:x+':0',x,y:0,url,
      sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const shadow=Shadow.create({asset,manifest,capacity:2,lookaheadSeconds:1,
    hashBytes:async bytes=>crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
    fetchTile:async url=>{
      calls++;
      if(delay&&url==='tile_0.json')await gate;
      let bytes=files.get(url);
      if(corrupt&&url==='tile_1.json')bytes=enc.encode('{"x":1}');
      return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,
        bytes.byteOffset+bytes.byteLength)};
    }});
  return {shadow,release,calls:()=>calls};
}
async function settle(shadow){
  for(let i=0;i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,2));
    if(!shadow.status().running)return shadow.status();
  }
  throw Error('Shadow audit did not finish');
}
test('real measured tile shadow streams verified ground and bounds memory',async()=>{
  const f=fixture();
  assert.equal(f.shadow.observe([900005,6499990],[8,0]),true);
  let status=await settle(f.shadow);
  assert.ok(status.checked>0,status.lastError);
  assert.ok(status.peakErrorM<0.002);
  assert.equal(status.failures,0);
  const firstCalls=f.calls();
  for(let i=0;i<20;i++)f.shadow.observe([900005,6499990],[8,0]);
  assert.equal(f.calls(),firstCalls,'same footprint must not cause frame-rate fetches');
  assert.equal(f.shadow.observe([900045,6499990],[8,0]),true);
  status=await settle(f.shadow);
  assert.ok(status.loaded<=2);
  assert.ok(status.updates>=2);
  f.shadow.close();
  assert.equal(f.shadow.observe([900005,6499990]),false);
});
test('shadow auditing cannot turn missing or corrupted tile data into collision terrain',async()=>{
  const f=fixture({corrupt:true});
  f.shadow.observe([900025,6499990],[5,0]);
  const result=await settle(f.shadow);
  assert.ok(result.failures>=1);
  assert.match(result.lastError,/checksum mismatch/);
  assert.equal(result.checked,0);
});
test('new skier destination wins after an older slow tile request',async()=>{
  const f=fixture({delay:true});
  f.shadow.observe([900005,6499990],[1,0]);
  f.shadow.observe([900045,6499990],[1,0]);
  f.release();
  const result=await settle(f.shadow);
  assert.equal(result.failures,0);
  assert.ok(result.checked>0);
  assert.ok(result.loaded<=2);
});

test('failed tile checksum can be retried on a later observation, without a tight loop',async()=>{
  const f=fixture({corrupt:true});
  assert.equal(f.shadow.observe([900025,6499990],[5,0]),true);
  const first=await settle(f.shadow);
  assert.equal(first.failures,1);
  const before=f.calls();
  // No automatic fetch storm between observations.
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.calls(),before);
  assert.equal(f.shadow.observe([900025,6499990],[5,0]),true);
  const second=await settle(f.shadow);
  assert.equal(second.failures,2);
  assert.ok(f.calls()>before,'same destination must not be poisoned forever');
  assert.equal(second.checked,0);
});
test('leaving measured coverage invalidates delayed tile responses and permits re-entry',async()=>{
  const f=fixture({delay:true});
  assert.equal(f.shadow.observe([900005,6499990],[1,0]),true);
  assert.equal(f.shadow.observe([900500,6499990],[1,0]),false);
  f.release();
  let status=await settle(f.shadow);
  assert.equal(status.checked,0,'obsolete tile response must not be treated as current terrain');
  assert.equal(status.updates,0);
  assert.equal(f.shadow.observe([900005,6499990],[1,0]),true);
  status=await settle(f.shadow);
  assert.ok(status.checked>0,'returning inside real DEM must allow a new verified audit');
  assert.equal(status.failures,0);
});

test('validly signed but incomplete tile coverage fails the actual ski-contact audit',async()=>{
  const f=fixture({partial:true});
  assert.equal(f.shadow.observe([900035,6499990],[1,0]),true);
  const status=await settle(f.shadow);
  assert.equal(status.checked,0);
  assert.equal(status.failures,1);
  assert.match(status.lastError,/tile missing at ski contact/);
});
