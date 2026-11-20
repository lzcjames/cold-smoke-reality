'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const index=JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));
const asset=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes.json','utf8'));
const sources=fs.readFileSync('src/02a_reality.js','utf8')+'\n'+
  fs.readFileSync('src/02b_piste_network.js','utf8')+'\n'+
  fs.readFileSync('src/02e_jandri_lower.js','utf8')+'\n'+
  'const terrain=Reality.create(asset);'+
  'const prepared=JandriLower.extend(asset,terrain);'+
  'terrain.network=PisteNetwork.create(terrain,prepared);'+
  '({terrain,prepared,segments:JandriLower.segments});';
const {terrain,prepared,segments}=vm.runInNewContext(sources,{asset});
const n=.725607765053267,C=11754255.426096,e=Math.sqrt(.00669438002290);
const project=([lon,lat])=>{
  lon*=Math.PI/180;lat*=Math.PI/180;
  const is=Math.atanh(Math.sin(lat))-e*Math.atanh(e*Math.sin(lat));
  const r=C*Math.exp(-n*is),angle=n*(lon-3*Math.PI/180);
  return [700000+r*Math.sin(angle),12655612.049876-r*Math.cos(angle)];
};
const ids=[219275197,644393970];

test('the Jandri routes are exact pinned real OSM node subsequences in IGN DEM',()=>{
  assert.equal(index.originalResponseSHA256,'40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26');
  assert.equal(asset.provenance.demSha256,'41de1610079645985a62912a0a9d122e70f67128537bed29f1d0c41471442e19');
  assert.equal(segments.length,2);
  assert.equal(asset.pistes.length,3,'never rewrite hashed original DEM asset');
  assert.equal(prepared.pistes.length,5);
  for(const segment of segments){
    const original=index.features.find(w=>w.id===segment.osmWay);
    assert.ok(original);
    const first=original.nodes.indexOf(segment.nodes[0]);
    assert.ok(first>=0);
    assert.ok(segment.nodes.length>=20);
    for(let i=0;i<segment.nodes.length;i++){
      assert.equal(segment.nodes[i],original.nodes[first+i]);
      const xy=project(original.coordinates[first+i]);
      assert.ok(Math.hypot(xy[0]-segment.points[i][0],xy[1]-segment.points[i][1])<0.002);
      const world=terrain.project(...segment.points[i]);
      assert.equal(terrain.withinDEM(...world),true);
      assert.ok(Number.isFinite(terrain.altitude(...world)));
    }
    assert.equal(segment.difficulty,'unrated','do not fabricate an official piste grade');
  }
});

test('both Jandri lower fragments start on actual measured downhill slopes',()=>{
  for(const id of ids){
    const line=segments.find(s=>s.osmWay===id);
    const world=line.points.map(p=>terrain.project(...p));
    const heights=world.map(p=>terrain.altitude(...p));
    assert.ok(heights[0]>heights.at(-1)+25,'real downhill elevation must be measured');
    const start=terrain.network.spawnFor(id),near={};
    assert.ok(start);
    assert.equal(terrain.withinDEM(...start),true);
    assert.equal(terrain.network.lookup(...start,near),true);
    assert.equal(near.piste.osmWay,id,'spawn must stay on its chosen Jandri way');
    assert.ok(Number.isFinite(terrain.network.preparedHeight(...start)));
  }
});

test('source gates reject another raster or OSM snapshot',()=>{
  const bad={...asset,provenance:{...asset.provenance,osmSha256:'f'.repeat(64)}};
  assert.throws(()=>vm.runInNewContext(
    fs.readFileSync('src/02e_jandri_lower.js','utf8')+'\nJandriLower.extend(asset,terrain)',
    {asset:bad,terrain}),/pinned real IGN\/OSM pack/);
});

test('only two lower fragments are playable, no fake 2600/3200 DEM or cleared tunnel',()=>{
  assert.deepEqual(segments.map(s=>s.osmWay),ids);
  assert.ok(Math.max(...asset.grid.heights)<2600);
  assert.ok(!segments.some(s=>s.osmWay===660937155),'Jandri 3 tunnel excluded');
  assert.ok(segments.every(s=>s.name.includes('下部实测片段')));
});
