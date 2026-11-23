#!/usr/bin/env node
'use strict';
// Offline audit of the REAL shipped Les Deux Alpes DEM and pinned lower
// Jandri OSM polylines. This never approves a route for gameplay.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {split}=require('./export_dem_tiles.cjs');
const TiledReality=require('../../src/02a_tiled_reality.js');
function audit(asset,segments,{stepM=2}={}) {
  if(asset?.id!=='les-deux-alpes'||!asset.provenance?.osmSha256||
     !asset.provenance?.demSha256||!Array.isArray(asset.piste?.points)||
     !Array.isArray(segments)||segments.length!==2||
     ![219275197,644393970].every(id=>segments.some(s=>s.osmWay===id)))
    throw Error('Pinned authentic Les Deux Alpes DEM and two lower Jandri OSM ways required');
  const start=asset.piste.points[0],end=asset.piste.points.at(-1);
  const d=[end[0]-start[0],end[1]-start[1]],length=Math.hypot(...d);
  if(!(length>50))throw Error('Invalid source route projection');
  const {grid,tiles}=split(asset);
  const terrain=TiledReality.create({id:asset.id,name:'Les Deux Alpes shipped DEM',
    elevationSource:asset.elevationSource,
    reference:{originLambert93:start,downhillLambert93:d.map(x=>x/length),
      datumM:0},grid,tiles});
  const routes=segments.map(s=>{
    if(s.points.length<2||s.points.length!==s.nodes.length)
      throw Error('Pinned Jandri source geometry mismatch');
    const result=terrain.auditSkiRoute(s.points,{sampleStepM:stepM});
    return {osmWay:s.osmWay,name:s.name,sourceVertices:s.points.length,
      ...result};
  });
  return {schema:'cold-smoke-shipped-jandri-twin-ski-route/v1',
    source:'pinned OSM lower segments and shipped IGN LiDAR DEM',
    resortId:asset.id,sourceOsmSha256:asset.provenance.osmSha256,
    sourceDemSha256:asset.provenance.demSha256,
    routeCount:routes.length,completed:routes.filter(r=>r.complete).length,
    routes,sourceOnly:true,approvedForGameplay:false};
}
function main(args){
  const input=args[0]||path.join(__dirname,'../../data/reality/les-deux-alpes.json');
  const out=args[1];
  const asset=JSON.parse(fs.readFileSync(input,'utf8'));
  const script=fs.readFileSync(path.join(__dirname,'../../src/02e_jandri_lower.js'),'utf8');
  const jandri=vm.runInNewContext(script+'\nJandriLower');
  if(asset.provenance?.osmSha256!==jandri.sourceOsmSha256||
     asset.provenance?.demSha256!==jandri.sourceDemSha256)
    throw Error('Jandri source hashes do not match shipped IGN/OSM');
  const report=audit(asset,jandri.segments);
  if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  for(const r of report.routes)console.log(r.name, r.complete?'covered':'missing',
    'after',r.distanceM.toFixed(1),'m',r.missingAtProjected||'');
  console.log('Source-only route coverage',report.completed+'/'+report.routeCount,
    '(NOT a playable resort approval)');
}
if(require.main===module){try{main(process.argv.slice(2));}
  catch(e){console.error(e.stack||e);process.exitCode=1;}}
module.exports={audit,main};
