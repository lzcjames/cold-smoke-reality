'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const map=require('../docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json');

test('actual supplied Les 2 Alpes PDF source checksum and schematic scope are pinned',()=>{
  assert.match(map.source.sha256,/^[0-9a-f]{64}$/);
  assert.equal(map.source.sha256,'7be8b77bea5806654918c2007cdd363a3477fb21f2d23b46ad03a0f352e96252');
  assert.equal(map.source.page,1);
  assert.equal(map.source.georeferenced,false);
  assert.equal(map.source.officialSourceURLVerified,false);
});
test('the 1650 - Jandri 2600 - Jandri 3200 station chain remains unapproved',()=>{
  assert.deepEqual(map.illustratedStationSectors.map(x=>x.id),
    ['les-deux-alpes-1650','jandri-2600','jandri-3200']);
  assert.deepEqual(map.cartographicLiftAlignment.map(x=>[x.from,x.to]),[
    ['les-deux-alpes-1650','jandri-2600'],
    ['jandri-2600','jandri-3200']
  ]);
  assert.ok(map.cartographicLiftAlignment.every(x=>x.depictedInMap && !x.confirmedPassengerService));
  assert.ok(map.illustratedStationSectors.every(x=>!x.operatorPlatformConfirmed));
  assert.ok(map.illustratedStationSectors.every(x=>x.operatorStationSectorConfirmed===true));
  assert.ok(map.cartographicLiftAlignment.every(x=>x.operatorRouteSectorsConfirmed===true));
});
test('source Jandri II missing bottom label never denies physical service or unlocks skip',()=>{
  assert.equal(map.openskidataStationAudit.jandriII.bottomSourceRecords,0);
  assert.equal(map.openskidataStationAudit.jandriII.topSourceRecords,2);
  assert.match(map.openskidataStationAudit.interpretation,/missing_bottom_tag/);
  assert.equal(map.requestedExpressRide.enabled,false);
  assert.equal(map.requestedExpressRide.approvedBoardingSites,0);
  assert.equal(map.requestedExpressRide.approvedDisembarkSites,0);
  assert.equal(map.requestedExpressRide.verifiedThroughRide,false);
  assert.equal(map.requestedExpressRide.verifiedIntermediateTransfer,false);
});

test('official sources corroborate current 3S station sectors, not seasonal transfer rules',()=>{
  assert.equal(map.operatorDocumentation.confirmedFacilityName,'Jandri 3S');
  assert.equal(map.operatorDocumentation.routeLayoutDocumented,true);
  assert.equal(map.operatorDocumentation.intermediateStationSectorMeters,2600);
  assert.deepEqual(map.operatorDocumentation.secondSectionStationSectors,['jandri-2600','jandri-3200']);
  assert.equal(map.operatorDocumentation.boardingPlatformCoordinatesConfirmed,false);
  assert.equal(map.operatorDocumentation.winterMustChangeCabinConfirmedFor2026,false);
  assert.equal(map.requestedExpressRide.enabled,false);
});
