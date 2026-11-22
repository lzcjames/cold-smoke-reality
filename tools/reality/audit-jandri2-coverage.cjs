'use strict';
// Read-only Jandri 2 source-to-game coverage gate. A line's OSM geometry is
// not approval of downhill direction, grooming, terrain safety or spawning.
const fs=require('node:fs');
const {audit}=require('./audit-jandri-topology.cjs');
const SOURCE_SHA='40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26';
const JANDRI2_LOWER_WAY=644393970;

function inspect(index, loadedSegments, asset) {
  if(index?.originalResponseSHA256!==SOURCE_SHA || index.wayCount!==37 ||
      !Array.isArray(index.features) || !Array.isArray(loadedSegments) ||
      asset?.id!=='les-deux-alpes' || !Array.isArray(asset?.grid?.heights))
    throw Error('Pinned real Jandri OSM and game DEM required');
  const ways=index.features.filter(w=>w.type==='way' &&
    w.drawable && w.names?.includes('Jandri 2'));
  if(ways.length!==11 || new Set(ways.map(w=>w.id)).size!==11)
    throw Error('Unexpected Jandri 2 original OSM ways');
  const graph=audit(index);
  const route=graph.routes.find(r=>r.name==='Jandri 2');
  if(!route || route.wayCount!==ways.length)
    throw Error('Jandri 2 topology unavailable');
  const byId=new Map(ways.map(w=>[w.id,w]));
  const coveredWays=[];
  for(const segment of loadedSegments.filter(s=>byId.has(s.osmWay))) {
    const source=byId.get(segment.osmWay);
    if(coveredWays.includes(segment.osmWay) ||
        !Array.isArray(segment.nodes) || segment.nodes.length<2 ||
        segment.nodes.length>source.nodes.length)
      throw Error('Invalid or duplicate playable Jandri 2 fragment');
    const first=source.nodes.indexOf(segment.nodes[0]);
    if(first<0 || first+segment.nodes.length>source.nodes.length ||
        !segment.nodes.every((n,i)=>source.nodes[first+i]===n))
      throw Error('Gameplay Jandri 2 fragment does not match original OSM sequence');
    coveredWays.push(segment.osmWay);
  }
  const partial=loadedSegments.find(s=>s.osmWay===JANDRI2_LOWER_WAY);
  if(!partial || coveredWays.length!==1 ||
      asset.provenance?.osmSha256!==SOURCE_SHA ||
      asset.provenance?.demSha256!=='41de1610079645985a62912a0a9d122e70f67128537bed29f1d0c41471442e19')
    throw Error('Current Jandri 2 lower-only baseline was changed');
  const source=byId.get(JANDRI2_LOWER_WAY);
  const startIndex=source.nodes.indexOf(partial.nodes[0]);
  const maxHeight=Math.max(...asset.grid.heights);
  if(!Number.isFinite(maxHeight)) throw Error('Missing finite DEM elevations');
  return Object.freeze({
    status:'source_geometry_only_full_descent_blocked',
    osmSnapshotUTC:index.snapshotTimestampUTC,
    originalOsmSHA256:SOURCE_SHA,
    sourceWayCount:ways.length,
    sourceApproxLengthM:+ways.reduce((v,w)=>v+w.approxPlanarLengthM,0).toFixed(1),
    sourceNodeComponents:route.exactNodeComponents.map(c=>c.slice()),
    currentPlayableWayIds:Object.freeze(coveredWays),
    sourceWayIds:Object.freeze(ways.map(w=>w.id)),
    currentlyUnloadedWayIds:Object.freeze(ways.filter(w=>!coveredWays.includes(w.id)).map(w=>w.id)),
    clippedWay:{osmWay:JANDRI2_LOWER_WAY,originalNodeCount:source.nodes.length,
      currentNodeCount:partial.nodes.length,originalStartNodeIndex:startIndex,
      omittedNodesBefore:startIndex,
      omittedNodesAfter:source.nodes.length-startIndex-partial.nodes.length},
    currentDemMaxHeightM:maxHeight,
    fullLengthPlayable:false,
    sourceNodeConnectivityIsSkiableConnection:false,
    verifiedFullRouteDirection:false,
    upperGroundPackPublished:false,
    nextRequiredGate:'Verified high-altitude MNT pack, directed route and safe piste-area audit'
  });
}
if(require.main===module) {
  // Source is loaded from code only for read-only audit (no game execution).
  const vm=require('node:vm');
  const source=fs.readFileSync('src/02e_jandri_lower.js','utf8');
  const lower=vm.runInNewContext(source+'\nJandriLower.segments');
  const index=JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));
  const asset=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes.json','utf8'));
  console.log(JSON.stringify(inspect(index,lower,asset),null,2));
}
module.exports={inspect};
