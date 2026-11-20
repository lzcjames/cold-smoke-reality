'use strict';

/**
 * Winter-only Jandri 3S journey contract, not a published game feature.
 * Geographic sectors are independently operator-verified, but platform
 * coordinates, pedestrian transfers and 2026/27 cabin policy are NOT.
 *
 * Product-design decision: winter mode presents a 2600m interchange step.
 * This does not assert real current-season mandatory cabin changes.
 */
const map = require('../../docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json');
const {MODES, beginRide, finishAtTop} = require('./lift_ride_flow.cjs');

const SEASON = 'winter';
const TERMINALS = Object.freeze({
  BASE: 'les-deux-alpes-1650',
  MID: 'jandri-2600',
  SUMMIT: 'jandri-3200',
});
const DESTINATIONS = Object.freeze([TERMINALS.MID, TERMINALS.SUMMIT]);

function validateGraph(graph) {
  if (!graph || graph.season !== SEASON ||
      graph.site !== 'Jandri 3S' ||
      !Array.isArray(graph.legs) || graph.legs.length !== 2 ||
      !map.operatorDocumentation.routeLayoutDocumented ||
      map.operatorDocumentation.confirmedFacilityName !== 'Jandri 3S' ||
      map.operatorDocumentation.intermediateStationSectorMeters !== 2600 ||
      map.illustratedStationSectors.length !== 3 ||
      graph.legs[0].fromSector !== TERMINALS.BASE ||
      graph.legs[0].toSector !== TERMINALS.MID ||
      graph.legs[1].fromSector !== TERMINALS.MID ||
      graph.legs[1].toSector !== TERMINALS.SUMMIT ||
      graph.legs[0].lift.osmId === graph.legs[1].lift.osmId ||
      graph.legs[0].lift.top.id !== graph.legs[1].lift.bottom.id ||
      graph.transferAt2600Verified !== true ||
      graph.currentWinterBoardingPolicyVerified !== true ||
      graph.verifiedRideGraph !== true) {
    throw new Error('Winter Jandri 3S needs two independently verified lift legs and actual 2600m transfer');
  }
  // Validate actual lift terminals by using the existing fail-closed ride gate,
  // not just the official sector altitude labels.
  for (const leg of graph.legs) {
    const lift = leg.lift;
    if (!lift || lift.verifiedOperatorRoute !== true ||
        lift.verifiedTravelDirection !== true ||
        lift.verifiedBoardingPolicy !== true ||
        !lift.bottom || !lift.top ||
        lift.bottom.verifiedDisembarkZone !== true ||
        lift.top.verifiedDisembarkZone !== true ||
        lift.top.verifiedExitRoute !== true ||
        lift.top.verifiedNoGoExclusions !== true) {
      throw new Error('No real boarding/disembark gate for this winter lift segment');
    }
    // Probe base ride validations with a deliberately invalid boarding event:
    // must reject specifically because no actual boarding occurred.
    let rejected = false;
    try { beginRide(lift, {stationId: lift.bottom.id}); }
    catch (err) {
      if (/Cannot board lift/.test(String(err.message))) rejected = true;
      else throw err;
    }
    if (!rejected) throw new Error('Lift gate allowed an unverified boarding event');
  }
  return graph;
}

function chooseWinterTrip(graph, boarded, destination) {
  validateGraph(graph);
  if (!DESTINATIONS.includes(destination))
    throw new Error('Winter Jandri destination must be 2600 or 3200');
  const first = beginRide(graph.legs[0].lift, boarded);
  return Object.freeze({
    season: SEASON, site: 'Jandri 3S', destination,
    legsRequired: destination === TERMINALS.MID ? 1 : 2,
    segmentIndex: 0, currentRide: first, status: 'riding',
    mode: MODES.NORMAL, arrival: null,
  });
}

