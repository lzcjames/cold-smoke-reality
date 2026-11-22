'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const moduleText=fs.readFileSync('src/02h_jandri_lift_geometry.js','utf8');
const uiText=fs.readFileSync('src/02g_jandri_lift_preview.js','utf8');
const boot=fs.readFileSync('src/99_main.js','utf8');
const tpl=fs.readFileSync('template.html','utf8');
function geometry() {
  const sandbox={};
  vm.runInNewContext(moduleText+'\nthis.out=JandriLiftGeometry;',sandbox);
  return sandbox.out;
}
function auditedPack() {
  // Made-up coordinates in tests ONLY. Never used in player runtime assets.
  const stationIds=['les-deux-alpes-1650','jandri-2600','jandri-3200'];
  return {season:'winter',resortId:'les-deux-alpes',
    status:'independently_source_validated',sourceSha256:'a'.repeat(64),
    stationIds,liftOsmIds:['way/1229057878','way/1361005452'],
    stations:stationIds.map((id,i)=>({id,anchor:[940000+i*30,1600+i*700,6450000+i*30],
      measuredPlatformLocation:true,verifiedTerrainGround:true})),
    legs:['way/1229057878','way/1361005452'].map((osmWay,i)=>({osmWay,
      towers:[{anchor:[940010+i*30,1650+i*700,6450010+i*30],
        measuredStructurePosition:true,verifiedTerrainClearance:true}]}))};
}
test('no sourced position data is bundled into the default game',()=>{
  const network=fs.readFileSync('src/02f_jandri_lift_network.js','utf8');
  assert.match(network,/verifiedWorldPoint:null/);
  assert.match(network,/boardingApproved:false/);
  assert.match(network,/expressRideEnabled:false/);
  assert.doesNotMatch(moduleText,/Course\.height|Game\.step|window\.|requestAnimationFrame/);
  assert.doesNotMatch(uiText,/Game\.step|Terrain\.update|Render\.passes|requestAnimationFrame/);
});
test('Jandri lift cable geometry refuses arbitrary or unaudited coordinates',()=>{
  const g=geometry(),p=auditedPack();
  assert.throws(()=>g.centerline(null,0),/Unverified/);
  assert.throws(()=>g.centerline(p,2),/Invalid lift leg/);
  for(const mutation of [
    q=>{q.status='unverified';},
    q=>{q.sourceSha256='not-hash';},
    q=>{q.stations[0].anchor=[Infinity,0,0];},
    q=>{q.stations[2].verifiedTerrainGround=false;},
    q=>{q.legs[0].towers[0].measuredStructurePosition=false;},
    q=>{q.legs[1].towers[0].verifiedTerrainClearance=false;},
    q=>{q.legs[0].towers=[];},
    q=>{q.liftOsmIds[1]='way/unknown';},
  ]) {
    const value=auditedPack();mutation(value);
    assert.throws(()=>g.validate(value));
  }
});
test('strict geometry produces only the supplied station/tower points',()=>{
  const g=geometry(),p=auditedPack();
  assert.equal(g.validate(p),true);
  const line=g.centerline(p,1);
  assert.deepEqual(Array.from(line,x=>Array.from(x)),[
    p.stations[1].anchor,p.legs[1].towers[0].anchor,p.stations[2].anchor
  ]);
  assert.ok(Object.isFrozen(line));
  assert.ok(Object.isFrozen(line[0]));
  assert.throws(()=>{line[0][0]=42;},TypeError);
  assert.notEqual(p.stations[1].anchor[0],42);
});
test('winter SVG schematic is title only and cannot enable lift transport',()=>{
  assert.match(tpl,/id="jandri-winter-schematic"/);
  assert.match(tpl,/jandri-winter-normal" disabled/);
  assert.match(tpl,/jandri-winter-express" disabled/);
  assert.match(boot,/JandriLiftPreview\.init\(/);
  assert.match(boot,/jandriLiftDiagram\.paint\(route\)/);
  assert.match(uiText,/非实景坐标/);
  assert.match(uiText,/车厢速度非实测/);
  assert.doesNotMatch(uiText,/history\.replaceState|Game\.reset|placePlayer/);
});
