'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MODES, beginRide, finishAtTop, rideChoices } =
  require('../tools/reality/lift_ride_flow.cjs');

function lift() {
  const osmId = 'way/1229057878';
  const terminal = (id,y) => ({
    id, liftOsmId:osmId, x:950000, y, z:6440000,
    verifiedPosition:true, verifiedGroundHeight:true,
    verifiedTerrainClearance:true, verifiedDisembarkZone:true,
    verifiedExitRoute:true, verifiedNoGoExclusions:true,
  });
  return {osmId, bottom:terminal('bottom',1600),top:terminal('top',2600),
    verifiedOperatorRoute:true,verifiedTravelDirection:true,
    verifiedBoardingPolicy:true};
}
const boarding = {stationId:'bottom', nearVerifiedStation:true,
  authorizedToBoard:true,onFootOrSkisInBoardingZone:true};

test('normal and direct-to-top share identical surveyed arrival',()=>{
  const l=lift(), ride=beginRide(l,boarding);
  const normal=finishAtTop(l,ride,MODES.NORMAL);
  const express=finishAtTop(l,ride,MODES.EXPRESS);
  assert.deepEqual(express.arrival,normal.arrival);
  assert.equal(express.status,'disembarked');
  assert.equal(express.mode,MODES.EXPRESS);
  assert.deepEqual(rideChoices(l,ride).map(x=>x.enabled),[true,true]);
});
test('cannot teleport without actual lower-station boarding',()=>{
  const l=lift();
  assert.throws(()=>beginRide(l,{...boarding,authorizedToBoard:false}),/Cannot board/);
  assert.throws(()=>beginRide(l,{...boarding,stationId:'top'}),/Cannot board/);
  assert.deepEqual(rideChoices(l,null).map(x=>x.enabled),[false,false]);
  assert.throws(()=>finishAtTop(l,null,MODES.EXPRESS),/active lift ride/);
});
test('target is never inferred or synthesized',()=>{
  const l=lift(), ride=beginRide(l,boarding);
  const missing=lift();
  missing.top.verifiedDisembarkZone=false;
  assert.deepEqual(rideChoices(missing,ride).map(x=>x.enabled),[true,false]);
  assert.throws(()=>finishAtTop(missing,ride,MODES.EXPRESS),/safe disembark/);
  const unverified=lift();
  unverified.top.verifiedPosition=false;
  assert.throws(()=>finishAtTop(unverified,ride,MODES.EXPRESS),/verified geometry/);
});
test('cannot use another lift or skip twice',()=>{
  const l=lift(),ride=beginRide(l,boarding);
  const other=lift();other.osmId='way/1361005452';
  assert.throws(()=>finishAtTop(other,ride,MODES.EXPRESS),/correct active lift ride|verified geometry/);
  const ended=finishAtTop(l,ride,MODES.EXPRESS);
  assert.throws(()=>finishAtTop(l,ended,MODES.EXPRESS),/correct active lift ride/);
});
test('do not begin rides on downhill assumptions or unknown access',()=>{
  for (const field of ['verifiedOperatorRoute','verifiedTravelDirection','verifiedBoardingPolicy']) {
    const l=lift();l[field]=false;
    assert.throws(()=>beginRide(l,boarding),/verified geometry/);
  }
});
