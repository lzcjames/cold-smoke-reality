'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {stageSurveyRoutes}=require('../tools/reality/stage_osm_piste_network.cjs');
const {auditTerrainCorridors}=require('../tools/reality/audit_resort_dem_corridors.cjs');
const {createMultiResSampler}=require('../tools/reality/multires_terrain.cjs');
const meta={sourceSha256:'a'.repeat(64),sourceVerified:true,
  crs:'EPSG:2154',verticalDatum:'IGN69'};
const grid=(n,h)=>({...meta,originX:0,originZ:0,stepM:10,cols:n,rows:n,
  heights:Float32Array.from({length:n*n},(_,i)=>h-Math.floor(i/n)*2)});
const source={schema:'cold-smoke-osm-survey/v1',resortId:'example-ski',
  coordinateSystem:'EPSG:4326',provenance:{originalResponseSHA256:'b'.repeat(64)},
  ways:[{osmWay:456,names:['Source piste'],difficulty:'easy',
    osmNodeIds:[11,12,13],coordinatesWGS84:[[10,10],[10,30],[10,50]],
    sourceApproxLengthM:40}]};
const projection={sourceCRS:'EPSG:4326',targetCRS:'EPSG:2154',
  sourceVerified:true,forward:p=>p};
const report=()=>auditTerrainCorridors(source,
  createMultiResSampler({detail:grid(9,220),backdrop:grid(14,180)}),projection);
test('full detailed source route stages network geometry, never grants playable access',()=>{
 const result=stageSurveyRoutes(source,report(),projection,
   [{osmWay:456,direction:'as_osm'}]);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].osmWay,456);
 assert.deepEqual(result.candidates[0].nodes,[11,12,13]);
 assert.deepEqual(result.candidates[0].points,[[10,10],[10,30],[10,50]]);
 assert.equal(result.networkReady,false);
 assert.equal(result.approvedPlayableWays,0);
 assert.equal(result.candidates[0].approvedForGameplay,false);
 assert.ok(result.candidates[0].measuredNetDescentM>0);
});
test('reverse of measured downhill trend is rejected',()=>{
 assert.throws(()=>stageSurveyRoutes(source,report(),projection,
   [{osmWay:456,direction:'reverse_osm'}]),/not net downhill/);
});
test('missing ground and altered node identities fail closed',()=>{
 const bad=report();
 bad.ways[0].coverage.detailedCentrelineCovered=false;
 assert.throws(()=>stageSurveyRoutes(source,bad,projection,
   [{osmWay:456,direction:'as_osm'}]),/Uncovered/);
 const other=report();
 other.ways[0].exactOriginalOsmNodeIds[1]=999;
 assert.throws(()=>stageSurveyRoutes(source,other,projection,
   [{osmWay:456,direction:'as_osm'}]),/Uncovered/);
});
test('no guessed shared-node junctions or duplicate route IDs',()=>{
 assert.throws(()=>stageSurveyRoutes(source,report(),projection,
  [{osmWay:456,direction:'as_osm'},{osmWay:456,direction:'as_osm'}]),/duplicate/);
 assert.throws(()=>stageSurveyRoutes(source,report(),projection,
  [{osmWay:999,direction:'as_osm'}]),/Unknown/);
 const reportCopy=report();
 reportCopy.originalOsmSHA256='0'.repeat(64);
 assert.throws(()=>stageSurveyRoutes(source,reportCopy,projection,
  [{osmWay:456,direction:'as_osm'}]),/matching pinned/);
});

test('staging is deterministic and never mutates source geometry or measured profile',()=>{
 const before=structuredClone(source);
 const evidence=report();
 const snap=structuredClone(evidence);
 const result=stageSurveyRoutes(source,evidence,projection,[{osmWay:456,direction:'as_osm'}]);
 result.candidates[0].nodes[0]=999;
 result.candidates[0].points[0][0]=999;
 assert.deepEqual(source,before);
 assert.deepEqual(evidence,snap);
 assert.equal(result.junctions.length,0);
});
