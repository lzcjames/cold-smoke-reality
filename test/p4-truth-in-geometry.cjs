#!/usr/bin/env node
// Offline truth-in-geometry audit of the *published* real Les Deux Alpes pack.
// This checks what is measured (OSM centreline, IGN DEM) versus what is
// inferred (uniform gameplay width, interpolated 15m raster). It does not
// claim the official piste footprint or every on-site turn is reproduced.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const p4 = JSON.parse(fs.readFileSync(path.join(ROOT,'data/reality/les-deux-alpes.json'),'utf8'));
const expected = new Map([
  [219409078,'Diable 1'],
  [643745486,'Petites Crêtes'],
  [643786947,'Vallons du Diable'],
]);
const junctionIds = new Set([6057592057,6057592113]);
const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const length = points => points.slice(1).reduce((sum,p,i)=>sum+dist(p,points[i]),0);
function sampleDEM(x,y) {
  const {east,north,step,cols,rows,heights} = p4.grid;
  const u=(x-east)/step,v=(north-y)/step;
  assert(u>=0&&u<cols-1&&v>=0&&v<rows-1,'Sample outside measured DEM');
  const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*cols+i;
  return (1-b)*((1-a)*heights[k]+a*heights[k+1]) +
    b*((1-a)*heights[k+cols]+a*heights[k+cols+1]);
}
function pisteAudit(p) {
  assert.equal(p.name,expected.get(p.osmWay));
  assert.equal(p.nodes.length,p.points.length,'Every drawn centreline point must correspond to OSM node');
  assert(p.nodes.length>=2);
  const elevations=p.points.map(([x,y])=>sampleDEM(x,y));
  const lineMeters=length(p.points);
  const directMeters=dist(p.points[0],p.points.at(-1));
  return {name:p.name,osmWay:p.osmWay,difficulty:p.difficulty,
    osmVertices:p.nodes.length,centrelineMeters:+lineMeters.toFixed(1),
    endpointMetres:+directMeters.toFixed(1),
    firstElevationM:+elevations[0].toFixed(1),
    lastElevationM:+elevations.at(-1).toFixed(1),
    elevationChangeM:+(elevations.at(-1)-elevations[0]).toFixed(1),
    segmentsWithSampledRise:elevations.slice(1).filter((h,i)=>h>elevations[i]+.5).length};
}
assert.equal(p4.id,'les-deux-alpes');
assert.equal(p4.pistes.length,3);
assert.equal(p4.junctions.length,2);
assert.equal(p4.piste.osmWay,219409078);
assert.deepEqual(new Set(p4.pistes.map(p=>p.osmWay)),new Set(expected.keys()));
assert.deepEqual(new Set(p4.junctions.map(j=>j.osmNode)),junctionIds);
assert.equal(p4.grid.step,15,'Web terrain grid must be labeled as a 15m resample, not native 0.5m');
assert.match(p4.elevationSource,/IGN LiDAR HD MNT 0\.5 m/);
assert.equal(p4.provenance.osmTimestampUTC,'2026-07-24T11:04:51Z');
assert.equal(p4.grid.cols*p4.grid.rows,p4.grid.heights.length);
const pistes=p4.pistes.map(pisteAudit);
const junctions=p4.junctions.map(j=>{
  const onWays=p4.pistes.filter(p=>p.nodes.includes(j.osmNode));
  assert(onWays.length>=2,'Junction must have a REAL shared OSM vertex');
  const mismatches=onWays.map(p=>dist(p.points[p.nodes.indexOf(j.osmNode)],j.point));
  assert(mismatches.every(d=>d<.06),'Junction must exactly coincide with way vertices within grid rounding');
  return {osmNode:j.osmNode,lon:j.lonLat[0],lat:j.lonLat[1],
    joinedOSMWays:onWays.map(p=>p.osmWay),maxCenterlineMismatchM:+Math.max(...mismatches).toFixed(3)};
});
const report={resort:p4.id,measuredSources:{
  centreline:'OSM ways and OSM vertices, pinned 2026-07-24T11:04:51Z',
  terrain:p4.elevationSource,sourceRasterResolutionM:0.5,
  publishedTerrainGridResolutionM:p4.grid.step,
  publishedGridCells:p4.grid.cols*p4.grid.rows
},inferredPresentation:{
  primaryPlayableWidthM:36,secondaryStakeSeparationM:24,networkLookupRadiusM:70,
  widthEvidence:'Reality.create uses halfWidth=18; PisteNetwork.create places secondary stakes at ±12m and searches 70m',
  pisteBoundarySurveyed:false,decorativeVegetationSurveyed:false,
  rendererSurface:'Procedural snow / shading, not survey-grade photogrammetry',
  fullOfficialRouteCoverageVerified:false
},pistes,junctions};
if(process.argv.includes('--json')) console.log(JSON.stringify(report,null,2));
else {
  console.log('P4 real-geometry audit:',pistes.length,'OSM piste segments,',
    junctions.length,'exact shared-node junctions');
  for(const p of pistes) console.log(p.name,p.osmWay,
    p.centrelineMeters+'m',p.osmVertices+' OSM vertices',
    'approx elevation change '+p.elevationChangeM+'m');
  console.log('Web DEM 15m from IGN native 0.5m; 36m primary corridor and 24m secondary stake spacing are NOT measured.');
}
