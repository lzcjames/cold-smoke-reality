'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { verify } = require('../tools/reality/audit-jandri-measured-routes.cjs');

const index = JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));
const originalWays = index.features.filter(w=>w.type==='way' && w.drawable);
function measuredFixture() {
  return {
    stage:'full_authentic_MNT_mosaic_gate_non_publishing',
    status:'complete_real_mosaic_and_profiles_not_published',
    osmSourceSHA256:index.originalResponseSHA256,
    wfsSourceSHA256:'a'.repeat(64),
    tileCountExpected:24,
    sourceTiles:Array.from({length:24},(_,i)=>({tile:`0945-${String(6438+i).padStart(4,'0')}`,sha256:'b'.repeat(64),bytes:20000})),
    crossTileEdges:Array.from({length:37},()=>({validPairs:2000})),
    osmWayProfiles:originalWays.map(w=>({
      osmWay:w.id, lengthM:w.approxPlanarLengthM, firstElevationM:2200,
      lastElevationM:2180, netElevationChangeM:-20,
      cumulativeAscentM:0,cumulativeDescentM:20,
      maxAbsoluteSampleGradePct:12,sampleCount:10,
      direction:'unconfirmed_not_implied_by_OSM_node_order'
    }))
  };
}
test('pinned authentic OSM topology: 37 ways and 8 candidate nodes never auto-approved',()=>{
  const result=verify(index,measuredFixture());
  assert.equal(result.measuredOSMWayCount,37);
  assert.equal(result.sharedNodeCandidates,8);
  assert.equal(result.approvedJunctions,0);
  assert.equal(result.approvedPlayableWays,0);
  assert.equal(result.junctionCandidates.filter(c=>c.approvedSignage).length,0);
  assert.ok(result.junctionCandidates.some(c=>c.ways.some(w=>w.locationInWay==='interior')));
  assert.ok(result.waySummary.every(w=>w.approvedDownhillDirection===null));
});
test('rejects wrong OSM provenance and incomplete source DEM',()=>{
  const changed=measuredFixture();changed.osmSourceSHA256='0'.repeat(64);
  assert.throws(()=>verify(index,changed),/Authentic complete/);
  const missing=measuredFixture();missing.sourceTiles.pop();
  assert.throws(()=>verify(index,missing),/Authentic complete/);
});
test('rejects inconsistent measured elevation and duplicate IDs',()=>{
  const wrong=measuredFixture();wrong.osmWayProfiles[0].netElevationChangeM=100;
  assert.throws(()=>verify(index,wrong),/consistency/);
  const repeat=measuredFixture();repeat.osmWayProfiles[1].osmWay=repeat.osmWayProfiles[0].osmWay;
  assert.throws(()=>verify(index,repeat),/invalid measured/);
});
test('rejects missing real ground edge and unsafe inferred direction',()=>{
  const seam=measuredFixture();seam.crossTileEdges[0].validPairs=1999;
  assert.throws(()=>verify(index,seam),/invalid adjacent ground edge/);
  const direction=measuredFixture();direction.osmWayProfiles[0].direction='automatically_confirmed';
  assert.throws(()=>verify(index,direction),/Uncertified or invalid/);
});
