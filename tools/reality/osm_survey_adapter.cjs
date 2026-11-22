'use strict';
// Generic source-only OSM ski-resort adapter. Creates a portable, non-playable
// survey descriptor. It never generates terrain, skiable junctions or lifts.
const ID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH=/^[0-9a-f]{64}$/;
const pair=xy=>Array.isArray(xy)&&xy.length===2&&xy.every(Number.isFinite)&&
  xy[0]>=-180&&xy[0]<=180&&xy[1]>=-90&&xy[1]<=90;
function normalizeOsmSurvey(index,{resortId,names=null}={}) {
  if(!ID.test(resortId||'') || !index ||
      index.source!=='OpenStreetMap / Overpass' ||
      !HASH.test(index.originalResponseSHA256||'') ||
      typeof index.snapshotTimestampUTC!=='string' ||
      !Number.isFinite(Date.parse(index.snapshotTimestampUTC)) ||
      !Array.isArray(index.features))
    throw Error('A pinned OSM source index and resort ID are required');
  if(names!==null && (!Array.isArray(names)||!names.length||
      names.some(n=>typeof n!=='string'||!n.trim()) ||
      new Set(names).size!==names.length))
    throw Error('Names must be a nonempty list of exact OSM route names');
  const selected=names===null?null:new Set(names);
  const ids=new Set(), nodeCoords=new Map(), ways=[];
  for(const feature of index.features) {
    if(feature.type!=='way' || feature.drawable===false)continue;
    if(!Array.isArray(feature.names) || !feature.names.length ||
        !feature.names.some(n=>typeof n==='string'&&(!selected||selected.has(n))))
      continue;
    if(!Number.isSafeInteger(feature.id)||feature.id<=0||ids.has(feature.id)||
       feature.tags?.['piste:type']!=='downhill' ||
       !Array.isArray(feature.nodes)||!Array.isArray(feature.coordinates)||
       feature.nodes.length<2||feature.nodes.length!==feature.coordinates.length ||
       !Number.isFinite(feature.approxPlanarLengthM)||feature.approxPlanarLengthM<=0)
      throw Error('Invalid selected OSM downhill way');
    ids.add(feature.id);
    const current=new Set();
    const nodes=[];
    const points=[];
    for(let i=0;i<feature.nodes.length;i++){
      const id=feature.nodes[i],xy=feature.coordinates[i];
      if(!Number.isSafeInteger(id)||id<=0||current.has(id)||!pair(xy))
        throw Error('Invalid or duplicate OSM node coordinate');
      current.add(id);
      const previous=nodeCoords.get(id);
      if(previous&&(previous[0]!==xy[0]||previous[1]!==xy[1]))
        throw Error('Conflicting coordinate for shared OSM node');
      nodeCoords.set(id,xy);
      nodes.push(id);points.push(xy.slice());
    }
    ways.push({sourceId:String(feature.id),osmWay:feature.id,
      names:feature.names.filter(n=>typeof n==='string'),
      difficulty:feature.tags?.['piste:difficulty']||null,
      osmNodeIds:nodes,coordinatesWGS84:points,
      sourceApproxLengthM:feature.approxPlanarLengthM,
      approvedForGameplay:false});
  }
  if(!ways.length)throw Error(selected ?
    'Selected OSM route name not found: '+[...selected].join(', ') :
    'No source OSM piste ways match this resort selection');
  if(selected)for(const n of selected)
    if(!ways.some(w=>w.names.includes(n)))
      throw Error('Selected OSM route name not found: '+n);
  const groups=new Map();
  for(const way of ways)for(const n of way.names) {
    if(selected&&!selected.has(n))continue;
    const group=groups.get(n)||[];
    group.push(way.osmWay);groups.set(n,group);
  }
  const routes=[...groups].map(([name,osmWays])=>({
    name,osmWays:osmWays.slice(),wayCount:osmWays.length,
    // Shared source nodes only. Individual ways are NOT automatically
    // joined into a downhill route, even when their names match.
    approvedAsConnectedRoute:false
  }));
  const refs=new Map();
  for(const way of ways)for(const id of way.osmNodeIds){
    const arr=refs.get(id)||[];
    arr.push(way.osmWay);refs.set(id,arr);
  }
  const sharedNodes=[...refs].filter(([,refs])=>refs.length>1)
    .map(([osmNode,osmWays])=>({osmNode,osmWays:osmWays.slice(),
      coordinatesWGS84:nodeCoords.get(osmNode).slice(),
      approvedAsSkiJunction:false}));
  return {schema:'cold-smoke-osm-survey/v1',resortId,
    provenance:{source:index.source,originalResponseSHA256:index.originalResponseSHA256,
      snapshotTimestampUTC:index.snapshotTimestampUTC,
      licence:'ODbL 1.0 · © OpenStreetMap contributors'},
    coordinateSystem:'EPSG:4326',ways,routes,sharedNodes,
    gates:{allSourceCoordinatesPreserved:true,
      detailDemCoverageVerified:false,downhillDirectionVerified:false,
      groomedBoundariesVerified:false,approvedPlayableWays:0,
      approvedSkiJunctions:0}};
}
module.exports={normalizeOsmSurvey};