function verifiedTransferBoarding(graph, event) {
  const a=graph.legs[0].lift.top;
  const b=graph.legs[1].lift.bottom;
  if (!event || event.stationId !== a.id ||
      event.authorizedToBoard !== true ||
      event.nearVerifiedStation !== true ||
      event.onFootOrSkisInBoardingZone !== true ||
      event.operatorTransferAllowed !== true ||
      event.verifiedTransferCorridor !== true ||
      event.verifiedPassengerExitAtMid !== true ||
      a.id !== b.id) {
    throw new Error('2600m transfer needs a verified passenger corridor and real boarding');
  }
  return event;
}

/** Complete one leg. For a 3200 trip, first call enters 2600 transfer state. */
function advanceWinterTrip(graph, trip, mode, transferEvidence) {
  validateGraph(graph);
  if (!trip || trip.season !== SEASON || trip.site !== graph.site ||
      trip.status !== 'riding' || trip.segmentIndex !== 0 && trip.segmentIndex !== 1 ||
      !DESTINATIONS.includes(trip.destination) ||
      trip.legsRequired !== (trip.destination===TERMINALS.MID?1:2))
    throw new Error('No active winter Jandri trip for this leg');
  if (!Object.values(MODES).includes(mode))
    throw new Error('Unrecognized ride mode');
  const leg=graph.legs[trip.segmentIndex];
  const finish=finishAtTop(leg.lift, trip.currentRide, mode);
  if (trip.segmentIndex===0 && trip.legsRequired===2) {
    if (!transferEvidence) {
      return Object.freeze({...trip,status:'awaiting_2600_transfer',currentRide:null,
                            mode, arrival:null});
    }
    const event=verifiedTransferBoarding(graph,transferEvidence);
    return Object.freeze({
      ...trip, segmentIndex:1,
      currentRide:beginRide(graph.legs[1].lift,event),
      mode,status:'riding',arrival:null,
    });
  }
  return Object.freeze({
    ...trip,status:'arrived',mode,currentRide:null,
    arrival:finish.arrival,
    completedAtSector:trip.destination,
  });
}

/** Resume an actual transfer after the first leg finished. */
function continueAt2600(graph, trip, transferEvent) {
  validateGraph(graph);
  if (!trip || trip.status!=='awaiting_2600_transfer' ||
      trip.legsRequired!==2 || trip.segmentIndex!==0 ||
      trip.destination!==TERMINALS.SUMMIT)
    throw new Error('Only an active Jandri summit journey may transfer at 2600');
  const event=verifiedTransferBoarding(graph,transferEvent);
  return Object.freeze({...trip,segmentIndex:1,
    currentRide:beginRide(graph.legs[1].lift,event),
    status:'riding'});
}

/**
 * An express ride skips *animation only*. It cannot skip the verified 2600m
 * transfer check for a 3200m target or invent a different landing point.
 */
function expressWinterTrip(graph, trip, transferEvidence) {
  validateGraph(graph);
  if (!trip || trip.status!=='riding' || trip.segmentIndex!==0)
    throw new Error('Express action requires first-leg in-progress ride');
  const first=advanceWinterTrip(graph,trip,MODES.EXPRESS);
  if (trip.legsRequired===1) return first;
  const second=continueAt2600(graph,first,transferEvidence);
  return advanceWinterTrip(graph,second,MODES.EXPRESS);
}

function journeyChoices(graph, trip) {
  const riding=trip?.status==='riding' && trip.segmentIndex===0 && trip.site===graph?.site;
  return [{
    id:MODES.NORMAL,label:'正常乘坐',enabled:!!riding
  },{
    id:MODES.EXPRESS,label:'直达终点站',
    enabled:!!(riding && graph?.verifiedRideGraph===true &&
              graph?.transferAt2600Verified===true &&
              graph?.currentWinterBoardingPolicyVerified===true)
  }];
}

module.exports={
  SEASON, TERMINALS, DESTINATIONS, validateGraph, chooseWinterTrip,
  advanceWinterTrip, continueAt2600, expressWinterTrip, journeyChoices
};
