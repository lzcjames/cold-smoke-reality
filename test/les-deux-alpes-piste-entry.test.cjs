'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const tpl=fs.readFileSync('template.html','utf8');
const main=fs.readFileSync('src/99_main.js','utf8');
const asset=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes.json','utf8'));
const source=fs.readFileSync('src/02a_reality.js','utf8')+'\n'+
  fs.readFileSync('src/02b_piste_network.js','utf8')+'\n'+
  'const terrain = Reality.create(asset); terrain.network = PisteNetwork.create(terrain,asset); terrain;';
const terrain=vm.runInNewContext(source,{asset});
const expected=[
  [643745486,'Petites Crêtes','novice'],
  [643786947,'Vallons du Diable','intermediate'],
  [219409078,'Diable 1','advanced'],
];

test('menu offers only the three existing separately measured Les Deux Alpes pistes',()=>{
  for(const [id,name] of expected) {
    assert.match(tpl,new RegExp('<option value="'+id+'">'+name));
  }
  assert.match(tpl,/id="reality-start-piste-wrap"[^>]*\bhidden\b/);
  assert.match(main,/select\.addEventListener\('change', updatePisteChoice\)/);
  assert.match(main,/startPisteWrap\.hidden = select\.value !== 'les-deux-alpes'/);
  assert.match(main,/terrain\.selectedSpawn = point/);
  assert.match(main,/terrain\.selectedPiste = nearest\.piste/);
  assert.match(main,/history\.replaceState/);
});

test('all listed start positions exist in the actual IGN/OSM network, not invented runs',()=>{
  assert.equal(asset.pistes.length,3);
  for(const [id,name,difficulty] of expected) {
    const line=asset.pistes.find(p=>p.osmWay===id);
    assert.equal(line?.name,name);
    assert.equal(line?.difficulty,difficulty);
    const point=terrain.network.spawnFor(id);
    assert.ok(point, name+' needs a measured centreline start');
    assert.equal(terrain.withinDEM(...point),true,name+' must remain in measured DEM');
    const closest={};
    assert.equal(terrain.network.lookup(...point,closest),true);
    assert.equal(closest.piste.osmWay,id,'the selected piste cannot silently become a different run');
    assert.ok(Number.isFinite(terrain.height(...point)));
  }
});

test('no Jandri 2600 or 3200 arrival may be fabricated from the lower 3-piste crop',()=>{
  const max=Math.max(...asset.grid.heights);
  assert.ok(max<2600,'this crop does not contain the upper Jandri lift sectors');
  assert.doesNotMatch(main,/JandriQuickTransition\.run\(/,'piste entry must not unlock an unverified lift teleport');
});
