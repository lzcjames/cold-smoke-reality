'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {intake,pointInPolygon}=require('../tools/reality/audit-jandri-boundary-intake.cjs');
const source=JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));
const way=source.features.find(w=>w.type==='way'&&w.drawable);
const [lon,lat]=way.coordinates[0];
const around=[[lon-.0002,lat-.0002],[lon+.0002,lat-.0002],
              [lon+.0002,lat+.0002],[lon-.0002,lat+.0002],[lon-.0002,lat-.0002]];
function fixture(polygon=around) {
  const fc={type:'FeatureCollection',features:[{type:'Feature',
    properties:{sourceFeatureId:'external-source-1',osmWayIds:[way.id]},
    geometry:{type:'Polygon',coordinates:[polygon]}}]};
  const raw=Buffer.from(JSON.stringify(fc));
  const meta={sourceURL:'https://example.org/source/2026/polygons.geojson',
    sourceDate:'2026-11-20',license:'ODbL-1.0',
    sha256:crypto.createHash('sha256').update(raw).digest('hex')};
  return [fc,meta,raw];
}
test('screen a verifiable real OSM way overlap but never publish piste area',()=>{
  const [fc,m,raw]=fixture();
  const report=intake(source,fc,m,raw);
  assert.equal(report.totalCandidatePolygons,1);
  assert.equal(report.candidatesWithOSMVertexOverlap,1);
  assert.equal(report.approvedPlayableSurfaces,0);
  assert.equal(report.approvedPisteBoundaries,0);
  assert.equal(report.readyForGame,false);
  assert.ok(report.findings[0].referencedOSMVerticesInside>=1);
});
test('spatially distant polygons do not masquerade as surveyed piste',()=>{
  const distant=[[0,0],[.001,0],[.001,.001],[0,.001],[0,0]];
  const [fc,m,raw]=fixture(distant);
  assert.equal(intake(source,fc,m,raw).candidatesWithOSMVertexOverlap,0);
});
test('reject tampered bytes and unlicensed/unattributed sources',()=>{
  const [fc,m,raw]=fixture();
  assert.throws(()=>intake(source,fc,{...m,sha256:'f'.repeat(64)},raw),/source evidence/);
  assert.throws(()=>intake(source,fc,{...m,license:'unknown'},raw),/source evidence/);
  assert.throws(()=>intake(source,fc,{...m,sourceURL:'http://example.org'},raw),/source evidence/);
});
test('reject invalid geometry and invented OSM route IDs',()=>{
  const [fc,m,raw]=fixture();
  const bad={...fc,features:[{...fc.features[0],geometry:{type:'Point',coordinates:[lon,lat]}}]};
  assert.throws(()=>intake(source,bad,m,raw),/Non-polygon/);
  const invented={...fc,features:[{...fc.features[0],
    properties:{sourceFeatureId:'x',osmWayIds:[1234567890]}}]};
  assert.throws(()=>intake(source,invented,m,raw),/crosswalk/);
  const open=around.slice(0,-1);
  const malformed={...fc,features:[{...fc.features[0],
    geometry:{type:'Polygon',coordinates:[open]}}]};
  assert.throws(()=>intake(source,malformed,m,raw),/Invalid closed/);
});
test('polygon holes never count as a valid inside region',()=>{
  const hole=[[lon-.00005,lat-.00005],[lon+.00005,lat-.00005],
              [lon+.00005,lat+.00005],[lon-.00005,lat+.00005],[lon-.00005,lat-.00005]];
  assert.equal(pointInPolygon([lon,lat],[around,hole]),false);
});
