#!/usr/bin/env node
'use strict';
// Exercise the actual verified IGN Jandri 2 DEM through the same synchronous
// source-only sampler used by future streaming terrain; never enables gameplay.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {verify}=require('./tile_measured_dem.cjs');
const {check}=require('./check_measured_tiles.cjs');
const samplerSource=fs.readFileSync(path.join(__dirname,'../../src/02l_terrain_height_snapshot.js'),'utf8');
const Height=vm.runInNewContext(samplerSource+'\nTerrainHeightSnapshot').create;

function audit(staging,folder){
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 const original=check(staging,folder);
 const verified=verify(manifest,name=>fs.readFileSync(path.join(folder,name),'utf8'));
 if(!original.sourceGridReconstructedExactly||!verified.originalGridVerified||
    manifest.approvedForGameplay!==false)
  throw Error('Original measured source was not reproduced exactly');
 const loaded=manifest.tiles.map(entry=>{
  const file=JSON.parse(fs.readFileSync(path.join(folder,entry.filename),'utf8'));
  return {name:entry.filename,grid:file.grid};
 });
 const snapshot=Height(manifest,loaded);
 if(snapshot.approvedForGameplay!==false||snapshot.readyForPhysics!==false||
    snapshot.residentTiles!==manifest.tiles.length)
  throw Error('DEM preview was unexpectedly approved for gameplay');
 const grid=staging.grid,heights=grid.heights;
 if(!Array.isArray(heights)||heights.length!==grid.cols*grid.rows||
    grid.cols<2||grid.rows<2)throw Error('Invalid measured original DEM grid');
 let vertexSamples=0,midpointSamples=0,seamSamples=0;
 let maxVertexErrorM=0,maxMidpointErrorM=0;
 let maxSeamDisagreementM=0;
 for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.cols;col++){
  const east=grid.east+col*grid.step;
  const north=grid.north-row*grid.step;
  const sampled=snapshot.sample(east,north);
  const wanted=heights[row*grid.cols+col];
  if(sampled===null||!Number.isFinite(sampled))
    throw Error('Source-only sampler lost measured DEM grid node '+col+','+row);
  const error=Math.abs(sampled-wanted);
  maxVertexErrorM=Math.max(maxVertexErrorM,error);
  if(error>0.001)throw Error('Source-only height drift on verified node '+col+','+row);
  vertexSamples++;
  // Independent original adjacent chunks must agree at repeated seam nodes,
  // not merely produce a plausible height from the first matching tile.
  let shared=[];
  for(let t=0;t<loaded.length;t++){
   const g=loaded[t].grid;
   const x=Math.round((east-g.east)/g.step);
   const y=Math.round((g.north-north)/g.step);
   if(x>=0&&x<g.cols&&y>=0&&y<g.rows &&
      Math.abs(g.east+x*g.step-east)<0.0001 &&
      Math.abs(g.north-y*g.step-north)<0.0001)
     shared.push(g.heights[y*g.cols+x]);
  }
  if(shared.length>1){
   for(const h of shared.slice(1)){
    maxSeamDisagreementM=Math.max(maxSeamDisagreementM,Math.abs(h-shared[0]));
    if(Math.abs(h-shared[0])>0.002)throw Error('Real IGN DEM seam differs');
    seamSamples++;
   }
  }
 }
 for(let row=0;row<grid.rows-1;row++)for(let col=0;col<grid.cols-1;col++){
  const east=grid.east+(col+0.5)*grid.step;
  const north=grid.north-(row+0.5)*grid.step;
  const sample=snapshot.sample(east,north);
  const k=row*grid.cols+col;
  // Float32 storage in the streaming source snapshot is intentional;
  // compare with the same rounded heights rather than unstable JSON order.
  const wanted=(Math.fround(heights[k])+Math.fround(heights[k+1])+
    Math.fround(heights[k+grid.cols])+Math.fround(heights[k+grid.cols+1]))/4;
  if(sample===null||!Number.isFinite(sample))
    throw Error('Source-only midpoint sampling lost measured coverage');
  const error=Math.abs(sample-wanted);
  maxMidpointErrorM=Math.max(maxMidpointErrorM,error);
  if(error>0.001)throw Error('Real source DEM midpoint interpolation mismatch');
  midpointSamples++;
 }
 const outside=snapshot.sample(grid.east-grid.step,grid.north);
 if(outside!==null)throw Error('Real sampler invented terrain beyond detailed DEM');
 return {schema:'cold-smoke-real-dem-height-audit/v1',
  sourceOSMSHA256:staging.sourceOSMSHA256,
  sourceTileCount:manifest.tiles.length,
  gridCols:grid.cols,gridRows:grid.rows,
  vertexSamples,midpointSamples,seamSamples,
  maxVertexErrorM,maxMidpointErrorM,maxSeamDisagreementM,
  outsideCoverageReturnedNull:true,sourceReconstructedExactly:true,
  networkFetchesDuringSamples:0,
  approvedForGameplay:false,readyForPhysics:false};
}
function main(args){
 const [asset,folder,reportFile]=args;
 if(!asset||!folder)throw Error('Usage: node tools/reality/audit_real_dem_snapshot.cjs <staging-grid.json> <tile-folder> [report.json]');
 const report=audit(JSON.parse(fs.readFileSync(asset,'utf8')),folder);
 if(reportFile)fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
 console.log('Verified actual IGN source:',report.vertexSamples,'vertices,',
  report.midpointSamples,'interior cells,',report.seamSamples,'overlap checks; NOT playable');
 return report;
}
if(require.main===module)try{main(process.argv.slice(2));}
catch(error){console.error(error.stack||error);process.exitCode=1;}
module.exports={audit,main};
