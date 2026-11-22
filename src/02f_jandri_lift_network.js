// Jandri 3S: small source-backed station/leg network for WINTER preview.
// Deliberately contains no game-world position, fictitious cabin, lift speed,
// travel duration, boarding approval or teleporter destination.
// Operator sectors: docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json
// OpenSkiData IDs: docs/p4/JANDRI-LIFT-STATION-CROSSWALK.md
// These lift identifiers represent independently audited OSM lift ways,
// not independently verified boarding platforms or safe access corridors.
const JandriLiftNetwork = (() => {
  const source = Object.freeze({
    topology: 'docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json',
    crosswalk: 'docs/p4/JANDRI-LIFT-STATION-CROSSWALK.md',
    verifiedFacility: 'Jandri 3S',
    season: 'winter',
    positionsVerified: false,
    boardingPolicyVerified: false,
    intermediateTransferVerified: false,
    safeExitsVerified: false,
  });
  const stations = Object.freeze([
    Object.freeze({id:'les-deux-alpes-1650',name:'Les Deux Alpes 1650',
      sectorAltitudeM:1650,verifiedWorldPoint:null,boardingApproved:false,exitApproved:false}),
    Object.freeze({id:'jandri-2600',name:'Jandri 2600',
      sectorAltitudeM:2600,verifiedWorldPoint:null,boardingApproved:false,exitApproved:false}),
    Object.freeze({id:'jandri-3200',name:'Jandri 3200',
      sectorAltitudeM:3200,verifiedWorldPoint:null,boardingApproved:false,exitApproved:false}),
  ]);
  const legs = Object.freeze([
    Object.freeze({id:'jandri-i',name:'Jandri I',osmWay:'way/1229057878',
      from:stations[0].id,to:stations[1].id,boardingApproved:false,
      durationSeconds:null,cabinSpeedMps:null}),
    Object.freeze({id:'jandri-ii',name:'Jandri II',osmWay:'way/1361005452',
      from:stations[1].id,to:stations[2].id,boardingApproved:false,
      durationSeconds:null,cabinSpeedMps:null}),
  ]);
  function plan(destination) {
    if (destination !== stations[1].id && destination !== stations[2].id)
      throw new Error('Jandri 3S destination must be a verified winter station sector');
    const chosenLegs = destination === stations[1].id ? legs.slice(0,1) : legs.slice();
    const chosenStations = destination === stations[1].id ? stations.slice(0,2) : stations.slice();
    // An OSM lift line or schematic station sector is NOT a boarding area.
    // Both modes remain locked until separately audited platform/terrain/
    // transfer provenance is supplied. Do not infer permission from schedule.
    return Object.freeze({
      season:'winter',destination,stations:Object.freeze(chosenStations),
      legs:Object.freeze(chosenLegs),
      intermediateTransferRequired:destination===stations[2].id,
      intermediateTransferPolicyVerified:false,
      normalRideEnabled:false,expressRideEnabled:false,
      arrivalWorldPoint:null,boardingWorldPoint:null,
      requiresIndependentStationAuthorization:true,
    });
  }
  function canBoard() { return false; }
  return Object.freeze({source,stations,legs,plan,canBoard});
})();
