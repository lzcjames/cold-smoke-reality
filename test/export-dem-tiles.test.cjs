'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Export=require('../tools/reality/export_dem_tiles.cjs');
const DEM=require('../src/02a_tiled_dem.js');
const Stream=require('../src/02a_tile_stream.js');
function fixture(){
  const cols=8,rows=7;
  return {id:'verified-fixture',grid:{cols,rows,east:900000,north:6500000,step:15,
    heights:Array.from({length:cols*rows},(_,k)=>1800+(k%cols)*2+Math.floor(k/cols)*3)}};
}
test('export full rectangular DEM including partial edge tiles, without changing heights',()=>{
  const source=fixture(),out=Export.split(source,{cells:4});
  const dem=DEM.create(out.grid);
  for(const tile of out.tiles)dem.add(tile);
  assert.equal(out.tiles.length,6);
  assert.ok(out.tiles.some(t=>t.cols===2 && t.rows===4));
  for(let j=0;j<source.grid.rows;j++)for(let i=0;i<source.grid.cols;i++){
    const actual=dem.sample(source.grid.east+i*15,source.grid.north-j*15);
    assert.ok(Math.abs(actual-source.grid.heights[j*source.grid.cols+i])<1e-6);
  }
  assert.equal(dem.sample(source.grid.east+(source.grid.cols)*15,source.grid.north),null);
});
test('exported tile files have real byte SHA hashes for the streaming loader',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cold-smoke-dem-'));
  try{
    const source=fixture(),m=Export.write(source,dir,{cells:4});
    const dem=DEM.create(m.grid);
    const stream=Stream.create({dem,manifest:m,capacity:m.tiles.length,
      fetchTile:async url=>({ok:true,arrayBuffer:async()=> {
        const b=fs.readFileSync(path.join(dir,url));
        return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
      }}),
      hashBytes:async bytes=>crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
    });
    await stream.retain(m.tiles.map(t=>t.id));
    assert.equal(dem.loaded(),m.tiles.length);
    assert.equal(dem.sample(900105,6499910),source.grid.heights.at(-1));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid DEM source is rejected without synthetic fill',()=>{
  const src=fixture();
  src.grid.heights[7]=NaN;
  assert.throws(()=>Export.split(src,{cells:4}),/Valid source Reality DEM/);
  assert.throws(()=>Export.split(fixture(),{cells:1}),/Valid source Reality DEM/);
});
test('bundled measured Les Deux Alpes pack can be exported losslessly when present',()=>{
  const file=path.join(__dirname,'../data/reality/les-deux-alpes.json');
  if(!fs.existsSync(file)) return; // optional pack may be absent in source checkout
  const asset=JSON.parse(fs.readFileSync(file,'utf8'));
  const out=Export.split(asset,{cells:41});
  const dem=DEM.create(out.grid);
  for(const tile of out.tiles)dem.add(tile);
  for(let j=0;j<asset.grid.rows;j++)for(let i=0;i<asset.grid.cols;i++) {
    assert.ok(Math.abs(dem.sample(asset.grid.east+i*asset.grid.step,
      asset.grid.north-j*asset.grid.step)-
      asset.grid.heights[j*asset.grid.cols+i])<1e-6);
  }
});
