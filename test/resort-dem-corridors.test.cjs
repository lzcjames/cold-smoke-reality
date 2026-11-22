'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditTerrainCorridors}=require('../tools/reality/audit_resort_dem_corridors.cjs');
const {createMultiResSampler}=require('../tools/reality/multires_terrain.cjs');
const metadata={sourceSha256:'a'.repeat(64),sourceVerified:true,
  crs:'EPSG:2154',verticalDatum:'IGN69'};
function grid(n,base,override={}) {
 return {...metadata,originX:0,originZ:0,cols:n,rows:n,stepM:10,
  heights:Float32Array.from({length:n*n},(_,i)=>base-Math.floor(i/n)),...override};
}
function survey(ways=[{osmWay:77,names:['Test Piste'],osmNodeIds:[1,2],
  coordinatesWGS84:[[0,0],[40,0]],sourceApproxLengthM:40}]) {
 return {schema:'cold-smoke-osm-survey/v1',resortId:'demo-ski',
  coordinateSystem:'EPSG:4326',provenance:{originalResponseSHA256:'b'.repeat(64)},ways};
}
const proj={sourceCRS:'EPSG:4326',targetCRS:'EPSG:2154',
 sourceVerified:true,forward:p=>p};
test('covered real DEM centrelines receive measured profiles but never ski approval',()=>{
 const sampler=createMultiResSampler({detail:grid(9,210),backdrop:grid(15,180)});
 const result=auditTerrainCorridors(survey(),sampler,proj);
 assert.equal(result.detailedCentrelineCoveredWays,1);
 assert.equal(result.approvedPlayableWays,0);
 assert.equal(result.ways[0].coverage.detailedCentrelineCovered,true);
 assert.equal(result.ways[0].detailProfile.complete,true);
 assert.equal(result.ways[0].detailProfile.firstElevationM,210);
 assert.equal(result.ways[0].detailProfile.lastElevationM,210);
 assert.equal(result.ways[0].approvedForGameplay,false);
 assert.equal(result.ways[0].detailProfile.directionApproved,false);
 assert.equal(result.ways[0].groomedWidthVerified,false);
});
test('nodata in a sparse segment is rejected despite both endpoints existing',()=>{
 const detail=grid(9,210);
 detail.heights[2]=NaN;
 const sampler=createMultiResSampler({detail,backdrop:grid(15,180)});
 const result=auditTerrainCorridors(survey(),sampler,proj);
 assert.equal(result.detailedCentrelineCoveredWays,0);
 assert.equal(result.ways[0].detailProfile.complete,false);
 assert.deepEqual(result.ways[0].coverage.uncoveredSegmentIndices,[1]);
 assert.equal(result.ways[0].detailProfile.firstElevationM,null);
});
test('backdrop-only ground must not yield playable piste or fabricated height',()=>{
 const sampler=createMultiResSampler({detail:grid(5,210),backdrop:grid(15,180)});
 const result=auditTerrainCorridors(survey(),sampler,
   {...proj,forward:([x,z])=>[x+40,z]});
 assert.equal(result.detailedCentrelineCoveredWays,0);
 assert.equal(result.ways[0].detailProfile.complete,false);
 assert.ok(result.ways[0].coverage.backdropOnlyVertexCount>0);
});
test('invalid projection provenance, duplicate route ID and zero-length paths fail',()=>{
 const sampler=createMultiResSampler({detail:grid(9,210),backdrop:grid(15,180)});
 assert.throws(()=>auditTerrainCorridors(survey(),sampler,
   {...proj,sourceVerified:false}),/source-verified/);
 assert.throws(()=>auditTerrainCorridors(survey(),sampler,
   {...proj,targetCRS:'EPSG:4326'}),/source-verified/);
 const doubled=survey([survey().ways[0],survey().ways[0]]);
 assert.throws(()=>auditTerrainCorridors(doubled,sampler,proj),/Invalid source/);
 assert.throws(()=>auditTerrainCorridors(survey(),sampler,
   {...proj,forward:()=>[0,0]}),/Degenerate/);
});
test('detail height never uses cosmetic backdrop blend',()=>{
 const near=grid(9,210),far=grid(15,100);
 const sampler=createMultiResSampler({detail:near,backdrop:far});
 assert.equal(sampler.detailHeight(0,0),210);
 assert.equal(sampler.height(0,0),100);
 assert.equal(sampler.detailHeight(90,90),null);
});
