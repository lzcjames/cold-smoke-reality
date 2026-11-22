'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {inventory,planGroundTiles}=require('../tools/reality/resort_wide_inventory.cjs');
const sector=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes-sectors.json','utf8'));
const source=JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));
const projection={sourceCRS:'EPSG:4326',targetCRS:'EPSG:2154',
  sourceVerified:true,forward:([x,y])=>[1000+x*10,1000+y*10]};
test('whole-resort map is not conflated with the pinned Jandri-only survey',()=>{
 const r=inventory(sector,source);
 assert.equal(r.officialMapSectorCount,12);
 assert.equal(r.osm.knownDownhillWays,37);
 assert.equal(r.osm.routeLabels.length,6);
 assert.equal(r.osm.routeLabels.find(x=>x.name==='Jandri 2').sourceWayCount,11);
 assert.equal(r.wholeResortSurveyComplete,false);
 assert.equal(r.wholeResortDEMComplete,false);
 assert.ok(r.officialMapSectors.every(x=>!x.hasGeoreferencedBoundaries));
 assert.equal(r.approvedForGameplay,false);
});
test('tile planner follows original line interiors, not merely endpoints',()=>{
 const s={source:'OpenStreetMap / Overpass',originalResponseSHA256:'a'.repeat(64),
   features:[{id:91,type:'way',drawable:true,tags:{'piste:type':'downhill'},
     nodes:[101,102],coordinates:[[0,0],[100,0]]}]};
 const p=planGroundTiles(s,projection,{tileSizeM:500,marginM:0,sampleStepM:10});
 assert.deepEqual(p.tiles.map(x=>x.id),['2:2','3:2','4:2']);
 assert.ok(p.tiles.every(t=>t.sourceWayIds.length===1&&t.sourceWayIds[0]===91));
 assert.equal(p.approvedForGameplay,false);
 assert.equal(p.noDEMDownloaded,true);
});
test('fail closed for unverifiable projected CRS and unauthorized map geometries',()=>{
 const fake=structuredClone(sector);
 fake.sectors[0].sourceBoundsLambert93=[1,2,3,4];
 assert.throws(()=>inventory(fake,source),/cannot imply/);
 assert.throws(()=>planGroundTiles(source,{...projection,sourceVerified:false}),/verified/);
 assert.throws(()=>planGroundTiles(source,{...projection,targetCRS:'EPSG:3857'}),/verified/);
});
test('tile budget rejects massive mapped area rather than silently lowering quality',()=>{
 const s={source:'OpenStreetMap / Overpass',originalResponseSHA256:'b'.repeat(64),
   features:[{id:91,type:'way',drawable:true,tags:{'piste:type':'downhill'},
     nodes:[101,102],coordinates:[[0,0],[100,0]]}]};
 assert.throws(()=>planGroundTiles(s,projection,
   {tileSizeM:250,marginM:0,sampleStepM:25,maxTiles:1}),/budget/);
});
test('route identifications are not fabricated from shared geography',()=>{
 const r=inventory(sector,source);
 const p=planGroundTiles(source,projection,{tileSizeM:1000,marginM:45});
 assert.equal(p.sourceWayCount,37);
 assert.equal(new Set(p.tiles.flatMap(x=>x.sourceWayIds)).size,37);
 assert.ok(p.tiles.every(x=>!x.detailedDEMVerified));
 assert.equal(r.osm.sourceSHA256,p.sourceOSMSHA256);
});
