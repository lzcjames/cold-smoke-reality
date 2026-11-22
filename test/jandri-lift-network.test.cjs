'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const topo=JSON.parse(fs.readFileSync('docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json','utf8'));
const crosswalk=fs.readFileSync('docs/p4/JANDRI-LIFT-STATION-CROSSWALK.md','utf8');
const source=fs.readFileSync('src/02f_jandri_lift_network.js','utf8');
function module() {
  const sandbox={};
  vm.runInNewContext(source+'\nthis.network=JandriLiftNetwork;',sandbox);
  return sandbox.network;
}
test('Jandri 3S network is pinned to the audited sectors and OSM way IDs',()=>{
  const m=module();
  assert.deepEqual(Array.from(m.stations,x=>x.id),
    topo.illustratedStationSectors.map(x=>x.id));
  assert.deepEqual(Array.from(m.legs,x=>[x.from,x.to]),
    topo.cartographicLiftAlignment.map(x=>[x.from,x.to]));
  assert.deepEqual(Array.from(m.legs,x=>x.osmWay),
    ['way/1229057878','way/1361005452']);
  for (const id of m.legs.map(l=>l.osmWay)) assert.ok(crosswalk.includes(id));
  assert.equal(m.source.positionsVerified,false);
  assert.equal(m.source.boardingPolicyVerified,false);
  assert.equal(m.source.intermediateTransferVerified,false);
});
test('mid and summit itineraries use exactly the correct audited leg sequences',()=>{
  const m=module();
  const mid=m.plan('jandri-2600'),summit=m.plan('jandri-3200');
  assert.deepEqual(Array.from(mid.legs,l=>l.id),['jandri-i']);
  assert.deepEqual(Array.from(summit.legs,l=>l.id),['jandri-i','jandri-ii']);
  assert.deepEqual(Array.from(mid.stations,s=>s.sectorAltitudeM),[1650,2600]);
  assert.deepEqual(Array.from(summit.stations,s=>s.sectorAltitudeM),[1650,2600,3200]);
  assert.equal(mid.intermediateTransferRequired,false);
  assert.equal(summit.intermediateTransferRequired,true);
  assert.equal(summit.intermediateTransferPolicyVerified,false);
});
test('no fictitious ride route, coordinates, speed, boarding or express access is exposed',()=>{
  const m=module();
  for (const id of ['jandri-2600','jandri-3200']) {
    const p=m.plan(id);
    assert.equal(p.normalRideEnabled,false);
    assert.equal(p.expressRideEnabled,false);
    assert.equal(p.boardingWorldPoint,null);
    assert.equal(p.arrivalWorldPoint,null);
    assert.equal(p.requiresIndependentStationAuthorization,true);
    assert.equal(Object.isFrozen(p),true);
    assert.equal(Object.isFrozen(p.legs),true);
  }
  for (const station of m.stations) {
    assert.equal(station.verifiedWorldPoint,null);
    assert.equal(station.boardingApproved,false);
    assert.equal(station.exitApproved,false);
  }
  for (const leg of m.legs) {
    assert.equal(leg.durationSeconds,null);
    assert.equal(leg.cabinSpeedMps,null);
    assert.equal(leg.boardingApproved,false);
  }
  assert.equal(m.canBoard(),false);
  for (const invalid of ['jandri-4000','les-deux-alpes-1650',null,''])
    assert.throws(()=>m.plan(invalid),/destination/);
});
