'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {inspect}=require('../tools/reality/audit-jandri2-coverage.cjs');
const index=JSON.parse(fs.readFileSync('docs/p4/JANDRI-OSM-INDEX.json','utf8'));
const asset=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes.json','utf8'));
const segments=vm.runInNewContext(
  fs.readFileSync('src/02e_jandri_lower.js','utf8')+'\nJandriLower.segments'
);
test('Jandri 2 exposes all 11 authentic source ways but only one lower playable fragment',()=>{
  const a=inspect(index,segments,asset);
  assert.equal(a.sourceWayCount,11);
  assert.equal(a.sourceWayIds.length,11);
  assert.equal(a.currentPlayableWayIds.length,1);
  assert.equal(a.currentPlayableWayIds[0],644393970);
  assert.equal(a.currentlyUnloadedWayIds.length,10);
  assert.equal(a.clippedWay.originalNodeCount,33);
  assert.equal(a.clippedWay.currentNodeCount,25);
  assert.ok(a.clippedWay.omittedNodesBefore+a.clippedWay.omittedNodesAfter>0);
  assert.equal(a.fullLengthPlayable,false);
  assert.equal(a.sourceNodeConnectivityIsSkiableConnection,false);
  assert.equal(a.verifiedFullRouteDirection,false);
  assert.ok(a.currentDemMaxHeightM<2600);
  assert.ok(a.sourceApproxLengthM>3000&&a.sourceApproxLengthM<3100);
});
test('source-node components come from actual topology, not guessed adjacency',()=>{
  const a=inspect(index,segments,asset);
  const nodes=a.sourceNodeComponents.flat();
  assert.deepEqual(nodes.slice().sort((a,b)=>a-b),a.sourceWayIds.slice().sort((a,b)=>a-b));
});
test('rejects altered original OSM, missing playable clip and fake joins',()=>{
  assert.throws(()=>inspect({...index,originalResponseSHA256:'f'.repeat(64)},segments,asset),/Pinned real/);
  assert.throws(()=>inspect(index,[],asset),/lower-only/);
  const fake=Array.from(segments,s=>({...s,nodes:Array.from(s.nodes)}));
  fake.find(x=>x.osmWay===644393970).nodes[1]=123456;
  assert.throws(()=>inspect(index,fake,asset),/does not match original/);
});
