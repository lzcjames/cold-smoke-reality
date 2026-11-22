'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TiledReality = require('../src/02a_tiled_reality.js');
const opts = () => ({
  id:'test-fixture',name:'Synthetic validation fixture',
  elevationSource:'TEST ONLY - not surveyed',grid:{east:900000,north:6500000,step:10,cells:3},
  reference:{originLambert93:[900005,6499995],downhillLambert93:[0,-1],
    datumM:2000},
  tiles:[]
});
const h = (e,n) => 2000 + .02*(e-900000) + .03*(6500000-n);
function tile(x,y) {return {x,y,heights:Array.from({length:9},(_,i)=>{
  const col=i%3,row=Math.floor(i/3);
  return h(900000+(x*2+col)*10,6500000-(y*2+row)*10);
})};}
test('Reality tile adapter preserves projected/game transform and height datum',()=>{
  const o=opts();o.tiles=[tile(0,0),tile(1,0)];
  const reality=TiledReality.create(o);
  const [x,z]=reality.project(900025,6499995);
  assert.ok(Math.abs(x-20)<1e-8);
  assert.ok(Math.abs(z)<1e-8);
  assert.deepEqual(reality.toProjected(x,z),[900025,6499995]);
  assert.ok(Math.abs(reality.height(x,z)-(h(900025,6499995)-2000))<1e-8);
  assert.equal(reality.approvedForGameplay,false);
});
test('Reality adapter never clamps missing tiles into collision heights',()=>{
  const o=opts();o.tiles=[tile(0,0)];
  const t=TiledReality.create(o);
  const p=t.project(900025,6499995);
  assert.equal(t.withinDEM(...p),false);
  assert.equal(t.height(...p),null);
  assert.throws(()=>t.requireHeight(...p),/DEM tile missing/);
  t.dem.add(tile(1,0));
  assert.equal(t.withinDEM(...p),true);
  assert.ok(Number.isFinite(t.requireHeight(...p)));
});
test('corridor checks every 5m and both sides, including tile gaps',()=>{
  const o=opts();o.tiles=[tile(0,0)];
  const t=TiledReality.create(o);
  const a=[900005,6499990], b=[900015,6499990], c=[900035,6499990];
  assert.equal(t.validateCorridor([a,b],3),true);
  assert.equal(t.validateCorridor([a,c],3),false);
  t.dem.add(tile(1,0));
  assert.equal(t.validateCorridor([a,c],3),true);
  assert.throws(()=>t.validateCorridor([a,a],3),/Invalid corridor segment/);
});
test('invalid geographic references fail closed',()=>{
  const o=opts();o.reference.downhillLambert93=[0,2];
  assert.throws(()=>TiledReality.create(o),/unit projected/);
  const q=opts();q.tiles=[{...tile(0,0),heights:[NaN]}];
  assert.throws(()=>TiledReality.create(q),/Invalid measured/);
});
