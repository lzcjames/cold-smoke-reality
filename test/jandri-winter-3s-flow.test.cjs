'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {MODES}=require('../tools/reality/lift_ride_flow.cjs');
const {
 SEASON,TERMINALS,validateGraph,chooseWinterTrip,advanceWinterTrip,
 continueAt2600,expressWinterTrip,planQuickWinterArrival,journeyChoices,
}=require('../tools/reality/jandri_winter_3s_flow.cjs');

function graph(){
  const t=(id,y,osmId)=>({
    id,liftOsmId:osmId,x:940000,y,z:6450000,
    verifiedPosition:true,verifiedGroundHeight:true,verifiedTerrainClearance:true,
    verifiedDisembarkZone:true,verifiedExitRoute:true,verifiedNoGoExclusions:true,
  });
  const osm1='way/1229057878',osm2='way/1361005452';
  // Fictional coordinates appear ONLY in unit tests, never as a game asset.
  const lower=t('base',1650,osm1),middle=t('middle',2600,osm1);
  const middleSecond=t('middle',2600,osm2),upper=t('upper',3200,osm2);
  const lift=(osmId,bottom,top)=>({
    osmId,bottom,top,
    verifiedOperatorRoute:true,verifiedTravelDirection:true,verifiedBoardingPolicy:true,
  });
  return {
    season:SEASON,site:'Jandri 3S',
    transferAt2600Verified:true,currentWinterBoardingPolicyVerified:true,
    verifiedRideGraph:true,
    legs:[
      {fromSector:TERMINALS.BASE,toSector:TERMINALS.MID,lift:lift(osm1,lower,middle)},
      {fromSector:TERMINALS.MID,toSector:TERMINALS.SUMMIT,lift:lift(osm2,middleSecond,upper)}
    ],
  };
}
const boarding={
  stationId:'base',authorizedToBoard:true,nearVerifiedStation:true,
  onFootOrSkisInBoardingZone:true,
};
const transfer={
  stationId:'middle',authorizedToBoard:true,nearVerifiedStation:true,
  onFootOrSkisInBoardingZone:true,operatorTransferAllowed:true,
  verifiedTransferCorridor:true,verifiedPassengerExitAtMid:true,
};
test('winter choice of 2600 ends after first actual lift leg',()=>{
  const g=graph(), trip=chooseWinterTrip(g,boarding,TERMINALS.MID);
  const normal=advanceWinterTrip(g,trip,MODES.NORMAL);
  const express=expressWinterTrip(g,trip);
  assert.equal(normal.status,'arrived');
  assert.equal(normal.completedAtSector,TERMINALS.MID);
  assert.deepEqual(normal.arrival,express.arrival);
  assert.equal(express.arrival.stationId,'middle');
});
test('winter summit journey requires verified 2600 transfer for both modes',()=>{
  const g=graph(),trip=chooseWinterTrip(g,boarding,TERMINALS.SUMMIT);
  const mid=advanceWinterTrip(g,trip,MODES.NORMAL);
  assert.equal(mid.status,'awaiting_2600_transfer');
  assert.throws(()=>continueAt2600(g,mid,{...transfer,verifiedTransferCorridor:false}),/2600m transfer/);
  const second=continueAt2600(g,mid,transfer);
  const normal=advanceWinterTrip(g,second,MODES.NORMAL);
  const express=expressWinterTrip(g,trip,transfer);
  assert.equal(normal.completedAtSector,TERMINALS.SUMMIT);
  assert.equal(normal.arrival.stationId,'upper');
  assert.deepEqual(normal.arrival,express.arrival);
  assert.deepEqual(journeyChoices(g,trip).map(x=>x.enabled),[true,true]);
});
test('no express to 3200 without authenticated intermediate passenger path',()=>{
  const g=graph(),t=chooseWinterTrip(g,boarding,TERMINALS.SUMMIT);
  assert.throws(()=>expressWinterTrip(g,t),/2600m transfer/);
  assert.throws(()=>expressWinterTrip(g,t,{...transfer,operatorTransferAllowed:false}),/2600m transfer/);
  assert.throws(()=>chooseWinterTrip(g,{...boarding,stationId:'middle'},TERMINALS.SUMMIT),/Cannot board/);
});
test('off-season and unverified operating policy fail closed',()=>{
  const g=graph();
  g.season='summer';
  assert.throws(()=>validateGraph(g),/Winter Jandri/);
  const g2=graph();
  g2.currentWinterBoardingPolicyVerified=false;
  assert.throws(()=>chooseWinterTrip(g2,boarding,TERMINALS.SUMMIT),/Winter Jandri/);
  assert.deepEqual(journeyChoices(g2,{status:'riding',segmentIndex:0,site:'Jandri 3S'}).map(x=>x.enabled),[true,false]);
});
test('zero guessed station coordinates or changed OSM lift identities',()=>{
  const g=graph();
  g.legs[1].lift.top.verifiedPosition=false;
  assert.throws(()=>chooseWinterTrip(g,boarding,TERMINALS.SUMMIT),/verified geometry/);
  const other=graph();
  other.legs[1].lift.bottom.id='other-station';
  assert.throws(()=>validateGraph(other),/Winter Jandri/);
  const unverified=graph();
  unverified.transferAt2600Verified=false;
  assert.throws(()=>validateGraph(unverified),/Winter Jandri/);
});
test('cannot restart expired ride, fake destination or skip intermediate leg',()=>{
  const g=graph(),r=chooseWinterTrip(g,boarding,TERMINALS.SUMMIT);
  const arrived=expressWinterTrip(g,r,transfer);
  assert.throws(()=>expressWinterTrip(g,arrived,transfer),/Express action requires/);
  assert.throws(()=>chooseWinterTrip(g,boarding,'fictional-3500'),/2600 or 3200/);
});

test('quick ride produces only a lightweight verified arrival plan with no simulated cabins',()=>{
  const g=graph();
  const mid=planQuickWinterArrival(g,boarding,TERMINALS.MID);
  const top=planQuickWinterArrival(g,boarding,TERMINALS.SUMMIT,transfer);
  assert.equal(mid.transitionMs,1800);
  assert.equal(mid.needsCabinAnimation,false);
  assert.equal(mid.needsLiftPhysics,false);
  assert.equal(mid.arrival.stationId,'middle');
  assert.equal(top.arrival.stationId,'upper');
  assert.deepEqual(top.arrival,expressWinterTrip(g,chooseWinterTrip(g,boarding,TERMINALS.SUMMIT),transfer).arrival);
  assert.equal(Object.isFrozen(top),true);
});
test('quick ride never bypasses winter station or destination evidence gates',()=>{
  const g=graph();
  assert.throws(()=>planQuickWinterArrival(g,boarding,TERMINALS.SUMMIT),/2600m transfer/);
  assert.throws(()=>planQuickWinterArrival(g,boarding,TERMINALS.SUMMIT,{...transfer,verifiedTransferCorridor:false}),/2600m transfer/);
  assert.throws(()=>planQuickWinterArrival(g,boarding,'fake-summit',transfer),/2600 or 3200/);
  assert.throws(()=>planQuickWinterArrival(g,{...boarding,authorizedToBoard:false},TERMINALS.MID),/Cannot board/);
  const broken=graph();
  broken.legs[1].lift.top.verifiedTerrainClearance=false;
  assert.throws(()=>planQuickWinterArrival(broken,boarding,TERMINALS.SUMMIT,transfer),/verified geometry/);
});
