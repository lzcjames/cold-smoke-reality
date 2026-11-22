'use strict';
// Fail-closed verification for *unpublished*, independently measured DEM.
// No runtime resort pack, skiable approval or source raster is created here.
const fs=require('node:fs'),crypto=require('node:crypto');
const SHA=/^[a-f0-9]{64}$/;
function validate(staging, report, index, {expectedName='Jandri 2', maxJsonBytes=2*1024*1024}={}) {
  if(!staging || staging.schema!=='cold-smoke-measured-dem-staging/v1' ||
     staging.resortId!=='les-deux-alpes'||staging.routeName!==expectedName||
     staging.approvedForGameplay!==false||staging.mergedIntoResort!==false||
     staging.sourcePixelVerifiedByAudit!==true||
     staging.sourceReportStatus!=='complete_real_mosaic_and_profiles_not_published' ||
     report?.status!==staging.sourceReportStatus ||
     index?.source!=='OpenStreetMap / Overpass'||
     !SHA.test(index.originalResponseSHA256||'')||
     index.originalResponseSHA256!==report.osmSourceSHA256||
     staging.sourceOSMSHA256!==report.osmSourceSHA256)
    throw Error('Unmatched or gameplay-approved Jandri source evidence');
  const actualBytes=Buffer.byteLength(JSON.stringify(staging));
  if(actualBytes>maxJsonBytes)throw Error('Staging grid exceeds browser budget');
  const sourceTiles=report.sourceTiles;
  if(!Array.isArray(sourceTiles)||sourceTiles.length!==24||
     !Array.isArray(report.crossTileEdges)||report.crossTileEdges.length!==37||
     !Array.isArray(report.osmWayProfiles)||report.osmWayProfiles.length!==37||
     !Array.isArray(staging.originalTiles)||staging.originalTiles.length!==24)
    throw Error('Incomplete original source tile or OSM measured report');
  const ids=new Set();
  for(const tile of sourceTiles) {
    if(typeof tile.tile!=='string'||ids.has(tile.tile)||!SHA.test(tile.sha256||''))
      throw Error('Invalid provenance for original terrain tiles');
    ids.add(tile.tile);
  }
  if(ids.size!==24||staging.originalTiles.some(x=>!ids.has(x)) ||
     new Set(staging.originalTiles).size!==24)
    throw Error('Candidate original tile list differs from audited ground');
  const original=index.features.filter(f=>f.type==='way'&&f.drawable===true &&
    f.names?.includes(expectedName)&&f.tags?.['piste:type']==='downhill');
  if(!original.length||!Array.isArray(staging.originalSourceWays)||
      original.length!==staging.originalSourceWays.length ||
      new Set(staging.originalSourceWays).size!==original.length||
      original.some(f=>!staging.originalSourceWays.includes(f.id)))
    throw Error('Candidate differs from original Jandri source way inventory');
  const measuredIds=new Set(report.osmWayProfiles.map(p=>p.osmWay));
  if(original.some(f=>!measuredIds.has(f.id)))throw Error('Missing original measured way');
  const g=staging.grid;
  if(!g||!Number.isInteger(g.cols)||g.cols<2||g.cols>1200||
     !Number.isInteger(g.rows)||g.rows<2||g.rows>1200||
     g.cols*g.rows>1200*1200||
     !Number.isFinite(g.step)||g.step<2||g.step>60||
     !Number.isFinite(g.east)||!Number.isFinite(g.north)||
     !Array.isArray(g.heights)||g.heights.length!==g.cols*g.rows ||
     g.heights.some(h=>!Number.isFinite(h)||h<=-100||h>=6000))
    throw Error('Invalid, incomplete or fabricated measured height grid');
  if(!Number.isSafeInteger(staging.verifiedSourceLineSamples)||
      staging.verifiedSourceLineSamples<original.length*2 ||
     staging.approxUncompressedHeightBytes!==g.heights.length*4)
    throw Error('Staged geometry missing source-line coverage samples');
  const heights=g.heights;
  return Object.freeze({
    schema:'cold-smoke-measured-dem-check/v1',resortId:staging.resortId,
    sourceOSMSHA256:staging.sourceOSMSHA256,
    routeName:expectedName,sourceWays:original.length,
    originalOfficialTerrainTiles:sourceTiles.length,
    gridCols:g.cols,gridRows:g.rows,gridStepM:g.step,
    gridHeightSamples:heights.length,
    boundsLambert93:[g.east,g.north-(g.rows-1)*g.step,
      g.east+(g.cols-1)*g.step,g.north],
    minElevationM:Math.min(...heights),maxElevationM:Math.max(...heights),
    stagingJsonBytes:actualBytes,verifiedSourceLineSamples:staging.verifiedSourceLineSamples,
    playable:false,readyToDeploy:false
  });
}
function main(args) {
  const [asset,report,index,output]=args;
  if(!asset||!report||!index)
    throw Error('Usage: node tools/reality/verify_measured_staging.cjs <staging.json> <audit-report.json> <original-index.json> [out.json]');
  const load=path=>JSON.parse(fs.readFileSync(path,'utf8'));
  const result=validate(load(asset),load(report),load(index));
  if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log('Authenticated nonplayable DEM:',result.sourceWays,'ways,',
    result.gridCols+'x'+result.gridRows,'cells;',result.stagingJsonBytes,'JSON bytes');
  return result;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
  console.error(e.message);process.exitCode=1;
}}
module.exports={validate,main};
