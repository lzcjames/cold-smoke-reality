'use strict';
// General OSM source -> measured DEM corridor audit.
// Does not authorize ski travel, pistes, inferred joins or lift arrivals.
function auditTerrainCorridors(survey,sampler,projection,{maxIntervalM=5}={}) {
  if(survey?.schema!=='cold-smoke-osm-survey/v1'||
      survey.coordinateSystem!=='EPSG:4326'||
      !Array.isArray(survey.ways)||!survey.ways.length||
      typeof sampler?.coverage!=='function'||
      typeof sampler?.detailHeight!=='function'||
      typeof projection?.forward!=='function'||
      projection.sourceCRS!=='EPSG:4326'||
      projection.targetCRS!=='EPSG:2154'||
      projection.sourceVerified!==true||
      !(maxIntervalM>0&&Number.isFinite(maxIntervalM)&&maxIntervalM<=30))
    throw Error('Pinned OSM survey, source-verified CRS transform and detailed DEM required');
  const reports=[];
  const unique=new Set();
  for(const way of survey.ways) {
    if(!Number.isSafeInteger(way.osmWay)||unique.has(way.osmWay)||
        !Array.isArray(way.osmNodeIds)||!Array.isArray(way.coordinatesWGS84)||
        way.osmNodeIds.length!==way.coordinatesWGS84.length||
        way.osmNodeIds.length<2)
      throw Error('Invalid source OSM survey geometry');
    unique.add(way.osmWay);
    const points=way.coordinatesWGS84.map(p=>{
      const v=projection.forward(p.slice());
      if(!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite))
        throw Error('Invalid projected source OSM coordinate');
      return v.slice();
    });
    const coverage=sampler.coverage(points);
    const uncoveredEdges=new Set(coverage.uncoveredSegmentIndices);
    const missingVertices=new Set(coverage.missingIndices);
    let cumulativeAscentM=0,cumulativeDescentM=0;
    let measuredLengthM=0,sampledSteps=0;
    let profileComplete=true;
    let previousHeight=null;
    let firstHeight=null,lastHeight=null;
    // Sample at <= min(requested spacing, detailed DEM half-cell),
    // using only genuine detailed DEM, not backdrop-blended values.
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i];
      const d=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(!(d>0)) throw Error('Degenerate source OSM route segment');
      measuredLengthM+=d;
      const n=Math.ceil(d/maxIntervalM);
      if(n>100000) throw Error('Excessive OSM profile audit samples');
      for(let j=i===1?0:1;j<=n;j++){
        const t=j/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
        const h=sampler.detailHeight(x,z);
        sampledSteps++;
        if(!Number.isFinite(h)){
          profileComplete=false;previousHeight=null;continue;
        }
        if(firstHeight===null)firstHeight=h;
        lastHeight=h;
        if(previousHeight!==null){
          const delta=h-previousHeight;
          if(delta>0)cumulativeAscentM+=delta;
          else cumulativeDescentM-=delta;
        }
        previousHeight=h;
      }
    }
    const ready=coverage.detailOnlyReady&&profileComplete&&!missingVertices.size&&!uncoveredEdges.size;
    reports.push({
      osmWay:way.osmWay,names:way.names.slice(),
      originalNodeCount:way.osmNodeIds.length,
      sourceLengthM:way.sourceApproxLengthM,
      projectedLengthM:+measuredLengthM.toFixed(2),
      exactOriginalOsmNodeIds:way.osmNodeIds.slice(),
      coverage:{
        detailVertexCount:coverage.detailVertices,
        backdropOnlyVertexCount:coverage.backdropOnlyVertices,
        missingVertexIndices:coverage.missingIndices.slice(),
        uncoveredSegmentIndices:coverage.uncoveredSegmentIndices.slice(),
        detailedCentrelineCovered:ready
      },
      detailProfile:{
        sampleCount:sampledSteps,
        complete:ready,
        firstElevationM:ready?+firstHeight.toFixed(2):null,
        lastElevationM:ready?+lastHeight.toFixed(2):null,
        ascentInOsmOrderM:ready?+cumulativeAscentM.toFixed(2):null,
        descentInOsmOrderM:ready?+cumulativeDescentM.toFixed(2):null,
        directionApproved:false
      },
      approvedForGameplay:false,
      groomedWidthVerified:false,
      safeHazardsVerified:false,
      approvedSkiJunctions:0
    });
  }
  return {
    schema:'cold-smoke-osm-dem-corridors/v1',
    resortId:survey.resortId,
    originalOsmSHA256:survey.provenance.originalResponseSHA256,
    sourceCRS:'EPSG:4326',detailCRS:'EPSG:2154',
    sourceWayCount:reports.length,
    detailedCentrelineCoveredWays:reports.filter(x=>x.coverage.detailedCentrelineCovered).length,
    approvedPlayableWays:0,
    warnings:[
      'DEM centreline coverage is not a groomed piste polygon, safe width or cleared hazard area.',
      'OSM coordinate order does not certify downhill skiing direction.',
      'No shared-node topology or nearby centreline creates an approved junction.'
    ],
    ways:reports
  };
}
module.exports={auditTerrainCorridors};
