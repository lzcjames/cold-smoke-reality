#!/usr/bin/env node
'use strict';
// Check the archived tiles against the original, separately audited DEM.
// This never makes tiles eligible for live collision or gameplay.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {verify,gridHash}=require('./tile_measured_dem.cjs');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function check(original,folder){
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 if(original?.schema!=='cold-smoke-measured-dem-staging/v1'||
    original.approvedForGameplay!==false||original.mergedIntoResort!==false||
    original.resortId!==manifest.resortId||
    original.routeName!==manifest.routeName||
    original.sourceOSMSHA256!==manifest.sourceOSMSHA256||
    gridHash(original.grid)!==manifest.originalGridSHA256)
   throw Error('Source tile manifest does not match original measured staging DEM');
 const result=verify(manifest,name=>fs.readFileSync(path.join(folder,name),'utf8'));
 return {schema:'cold-smoke-dem-tile-evidence/v1',resortId:original.resortId,
   sourceOSMSHA256:original.sourceOSMSHA256,
   gridCols:original.grid.cols,gridRows:original.grid.rows,
   measuredHeightSamples:original.grid.heights.length,
   sourceTileCount:result.tiles,
   sourceGridReconstructedExactly:result.originalGridVerified,
   sourceOnly:true,approvedForGameplay:false,readyForRuntime:false};
}
function main(args){
 const [original,folder,out]=args;
 if(!original||!folder)throw Error('Usage: node tools/reality/check_measured_tiles.cjs <original-grid.json> <tile-directory> [report.json]');
 const report=check(JSON.parse(fs.readFileSync(original,'utf8')),folder);
 if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log('Original measured DEM reconstructed:',report.measuredHeightSamples,'cells in',report.sourceTileCount,'source-only tiles');
 return report;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 console.error(e.message);process.exitCode=1;
}}
module.exports={check,main};
