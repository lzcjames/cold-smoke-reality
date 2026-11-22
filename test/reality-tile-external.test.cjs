'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const exporter=require('../tools/reality/export_dem_tiles.cjs');
const root=path.join(__dirname,'..');
const source=['src/02a_tiled_dem.js','src/02a_tile_stream.js',
  'src/02a_tiled_external.js'].map(x=>fs.readFileSync(path.join(root,x),'utf8')).join('\n');
const hash=bytes=>crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
function fixture() {
  const cols=8, rows=7, heights=Array.from({length:cols*rows},
    (_,i)=>1700+Math.floor(i/cols)*3+(i%cols)*2);
  const asset={version:1,id:'les-deux-alpes',grid:
    {cols,rows,heights,east:900000,north:6500000,step:15}};
  const split=exporter.split(asset,{cells:4});
  const files=new Map(), entries=[];
  for(const tile of split.tiles){
    const url='tile_'+tile.x+'_'+tile.y+'.json';
    const bytes=Buffer.from(JSON.stringify(tile));
    files.set('reality/les-deux-alpes-tiles/'+url,bytes);
    entries.push({id:tile.x+':'+tile.y,x:tile.x,y:tile.y,url,
      sha256:hash(bytes)});
  }
  const manifest={schema:split.schema,resortId:asset.id,grid:split.grid,
    bounds:split.bounds,sourceHeightSHA256:split.sourceHeightSHA256,
    tiles:entries};
  files.set('reality/les-deux-alpes-tiles/manifest.json',
    Buffer.from(JSON.stringify(manifest)));
  return {asset,files,manifest};
}
async function run(asset,files) {
  const ctx=vm.createContext({crypto:crypto.webcrypto,TextEncoder,TextDecoder,
    fetch:async url=>({ok:files.has(url),
      json:async()=>JSON.parse(files.get(url)?.toString()||'null'),
      arrayBuffer:async()=>{const b=files.get(url)||Buffer.alloc(0);
        return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}
    })});
  return await vm.runInContext(source+\`\nRealityTileExternal.load(asset,
    'reality/les-deux-alpes-tiles/manifest.json');\`,Object.assign(ctx,{asset}));
}
test('external verified tiles reconstruct source heights at all sample points',async()=>{
  const {asset,files}=fixture(),ground=await run(asset,files),g=asset.grid;
  assert.equal(ground.tiles,6);
  assert.equal(ground.external,true);
  for(let row=0;row<g.rows;row++)for(let col=0;col<g.cols;col++)
    assert.ok(Math.abs(ground.height(g.east+col*g.step,
      g.north-row*g.step)-g.heights[row*g.cols+col])<1e-6);
});
test('corrupted external tile never activates collision terrain',async()=>{
  const {asset,files}=fixture();
  files.set('reality/les-deux-alpes-tiles/tile_0_0.json',Buffer.from('{"x":0}'));
  await assert.rejects(run(asset,files),/DEM checksum mismatch/);
});
test('external manifest cannot substitute a different measured grid',async()=>{
  const {asset,files}=fixture();
  asset.grid.heights[4]+=1;
  await assert.rejects(run(asset,files),/source DEM checksum mismatch/);
});
test('external manifest cannot silently omit terrain tiles',async()=>{
  const {asset,files,manifest}=fixture();
  manifest.tiles.pop();
  files.set('reality/les-deux-alpes-tiles/manifest.json',
    Buffer.from(JSON.stringify(manifest)));
  await assert.rejects(run(asset,files),/Published measured DEM tiles disagree/);
});
