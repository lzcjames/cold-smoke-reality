'use strict';
// Portable resort source adapter. Original implementation inspired by the
// *data layout*, not copied from Hemu's renderer or lift engine.
// This is an IMPORT/STAGING contract, not a gameplay or boarding authorization.
const finitePair=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const validId=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
const unique=(items,kind)=>{const seen=new Set();for(const v of items){const id=String(v?.id??'');if(!id||seen.has(id))throw Error('Duplicate or empty '+kind+' ID');seen.add(id);}return seen;};
const clonePoints=(points,kind)=>{
  if(!Array.isArray(points)||points.length<2||points.some(p=>!finitePair(p)))
    throw Error('Invalid '+kind+' point array');
  const result=points.map(p=>[p[0],p[1]]);
  for(let i=1;i<result.length;i++)
    if(Math.hypot(result[i][0]-result[i-1][0],result[i][1]-result[i-1][1])<0.001)
      throw Error('Duplicate consecutive '+kind+' coordinates');
  return result;
};
const length=points=>points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
function normalize(world,options={}) {
  if(!validId(options.resortId)||!world||!Array.isArray(world.pistes)||
      !Array.isArray(world.lifts)||!Array.isArray(world.stations))
    throw Error('Resort adapter needs ID, pistes, lifts and stations');
  if(!world.origin||![world.origin.lon,world.origin.lat].every(Number.isFinite)||
      !Number.isFinite(world.elevationOrigin))
    throw Error('Missing source-world geodetic origin or elevation datum');
  if(!world.detail||!world.backdrop) throw Error('Two-level terrain metadata required');
  const grids=[world.detail,world.backdrop].map((g,i)=>{
    if(!Number.isInteger(g.cells)||g.cells<2||!Number.isFinite(g.size)||g.size<=0||
        !finitePair(g.center)||typeof g.encoding!=='string'||
        typeof g.sha256!=='string'||!/^[a-f0-9]{64}$/.test(g.sha256))
      throw Error('Invalid source terrain metadata '+i);
    return {cells:g.cells,sizeM:g.size,center:g.center.slice(),
      encoding:g.encoding,sourceSha256:g.sha256,
      // Hemu JS embeds compressed elevation blocks separately. A metadata
      // descriptor is not an actual height grid and never enables skiing.
      dataLoaded:false};
  });
  unique(world.pistes,'piste');unique(world.lifts,'lift');unique(world.stations,'station');
  const pistes=world.pistes.map(p=>{
    const points=clonePoints(p.points,'piste');
    if(typeof p.name!=='string'||!p.name.trim())throw Error('Piste name required');
    return {sourceId:String(p.id),name:p.name,nameEn:p.en||null,
      difficulty:p.difficulty||null,points,lengthM:length(points),
      sourceReference:p.osmRef||null,approvedForGameplay:false};
  });
  const stationIds=new Set(world.stations.map(s=>String(s.id)));
  const stations=world.stations.map(s=>{
    if(!finitePair(s.point))throw Error('Invalid lift station point');
    return {sourceId:String(s.id),point:s.point.slice(),
      terminals:Array.isArray(s.terminals)?s.terminals.map(t=>({
        liftId:String(t.liftId),end:t.end})):[]};
  });
  const liftIds=new Set(world.lifts.map(l=>String(l.id)));
  const lifts=world.lifts.map(l=>{
    const points=clonePoints(l.points,'lift');
    if(!Array.isArray(l.stationIds)||l.stationIds.length!==2||
       (l.type==='magic_carpet' ? l.stationIds.some(id=>id!==null) :
         l.stationIds.some(id=>id==null||!stationIds.has(String(id)))))
      throw Error('Lift needs two existing source stations');
    return {sourceId:String(l.id),name:l.name||String(l.id),
      kind:l.type||'unspecified',points,lengthM:length(points),
      stationIds:l.stationIds.map(id=>id===null?null:String(id)),
      unstationedSurfaceLift:l.type==='magic_carpet',approvedForBoarding:false};
  });
  for(const station of stations)for(const t of station.terminals)
    if(!liftIds.has(t.liftId)||!['lower','upper'].includes(t.end))
      throw Error('Invalid station terminal lift reference');
  for(const lift of lifts) {
    if(lift.unstationedSurfaceLift)continue;
    for(let i=0;i<2;i++) {
      const s=stations.find(s=>s.sourceId===lift.stationIds[i]);
      if(!s.terminals.some(t=>t.liftId===lift.sourceId))
        throw Error('Lift endpoint missing station terminal association');
      // Approximate source coordinates may vary slightly in raw OSM snapshots;
      // do not snap them automatically, or infer a verified safe platform.
    }
  }
  return {schema:'cold-smoke-portable-resort/v1',resortId:options.resortId,
    provenance:{sourceFormat:options.sourceFormat||'hemu-world-like',
      originalSource:options.originalSource||null,
      importedAtUTC:null},
    localFrame:{originLon:world.origin.lon,originLat:world.origin.lat,
      elevationOriginM:world.elevationOrigin,coordinateUnits:'metres',
      // A local Hemu X/Z frame CANNOT be treated as EPSG:2154 by renaming it.
      requiresIndependentGeoreferencing:true},
    terrain:{detail:grids[0],backdrop:grids[1],certifiedPlayableDEM:false},
    pistes,lifts,stations,
    gates:{approvedPlayablePistes:0,approvedBoardingLifts:0,
      sourceTopologyOnly:true,safePisteBoundariesVerified:false,
      skiPhysicsUnchanged:true}};
}
// Export for Cold Smoke's existing PisteNetwork.create format only after an
// importer supplies actual CRS transform, genuine OSM IDs and audited DEM.
// Never synthesize node IDs, grade directions, joins, or safe piste boundaries.
function toVerifiedPisteNetwork(manifest,approval) {
  if(manifest?.schema!=='cold-smoke-portable-resort/v1'||
      typeof approval?.projectToLambert93!=='function'||
      typeof approval?.coversDetailedGround!=='function'||
      !Array.isArray(approval?.routes)||!approval.routes.length)
    throw Error('Independent georeferencing, ground and route approvals required');
  const pistes=[];
  for(const r of approval.routes) {
    const source=manifest.pistes.find(p=>p.sourceId===String(r.sourceId));
    if(!source||r.verified!==true||!Number.isSafeInteger(r.osmWay)||
        r.osmWay<=0||!Array.isArray(r.osmNodeIds)||
        r.osmNodeIds.length!==source.points.length||
        new Set(r.osmNodeIds).size!==r.osmNodeIds.length||
        r.osmNodeIds.some(id=>!Number.isSafeInteger(id)||id<=0))
      throw Error('Incomplete source-backed approved piste');
    const points=source.points.map(p=>{
      const xy=approval.projectToLambert93(p.slice());
      if(!finitePair(xy)||!approval.coversDetailedGround(xy[0],xy[1]))
        throw Error('Route leaves verified high-detail DEM');
      return xy.slice();
    });
    for(let i=1;i<points.length;i++){
      // Sparse source nodes may cross nodata; the DEM gate must check
      // interpolated points no further than 5 m apart.
      const a=points[i-1],b=points[i];
      const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5);
      if(steps>100000)throw Error('Unbounded route edge');
      for(let j=1;j<steps;j++){
        const t=j/steps;
        if(!approval.coversDetailedGround(a[0]+(b[0]-a[0])*t,
            a[1]+(b[1]-a[1])*t))
          throw Error('Route segment crosses missing detailed ground');
      }
    }
    pistes.push({osmWay:r.osmWay,name:source.name,
      difficulty:source.difficulty,nodes:r.osmNodeIds.slice(),points});
  }
  if(new Set(pistes.map(p=>p.osmWay)).size!==pistes.length)
    throw Error('Duplicate verified OSM way');
  // Explicit junction approvals only; never infer them from crossing lines.
  const junctions=approval.junctions||[];
  if(!Array.isArray(junctions)||junctions.length)
    throw Error('Junction approval must be handled independently');
  return {pistes,junctions};
}
module.exports={normalize,toVerifiedPisteNetwork};
