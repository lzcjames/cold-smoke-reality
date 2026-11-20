'use strict';

/**
 * Future Jandri lift-riding flow. No made-up station coordinates or lifts:
 * the caller must supply an operator/terrain-verified lift graph and boarding
 * point before starting a ride or enabling the express-to-terminal action.
 *
 * This is a release-gated transport contract, not an enabled game feature.
 */
const MODES = Object.freeze({
  NORMAL: 'normal_ride',
  EXPRESS: 'express_to_terminal',
});

function verifiedTerminal(lift, station) {
  return !!(station &&
    station.verifiedPosition === true &&
    station.verifiedGroundHeight === true &&
    station.verifiedTerrainClearance === true &&
    Number.isFinite(station.x) &&
    Number.isFinite(station.z) &&
    Number.isFinite(station.y) &&
    station.liftOsmId === lift.osmId &&
    typeof station.id === 'string' && station.id.length > 0);
}

function validatedLift(lift) {
  if (!lift || !/^way\/\d+$/.test(lift.osmId || '') ||
      lift.verifiedOperatorRoute !== true ||
      lift.verifiedTravelDirection !== true ||
      lift.verifiedBoardingPolicy !== true ||
      !verifiedTerminal(lift, lift.bottom) ||
      !verifiedTerminal(lift, lift.top) ||
      lift.bottom.id === lift.top.id ||
      lift.bottom.y >= lift.top.y) {
    throw new Error('Lift and both terminals need verified geometry, height, access, and direction');
  }
  return lift;
}

function beginRide(lift, boarding) {
  validatedLift(lift);
  if (!boarding || boarding.stationId !== lift.bottom.id ||
      boarding.nearVerifiedStation !== true ||
      boarding.authorizedToBoard !== true ||
      boarding.onFootOrSkisInBoardingZone !== true) {
    throw new Error('Cannot board lift without a verified accessible lower station');
  }
  return Object.freeze({
    liftOsmId: lift.osmId,
    boardingStationId: lift.bottom.id,
    destinationStationId: lift.top.id,
    status: 'riding',
    mode: MODES.NORMAL,
  });
}

function finishAtTop(lift, ride, mode) {
  validatedLift(lift);
  if (!Object.values(MODES).includes(mode) ||
      !ride || ride.status !== 'riding' ||
      ride.liftOsmId !== lift.osmId ||
      ride.boardingStationId !== lift.bottom.id ||
      ride.destinationStationId !== lift.top.id) {
    throw new Error('Express exit is allowed only during the correct active lift ride');
  }
  if (lift.top.verifiedDisembarkZone !== true ||
      lift.top.verifiedExitRoute !== true ||
      lift.top.verifiedNoGoExclusions !== true) {
    throw new Error('Destination requires independently verified safe disembark and exit');
  }
  return Object.freeze({
    ...ride,
    status: 'disembarked',
    mode,
    arrival: Object.freeze({
      stationId: lift.top.id,
      x: lift.top.x,
      y: lift.top.y,
      z: lift.top.z,
      source: 'verified_lift_top_terminal',
    }),
  });
}

function rideChoices(lift, ride) {
  const active = !!ride && ride.status === 'riding' && ride.liftOsmId === lift?.osmId;
  const destinationVerified = active && !!lift &&
    verifiedTerminal(lift, lift.top) &&
    lift.top.verifiedDisembarkZone === true &&
    lift.top.verifiedExitRoute === true &&
    lift.top.verifiedNoGoExclusions === true;
  return [
    { id: MODES.NORMAL, label: '正常乘坐', enabled: active },
    { id: MODES.EXPRESS, label: '直达终点站', enabled: destinationVerified },
  ];
}

module.exports = { MODES, beginRide, finishAtTop, rideChoices };
