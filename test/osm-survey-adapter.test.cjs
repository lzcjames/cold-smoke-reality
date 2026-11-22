'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {normalizeOsmSurvey}=require('../tools/reality/osm_survey_adapter.cjs');
const index=JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));
test('full pinned resort source produces 37 exact OSM ways with no playable authorization',()=>{
 const result=normalizeOsmSurvey(index,{resortId:'les-deux-alpes'});
 assert.equal(result.ways.length,37);
 assert.equal(result.coordinateSystem,'EPSG:4326');
 assert.equal(result.provenance.originalResponseSHA256,index.originalResponseSHA256);
 assert.ok(result.sharedNodes.length>=8);
 assert.ok(result.ways.every(w=>!w.approvedForGameplay));
 assert.equal(result.gates.approvedSkiJunctions,0);
 assert.ok(result.sharedNodes.every(n=>!n.approvedAsSkiJunction));
});
test('Jandri 2 selection keeps all 11 original pieces without synthetic joins',()=>{
 const result=normalizeOsmSurvey(index,{resortId:'les-deux-alpes',names:['Jandri 2']});
 assert.equal(result.ways.length,11);
 assert.equal(result.routes.length,1);
 assert.equal(result.routes[0].approvedAsConnectedRoute,false);
 const source=index.features.find(w=>w.id===644393970);
 const selected=result.ways.find(w=>w.osmWay===644393970);
 assert.deepEqual(selected.osmNodeIds,source.nodes);
 assert.deepEqual(selected.coordinatesWGS84,source.coordinates);
 assert.equal(result.gates.detailDemCoverageVerified,false);
});
test('rejects counterfeit provenance, fake joins and corrupted node coordinates',()=>{
 assert.throws(()=>normalizeOsmSurvey({...index,originalResponseSHA256:'not-a-hash'},
   {resortId:'les-deux-alpes'}),/pinned/);
 assert.throws(()=>normalizeOsmSurvey(index,{resortId:'les-deux-alpes',names:['Fake Jandri 12']}),
   /not found/);
 const corrupted=structuredClone(index);
 const way=corrupted.features.find(w=>w.names.includes('Jandri 2'));
 way.nodes[1]=way.nodes[0];
 assert.throws(()=>normalizeOsmSurvey(corrupted,
   {resortId:'les-deux-alpes',names:['Jandri 2']}),/duplicate OSM node/);
 const repeated=structuredClone(index);
 const copy=structuredClone(repeated.features.find(w=>w.names.includes('Jandri 2')));
 repeated.features.push(copy);
 assert.throws(()=>normalizeOsmSurvey(repeated,
   {resortId:'les-deux-alpes',names:['Jandri 2']}),/Invalid selected OSM/);
});
