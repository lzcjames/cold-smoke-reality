'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const scripts=['src/02a_reality.js','src/02a_tiled_dem.js',
  'src/02a_tiled_preview.js'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
function create(asset,search) {
  const context={asset,location:{search}};
  const code=scripts+'\nReality.create(asset);';
  return vm.runInNewContext(code,context);
}
test('real Les Deux Alpes DEM preview uses the identical camera and collision heights',t=>{
  const file=path.join(root,'data/reality/les-deux-alpes.json');
  if(!fs.existsSync(file))return t.skip('Optional pinned IGN source not present in checkout');
  const asset=JSON.parse(fs.readFileSync(file,'utf8'));
  const original=create(asset,'?reality=les-deux-alpes&network=1');
  const tiled=create(asset,'?reality=les-deux-alpes&network=1&tileCollision=1');
  assert.equal(original.tilePreviewEnabled,false);
  assert.equal(tiled.tilePreviewEnabled,true);
  assert.ok(tiled.tilePreviewCount>=4);
  const {east,north,step,cols,rows}=asset.grid;
  let worst=0;
  // Exact source samples including seams (41 nodes => every 40 intervals).
  for(let y=0;y<rows;y+=5)for(let x=0;x<cols;x+=5) {
    const point=original.project(east+x*step,north-y*step);
    const difference=Math.abs(original.altitude(...point)-tiled.altitude(...point));
    worst=Math.max(worst,difference);
  }
  // Interpolation off-grid and tile-boundary probes used by skier skis.
  for(let y=4;y<rows-2;y+=13)for(let x=2;x<cols-2;x+=17) {
    const point=original.project(east+(x+.37)*step,north-(y+.61)*step);
    worst=Math.max(worst,Math.abs(original.height(...point)-tiled.height(...point)));
    assert.equal(original.withinDEM(...point),tiled.withinDEM(...point));
  }
  assert.ok(worst<0.002,'Real DEM A/B elevation divergence '+worst+'m');
});
test('tile preview stays disabled on unrelated resorts',()=>{
  const file=path.join(root,'data/reality/alpe-dhuez.json');
  if(!fs.existsSync(file))return;
  const asset=JSON.parse(fs.readFileSync(file,'utf8'));
  const terrain=create(asset,'?reality=alpe-dhuez&tileCollision=1');
  assert.equal(terrain.tilePreviewEnabled,false);
});
