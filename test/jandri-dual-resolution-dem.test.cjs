'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMultiResSampler}=require('../tools/reality/multires_terrain.cjs');
const meta={crs:'EPSG:2154',verticalDatum:'IGN69',sourceVerified:true,sourceSha256:'a'.repeat(64)};
const grid=(n,step,base,change={})=>({
 ...meta,cols:n,rows:n,originX:0,originZ:0,stepM:step,
 heights:Float32Array.from({length:n*n},()=>base),...change
});
test('source-bound dual resolution uses exact sampled terrain and no extrapolation',()=>{
 const g=createMultiResSampler({detail:grid(5,10,200),backdrop:grid(11,20,100)});
 assert.equal(g.height(20,20),200);
 assert.equal(g.height(85,85),100);
 assert.equal(g.height(-1,4),null);
 assert.equal(g.height(201,201),null);
});
test('seam blends near detail edge instead of inventing a cliff',()=>{
 const g=createMultiResSampler({detail:grid(10,10,200),backdrop:grid(20,10,100),edgeCells:3});
 assert.equal(g.height(0,10),100);
 assert.ok(g.height(15,10)>100 && g.height(15,10)<200);
 assert.equal(g.height(40,40),200);
});
test('incomplete high detail coverage never becomes playable by backdrop alone',()=>{
 const g=createMultiResSampler({detail:grid(5,10,200),backdrop:grid(11,20,100)});
 const report=g.coverage([[20,20],[40,40],[120,120]]);
 assert.equal(report.detailOnlyReady,false);
 assert.equal(report.detailVertices,2);
 assert.equal(report.backdropOnlyVertices,1);
 assert.equal(report.requiresHazardAndPisteAreaReview,true);
 assert.equal(report.highDetailCoverageMarginM,null);
 assert.equal(report.missingIndices.length,0);
 assert.equal(g.coverage([[120,120],[210,210]]).missingIndices.length,1);
});
test('invalid source or datum is rejected and no-data cannot turn into a height',()=>{
 for(const bad of [
  {...grid(5,10,200),sourceVerified:false},
  {...grid(5,10,200),sourceSha256:''},
  {...grid(5,10,200),crs:'EPSG:4326'},
  {...grid(5,10,200),stepM:0},
 ])assert.throws(()=>createMultiResSampler({detail:bad,backdrop:grid(11,20,100)}));
 assert.throws(()=>createMultiResSampler({
  detail:grid(5,10,200),backdrop:grid(11,20,100,{verticalDatum:'EGM96'})
 }),/datums/);
 const detail=grid(5,10,200);detail.heights[2*detail.cols+2]=NaN;
 const g=createMultiResSampler({detail,backdrop:grid(11,20,100)});
 assert.equal(g.height(20,20),100);
 assert.equal(g.coverage([[20,20],[30,30]]).detailOnlyReady,false);
});
