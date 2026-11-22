#!/usr/bin/env node
'use strict';
// Official-source only: verify geographic mesh adjacency after authentic MNT
// collection. Nothing in this script approves a skiable piste or scene.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {check}=require('./check_measured_tiles.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../src/02m_terrain_source_mesh.js'),'utf8');
const Mesh=vm.runInNewContext(source+'\nTerrainSourceMesh').fromMeasuredTile;
function audit(staging,folder) {
 const verified=check(staging,folder);
 if(!verified.sourceGridReconstructedExactly||staging.approvedForGameplay!==false)
  throw Error('Authentic DEM source cannot be verified for meshing');
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 const origin={originEast:staging.grid.east,originNorth:staging.grid.north,
   baseElevationM:Math.floor(Math.min(...staging.grid.heights)/100)*100};
 const meshes=manifest.tiles.map(e=>{
  const payload=JSON.parse(fs.readFileSync(path.join(folder,e.filename),'utf8'));
  if(payload.schema!=='cold-smoke-dem-source-tile/v1'||
     payload.approvedForGameplay!==false ||
     payload.name!==undefined ||
     payload.startCol!==e.startCol||payload.startRow!==e.startRow)
    throw Error('Unrecognized source-only terrain tile geometry');
  return Mesh({name:e.filename,grid:payload.grid},origin);
 });
 const totalVertices=meshes.reduce((n,m)=>n+m.vertexCount,0);
 const totalTriangles=meshes.reduce((n,m)=>n+m.triangleCount,0);
 let seamNodes=0,maxSeamErrorM=0;
 for(let a=0;a<manifest.tiles.length;a++)for(let b=a+1;b<manifest.tiles.length;b++){
  const x=manifest.tiles[a],y=manifest.tiles[b];
  const col0=Math.max(x.startCol,y.startCol);
  const col1=Math.min(x.startCol+x.cols-1,y.startCol+y.cols-1);
  const row0=Math.max(x.startRow,y.startRow);
  const row1=Math.min(x.startRow+x.rows-1,y.startRow+y.rows-1);
  if(col0>col1||row0>row1)continue;
  for(let row=row0;row<=row1;row++)for(let col=col0;col<=col1;col++){
   const ia=((row-x.startRow)*x.cols+col-x.startCol)*3;
   const ib=((row-y.startRow)*y.cols+col-y.startCol)*3;
   for(let axis=0;axis<3;axis++){
    const error=Math.abs(meshes[a].positions[ia+axis]-
                         meshes[b].positions[ib+axis]);
    maxSeamErrorM=Math.max(maxSeamErrorM,error);
    if(error>0.002)throw Error('Measured source mesh edge mismatch');
   }
   seamNodes++;
  }
 }
 if(!seamNodes||meshes.length<2)throw Error('No authentic terrain tile seams checked');
 if(meshes.some(m=>m.approvedForGameplay!==false||m.readyForCollision!==false))
  throw Error('Source-only mesh unexpectedly promoted to gameplay');
 return {schema:'cold-smoke-real-source-mesh-evidence/v1',
   originalSourceTiles:meshes.length,
   originalGridHeightSamples:staging.grid.heights.length,
   meshedVertexCount:totalVertices,meshedTriangleCount:totalTriangles,
   sharedMeshVertexPairs:seamNodes,maxSharedPositionErrorM:maxSeamErrorM,
   approvedForGameplay:false,readyForCollision:false};
}
function main(args){
 const [input,folder,output]=args;
 if(!input||!folder)throw Error('Usage: node tools/reality/audit_real_dem_mesh.cjs <source-grid.json> <chunk-folder> [out.json]');
 const report=audit(JSON.parse(fs.readFileSync(input,'utf8')),folder);
 if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log('Official source-only terrain preview meshes:',report.originalSourceTiles,
 'tiles,',report.meshedTriangleCount,'triangles,',report.sharedMeshVertexPairs,
 'seam pairs; not playable');
}
if(require.main===module)try{main(process.argv.slice(2));}
catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={audit,main};
