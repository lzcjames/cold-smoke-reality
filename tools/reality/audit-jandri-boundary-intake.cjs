#!/usr/bin/env node
'use strict';
// P4 Jandri external polygon evidence intake. This is a SOURCE SCREEN only:
// polygon overlaps an OSM centreline, not proof of groomed or safe ski terrain.
const fs = require('node:fs');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const PINNED = '40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26';
function insideRing(point, ring) {
  let inside = false;
  for (let a=0,b=ring.length-1;a<ring.length;b=a++) {
    const [ax,ay]=ring[a], [bx,by]=ring[b], [x,y]=point;
    if ((ay>y)!==(by>y) && x < (bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
  }
  return inside;
}
function pointInPolygon(point, polygon) {
  return insideRing(point,polygon[0]) &&
    !polygon.slice(1).some(hole=>insideRing(point,hole));
}
function checkPolygon(poly) {
  if (!Array.isArray(poly) || !poly.length) throw new Error('Missing exterior ring');
  for (const ring of poly) {
    if (!Array.isArray(ring) || ring.length < 4 ||
        !ring.every(p=>Array.isArray(p) && p.length===2 &&
          p.every(Number.isFinite) && Math.abs(p[0])<=180 && Math.abs(p[1])<=90) ||
        ring[0][0]!==ring.at(-1)[0] || ring[0][1]!==ring.at(-1)[1] ||
        new Set(ring.slice(0,-1).map(p=>p.join(','))).size<3)
      throw new Error('Invalid closed WGS84 polygon ring');
    const twiceArea = ring.slice(1).reduce((acc,p,i)=>
      acc+ring[i][0]*p[1]-p[0]*ring[i][1],0);
    if (Math.abs(twiceArea) < 1e-12) throw new Error('Degenerate polygon ring');
    // A polygon can be geometrically complex or self-intersecting even if
    // the above quick checks succeed: this is NOT a topology certification.
  }
}
function intake(index, fc, metadata, sourceBytes) {
  if (index.originalResponseSHA256!==PINNED ||
      index.snapshotTimestampUTC!=='2026-07-24T11:04:51Z' ||
      index.wayCount!==37) throw new Error('Unpinned authentic Jandri centreline edition');
  if (fc?.type!=='FeatureCollection' || !Array.isArray(fc.features) ||
      fc.features.length===0 || fc.features.length>300)
    throw new Error('Expected bounded GeoJSON polygon evidence');
  if (!metadata || !/^https:\/\//.test(metadata.sourceURL || '') ||
      !/^20\d\d-\d\d-\d\d$/.test(metadata.sourceDate || '') ||
      !['ODbL-1.0','Licence-Ouverte-2.0'].includes(metadata.license) ||
      !/^[0-9a-f]{64}$/.test(metadata.sha256 || '') ||
      !sourceBytes || crypto.createHash('sha256').update(sourceBytes).digest('hex')!==metadata.sha256)
    throw new Error('Missing dated, licensed, byte-authenticated source evidence');
  // Hashing sourceBytes is insufficient if the caller passes a different,
  // independently edited FeatureCollection. Audit exactly the parsed bytes.
  let authenticatedFeatureCollection;
  try { authenticatedFeatureCollection = JSON.parse(sourceBytes.toString('utf8')); }
  catch { throw new Error('Authenticated GeoJSON bytes are not valid JSON'); }
  if (!isDeepStrictEqual(fc, authenticatedFeatureCollection))
    throw new Error('Boundary candidate differs from authenticated GeoJSON source bytes');
  const ways = new Map(index.features.filter(w=>w.type==='way'&&w.drawable).map(w=>[w.id,w]));
  const findings=[];
  const seen=new Set();
  for (const [n,f] of fc.features.entries()) {
    if (f?.type!=='Feature' || !f.geometry || !['Polygon','MultiPolygon'].includes(f.geometry.type))
      throw new Error('Non-polygon external boundary candidate');
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    if (!Array.isArray(polys)||!polys.length||polys.length>20)
      throw new Error('Invalid boundary multipolygon');
    for (const poly of polys) checkPolygon(poly);
    const p=f.properties||{};
    if ((typeof p.sourceFeatureId!=='string' && !Number.isSafeInteger(p.sourceFeatureId)) ||
        seen.has(String(p.sourceFeatureId)) || !Array.isArray(p.osmWayIds) ||
        !p.osmWayIds.length || p.osmWayIds.length>37 ||
        p.osmWayIds.some(id=>!ways.has(id)) ||
        new Set(p.osmWayIds).size!==p.osmWayIds.length)
      throw new Error('Boundary source ID or OSM way crosswalk is unverified');
    seen.add(String(p.sourceFeatureId));
    let referencedNodeHits=0;
    const matchedWays=[];
    for (const wayId of p.osmWayIds) {
      const way=ways.get(wayId);
      const hits=way.coordinates.filter(point=>polys.some(poly=>pointInPolygon(point,poly))).length;
      referencedNodeHits+=hits;
      matchedWays.push({osmWay:wayId,osmVerticesInside:hits,
        totalOSMVertices:way.nodes.length});
    }
    findings.push({featureIndex:n,sourceFeatureId:p.sourceFeatureId,
      polygonCount:polys.length,referencedWayCount:matchedWays.length,
      referencedOSMVerticesInside:referencedNodeHits,matchedWays,
      spatiallyRelevant:referencedNodeHits>0,
      approvedPisteBoundary:false,approvedPlayableSurface:false,
      reason:'Overlap/OSM ID crosswalk is a candidate only; no operator piste-boundary, hazard, or seasonal clearance certification.'});
  }
  return {stage:'external_boundary_candidate_intake_not_gameplay',
    sourceURL:metadata.sourceURL,sourceDate:metadata.sourceDate,sourceLicense:metadata.license,
    originalBytesSHA256:metadata.sha256,pinnedOSMSourceSHA256:PINNED,
    totalCandidatePolygons:findings.length,
    candidatesWithOSMVertexOverlap:findings.filter(f=>f.spatiallyRelevant).length,
    approvedPisteBoundaries:0,approvedPlayableSurfaces:0,readyForGame:false,
    findings,
    nextGate:'Independent operator/field verification of piste polygon semantics, corridor continuity, no-go hazards and tunnel clearance.'};
}
if (require.main===module) {
  const [osmPath,geojsonPath,metaPath] = process.argv.slice(2);
  if (!osmPath||!geojsonPath||!metaPath) {
    console.error('Usage: node audit-jandri-boundary-intake.cjs OSM-index.json polygons.geojson provenance.json');
    process.exit(2);
  }
  const source=fs.readFileSync(geojsonPath);
  const result=intake(JSON.parse(fs.readFileSync(osmPath,'utf8')),
    JSON.parse(source.toString('utf8')),
    JSON.parse(fs.readFileSync(metaPath,'utf8')),source);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
module.exports={intake,pointInPolygon,checkPolygon};
