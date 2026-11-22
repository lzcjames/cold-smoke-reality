'use strict';
// Deterministic measured-source stress traversal (tile centers, including
// partial boundary tiles). This is a cache test, not an FPS benchmark or
// proof that unmeasured areas of the resort are skiable.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Shadow=require('../src/02a_tile_shadow.js');
const {split}=require('../tools/reality/export_dem_tiles.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function settled(shadow){
  for(let n=0;n<80;n++){
    await new Promise(resolve=>setTimeout(resolve,2));
    if(!shadow.status().running)return shadow.status();
  }
  throw Error('Measured source shadow traversal did not settle');
}
test('real IGN crop: repeated complete tile-grid traversal stays bounded and matches original heights',async t=>{
  const source=path.join(__dirname,'../data/reality/les-deux-alpes.json');
  if(!fs.existsSync(source))return t.skip('Optional licensed measured DEM unavailable');
  const asset=JSON.parse(fs.readFileSync(source,'utf8'));
  const result=split(asset,{cells:41});
  assert.equal(result.tiles.length,16);
  const files=new Map();
  const manifest={schema:result.schema,resortId:result.resortId,
    grid:result.grid,bounds:result.bounds,
    sourceHeightSHA256:result.sourceHeightSHA256,tiles:[]};
  for(const tile of result.tiles){
    const id=tile.x+':'+tile.y,url='tile_'+tile.x+'_'+tile.y+'.json';
    const bytes=Buffer.from(JSON.stringify(tile));
    files.set(url,bytes);
    manifest.tiles.push({id,x:tile.x,y:tile.y,url,sha256:sha(bytes)});
  }
  let requests=0,maxActive=0,active=0;
  const shadow=Shadow.create({asset,manifest,capacity:6,lookaheadSeconds:1.5,
    hashBytes:async b=>sha(Buffer.from(b)),
    fetchTile:async url=>{
      requests++;active++;maxActive=Math.max(active,maxActive);
      await Promise.resolve();
      active--;
      const bytes=files.get(url);
      if(!bytes)return {ok:false};
      return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(
        bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
    }});
  const g=asset.grid,pitch=40;
  const positions=result.tiles.map(tile=>[
    g.east+(tile.x*pitch+(tile.cols-1)/2)*g.step,
    g.north-(tile.y*pitch+(tile.rows-1)/2)*g.step
  ]);
  let previous=0;
  // Walk all 16 measured tiles, reverse, then repeat. Deliberate large
  // camera/skier-position changes test eviction and revisiting, not a
  // physically simulated downhill run.
  for(let lap=0;lap<3;lap++){
    const traversal=lap%2?positions.slice().reverse():positions;
    for(const point of traversal){
      assert.equal(shadow.observe(point,[1,0]),true);
      const state=await settled(shadow);
      assert.equal(state.failures,0,state.lastError);
      assert.ok(state.loaded<=6,'source tile cache exceeded six tiles');
      assert.ok(state.protected.length<=6);
      assert.ok(state.peakErrorM<0.002,'source-grid height diverged');
      assert.ok(state.checked>=previous);
      previous=state.checked;
    }
  }
  const state=shadow.status();
  assert.ok(state.checked>20,'too few measured height comparisons');
  assert.ok(state.updates>=20,'did not traverse the measured crop');
  assert.ok(maxActive<=2,'hash-verified fetch concurrency exceeded limit');
  assert.ok(requests<150,'too many requests for a fixed 16-tile crop');
  shadow.close();
});
