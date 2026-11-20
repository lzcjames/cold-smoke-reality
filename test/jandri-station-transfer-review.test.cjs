'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {review,horizontalDistanceM}=require('../tools/reality/jandri-station-transfer-review.cjs');
const PIN='40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26';

function fixture() {
  const ids=['way/1229057878','way/1361005452'];
  const names=['Jandri I','Jandri II'];
  const lifts=[], rows=[];
  for(let i=0;i<2;i++){
    const stations=[];
    for(let j=0;j<(i===0?4:2);j++){
      const id='source-'+i+'-'+j;
      const coords=[6.165+j*.002,45.0+i*.005,2000+i*600+j*80];
      const position=j===0?'bottom':j===(i===0?3:1)?'top':'mid';
      stations.push({dailyStationId:id,coordinatesWGS84:coords,positionTag:position,
        sourceEntryTag:j!==3,sourceExitTag:true,upstreamOSMIds:['node/'+id],
        boardingVerified:false,disembarkVerified:false,liftConnectionVerified:false,
        nearestPinnedPiste:{osmWay:1234,proximityOnly:true,approvedPhysicalAccess:false,horizontalDistanceM:12.5}});
      rows.push({stationSourceId:id,lift:names[i],upstreamLiftOSMId:ids[i],
        sourcePositionTag:position,sourceEntryTag:j!==3,sourceExitTag:true,
        originalWGS84:coords.slice(0,2),sourceGeometryHeightM:coords[2],
        sourceHeightMinusIGNGroundM:10,
        ignGroundHeightM:coords[2]-10,
        ignGroundTileSHA256:'a'.repeat(64),insideVerifiedJandri24TileInventory:true,
        operatorBoardingApproved:false,safeDisembarkApproved:false,expressToTopEnabled:false});
    }
    lifts.push({lift:names[i],upstreamOSMId:ids[i],stations,sourceStationCount:stations.length});
  }
  const crosswalk={stage:'Jandri_I_II_OpenSkiData_station_piste_proximity_only',pinnedOSMSourceSHA256:PIN,
    readyForGame:false,openskidataBuildUTC:'2026-11-20T11:00:00Z',
    openskidataSourceHashes:{lifts:'1'.repeat(64),spots:'2'.repeat(64)},lifts};
  const ground={stage:'Jandri_I_II_authentic_IGN_station_ground_only',
    status:'source_ground_measured_with_explicit_coverage_limits',
    pinnedOSMSourceSHA256:PIN,readyForGame:false,
    openskidataBuildUTC:crosswalk.openskidataBuildUTC,
    openskidataSourceHashes:crosswalk.openskidataSourceHashes,
    sourceLinkedStations:6,stationsWithActualIGNGroundHeight:6,
    stationsWithinPisteMntInventory:6,
    approvedBoardingZones:0,approvedExpressDestinations:0,
    stationMeasurements:rows};
  return [crosswalk,ground];
}
test('six original station identities and eight crosslift candidates never auto-approve',()=>{
  const [crosswalk,ground]=fixture(),r=review(crosswalk,ground);
  assert.equal(r.stationCount,6);
  assert.equal(r.crossLiftCandidatePairs,8);
  assert.equal(r.groundHeightCoverageCount,6);
  assert.equal(r.authorizedTransfers,0);
  assert.equal(r.approvedDirectToTerminal,0);
  assert.equal(r.sourceRoleCount.bottom,2);
  assert.equal(r.sourceRoleCount.top,2);
  assert.ok(r.stations.every(x=>!x.boardingApproved && !x.directToTerminalApproved));
  assert.ok(r.transferCandidates.every(x=>!x.traversable && x.sourceOnly));
});
test('crosslift distance uses geographic meters and geodesic coordinates',()=>{
  assert.equal(horizontalDistanceM([6.15,45],[6.15,45]),0);
  assert.ok(horizontalDistanceM([6.15,45],[6.151,45])>75);
  assert.ok(horizontalDistanceM([6.15,45],[6.151,45])<85);
});
test('modified publisher identity and source count fail closed',()=>{
  let [a,b]=fixture();b.openskidataBuildUTC='tomorrow';
  assert.throws(()=>review(a,b),/paired/);
  [a,b]=fixture();b.stationsWithActualIGNGroundHeight=5;
  assert.throws(()=>review(a,b),/paired/);
  [a,b]=fixture();a.lifts[0].stations.pop();
  assert.throws(()=>review(a,b),/Incomplete/);
});
test('missing or duplicated stations, altered coords and unapproved transfer are rejected',()=>{
  let [a,b]=fixture();b.stationMeasurements[1].stationSourceId=b.stationMeasurements[0].stationSourceId;
  assert.throws(()=>review(a,b),/duplicated/);
  [a,b]=fixture();b.stationMeasurements[0].originalWGS84=[0,0];
  assert.throws(()=>review(a,b),/mismatch/);
  [a,b]=fixture();a.lifts[0].stations[0].nearestPinnedPiste.approvedPhysicalAccess=true;
  assert.throws(()=>review(a,b),/transfer distance/);
  [a,b]=fixture();b.stationMeasurements[0].operatorBoardingApproved=true;
  assert.throws(()=>review(a,b),/measured station/);
});
