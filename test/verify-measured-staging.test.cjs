'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../tools/reality/verify_measured_staging.cjs');
const sha=c=>c.repeat(64);
function fixture(){
 const source={source:'OpenStreetMap / Overpass',
 originalResponseSHA256:sha('a'),
 features:[{type:'way',drawable:true,id:501,names:['Jandri 2'],
 tags:{'piste:type':'downhill'},nodes:[1,2],
 coordinates:[[6,45],[6.01,45.01]]}]};
 const tiles=Array.from({length:24},(_,i)=>({tile:'0940-'+String(i).padStart(4,'0'),sha256:sha('b')}));
 const report={status:'complete_real_mosaic_and_profiles_not_published',
 osmSourceSHA256:sha('a'),sourceTiles:tiles,
 crossTileEdges:Array.from({length:37},(_,i)=>({i})),
 osmWayProfiles:Array.from({length:37},(_,i)=>({osmWay:i===0?501:1000+i}))};
 const grid={cols:3,rows:3,step:15,east:947000,north:6439000,
 heights:[2200,2199,2198,2197,2196,2195,2194,2193,2192]};
 const asset={schema:'cold-smoke-measured-dem-staging/v1',resortId:'les-deux-alpes',
 routeName:'Jandri 2',approvedForGameplay:false,mergedIntoResort:false,
 sourcePixelVerifiedByAudit:true,sourceReportStatus:report.status,
 sourceOSMSHA256:sha('a'),originalTiles:tiles.map(t=>t.tile),
 originalSourceWays:[501],grid,approxUncompressedHeightBytes:36,
 verifiedSourceLineSamples:8};
 return {source,report,asset};
}
test('measured preview is sourced, bounded and never gameplay-approved',()=>{
 const {asset,report,source}=fixture();
 const result=validate(asset,report,source);
 assert.equal(result.sourceWays,1);
 assert.equal(result.gridHeightSamples,9);
 assert.equal(result.playable,false);
 assert.deepEqual(result.boundsLambert93,[947000,6438970,947030,6439000]);
 assert.equal(result.minElevationM,2192);
 assert.equal(result.maxElevationM,2200);
});
test('reject missing or substituted source official tile',()=>{
 const {asset,report,source}=fixture();
 asset.originalTiles[0]='made-up';
 assert.throws(()=>validate(asset,report,source),/tile list/);
});
test('reject unapproved source replacement and forged playable status',()=>{
 const {asset,report,source}=fixture();
 asset.approvedForGameplay=true;
 assert.throws(()=>validate(asset,report,source),/gameplay-approved/);
 asset.approvedForGameplay=false;
 source.features[0].id=999;
 assert.throws(()=>validate(asset,report,source),/source way inventory/);
});
test('reject invented heights, malformed grid and memory budget violations',()=>{
 const {asset,report,source}=fixture();
 asset.grid.heights[4]=NaN;
 assert.throws(()=>validate(asset,report,source),/height grid/);
 asset.grid.heights[4]=2196;
 asset.grid.cols=4;
 assert.throws(()=>validate(asset,report,source),/height grid/);
 asset.grid.cols=3;
 assert.throws(()=>validate(asset,report,source,{maxJsonBytes:40}),/browser budget/);
});
test('reject original OSM hash mismatch and missing measured profile',()=>{
 const {asset,report,source}=fixture();
 source.originalResponseSHA256=sha('f');
 assert.throws(()=>validate(asset,report,source),/Unmatched/);
 source.originalResponseSHA256=sha('a');
 report.osmWayProfiles[0].osmWay=100000;
 assert.throws(()=>validate(asset,report,source),/Missing original measured/);
});
