'use strict';
// Stages OSM source ways in the format consumed by PisteNetwork.create.
// It never adds inferred route joins or grants gameplay access.
function stageSurveyRoutes(survey, report, projection, selected) {
  if(survey?.schema!=='cold-smoke-osm-survey/v1' ||
     report?.schema!=='cold-smoke-osm-dem-corridors/v1' ||
     survey.resortId!==report.resortId ||
     survey.provenance?.originalResponseSHA256!==report.originalOsmSHA256 ||
     report.sourceWayCount!==survey.ways?.length ||
     report.approvedPlayableWays!==0 ||
     projection?.sourceCRS!=='EPSG:4326' ||
     projection.targetCRS!=='EPSG:2154' ||
     projection.sourceVerified!==true ||
     typeof projection.forward!=='function' ||
     !Array.isArray(selected) || !selected.length)
    throw Error('Staging requires matching pinned OSM/DEM evidence and explicit route selections');
  const sources=new Map(survey.ways.map(w=>[w.osmWay,w]));
  const audits=new Map(report.ways.map(w=>[w.osmWay,w]));
  if(sources.size!==report.sourceWayCount || audits.size!==sources.size ||
      [...audits.keys()].some(id=>!sources.has(id)))
    throw Error('OSM and detailed terrain reports disagree');
  const seen=new Set(), candidates=[];
  for(const item of selected) {
    const id=item?.osmWay;
    const source=sources.get(id), audit=audits.get(id);
    if(!Number.isSafeInteger(id)||!source||!audit||seen.has(id))
      throw Error('Unknown or duplicate OSM route selection');
    seen.add(id);
    if(item.direction!=='as_osm' && item.direction!=='reverse_osm')
      throw Error('A reviewed route orientation must be explicit');
    if(audit.approvedForGameplay!==false ||
       audit.coverage?.detailedCentrelineCovered!==true ||
       audit.detailProfile?.complete!==true ||
       audit.detailProfile?.directionApproved!==false ||
       audit.groomedWidthVerified!==false ||
       audit.safeHazardsVerified!==false ||
       audit.originalNodeCount!==source.osmNodeIds.length ||
       !Array.isArray(audit.exactOriginalOsmNodeIds) ||
       !audit.exactOriginalOsmNodeIds.every((n,i)=>n===source.osmNodeIds[i]))
      throw Error('Uncovered, altered or falsely approved source route');
    const first=audit.detailProfile.firstElevationM,
          last=audit.detailProfile.lastElevationM;
    if(!Number.isFinite(first)||!Number.isFinite(last)||
       (item.direction==='as_osm'?first-last:last-first)<=0)
      throw Error('Selected direction is not net downhill on measured ground');
    const nodes=source.osmNodeIds.slice();
    const points=source.coordinatesWGS84.map(p=>{
      const xy=projection.forward(p.slice());
      if(!Array.isArray(xy)||xy.length!==2||!xy.every(Number.isFinite))
        throw Error('Invalid authenticated OSM projection');
      return xy.slice();
    });
    if(item.direction==='reverse_osm'){nodes.reverse();points.reverse();}
    // Do not turn same-name ways into a stitched route: preserve each OSM ID.
    candidates.push({
      osmWay:id,name:source.names[0]||String(id),
      difficulty:source.difficulty,nodes,points,
      measuredNetDescentM:+Math.abs(first-last).toFixed(2),
      stagingOnly:true,approvedForGameplay:false
    });
  }
  return {
    schema:'cold-smoke-piste-network-staging/v1',
    resortId:survey.resortId,
    originalOsmSHA256:report.originalOsmSHA256,
    candidates,
    // This is intentionally not a live PisteNetwork payload. After
    // independently verifying piste widths, hazards and directed joins,
    // a separate final promotion gate must select actual player routes.
    junctions:[],networkReady:false,approvedPlayableWays:0,
    requiredNextReview:'Boundaries, hazards, safe junctions and browser collision'
  };
}
module.exports={stageSurveyRoutes};
