'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { audit } = require('../tools/reality/audit-jandri-topology.cjs');
const feature = (id, name, nodes, coordinates) => ({
  type: 'way', drawable: true, id, names: [name], nodes, coordinates,
  tags: {'piste:type':'downhill'}, approxPlanarLengthM: 100
});
const point = (x, y) => [x, y];
const doc = features => ({
  source: 'OpenStreetMap / Overpass', features,
  originalResponseSHA256: 'fixture', snapshotTimestampUTC: '2026-07-24T11:04:51Z'
});

test('only identical OSM node IDs create junction candidates', () => {
  const d = doc([
    feature(10,'Jandri 1',[1,2],[point(6.1,45),point(6.2,45)]),
    feature(11,'Jandri 2',[3,4],[point(6.2,45),point(6.3,45)]),
    feature(12,'Jandri 2',[4,5],[point(6.3,45),point(6.4,45)]),
  ]);
  const result = audit(d);
  assert.equal(result.crossNameSharedNodes.length,0);
  assert.deepEqual(result.routes.find(r=>r.name==='Jandri 2').exactNodeComponents, [[11,12]]);
});

test('a shared interior node is a candidate, not a certified ski exit', () => {
  const d = doc([
    feature(10,'Jandri 1',[1,2,3],[point(6.1,45),point(6.2,45),point(6.3,45)]),
    feature(20,'Jandri 3',[2,4],[point(6.2,45),point(6.4,45)])
  ]);
  const report = audit(d);
  assert.deepEqual(report.crossNameSharedNodes.map(x=>x.osmNode), [2]);
  assert.equal(report.crossNameSharedNodes[0].ways.find(w=>w.wayId===10).endpoint,false);
  assert.match(report.warning,/not certified junctions/);
});

test('reject conflicting coordinates for an identical node', () => {
  assert.throws(() => audit(doc([
    feature(10,'Jandri 1',[1,2],[point(6.1,45),point(6.2,45)]),
    feature(20,'Jandri 2',[2,3],[point(6.2001,45),point(6.3,45)])
  ])),/conflicting coordinates/);
});

test('reject invalid source and duplicate ways', () => {
  assert.throws(() => audit({features:[]}), /attributed/);
  const f = feature(10,'Jandri 1',[1,2],[point(6.1,45),point(6.2,45)]);
  assert.throws(() => audit(doc([f,f])), /duplicate/);
});

test('pinned real atlas has its own 37 ways and 8 cross-name shared nodes', () => {
  const p=path.resolve(__dirname,'../docs/p4/JANDRI-OSM-INDEX.json');
  const index=JSON.parse(fs.readFileSync(p,'utf8'));
  const result=audit(index);
  assert.equal(result.sourceSHA256,'40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26');
  assert.equal(result.wayCount,37);
  assert.equal(result.crossNameSharedNodes.length,8);
  assert.equal(result.routes.length,6);
  assert.equal(result.uniqueNodeCount,429);
});
