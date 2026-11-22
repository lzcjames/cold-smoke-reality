'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../src/02a_tiled_dem.js');

// Tiny surveyed-style fixtures ONLY: synthetic arrays prove interpolation and
// tile topology but are NEVER published as Les 2 Alpes measured terrain.
const spec = {east: 900000, north: 6500000, step: 10, cells: 3};
const make = (x, y, fn) => ({x, y, heights: Array.from({length:9}, (_, k) => {
  const col=k%3, row=Math.floor(k/3);
  return fn(900000+(x*2+col)*10, 6500000-(y*2+row)*10);
})});
const plane=(e,n) => 2000+0.2*(e-900000)+0.1*(n-6500000);

test('multi-tile DEM interpolates one projected continuous world at seams', () => {
  const dem=create(spec);
  // Insert out of order; both east-west and north-south joins are checked.
  for(const [x,y] of [[1,1],[0,0],[1,0],[0,1]])
    dem.add(make(x,y,plane));
  assert.equal(dem.loaded(),4);
  for(const [e,n] of [
    [900005,6499995],[900020,6499995],[900025,6499995],
    [900020,6499980],[900019.9,6499980.1],[900020.1,6499979.9],
    [900040,6499960],[900000,6500000]
  ]) assert.ok(Math.abs(dem.sample(e,n)-plane(e,n))<1e-8);
  assert.equal(dem.has(900040,6499960),true);
  assert.equal(dem.sample(900041,6499960),null);
  assert.equal(dem.sample(899999,6500001),null);
});
test('reject seam mismatch atomically and permit correct replacement',()=>{
  const dem=create(spec);
  dem.add(make(0,0,plane));
  const bad=make(1,0,plane);
  bad.heights[0]+=0.1;
  assert.throws(()=>dem.add(bad),/seam mismatch/);
  assert.equal(dem.loaded(),1);
  dem.add(make(1,0,plane));
  assert.equal(dem.sample(900020,6499990),plane(900020,6499990));
});
test('missing tiles never return extrapolated terrain and can load later',()=>{
  const dem=create(spec);
  dem.add(make(0,0,plane));
  assert.equal(dem.sample(900025,6499990),null);
  assert.equal(dem.has(900025,6499990),false);
  dem.add(make(1,0,plane));
  assert.ok(Number.isFinite(dem.sample(900025,6499990)));
  dem.remove(1,0);
  assert.equal(dem.sample(900025,6499990),null);
  assert.equal(dem.sample(NaN,6499990),null);
});
test('malformed tile, grid configuration, duplicate keys and heights fail closed',()=>{
  assert.throws(()=>create({...spec,cells:1}),/Invalid/);
  const dem=create(spec);
  assert.throws(()=>dem.add({x:0,y:0,heights:[1]}),/Invalid/);
  assert.throws(()=>dem.add(make(0,0,()=>NaN)),/Invalid/);
  assert.throws(()=>dem.add(make(0,0,()=>-1)),/Invalid/);
  dem.add(make(0,0,plane));
  assert.throws(()=>dem.add(make(0,0,plane)),/Duplicate/);
});
