#!/usr/bin/env node
'use strict';
// Strict Jandri 3D piste-footprint evidence gate. No invented piste widths,
// buffered centreline polygons, collision area, or tunnel surface.
const fs = require('node:fs');
const {audit} = require('./audit-jandri-topology.cjs');
const PINNED = '40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26';

function inventory(index) {
  const topology = audit(index);
  if (index.originalResponseSHA256 !== PINNED ||
      index.snapshotTimestampUTC !== '2026-07-24T11:04:51Z' ||
      topology.wayCount !== 37 || topology.crossNameSharedNodes.length !== 8)
    throw new Error('Refuse unpinned or incomplete Jandri source');
  const ways = index.features.filter(w => w.type === 'way' && w.drawable);
  const result = ways.map(w => {
    const tags = w.tags || {};
    const isTunnel = tags.tunnel === 'yes' || tags.location === 'underground';
    const obstacle = isTunnel ? ['tunnel_requires_cleared_passage_and_vertical_structure'] : [];
    // A line has zero mapped area: never turn it into a corridor just by width assumptions.
    // OSM 'piste:difficulty' is asserted by contributors, not an audited grade.
    return {
      osmWay: w.id, name: w.names[0], centrelineNodeCount: w.nodes.length,
      centrelineOnly: true, osmTaggedDifficulty: tags['piste:difficulty'] || null,
      operatorDifficultyConfirmed: false,
      tunnelTagged: isTunnel, markedRestrictions: obstacle,
      officialPisteBoundaryAvailable: false,
      verifiedPisteWidthAvailable: false,
      verifiedObstacleMaskAvailable: false,
      safeCollisionGeometryAvailable: false,
      approvedFor3DGameplay: false,
      missingEvidence: [
        'Independent real groomed piste polygon or operator width and corridor boundaries',
        'Verified rock/tree/cliff/hazard no-go zones and traversable terrain',
        'Confirmed downhill travel direction and skiable junction routing',
        ...(isTunnel ? ['Tunnel roof, passage height and actual navigable corridor'] : [])
      ]
    };
  });
  return {
    stage: 'authentic_Jandri_footprint_inventory_no_playable_area',
    originalOSMSHA256: PINNED, sourceTimeUTC: index.snapshotTimestampUTC,
    wayCount: ways.length, candidateJunctionNodes: topology.crossNameSharedNodes.length,
    sourceType: 'OSM downhill centreline ways only',
    pisteAreaPolygonsInSnapshot: 0, approvedPlayableAreas: 0,
    tunnelWayIds: result.filter(x=>x.tunnelTagged).map(x=>x.osmWay),
    sourceOperatorDifficultyCertifications: 0,
    ways: result,
    publishSafe: false,
    warning: 'MNT terrain is height, not a ski area. Never synthesize piste footprint or lift limits from centreline buffers.'
  };
}
if (require.main === module) {
  const f = process.argv[2] || 'docs/p4/JANDRI-OSM-INDEX.json';
  process.stdout.write(JSON.stringify(inventory(JSON.parse(fs.readFileSync(f,'utf8'))),null,2)+'\n');
}
module.exports = { inventory };
