'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const DEM=require('../src/02a_tiled_dem.js');
const Stream=require('../src/02a_tile_stream.js');
const Neighborhood=require('../src/02a_tile_neighborhood.js');
const Gate=require('../src/02a_tile_motion_gate.js');
const encoder=new TextEncoder();
function fixture(corrupt=false){
  const scheme={east:900000,north:6500000,step:10,cells:3};
  const dem=DEM.create(scheme);
  const tiles=[0,1].map(x=>({x,y:0,heights:Array.from({length:9},(_,i)=>{
    const e=x*20+(i%3)*10, south=Math.floor(i/3)*10;
    return 2000+e*.2+south*.1;
  })}));
  const resources=new Map(),manifest={schema:'cold-smoke-dem-tiles/v1',tiles:[]};
  for(const t of tiles) {
    const id=t.x+':0',url='tiles/'+id.replace(':','_')+'.json';
    const bytes=encoder.encode(JSON.stringify(t));
    resources.set(url,bytes);
    manifest.tiles.push({id,x:t.x,y:0,url,
      sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const stream=Stream.create({dem,manifest,capacity:2,concurrency:1,
    hashBytes:async bytes=>crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
    fetchTile:async url=>{
      let bytes=resources.get(url);
      if(corrupt&&url==='tiles/1_0.json')bytes=encoder.encode('{"x":1}');
      return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,
        bytes.byteOffset+bytes.byteLength)};
    }});
  const neighborhood=Neighborhood.create({scheme:{east:scheme.east,
    north:scheme.north,span:20},tileIds:manifest.tiles.map(t=>t.id),
    radius:1,budget:2,lookaheadSeconds:1});
  const gate=Gate.create({neighborhood,stream,dem,footprintM:1,sampleStepM:2});
  return {gate,dem,stream};
}
test('actual signed tile stream authorizes continuous verified ski-path crossing',async()=>{
  const {gate,stream,dem}=fixture();
  const from=[900015,6499990],to=[900025,6499990];
  assert.equal(dem.has(...from),false);
  const permit=await gate.prepare(from,to,[5,0]);
  assert.ok(permit,'both measured source tiles required');
  assert.equal(stream.status().loaded.length,2);
  assert.equal(gate.permit(permit,from,to),true);
  assert.ok(Math.abs(dem.sample(900020,6499990)-2005)<1e-8);
  assert.equal(await gate.prepare([900025,6499990],[900045,6499990]),null);
});
test('one altered remote tile rejects motion, never granting fabricated terrain',async()=>{
  const {gate,stream}=fixture(true);
  const from=[900015,6499990],to=[900025,6499990];
  await assert.rejects(gate.prepare(from,to),/DEM checksum mismatch/);
  assert.equal(gate.permit(null,from,to),false);
  assert.equal(stream.status().protected.length,0);
});
