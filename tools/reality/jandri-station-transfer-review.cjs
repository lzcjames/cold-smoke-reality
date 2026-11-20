'use strict';
/**
 * Evidence-only Jandri I/II boarding, alighting and between-lift interchange
 * audit. Inputs are two original, archived source-derived reports:
 * the OpenSkiData-to-OSM crosswalk and the IGN LiDAR HD station ground probe.
 *
 * Distance, OSM tags and bare-earth elevations NEVER approve lift travel,
 * any boarding/exit, or the requested "straight to terminal" ride choice.
 */
const fs = require('node:fs');
const PINNED = '40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26';
const LIFTS = new Map([
  ['way/1229057878','Jandri I'],
  ['way/1361005452','Jandri II'],
]);
const R = 6371008.8;
const rad = Math.PI/180;

function horizontalDistanceM(a,b) {
  if (![...a.slice(0,2),...b.slice(0,2)].every(Number.isFinite))
    throw new Error('Station geographic coordinates are invalid');
  const dlat=(b[1]-a[1])*rad, dlon=(b[0]-a[0])*rad;
  const h=Math.sin(dlat/2)**2+
    Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;
  return R*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
function normalizedTag(v) {
  return v===true ? 'yes' : v===false ? 'no' : v===null || v===undefined ? 'unknown' : 'invalid';
}
function review(crosswalk, ground) {
  if (!crosswalk || crosswalk.stage!=='Jandri_I_II_OpenSkiData_station_piste_proximity_only' ||
      crosswalk.pinnedOSMSourceSHA256!==PINNED || crosswalk.readyForGame!==false ||
      !ground || ground.stage!=='Jandri_I_II_authentic_IGN_station_ground_only' ||
      ground.status!=='source_ground_measured_with_explicit_coverage_limits' ||
      ground.pinnedOSMSourceSHA256!==PINNED || ground.readyForGame!==false ||
      crosswalk.openskidataBuildUTC!==ground.openskidataBuildUTC ||
      JSON.stringify(crosswalk.openskidataSourceHashes)!==JSON.stringify(ground.openskidataSourceHashes) ||
      ground.sourceLinkedStations!==6 || ground.stationsWithActualIGNGroundHeight!==6 ||
      ground.stationsWithinPisteMntInventory!==6 ||
      ground.approvedBoardingZones!==0 || ground.approvedExpressDestinations!==0) {
    throw new Error('Missing original paired OpenSkiData / measured IGN evidence');
  }
  if (!Array.isArray(crosswalk.lifts) || crosswalk.lifts.length!==2 ||
      new Set(crosswalk.lifts.map(l=>l.upstreamOSMId)).size!==2 ||
      crosswalk.lifts.some(l=>LIFTS.get(l.upstreamOSMId)!==l.lift) ||
      !Array.isArray(ground.stationMeasurements) ||
      ground.stationMeasurements.length!==6)
    throw new Error('Unexpected Jandri lift/station source inventory');
  const groundById=new Map();
  for (const row of ground.stationMeasurements) {
    if (!row || typeof row.stationSourceId!=='string' || !row.stationSourceId ||
        groundById.has(row.stationSourceId) ||
        !Number.isFinite(row.ignGroundHeightM) ||
        typeof row.ignGroundTileSHA256!=='string' ||
        !/^[0-9a-f]{64}$/.test(row.ignGroundTileSHA256) ||
        row.operatorBoardingApproved!==false || row.safeDisembarkApproved!==false ||
        row.expressToTopEnabled!==false) {
      throw new Error('Missing / duplicated or improperly approved measured station');
    }
    groundById.set(row.stationSourceId,row);
  }
  const inventory=[];
  const used=new Set();
  for (const lift of crosswalk.lifts) {
    if (!Array.isArray(lift.stations) || lift.stations.length!==lift.sourceStationCount)
      throw new Error('Incomplete source station linkage');
    for (const station of lift.stations) {
      const id=station.dailyStationId;
      const measured=groundById.get(id);
      if (!measured || used.has(id) ||
          measured.upstreamLiftOSMId!==lift.upstreamOSMId ||
          measured.lift!==lift.lift ||
          measured.sourcePositionTag!==station.positionTag ||
          measured.sourceEntryTag!==station.sourceEntryTag ||
          measured.sourceExitTag!==station.sourceExitTag ||
          station.boardingVerified!==false ||
          station.disembarkVerified!==false ||
          station.liftConnectionVerified!==false ||
          measured.insideVerifiedJandri24TileInventory!==true ||
          !Array.isArray(measured.originalWGS84) ||
          !Array.isArray(station.coordinatesWGS84) ||
          horizontalDistanceM(measured.originalWGS84,station.coordinatesWGS84)>0.05) {
        throw new Error('Station source/IGN identity, position or approval mismatch');
      }
      const near=station.nearestPinnedPiste;
      if (!near || near.approvedPhysicalAccess!==false ||
          near.proximityOnly!==true ||
          !Number.isFinite(near.horizontalDistanceM) || near.horizontalDistanceM<0)
        throw new Error('Unverified piste transfer distance');
      used.add(id);
      inventory.push({
        stationSourceId:id,
        upstreamLiftOSMId:lift.upstreamOSMId,
        lift:lift.lift,
        originalStationOSMIds:station.upstreamOSMIds,
        sourcePositionTag:station.positionTag,
        sourceEntryTag:normalizedTag(station.sourceEntryTag),
        sourceExitTag:normalizedTag(station.sourceExitTag),
        stationGroundIGNMeters:measured.ignGroundHeightM,
        stationSourceGeometryHeightMeters:measured.sourceGeometryHeightM,
        sourceMinusIGNHeightMeters:measured.sourceHeightMinusIGNGroundM ?? null,
        coordinatesWGS84:measured.originalWGS84,
        nearestPinnedPiste:near,
        roleEvidenceOnly:station.positionTag==='bottom'?'lower_source_label':
          station.positionTag==='top'?'upper_source_label':
          station.positionTag==='mid'?'intermediate_source_label':'unclassified_source_station',
        boardingApproved:false,
        disembarkApproved:false,
        physicalPisteTransferApproved:false,
        directToTerminalApproved:false,
      });
    }
  }
  if (inventory.length!==6 || used.size!==6 || groundById.size!==6)
    throw new Error('Incomplete original six-station join');

  // Every crosslift pair is examined, never filtered to "nearby and safe".
  // Horizontal distance and point-elevation delta cannot verify a skiable path.
  const first=inventory.filter(s=>s.upstreamLiftOSMId==='way/1229057878');
  const second=inventory.filter(s=>s.upstreamLiftOSMId==='way/1361005452');
  if (first.length!==4 || second.length!==2)
    throw new Error('Original Jandri station counts changed');
  const sourceRolesByLift=Object.fromEntries(
    [...LIFTS].map(([id,name])=>{
      const rows=inventory.filter(s=>s.upstreamLiftOSMId===id);
      return [name,{
        bottom:rows.filter(s=>s.sourcePositionTag==='bottom').length,
        mid:rows.filter(s=>s.sourcePositionTag==='mid').length,
        top:rows.filter(s=>s.sourcePositionTag==='top').length,
        unclassified:rows.filter(s=>!['bottom','mid','top'].includes(s.sourcePositionTag)).length,
        hasSourceLabelledBottom:rows.some(s=>s.sourcePositionTag==='bottom'),
        hasSourceLabelledTop:rows.some(s=>s.sourcePositionTag==='top')
      }];
    })
  );
  // Near-coincident original source *records* may be variants/duplicates,
  // not additional independent physical passenger platforms.
  const nearCoincidentSourcePairs=[];
  for(const rows of [first,second]){
    for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
      const d=horizontalDistanceM(rows[i].coordinatesWGS84,rows[j].coordinatesWGS84);
      if(d<3){
        nearCoincidentSourcePairs.push({
          lift:rows[i].lift,sourceStationIds:[rows[i].stationSourceId,rows[j].stationSourceId],
          horizontalDistanceMeters:+d.toFixed(2),distinctPlatformsVerified:false
        });
      }
    }
  }
  const transfers=[];
  for (const a of first) for (const b of second) {
    transfers.push({
      fromStationSourceId:a.stationSourceId,
      toStationSourceId:b.stationSourceId,
      horizontalDistanceMeters:+horizontalDistanceM(a.coordinatesWGS84,b.coordinatesWGS84).toFixed(1),
      measuredGroundHeightDifferenceMeters:+Math.abs(a.stationGroundIGNMeters-b.stationGroundIGNMeters).toFixed(2),
      traversable:false, pathType:'unverified',
      sourceOnly:true,
      missingEvidence:['verified public walkway/piste corridor','station entry/exit and platform clearance','operator interchange policy'],
    });
  }
  transfers.sort((a,b)=>a.horizontalDistanceMeters-b.horizontalDistanceMeters);
  return {
    stage:'Jandri_authentic_station_roles_and_interchange_screen_not_playable',
    pinnedOSMSourceSHA256:PINNED,
    openskidataBuildUTC:ground.openskidataBuildUTC,
    stationCount:6,
    sourceRoleCount:{
      bottom:inventory.filter(s=>s.sourcePositionTag==='bottom').length,
      mid:inventory.filter(s=>s.sourcePositionTag==='mid').length,
      top:inventory.filter(s=>s.sourcePositionTag==='top').length,
      unclassified:inventory.filter(s=>!['bottom','mid','top'].includes(s.sourcePositionTag)).length,
    },
    groundHeightCoverageCount:6,
    sourceRolesByLift,
    nearCoincidentStationRecordPairs:nearCoincidentSourcePairs,
    operatorInterchangeStationConfirmed:false,
    crossLiftCandidatePairs:transfers.length,
    stations:inventory,
    transferCandidates:transfers,
    authorizedTransfers:0, authorizedBoardingZones:0,
    approvedRideEndpoints:0, approvedDirectToTerminal:0,
    readyForGame:false,
    caveat:'OpenSkiData station type/entry/exit is OSM-derived; IGN measures terrain only. No passenger platform, physical route, lift service or skiable corridor is independently certified.',
  };
}
if (require.main===module) {
  const [a,b]=process.argv.slice(2);
  if (!a||!b) {console.error('Usage: node jandri-station-transfer-review.cjs crosswalk.json ign-ground.json');process.exit(2);}
  const report=review(JSON.parse(fs.readFileSync(a)),JSON.parse(fs.readFileSync(b)));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
module.exports={review,horizontalDistanceM};
