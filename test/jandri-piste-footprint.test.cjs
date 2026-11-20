'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {inventory}=require('../tools/reality/audit-jandri-piste-footprint.cjs');
const pinned=JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));

test('real 37-way Jandri centreline data provides no certified piste polygons',()=>{
  const r=inventory(pinned);
  assert.equal(r.wayCount,37);
  assert.equal(r.candidateJunctionNodes,8);
  assert.equal(r.pisteAreaPolygonsInSnapshot,0);
  assert.equal(r.approvedPlayableAreas,0);
  assert.equal(r.publishSafe,false);
  assert.equal(r.ways.filter(w=>w.approvedFor3DGameplay).length,0);
  assert.ok(r.ways.every(w=>w.officialPisteBoundaryAvailable===false));
  assert.ok(r.ways.every(w=>w.verifiedPisteWidthAvailable===false));
});
test('real Jandri 3 tunnel stays blocked without measured clearance',()=>{
  const r=inventory(pinned);
  assert.deepEqual(r.tunnelWayIds,[660937155]);
  const tunnel=r.ways.find(w=>w.osmWay===660937155);
  assert.equal(tunnel.name,'Jandri 3');
  assert.equal(tunnel.approvedFor3DGameplay,false);
  assert.ok(tunnel.missingEvidence.some(x=>x.includes('Tunnel roof')));
});
test('OSM easy tag does not certify skiable slope or operator grading',()=>{
  const r=inventory(pinned);
  assert.ok(r.ways.every(w=>w.osmTaggedDifficulty==='easy'));
  assert.ok(r.ways.every(w=>w.operatorDifficultyConfirmed===false));
});
test('reject modified or incomplete authoritative data',()=>{
  const modified=structuredClone(pinned);
  modified.originalResponseSHA256='f'.repeat(64);
  assert.throws(()=>inventory(modified),/Refuse unpinned/);
  const missing=structuredClone(pinned);
  missing.features.pop();
  assert.throws(()=>inventory(missing),/Refuse unpinned/);
});
